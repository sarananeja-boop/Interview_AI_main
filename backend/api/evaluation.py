"""
Evaluation API routes.
Handles post-interview scoring and feedback generation.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from db.database import get_db
from db.tables import User, Interview, Profile, Evaluation
from api.auth import get_current_user
from core.scoring_engine import evaluate_interview

router = APIRouter()


@router.get("/{interview_id}")
async def get_evaluation(
    interview_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get or generate evaluation for a completed interview.

    If evaluation already exists, returns it.
    If not, generates it from the conversation log.
    """
    # Verify interview
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    if interview.status != "completed":
        raise HTTPException(status_code=400, detail="Interview must be completed before evaluation")

    # Check if evaluation already exists
    eval_result = await db.execute(
        select(Evaluation).where(Evaluation.interview_id == interview_id)
    )
    existing_eval = eval_result.scalar_one_or_none()

    if existing_eval:
        if existing_eval.overall_score == 0.0 or not existing_eval.dimension_scores:
            # Delete broken evaluation and regenerate
            await db.delete(existing_eval)
            await db.commit() # Force commit so it doesn't roll back if generation fails
        else:
            return {
                "id": existing_eval.id,
                "interview_id": interview_id,
                "dimension_scores": existing_eval.dimension_scores,
                "overall_score": existing_eval.overall_score,
                "overall_assessment": existing_eval.overall_assessment or "",
                "weak_answers": existing_eval.weak_answers,
                "strengths": existing_eval.strengths,
                "improvement_plan": existing_eval.improvement_plan,
                "panel_perception": existing_eval.panel_perception,
                "candidate_potential": existing_eval.candidate_potential,
                "behavioral_metrics": interview.behavioral_metrics or {},
                "conversation_log": interview.conversation_log or [],
                "created_at": str(existing_eval.created_at),
            }

    # Get profile for context
    profile_result = await db.execute(
        select(Profile).where(Profile.id == interview.profile_id)
    )
    profile = profile_result.scalar_one_or_none()
    profile_data = profile.parsed_profile if profile else {}

    # Build memory state from stored data
    memory_state = {
        "turn_count": len(interview.conversation_log or []),
        "pressure_level": 0.5,
        "weak_answers": (interview.contradiction_tracker or {}).get("weak_answers", []),
        "strong_answers": [],
        "contradictions": (interview.contradiction_tracker or {}).get("contradictions", []),
        "claims": (interview.contradiction_tracker or {}).get("claims", []),
    }

    # Generate evaluation
    try:
        # Generate new evaluation
        eval_data = await evaluate_interview(
            conversation_log=interview.conversation_log,
            profile=profile_data,
            memory_state=memory_state,
            behavioral_metrics=interview.behavioral_metrics
        )
        
        if not eval_data or "dimension_scores" not in eval_data:
            raise Exception("LLM failed to generate valid structured data.")
        
        # Log evaluation quality for monitoring
        dim_count = len(eval_data.get("dimension_scores", []))
        strength_count = len(eval_data.get("strengths", []))
        weak_count = len(eval_data.get("weak_answers", []))
        plan_count = len(eval_data.get("improvement_plan", []))
        import logging
        logging.info(
            f"Evaluation generated: {dim_count}/12 dimensions, "
            f"{strength_count} strengths, {weak_count} weak answers, "
            f"{plan_count} improvement items, score={eval_data.get('overall_score')}"
        )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation generation failed: {str(e)}")

    # Save evaluation
    evaluation = Evaluation(
        interview_id=interview_id,
        dimension_scores=eval_data.get("dimension_scores", []),
        overall_score=eval_data.get("overall_score", 0),
        overall_assessment=eval_data.get("overall_assessment", ""),
        weak_answers=eval_data.get("weak_answers", []),
        strengths=eval_data.get("strengths", []),
        improvement_plan=eval_data.get("improvement_plan", []),
        panel_perception=eval_data.get("panel_perception", ""),
        candidate_potential=eval_data.get("candidate_potential", ""),
    )
    try:
        db.add(evaluation)
        await db.commit()
    except IntegrityError:
        # A simultaneous request already created the evaluation (e.g., React Strict Mode double fetch)
        await db.rollback()
        eval_result = await db.execute(
            select(Evaluation).where(Evaluation.interview_id == interview_id)
        )
        existing = eval_result.scalar_one_or_none()
        if existing:
            return {
                "id": existing.id,
                "interview_id": interview_id,
                "dimension_scores": existing.dimension_scores,
                "overall_score": existing.overall_score,
                "overall_assessment": existing.overall_assessment or "",
                "weak_answers": existing.weak_answers,
                "strengths": existing.strengths,
                "improvement_plan": existing.improvement_plan,
                "panel_perception": existing.panel_perception,
                "candidate_potential": existing.candidate_potential,
                "behavioral_metrics": interview.behavioral_metrics or {},
                "conversation_log": interview.conversation_log or [],
                "created_at": str(existing.created_at),
            }

    return {
        "id": evaluation.id,
        "interview_id": interview_id,
        **eval_data,
        "behavioral_metrics": interview.behavioral_metrics or {},
        "conversation_log": interview.conversation_log or [],
        "created_at": str(evaluation.created_at),
    }
