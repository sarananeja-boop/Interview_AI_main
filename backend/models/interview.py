"""
Pydantic schemas for interview sessions.
"""

from pydantic import BaseModel, Field


class InterviewStartRequest(BaseModel):
    profile_id: str
    interview_type: str = "iim_general"
    target_iim: str | None = None
    persona: str = "skeptic"  # skeptic | academic | friendly_trap | mixed
    hometown: str | None = None
    state: str | None = None
    interests: list[str] = []


class InterviewRespondRequest(BaseModel):
    answer: str = Field(description="Candidate's answer text")


class ConversationTurn(BaseModel):
    role: str  # "interviewer" | "candidate"
    content: str
    turn_number: int
    stage: str  # warmup | core | pressure | revisit | closing
    metadata: dict = {}  # flags like WEAK, CONTRADICTION, etc.


class InterviewState(BaseModel):
    id: str
    status: str
    current_stage: str
    turn_count: int
    pressure_level: float
    conversation_log: list[ConversationTurn]
    contradiction_count: int
    weak_answer_count: int


class InterviewResponse(BaseModel):
    """What the API returns after each candidate response."""
    interviewer_message: str
    current_stage: str
    turn_number: int
    pressure_level: float
    is_complete: bool = False
    metadata: dict = {}

class VisionMetrics(BaseModel):
    eye_contact_score: float = Field(ge=-1, le=1, default=1.0)  # -1 = face tracking unavailable
    head_yaw: float = 0.0
    head_pitch: float = 0.0
    posture_score: float = Field(ge=-1, le=1, default=1.0)  # -1 = face tracking unavailable
    face_visible: bool = True
    movement_stability: float = Field(ge=-1, le=1, default=1.0)  # -1 = face tracking unavailable
    looking_down_while_speaking: bool = False
    face_in_frame_pct: float = Field(ge=0, le=1, default=1.0)
    shoulder_alignment: float = Field(ge=0, le=1, default=1.0)
    phone_violation: bool = False
    inappropriate_gesture: bool = False
    multiple_people_detected: bool = False

class TelemetryRequest(BaseModel):
    interim_text: str
    stutter_count: int = 0
    mumbling: bool = False
    vision_metrics: VisionMetrics | None = None

class TelemetryResponse(BaseModel):
    should_interject: bool
    interjection_message: str | None = None

