"""
Dynamic interview prompt assembly.

Builds the full system prompt by layering:
  PERSONA + BEHAVIORAL_RULES + PROFILE_CONTEXT + MEMORY_STATE + STAGE_INSTRUCTIONS
"""

import json
from datetime import datetime


def build_interview_system_prompt(
    persona_prompt: str,
    profile_context: dict,
    memory_state: dict,
    current_stage: str,
    pressure_level: float,
    topic_coverage: str = "",
    retrieved_questions: list[str] | None = None,
    resume_context: list[str] | None = None,
    current_affairs_context: dict | None = None,
    hometown_context: dict | None = None,
    interests: list[str] | None = None,
) -> str:
    """
    Assemble the full system prompt for the interview engine.

    This is the core prompt engineering — every component matters.
    """

    # --- Profile Context ---
    profile_section = _build_profile_section(profile_context)

    # --- Memory State ---
    memory_section = _build_memory_section(memory_state)

    # --- Stage Instructions ---
    stage_section = _build_stage_instructions(current_stage, pressure_level)

    # --- Retrieved Questions (RAG) ---
    rag_section = ""
    if retrieved_questions:
        rag_lines = "\n".join(f"  {i+1}. \"{q}\"" for i, q in enumerate(retrieved_questions))
        rag_section = f"""
{topic_coverage}

QUESTIONS FOR THIS TURN:
{rag_lines}
"""
        if current_stage != "warmup":
            rag_section += """
QUESTION STRATEGY:
- Questions 1-3 are from DIFFERENT topic categories.
- Optional Question 4 is a contextual follow-up related to what the candidate just said.
- MANDATORY ROTATION RULE:
  - If the TOPIC COVERAGE above says "YOU MUST SWITCH NOW", you MUST NOT ask a follow-up. You MUST pick one of the Questions 1-3.
  - You can use transition phrases like: "Interesting. Let's move on to something different." or "Let's come back to that later. Tell me about..."
- FOLLOW-UP RULE: If rotation is not forced, and the candidate's previous answer requires clarification, you may ask a follow-up.
"""

    # --- Resume Context (RAG) ---
    resume_section = ""
    if resume_context:
        resume_lines = "\n".join(f"  - \"{chunk}\"" for chunk in resume_context)
        resume_section = f"""
SPECIFIC RESUME CONTEXT (Extracted from Candidate's uploaded resume based on recent answers):
{resume_lines}
Use this context to cross-question or verify candidate claims.
"""

    # --- Assemble ---
    current_date = datetime.now().strftime("%B %d, %Y")

    # --- Current Affairs Context ---
    ca_section = ""
    if current_affairs_context:
        headlines = current_affairs_context.get("headlines", [])
        hot_topics = current_affairs_context.get("hot_topics", [])
        iim_questions = current_affairs_context.get("iim_questions", [])
        if headlines or hot_topics or iim_questions:
            ca_lines = []
            for h in headlines[:8]:
                ca_lines.append(f"  - {h.get('title', '')} ({h.get('source', 'News')}, {h.get('date', 'recent')})")
            topics_str = ", ".join(hot_topics[:5]) if hot_topics else ""
            iim_q_str = chr(10).join(f"  - {q}" for q in iim_questions) if iim_questions else "None available."
            
            ca_section = f"""
CURRENT AFFAIRS CONTEXT (Today: {current_date}):
Use these REAL, RECENT headlines to ask timely and relevant questions. 
Pick headlines that connect to the candidate's profile, interests, or hometown.
60% of your current affairs questions should reference these real headlines.
40% can be from the pre-loaded question bank.

Recent Headlines:
{chr(10).join(ca_lines)}

Trending Topics: {topics_str}

RECENT IIM INTERVIEW QUESTIONS ON CANDIDATE'S INTERESTS:
{iim_q_str}
CRITICAL INSTRUCTION: Use these exact questions (or variations of them) when interviewing the candidate on their interests.

IMPORTANT: When asking about current affairs, formulate your OWN question based on these headlines.
Don't just read out the headline. Relate it to the candidate's profile or ask for their analysis.
"""

    # --- Hometown Intelligence ---
    hometown_section = ""
    if hometown_context and hometown_context.get("city"):
        ctx = hometown_context
        hometown_section = f"""
CANDIDATE HOMETOWN CONTEXT:
  City: {ctx.get('city', 'Unknown')}, State: {ctx.get('state', 'Unknown')}
  Chief Minister: {ctx.get('cm', 'Unknown')} | Governor: {ctx.get('governor', 'Unknown')}
  Lok Sabha MP / MLA Data: {ctx.get('mp', 'Unknown')} | {ctx.get('mla', 'Unknown')}
  Major Industries: {ctx.get('major_industries', 'Unknown')}
  Famous Landmarks: {ctx.get('famous_landmarks', 'Unknown')}
  Recent Local News: {ctx.get('recent_local_news', 'None found')}

USE this to ask specific hometown questions. The candidate SHOULD know these facts.
CRITICAL INSTRUCTION: You MUST actively test their knowledge of their city/state. 
Examples of questions you should dynamically generate and ask:
- "Can you name the local MLA or MP for your specific constituency in {ctx.get('city', 'your city')}?"
- "If I were to visit {ctx.get('city', 'your city')}, what 5-10 places would you take me to, and justify why from an economic or historical perspective?"
- "How do the major industries in {ctx.get('state', 'your state')} contribute to the national GDP?"
If they can't answer basic local facts, note this as a severe knowledge gap.
"""

    # --- Interest-Based Grilling ---
    interest_section = ""
    if interests:
        interests_str = ", ".join(interests)
        covered = memory_state.get("covered_interest_topics", [])
        covered_str = ", ".join(covered) if covered else "None yet"
        interest_section = f"""
CANDIDATE DECLARED INTERESTS: {interests_str}
Already probed: {covered_str}

RULES FOR INTEREST-BASED PROBING:
1. These interests are a PART of the interview, not the whole interview.
   Spend 2-4 turns maximum on any single interest topic before moving on.
2. Apply the "Expert Rule": since the candidate CHOSE these interests, 
   they are expected to demonstrate genuine depth. Don't accept surface-level answers.
3. Use the 3-Level probe:
   - Level 1: Broad → "You mentioned {interests_str.split(',')[0].strip()}. What's your view on [topic]?"
   - Level 2: Specific → Challenge their stance with a counter-argument
   - Level 3: Synthesis → Ask them to reconcile or connect to management/business
4. If they struggle on their OWN declared interest, this is a significant gap.
   Note it, but don't humiliate — move on professionally.
5. Distribute interest questions across the interview, don't cluster them.
"""

    return f"""{persona_prompt}

IMPORTANT CONTEXT: Today's actual date is {current_date}. 
Do NOT assume any dates past this point have already occurred. If the candidate's resume includes dates after {current_date}, it means they are currently pursuing or about to start that role. Do NOT accuse them of claiming future dates as completed.

{profile_section}

{memory_section}

{rag_section}

{resume_section}

{ca_section}

{hometown_section}

{interest_section}

{stage_section}

OUTPUT INSTRUCTIONS:
- CRITICAL LENGTH RULE: Keep your response ULTRA-CONCISE — maximum 2 to 3 short sentences total (under 45 words total!). In a verbal interview, long responses sound like robotic lectures and take too long to speak out loud.
- Do NOT lecture, explain economic theories, or summarize what the candidate just said. Get straight to the point: give a brief 1-sentence reaction or challenge, followed immediately by your 1-sentence question.
- Respond ONLY as the interviewer — never narrate or describe actions.
- Ask exactly ONE question or make ONE pointed observation.
- Do NOT use bullet points or lists — speak naturally.
- NEVER repeat a question you have already asked — check the conversation history above and do NOT rephrase or re-ask a previous question.
- NEVER say the same thing twice within your response.
- Your response should contain exactly ONE question. Do NOT ask multiple questions in the same turn.
- ANTI-LOOP & ANTI-BAIT MECHANISM: If the candidate tries to bait you into asking only about their favorite subject (e.g., "I am a geopolitical nerd, ask me current affairs"), do NOT take the bait! You MUST test their entire profile.
- STRICT TOPIC CAP: Never spend more than 2 to 3 consecutive turns on ANY single domain (e.g., Current Affairs, Geopolitics, Economics, or Hobbies). After at most 3 turns on a general theme, you MUST force a hard pivot to a completely different subject area (e.g., "Let's leave current affairs aside and talk about your academics/work experience..."). Do NOT get stuck in a conversational loop.

INTERVIEW COMPOSITION RULE (ADAPTIVE):
Use the following distribution as a general BASELINE, but you MUST dynamically shift these weights based on the candidate's specific profile:
- 35-45% Academics (Increase heavily for freshers)
- 20-30% Work Experience / Internships (Increase heavily for experienced candidates)
- 15-20% Current Affairs / Declared Interests (Adjust based on flow, capped at max 3 consecutive turns!)
- 5-15% Regional / Hometown
- Remainder: Goals, Hobbies, HR-type questions

CRITICAL ADAPTATION INSTRUCTIONS:
1. Shift focus based on profile: If they have extensive work experience, focus more on their job. If they are a fresher, focus heavily on academics.
2. Target Weak Points: If you identify weak points, knowledge gaps, or specific pressure points in their profile, quickly shift to test those areas regardless of the baseline percentages.
3. Enforce Rotation: Even if a deep-dive is interesting, do NOT allow any single topic (like geopolitics) to consume more than 25% of the total interview.

CURRENT AFFAIRS DRILL-DOWN TECHNIQUE:
When asking a current affairs or opinion question, use a sharp, concise approach to test depth:
1. THE HOOK: Broad question → "What are your thoughts on X?"
2. THE CHALLENGE: Sharp counter-perspective in ONE short sentence → "But have you considered Y?"
3. THE TIE-IN: Connect to management → "As a future manager, how would you handle Z?"
ADAPTIVE RULE: Keep each layer under 45 words total! Do NOT deliver a lecture before asking your question. Spread these layers across turns, and remember the strict 3-turn cap per topic!

CONVERSATION BOUNDARIES:
- If the candidate is highly unprofessional or explicitly demands to stop the interview, you MUST append the exact token [TERMINATE] at the end of your response to end the interview.
- NEVER use the [TERMINATE] token during a normal, professional conversation.
"""


