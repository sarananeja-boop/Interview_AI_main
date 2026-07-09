"""
Conversation Memory Engine.

Maintains per-session state including:
- Full conversation log
- Claims tracking
- Contradiction detection
- Weak answer flagging
- Pressure level management
- Revisit queue
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# In-memory session store (Redis replacement for MVP)
_sessions: dict[str, "InterviewMemory"] = {}


class InterviewMemory:
    """Stateful memory for a single interview session."""

    def __init__(self, interview_id: str, profile: dict | None = None):
        self.interview_id = interview_id
        self.profile = profile or {}

        # Conversation log
        self.conversation_log: list[dict] = []
        self.turn_count: int = 0

        # Claims tracking
        self.claims: list[dict] = []

        # Contradiction tracking
        self.contradictions: list[dict] = []

        # Answer quality tracking
        self.weak_answers: list[int] = []
        self.strong_answers: list[int] = []

        # Revisit queue — turn numbers to come back to
        self.revisit_queue: list[int] = []

        # Pressure management
        self.pressure_level: float = 0.3  # starts low

        # Question tracking for diversity
        self._asked_question_ids: list[str] = []
        self._covered_categories: list[str] = []  # ordered list of categories already touched
        self._recent_categories: list[str] = []   # rolling window of last 2 categories
        self._topic_history: list[str] = []
        self._consecutive_same_topic: int = 0

        # Interview stage
        self.current_stage: str = "warmup"
        self.started_at = datetime.now(timezone.utc)
        self.stage_turn_counts: dict[str, int] = {
            "warmup": 0,
            "core_questioning": 0,
            "pressure_round": 0,
            "revisit": 0,
            "closing": 0,
        }
        
        # Vision Telemetry History
        self.vision_history: list[dict] = []

        # Current affairs and interest tracking
        self.interests: list[str] = []
        self.hometown_context: dict = {}
        self.current_affairs_context: dict = {}
        self._covered_interest_topics: list[str] = []  # tracks which interests have been probed
        self._current_affairs_depth: dict[str, int] = {}  # topic -> number of follow-ups done
        self.interest_performance: dict[str, str] = {}  # interest -> "strong"/"weak"

    def add_turn(self, role: str, content: str, metadata: dict | None = None) -> int:
        """Add a conversation turn and return the turn number."""
        self.turn_count += 1
        turn = {
            "role": role,
            "content": content,
            "turn_number": self.turn_count,
            "stage": self.current_stage,
            "metadata": metadata or {},
        }
        self.conversation_log.append(turn)
        self.stage_turn_counts[self.current_stage] = (
            self.stage_turn_counts.get(self.current_stage, 0) + 1
        )
        return self.turn_count

    def add_claim(self, claim: str, confidence: str = "medium", flag: str = ""):
        """Track a claim made by the candidate."""
        self.claims.append({
            "claim": claim,
            "turn": self.turn_count,
            "confidence": confidence,
            "flag": flag,
        })

    def add_contradiction(self, description: str, turns: list[int]):
        """Flag a contradiction between two answers."""
        self.contradictions.append({
            "description": description,
            "turns": turns,
            "status": "unresolved",
            "type": "contradiction",
        })
        # Increase pressure when contradictions found
        self.pressure_level = min(1.0, self.pressure_level + 0.15)

    def flag_weak_answer(self, turn_number: int | None = None):
        """Flag the current (or specified) answer as weak."""
        t = turn_number or self.turn_count
        if t not in self.weak_answers:
            self.weak_answers.append(t)
            self.revisit_queue.append(t)
            # Weak answers increase pressure
            self.pressure_level = min(1.0, self.pressure_level + 0.1)

    def flag_strong_answer(self, turn_number: int | None = None):
        """Flag an answer as strong — slightly reduces pressure."""
        t = turn_number or self.turn_count
        if t not in self.strong_answers:
            self.strong_answers.append(t)
            self.pressure_level = max(0.2, self.pressure_level - 0.05)

    def pop_revisit(self) -> int | None:
        """Get the next turn to revisit, if any."""
        if self.revisit_queue:
            return self.revisit_queue.pop(0)
        return None

    def should_advance_stage(self) -> bool:
        """Check if it's time to move to the next interview stage."""
        stage_limits = {
            "warmup": 3,           # 2-3 questions
            "core_questioning": 7,  # 5-7 questions
            "pressure_round": 4,    # 3-4 questions
            "revisit": 2,           # 1-2 questions
            "closing": 1,           # 1 question
        }
        current_count = self.stage_turn_counts.get(self.current_stage, 0)
        # Count only interviewer turns for stage advancement
        interviewer_turns = current_count // 2  # roughly half are interviewer turns
        limit = stage_limits.get(self.current_stage, 5)
        return interviewer_turns >= limit

    def advance_stage(self):
        """Move to the next interview stage."""
        stage_order = ["warmup", "core_questioning", "pressure_round", "revisit", "closing"]
        try:
            idx = stage_order.index(self.current_stage)
            if idx < len(stage_order) - 1:
                self.current_stage = stage_order[idx + 1]
                logger.info(f"Interview {self.interview_id}: Advanced to {self.current_stage}")

                # Adjust pressure based on stage
                if self.current_stage == "pressure_round":
                    self.pressure_level = max(self.pressure_level, 0.7)
                elif self.current_stage == "revisit":
                    self.pressure_level = max(self.pressure_level, 0.6)
                elif self.current_stage == "closing":
                    self.pressure_level = max(0.3, self.pressure_level - 0.2)
        except ValueError:
            pass

    def is_complete(self) -> bool:
        """Check if the interview is complete (only true if LLM outputs [TERMINATE])."""
        return self.current_stage == "completed"

    def record_vision_metrics(self, metrics: dict):
        """Record a snapshot of vision metrics from the frontend telemetry loop."""
        if not metrics: return
        metrics["timestamp"] = datetime.now(timezone.utc).isoformat()
        metrics["turn_number"] = self.turn_count
        self.vision_history.append(metrics)

    def get_aggregated_vision_metrics(self) -> dict | None:
        """Compute session-wide averages for behavioral metrics.
        
        Handles -1 values as 'face tracking unavailable' by excluding them
        from averages instead of treating them as 0.
        """
        if not self.vision_history:
            return None
            
        history = self.vision_history
        total = len(history)
        
        # Filter out -1 values (face tracking unavailable) for face-dependent metrics
        valid_eye = [m.get("eye_contact_score", 0) for m in history if m.get("eye_contact_score", 0) >= 0]
        valid_posture = [m.get("posture_score", 0) for m in history if m.get("posture_score", 0) >= 0]
        valid_stability = [m.get("movement_stability", 0) for m in history if m.get("movement_stability", 0) >= 0]
        
        avg_eye_contact = sum(valid_eye) / len(valid_eye) if valid_eye else 0.0
        avg_posture = sum(valid_posture) / len(valid_posture) if valid_posture else 0.0
        avg_stability = sum(valid_stability) / len(valid_stability) if valid_stability else 0.0
        face_visible_pct = sum(m.get("face_in_frame_pct", 1) for m in history) / total
        avg_shoulder_alignment = sum(m.get("shoulder_alignment", 1.0) for m in history) / total
        
        # Count explicit looking down events while speaking
        looking_down_count = sum(1 for m in history if m.get("looking_down_while_speaking", False))
        
        phone_violation = any(m.get("phone_violation", False) for m in history)
        inappropriate_gesture = any(m.get("inappropriate_gesture", False) for m in history)
        multiple_people_detected = any(m.get("multiple_people_detected", False) for m in history)
        
        return {
            "eye_contact_score": avg_eye_contact,
            "posture_score": avg_posture,
            "movement_stability": avg_stability,
            "face_visible_pct": face_visible_pct,
            "looking_down_count": looking_down_count,
            "total_telemetry_windows": total,
            "shoulder_alignment": avg_shoulder_alignment,
            "phone_violation": phone_violation,
            "inappropriate_gesture": inappropriate_gesture,
            "multiple_people_detected": multiple_people_detected
        }

    def get_state(self) -> dict:
        """Export the full memory state (for prompt injection and persistence)."""
        return {
            "claims": self.claims,
            "contradictions": self.contradictions,
            "weak_answers": self.weak_answers,
            "strong_answers": self.strong_answers,
            "revisit_queue": self.revisit_queue,
            "pressure_level": self.pressure_level,
            "current_stage": self.current_stage,
            "turn_count": self.turn_count,
            "recent_categories": getattr(self, "_recent_categories", []),
            "topic_history": getattr(self, "_topic_history", []),
            "consecutive_same_topic": getattr(self, "_consecutive_same_topic", 0),
            "vision_summary": self.get_aggregated_vision_metrics(),
            "interests": getattr(self, "interests", []),
            "covered_interest_topics": getattr(self, "_covered_interest_topics", []),
            "current_affairs_depth": getattr(self, "_current_affairs_depth", {}),
        }

    def track_category(self, category: str):
        """Track that a category was used to enforce diversity."""
        if not category:
            return
        if category not in self._covered_categories:
            self._covered_categories.append(category)
        self._recent_categories.append(category)
        if len(self._recent_categories) > 2:
            self._recent_categories.pop(0)
            
        # Update topic history and consecutive counter
        if self._topic_history and self._topic_history[-1] == category:
            self._consecutive_same_topic += 1
        else:
            self._consecutive_same_topic = 1
        self._topic_history.append(category)

    def get_topic_coverage_prompt(self, available_categories: list[str]) -> str:
        """Generate the topic coverage status display for the LLM."""
        lines = ["TOPIC COVERAGE (you MUST ask from uncovered areas):"]
        for cat in available_categories:
            count = self._topic_history.count(cat)
            if count > 0:
                if count >= 2:
                    lines.append(f"✅ {cat} ({count} questions — ENOUGH, move on)")
                else:
                    lines.append(f"✅ {cat} ({count} questions)")
            else:
                lines.append(f"❌ {cat} — NOT YET ASKED")
                
        if self._consecutive_same_topic >= 2:
            lines.append(f"⚠️ CONSECUTIVE SAME-TOPIC: {self._consecutive_same_topic} — YOU MUST SWITCH NOW")
            
        return "\n".join(lines)

    def get_conversation_for_llm(self) -> list[dict]:
        """Format conversation history for LLM context."""
        formatted = []
        for turn in self.conversation_log:
            role = "user" if turn["role"] == "candidate" else "model"
            formatted.append({"role": role, "content": turn["content"]})
        return formatted

    def to_dict(self) -> dict:
        """Full serialization for database persistence."""
        return {
            "conversation_log": self.conversation_log,
            "claims": self.claims,
            "contradictions": self.contradictions,
            "weak_answers": self.weak_answers,
            "strong_answers": self.strong_answers,
            "revisit_queue": self.revisit_queue,
            "pressure_level": self.pressure_level,
            "current_stage": self.current_stage,
            "turn_count": self.turn_count,
            "stage_turn_counts": self.stage_turn_counts,
            "_asked_question_ids": self._asked_question_ids,
            "_covered_categories": self._covered_categories,
            "_topic_history": getattr(self, "_topic_history", []),
            "_consecutive_same_topic": getattr(self, "_consecutive_same_topic", 0),
            "vision_history": self.vision_history,
            "vision_summary": self.get_aggregated_vision_metrics(),
            "interests": getattr(self, "interests", []),
            "hometown_context": getattr(self, "hometown_context", {}),
            "current_affairs_context": getattr(self, "current_affairs_context", {}),
            "_covered_interest_topics": getattr(self, "_covered_interest_topics", []),
            "_current_affairs_depth": getattr(self, "_current_affairs_depth", {}),
            "interest_performance": getattr(self, "interest_performance", {}),
        }

    @classmethod
    def from_dict(cls, interview_id: str, data: dict, profile: dict | None = None) -> "InterviewMemory":
        """Restore an InterviewMemory from a serialized dict (DB recovery)."""
        mem = cls(interview_id, profile)
        mem.conversation_log = data.get("conversation_log", [])
        mem.turn_count = data.get("turn_count", 0)
        mem.claims = data.get("claims", [])
        mem.contradictions = data.get("contradictions", [])
        mem.weak_answers = data.get("weak_answers", [])
        mem.strong_answers = data.get("strong_answers", [])
        mem.revisit_queue = data.get("revisit_queue", [])
        mem.pressure_level = data.get("pressure_level", 0.3)
        mem.current_stage = data.get("current_stage", "warmup")
        mem.stage_turn_counts = data.get("stage_turn_counts", {
            "warmup": 0, "core_questioning": 0, "pressure_round": 0,
            "revisit": 0, "closing": 0,
        })
        mem._asked_question_ids = data.get("_asked_question_ids", [])
        mem._covered_categories = data.get("_covered_categories", [])
        mem._topic_history = data.get("_topic_history", [])
        mem._consecutive_same_topic = data.get("_consecutive_same_topic", 0)
        mem.vision_history = data.get("vision_history", [])
        mem.interests = data.get("interests", [])
        mem.hometown_context = data.get("hometown_context", {})
        mem.current_affairs_context = data.get("current_affairs_context", {})
        mem._covered_interest_topics = data.get("_covered_interest_topics", [])
        mem._current_affairs_depth = data.get("_current_affairs_depth", {})
        mem.interest_performance = data.get("interest_performance", {})
        return mem


