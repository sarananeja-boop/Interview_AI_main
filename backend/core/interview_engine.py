"""
Interview Orchestration Engine.

The brain of the interview system. Manages:
- Interview lifecycle (start → conduct → end)
- Stage transitions
- Prompt assembly
- LLM interaction
- Memory updates
- Answer analysis (weak/strong/contradiction detection)
"""

import json
import logging
from datetime import datetime, timezone

from core.llm_provider import llm
from core.memory_engine import (
    InterviewMemory, create_session, get_session, delete_session
)
from core.question_engine import get_questions_for_profile, classify_profile, _get_stage_categories
from core.vector_store import vector_store
from prompts.personas import build_persona_prompt, get_persona
from prompts.interview_prompts import build_interview_system_prompt
from config import settings
from core.current_affairs_engine import fetch_and_cache_news, get_relevant_headlines, get_hot_topics, get_hometown_context, get_iim_ca_questions

logger = logging.getLogger(__name__)


class InterviewEngine:
    """Orchestrates the full interview flow."""

    async def start_interview(
        self,
        interview_id: str,
        profile: dict,
        persona_key: str = "iim_general",
    ) -> dict:
        """
        Initialize a new interview session and generate the opening question.

        Returns the first interviewer message.
        """
        # Create memory session
        memory = create_session(interview_id, profile)

        # Store candidate interests and fetch current affairs context
        interests = profile.get("interests", [])
        hometown = profile.get("hometown", "")
        state = profile.get("state", "")
        memory.interests = interests
        
        # Fetch hometown context (async)
        if hometown and state:
            try:
                hometown_ctx = await get_hometown_context(hometown, state)
                memory.hometown_context = hometown_ctx
            except Exception as e:
                logger.warning(f"Failed to fetch hometown context: {e}")
        
        # Ensure news cache is populated
        try:
            await fetch_and_cache_news()
            ca_headlines = get_relevant_headlines(interests, state, n=10)
            hot_topics = get_hot_topics(n=5)
            iim_questions = await get_iim_ca_questions(interests)
            memory.current_affairs_context = {
                "headlines": ca_headlines,
                "hot_topics": hot_topics,
                "iim_questions": iim_questions,
            }
        except Exception as e:
            logger.warning(f"Failed to fetch current affairs: {e}")

        # Get persona
        persona = get_persona(persona_key)
        persona_prompt = build_persona_prompt(persona_key)

        # Get profile-specific questions for warmup stage
        warmup_questions = get_questions_for_profile(
            profile=profile,
            stage="warmup",
            count=3,
        )
        logger.info(f"Retrieved {len(warmup_questions)} warmup questions for profile")

        # Build initial system prompt with RAG questions
        system_prompt = build_interview_system_prompt(
            persona_prompt=persona_prompt,
            profile_context=profile,
            memory_state=memory.get_state(),
            current_stage="warmup",
            pressure_level=memory.pressure_level,
            retrieved_questions=warmup_questions,
            current_affairs_context=memory.current_affairs_context,
            hometown_context=memory.hometown_context,
            interests=memory.interests,
        )

        # Generate opening question
        opening_message = await llm.generate(
            system_prompt=system_prompt,
            user_message=(
                "The candidate has just joined the interview. "
                "Begin the interview by welcoming them properly. Introduce yourself briefly and naturally as an IIM panelist, "
                "set a professional tone, and then seamlessly transition into the first warmup question. "
                "CRITICAL: Do NOT recite facts about your institution (like 'we are the oldest IIM') in your introduction. "
                "For your first question, you can ask about their background/journey, but you MUST VARY the phrasing and tone completely so it never sounds scripted (e.g., 'I saw your CV, but who are you beyond that?', 'Take us through your choices'). "
                "Alternatively, occasionally skip the standard intro entirely and hit them with a 'googly' or unexpected question right away to test their composure."
            ),
            temperature=0.7,
        )

        import re
        if re.search(r'\[TERMINATE[_A-Z]*\]', opening_message):
            opening_message = re.sub(r'\[TERMINATE[_A-Z]*\]', '', opening_message).strip()

        # Record the interviewer's opening
        memory.add_turn("interviewer", opening_message)

        return {
            "interviewer_message": opening_message,
            "current_stage": memory.current_stage,
            "turn_number": memory.turn_count,
            "pressure_level": memory.pressure_level,
            "is_complete": False,
        }

    async def process_response(
        self,
        interview_id: str,
        candidate_answer: str,
        persona_key: str = "iim_general",
    ) -> dict:
        """
        Process a candidate's answer and generate the next interviewer response.

        This is the core loop:
        1. Record candidate answer
        2. Analyze answer quality (weak/strong/contradictions)
        3. Check if stage should advance
        4. Build updated system prompt with memory
        5. Generate next interviewer response
        6. Return response + metadata
        """
        memory = get_session(interview_id)
        if not memory:
            raise ValueError(f"No active session for interview {interview_id}")

        # 1. Record candidate answer with XML tags to prevent prompt injection
        safe_answer = f"<candidate_answer>\n{candidate_answer}\n</candidate_answer>"
        memory.add_turn("candidate", safe_answer)

        # 2. Lightweight local analysis (NO extra LLM call — saves API quota)
        analysis = self._analyze_answer_local(candidate_answer)
        if analysis.get("is_weak"):
            memory.flag_weak_answer()
        if analysis.get("is_strong"):
            memory.flag_strong_answer()

        # 3. Check stage advancement
        if memory.should_advance_stage():
            memory.advance_stage()

        # 4. Check if interview is complete
        if memory.is_complete():
            return {
                "interviewer_message": (
                    "Thank you for your time. That will be all from our side. "
                    "We'll communicate the results shortly. You may leave now."
                ),
                "current_stage": "completed",
                "turn_number": memory.turn_count,
                "pressure_level": memory.pressure_level,
                "is_complete": True,
            }

        # 4b. Check time-based limits
        if hasattr(memory, 'started_at') and memory.started_at:
            elapsed = (datetime.now(timezone.utc) - memory.started_at).total_seconds()
            if elapsed >= settings.INTERVIEW_MAX_SECONDS:
                return {
                    "interviewer_message": (
                        "We have run out of time. Thank you for your responses. "
                        "That will be all. You may leave now."
                    ),
                    "current_stage": "completed",
                    "turn_number": memory.turn_count,
                    "pressure_level": memory.pressure_level,
                    "is_complete": True,
                }
            elif elapsed >= settings.INTERVIEW_CLOSING_SECONDS and memory.current_stage != "closing":
                memory.current_stage = "closing"

        # 5. Get diverse questions from the curated question bank
        asked_ids = memory._asked_question_ids

        # Primary: Semantic search for relevant resume context (gives the LLM
        # factual context about the candidate to cross-reference claims)
        resume_context = []
        profile_id = memory.profile.get("_db_id")
        if profile_id:
            try:
                import asyncio
                results = await asyncio.to_thread(vector_store.query_resume, profile_id, candidate_answer, n_results=2)
                if results:
                    resume_context = results
            except Exception as e:
                logger.error(f"Resume vector search failed: {e}")

        # --- FOLLOW-UP: 1 semantic question related to what the candidate just said ---
        # This preserves natural conversational follow-ups (e.g., candidate mentions
        # DCF → one follow-up about valuation is fair game)
        followup_questions = []
        recent_cats = memory.get_state().get("recent_categories", [])
        try:
            import asyncio
            q_results = await asyncio.to_thread(
                vector_store.query_questions,
                candidate_answer,
                n_results=1,
                exclude_categories=recent_cats
            )
            for q in q_results:
                if q["id"] not in asked_ids:
                    followup_questions.append(q["text"])
                    # Track that we touched this category to keep round-robin honest
                    cat = q.get("metadata", {}).get("category")
                    if cat:
                        memory.track_category(cat)
        except Exception as e:
            logger.error(f"Question vector search failed: {e}")

        # --- DIVERSITY: 3 questions from different categories via round-robin rotation ---
        # This ensures the interview doesn't stay stuck on the follow-up topic
        rotated_questions = get_questions_for_profile(
            profile=memory.profile,
            stage=memory.current_stage,
            count=3,
            exclude_ids=asked_ids,
            covered_categories=memory._covered_categories,
        )

        # Combine: diverse options first (default choice), follow-up last
        stage_questions = rotated_questions + followup_questions[:1]
        
        # Get topic coverage stats
        available_cats = _get_stage_categories(memory.current_stage)
        topic_coverage = memory.get_topic_coverage_prompt(available_cats)

        # 6. Build updated system prompt with RAG context
        persona_prompt = build_persona_prompt(persona_key)
        system_prompt = build_interview_system_prompt(
            persona_prompt=persona_prompt,
            profile_context=memory.profile,
            memory_state=memory.get_state(),
            current_stage=memory.current_stage,
            pressure_level=memory.pressure_level,
            topic_coverage=topic_coverage,
            retrieved_questions=stage_questions,
            resume_context=resume_context,
            current_affairs_context=memory.current_affairs_context,
            hometown_context=memory.hometown_context,
            interests=memory.interests,
        )

        # 7. Generate next interviewer response using full conversation history
        conversation = memory.get_conversation_for_llm()
        interviewer_response = await llm.generate_with_history(
            system_prompt=system_prompt,
            conversation_history=conversation,
            temperature=0.75,
        )

        # Check for abuse/termination token
        is_abuse_termination = False
        import re
        if re.search(r'\[TERMINATE[_A-Z]*\]', interviewer_response):
            is_abuse_termination = True
            interviewer_response = re.sub(r'\[TERMINATE[_A-Z]*\]', '', interviewer_response).strip()
            memory.current_stage = "completed"

        # Record interviewer response
        memory.add_turn("interviewer", interviewer_response)

        return {
            "interviewer_message": interviewer_response,
            "current_stage": memory.current_stage,
            "turn_number": memory.turn_count,
            "pressure_level": memory.pressure_level,
            "is_complete": is_abuse_termination or memory.is_complete(),
            "metadata": {
                "answer_analysis": analysis,
                "contradiction_count": len(memory.contradictions),
                "weak_answer_count": len(memory.weak_answers),
            },
        }

    def _analyze_answer_local(self, answer: str) -> dict:
        """
        Lightweight local analysis — no LLM call needed.
        
        The interviewer LLM already detects contradictions and weak answers
        through the conversation history. This just flags obviously short/vague
        answers for the memory engine's pressure system.
        """
        words = answer.split()
        word_count = len(words)
        
        # Vague buzzwords that indicate a weak answer
        vague_phrases = [
            "holistic", "synergy", "passionate about", "value addition",
            "i believe", "in my opinion", "to be honest", "basically",
            "leverage", "paradigm", "ecosystem",
        ]
        answer_lower = answer.lower()
        vague_count = sum(1 for p in vague_phrases if p in answer_lower)
        
        # Strong indicators: specific numbers, names, examples
        import re
        has_numbers = bool(re.search(r'\d{2,}', answer))  # numbers with 2+ digits
        has_specifics = any(kw in answer_lower for kw in [
            "for example", "specifically", "percent", "crore", "lakh",
            "million", "increased by", "reduced by", "i led", "i built",
        ])
        
        is_weak = (word_count < 15) or (vague_count >= 2 and not has_specifics)
        is_strong = has_specifics or has_numbers or word_count > 80
        
        return {
            "is_weak": is_weak,
            "is_strong": is_strong,
            "suggested_followup_type": "challenge" if is_weak else "probe",
        }

    def get_interview_state(self, interview_id: str) -> dict | None:
        """Get the current state of an interview."""
        memory = get_session(interview_id)
        if not memory:
            return None

        return {
            "id": interview_id,
            "status": "active",
            "current_stage": memory.current_stage,
            "turn_count": memory.turn_count,
            "pressure_level": memory.pressure_level,
            "conversation_log": memory.conversation_log,
            "contradiction_count": len(memory.contradictions),
            "weak_answer_count": len(memory.weak_answers),
        }

    async def process_telemetry(self, interview_id: str, interim_text: str, stutter_count: int, mumbling: bool, vision_metrics: dict | None = None) -> dict:
        """Process real-time audio telemetry and determine if an interjection is needed."""
        memory = get_session(interview_id)
        if not memory:
            return {"should_interject": False}
            
        if vision_metrics:
            memory.record_vision_metrics(vision_metrics)
            if vision_metrics.get("phone_violation"):
                memory.pressure_level = 1.0
                return {
                    "should_interject": True,
                    "interjection_message": "Excuse me. I see a cell phone in your frame. Please put that away immediately. This is a formal interview and use of phones is strictly prohibited."
                }
            if vision_metrics.get("inappropriate_gesture"):
                memory.pressure_level = 1.0
                return {
                    "should_interject": True,
                    "interjection_message": "Excuse me, was that gesture really necessary? Maintain your professionalism."
                }
            
        # Hard rules for extreme behavioral signals
        if mumbling:
            return {
                "should_interject": True,
                "interjection_message": "Speak up, please. I cannot hear you clearly. An IIM candidate must project confidence."
            }
            
        if stutter_count >= 10:
            return {
                "should_interject": True,
                "interjection_message": "Take a deep breath. Stop stuttering and structure your thoughts clearly before speaking."
            }
            
        # LLM deviation check — only interrupt after ~1.5 mins of speaking (approx 180 words)
        words = interim_text.split()
        if len(words) >= 180:
            prompt = f"""
The candidate is currently speaking. Here is their interim answer so far:
"{interim_text}"

Evaluate if they are rambling, completely off-topic, or giving a generic textbook answer. 
You are an aggressive IIM interviewer.
Return JSON ONLY:
{{
  "should_interject": true/false,
  "reason": "short reason why",
  "interjection_message": "Stop right there. [1 sentence sharp interruption]"
}}
"""
            try:
                result = await llm.generate(
                    system_prompt="You are an aggressive IIM interviewer evaluating if the candidate is rambling or off-topic. Return JSON ONLY.",
                    user_message=prompt,
                )
                parsed = json.loads(result)
                if parsed.get("should_interject") and parsed.get("interjection_message"):
                    # Record this as an interruption
                    memory.add_turn("interviewer", f"[INTERRUPTED]: {parsed['interjection_message']}")
                    memory.pressure_level = min(1.0, memory.pressure_level + 0.15)
                    return {
                        "should_interject": True,
                        "interjection_message": parsed["interjection_message"]
                    }
            except Exception as e:
                logger.error(f"Telemetry LLM error: {e}")
                
        return {"should_interject": False}

    def end_interview(self, interview_id: str) -> dict:
        """End an interview and return the final memory state."""
        memory = get_session(interview_id)
        if not memory:
            raise ValueError(f"No active session for interview {interview_id}")

        final_state = memory.to_dict()
        delete_session(interview_id)
        return final_state


# Singleton
interview_engine = InterviewEngine()