def _build_profile_section(profile: dict) -> str:
    """Format the candidate profile for the system prompt."""
    if not profile:
        return "CANDIDATE PROFILE: No profile data available. Ask introductory questions."

    # Extract key fields
    name = profile.get("name", "Unknown")
    education = profile.get("education", [])
    work = profile.get("work_experience", [])
    skills = profile.get("skills", [])
    hobbies = profile.get("hobbies", [])
    interests = profile.get("interests", [])
    hometown = profile.get("hometown", "")
    state = profile.get("state", "")
    cat_score = profile.get("cat_score", "Not provided")
    career_goals = profile.get("career_goals", "Not stated")

    edu_str = ""
    for edu in education[:3]:  # Max 3 entries
        if isinstance(edu, dict):
            edu_str += f"\n  - {edu.get('degree', '')} in {edu.get('field', '')} from {edu.get('institution', '')} ({edu.get('score', '')})"

    work_str = ""
    for w in work[:3]:
        if isinstance(w, dict):
            work_str += f"\n  - {w.get('role', '')} at {w.get('company', '')} ({w.get('duration', '')})"

    return f"""CANDIDATE PROFILE:
  Name: {name}
  CAT Score: {cat_score}
  Career Goals: {career_goals}
  Education:{edu_str if edu_str else ' Not available'}
  Work Experience:{work_str if work_str else ' Fresher / Not available'}
  Skills: {', '.join(skills[:10]) if skills else 'Not listed'}
  Hobbies: {', '.join(hobbies[:5]) if hobbies else 'Not listed'}
  Hometown: {hometown if hometown else 'Not specified'}, State: {state if state else 'Not specified'}
  Declared Interests: {', '.join(interests) if interests else 'None declared'}
"""