# --- Session Store Functions ---

def create_session(interview_id: str, profile: dict | None = None) -> InterviewMemory:
    """Create a new interview memory session."""
    session = InterviewMemory(interview_id, profile)
    _sessions[interview_id] = session
    return session


def get_session(interview_id: str) -> InterviewMemory | None:
    """Retrieve an active session."""
    return _sessions.get(interview_id)


def delete_session(interview_id: str):
    """Remove a completed session from memory."""
    _sessions.pop(interview_id, None)

async def persist_session(interview_id: str):
    """Persist the current in-memory session state to the database."""
    session = _sessions.get(interview_id)
    if not session:
        return
    
    try:
        from db import async_session
        from db.tables import Interview
        from sqlalchemy import select
        from datetime import datetime, timezone
        
        async with async_session() as db:
            result = await db.execute(
                select(Interview).where(Interview.id == interview_id)
            )
            interview = result.scalar_one_or_none()
            if interview:
                interview.active_state = session.to_dict()
                interview.last_heartbeat = datetime.now(timezone.utc)
                await db.commit()
    except Exception as e:
        logger.error(f"Failed to persist session {interview_id}: {e}")

async def restore_session(interview_id: str) -> InterviewMemory | None:
    """Try to restore a session from the database (after server restart)."""
    if interview_id in _sessions:
        return _sessions[interview_id]
    
    try:
        from db import async_session
        from db.tables import Interview, Profile
        from sqlalchemy import select
        
        async with async_session() as db:
            result = await db.execute(
                select(Interview).where(
                    Interview.id == interview_id,
                    Interview.status == "active",
                    Interview.active_state.isnot(None),
                )
            )
            interview = result.scalar_one_or_none()
            if not interview or not interview.active_state:
                return None
            
            # Get profile data
            profile_result = await db.execute(
                select(Profile).where(Profile.id == interview.profile_id)
            )
            profile_record = profile_result.scalar_one_or_none()
            profile_data = profile_record.parsed_profile if profile_record else {}
            if profile_data and profile_record:
                profile_data["_db_id"] = str(profile_record.id)
            
            # Restore memory from serialized state
            memory = InterviewMemory.from_dict(
                interview_id, interview.active_state, profile_data
            )
            _sessions[interview_id] = memory
            logger.info(f"Restored session {interview_id} from database (turn {memory.turn_count})")
            return memory
    except Exception as e:
        logger.error(f"Failed to restore session {interview_id}: {e}")
        return None
