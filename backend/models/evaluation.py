"""
Pydantic schemas for evaluation and scoring.
"""

from pydantic import BaseModel, Field


class DimensionScore(BaseModel):
    dimension: str
    score: float = Field(ge=0, le=10, description="Score out of 10")
    reasoning: str = Field(description="Brief justification for the score")


class EvaluationResult(BaseModel):
    """Full structured evaluation output from the scoring engine."""
    dimension_scores: list[DimensionScore] = Field(
        description="12 scoring dimensions"
    )
    overall_score: float = Field(ge=0, le=10, description="Weighted overall out of 10")
    overall_assessment: str = Field(description="2-3 sentence overall assessment")
class WeakAnswer(BaseModel):
    turn_number: int | None = Field(None, description="The conversation turn number")
    original: str = Field(description="The original answer from the candidate")
    issue: str = Field(description="What was wrong or weak about the answer")
    suggested_rewrite: str = Field(description="A better, more professional way to phrase it")

class Strength(BaseModel):
    turn_number: int | None = Field(None, description="The conversation turn number")
    original: str = Field(description="The original answer from the candidate")
    strength: str = Field(description="What was good about the answer")
    impact: str = Field(description="Why this is a positive trait")

class EvaluationResult(BaseModel):
    """Full structured evaluation output from the scoring engine."""
    dimension_scores: list[DimensionScore] = Field(
        description="12 scoring dimensions"
    )
    overall_score: float = Field(ge=0, le=10, description="Weighted overall out of 10")
    overall_assessment: str = Field(description="2-3 sentence overall assessment")
    weak_answers: list[WeakAnswer] = Field(
        description="List of weak answers with rewrites."
    )
    strengths: list[Strength] = Field(
        description="List of strong answers or positive traits."
    )
    improvement_plan: list[str] = Field(
        description="5-7 specific, actionable improvement items"
    )
    panel_perception: str = Field(
        description="How the panel likely perceived this candidate"
    )
    candidate_potential: str = Field(
        description="Assessment of the candidate's upside, potential, and underlying merit despite any structural flaws"
    )
    high_risk_areas: list[str] = Field(
        default=[],
        description="Topics that could sink the real interview"
    )


# The 12 scoring dimensions
SCORING_DIMENSIONS = [
    "communication_clarity",
    "confidence",
    "logical_structure",
    "authenticity",
    "leadership_presence",
    "pressure_handling",
    "technical_depth",
    "business_awareness",
    "answer_precision",
    "composure",
    "listening_ability",
    "speaking_fluency",
]


class EvaluationResponse(BaseModel):
    id: str
    interview_id: str
    dimension_scores: list[DimensionScore]
    overall_score: float
    overall_assessment: str
    weak_answers: list[WeakAnswer]
    strengths: list[Strength]
    improvement_plan: list[str]
    panel_perception: str
    candidate_potential: str
    high_risk_areas: list[str]
    created_at: str