def _build_memory_section(memory: dict) -> str:
    """Format conversation memory for the system prompt."""
    if not memory:
        return "CONVERSATION MEMORY: This is the start of the interview."

    lines = []

    # Claims made
    claims = memory.get("claims", [])
    for claim in claims[-5:]:  # Last 5 claims
        flag = f" [{claim.get('flag', '')}]" if claim.get("flag") else ""
        lines.append(f"  - Turn {claim.get('turn', '?')}: Claimed \"{claim.get('claim', '')}\" — confidence: {claim.get('confidence', 'unknown')}{flag}")

    # Contradictions
    contradictions = memory.get("contradictions", [])
    for c in contradictions:
        status = c.get("status", "unresolved")
        lines.append(f"  - ⚠ CONTRADICTION ({status}): {c.get('description', c.get('type', 'unknown'))}")

    # Weak answers
    weak = memory.get("weak_answers", [])
    if weak:
        lines.append(f"  - Weak answers at turns: {weak}")

    # Revisit queue
    revisit = memory.get("revisit_queue", [])
    if revisit:
        lines.append(f"  - REVISIT QUEUE (bring up again): turns {revisit}")

    memory_text = "\n".join(lines) if lines else "  No notable observations yet."

    return f"""CONVERSATION MEMORY (use this to inform your next question):
{memory_text}
  Current pressure level: {memory.get('pressure_level', 0.5):.1f}/1.0
"""


def _build_stage_instructions(stage: str, pressure_level: float) -> str:
    """Get stage-specific instructions."""

    stages = {
        "warmup": f"""CURRENT STAGE: WARMUP (pressure: {pressure_level:.1f})
INSTRUCTIONS:
- Start with a general question like "Tell me about yourself" or "Walk me through your background"
- Listen carefully and identify potential areas to probe later
- Keep the tone relatively neutral — you're establishing baseline
- Start noting any vague claims or inconsistencies for later
""",
        "core_questioning": f"""CURRENT STAGE: CORE QUESTIONING (pressure: {pressure_level:.1f})
INSTRUCTIONS:
- You MUST rotate across different topic areas throughout the interview.
- Do NOT stay on one area for more than 2 consecutive questions.
- Use the TOPIC COVERAGE section to see what hasn't been asked yet.
- Begin challenging vague or generic answers
- Start building pressure gradually
- If you notice a CAT score in the profile, ONLY ask about it if relevant, do not force it.
""",
        "pressure_round": f"""CURRENT STAGE: PRESSURE ROUND (pressure: {pressure_level:.1f})
INSTRUCTIONS:
- This is the high-pressure phase — be aggressive but professional
- Challenge contradictions directly: "Earlier you said X, now you say Y"
- If answers are vague, demand specifics: "Give me numbers. What was the actual impact?"
- Ask uncomfortable questions about gaps, weaknesses, and failures
- Test their composure — do they crack or stay poised?
- Do NOT let weak answers slide — follow up immediately
""",
        "revisit": f"""CURRENT STAGE: REVISIT (pressure: {pressure_level:.1f})
INSTRUCTIONS:
- Revisit weak answers from earlier in the interview
- Reframe the question differently to test if the candidate can articulate better
- This is their second chance — if they fail again, note it as a significant weakness
- Reference what they said before: "Earlier when I asked about X, you said Y. I want to come back to that."
""",
        "closing": f"""CURRENT STAGE: CLOSING (pressure: {pressure_level:.1f})
INSTRUCTIONS:
- If this is the start of the closing stage, ask "Do you have any questions for us?" — this is evaluative, not just polite.
- If the candidate asks a question, you MUST answer it briefly (2-3 sentences max).
- AFTER answering their question (or if they say they have no questions), you MUST output the exact token [TERMINATE] to officially end the interview.
- Do NOT output [TERMINATE] on the same turn you ask "Do you have any questions?". Only output it after they have had a chance to respond.
""",
    }

    return stages.get(stage, stages["core_questioning"])
