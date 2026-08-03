"""
Interview API routes.
Handles interview lifecycle: start, respond, get state, end.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.tables import User, Profile, Interview, Evaluation
from api.auth import get_current_user
from core.interview_engine import interview_engine
from models.interview import (
    InterviewStartRequest, 
    InterviewRespondRequest,
    TelemetryRequest,
    TelemetryResponse
)

router = APIRouter()


@router.post("/start")
async def start_interview(
    data: InterviewStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Start a new interview session.

    Requires a profile_id. Creates the interview record,
    initializes memory, and returns the first interviewer question.
    """
    # Verify profile exists and belongs to user
    result = await db.execute(
        select(Profile).where(Profile.id == data.profile_id, Profile.user_id == user.id)
    )
    profile_record = result.scalar_one_or_none()
    if not profile_record:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Create interview record
    interview = Interview(
        user_id=user.id,
        profile_id=data.profile_id,
        status="active",
        interview_type=data.interview_type,
        target_iim=data.target_iim,
        panel_config={"persona": data.persona},
        started_at=datetime.now(timezone.utc),
    )
    db.add(interview)
    await db.flush()
    await db.commit()  # Release SQLite write lock BEFORE the long LLM call

    # Start the interview engine
    try:
        profile_data = profile_record.parsed_profile or {}
        profile_data["_db_id"] = str(profile_record.id)
        
        # Inject candidate details from setup form
        if data.hometown:
            profile_data["hometown"] = data.hometown
        if data.state:
            profile_data["state"] = data.state
        if data.interests:
            profile_data["interests"] = data.interests
        
        response = await asyncio.wait_for(
            interview_engine.start_interview(
                interview_id=interview.id,
                profile=profile_data,
                persona_key=data.persona,
            ),
            timeout=90.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Interview initialization timed out. Please try again."
        )
    except Exception as e:
        import logging
        error_msg = str(e)
        logging.error(f"Failed to start interview: {error_msg}")
        # Clean up the already-committed interview record on failure
        try:
            await db.execute(delete(Interview).where(Interview.id == interview.id))
            await db.commit()
        except Exception:
            pass
        # Give user a clear message for rate limits vs other errors
        if "rate limit" in error_msg.lower() or "429" in error_msg:
            raise HTTPException(status_code=429, detail="The AI service is temporarily busy. Please wait 30 seconds and try again.")
        raise HTTPException(status_code=500, detail="An internal error occurred while starting the interview.")

    # Persist session state to DB for crash recovery
    from core.memory_engine import persist_session
    await persist_session(interview.id, db=db)

    return {
        "interview_id": interview.id,
        **response,
    }


@router.post("/{interview_id}/respond")
async def respond_to_interviewer(
    interview_id: str,
    data: InterviewRespondRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit the candidate's answer and get the next interviewer response.

    This is the main interview loop endpoint.
    """
    # Verify interview exists and belongs to user
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    if interview.status != "active":
        raise HTTPException(status_code=400, detail="Interview is not active")

    # Get persona from panel config
    persona_key = (interview.panel_config or {}).get("persona", "skeptic")

    # Process through interview engine
    try:
        response = await asyncio.wait_for(
            interview_engine.process_response(
                interview_id=interview_id,
                candidate_answer=data.answer,
                persona_key=persona_key,
            ),
            timeout=90.0,  # 90 second hard limit
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="The interviewer is taking too long to respond. Please try again."
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import logging
        logging.error(f"Interview engine error: {str(e)}")
        raise HTTPException(status_code=500, detail="An internal error occurred while processing the response.")

    # Persist session state to DB for crash recovery
    from core.memory_engine import persist_session
    await persist_session(interview_id, db=db)

    # If interview is complete, update the record
    if response.get("is_complete"):
        interview.status = "completed"
        interview.ended_at = datetime.now(timezone.utc)
        # Persist final conversation log
        state = interview_engine.get_interview_state(interview_id)
        if state:
            interview.conversation_log = state.get("conversation_log", [])

    return response


@router.get("/user/history")
async def get_interview_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the history of all interviews for the current user."""
    # Left join with Evaluation to get overall_score
    result = await db.execute(
        select(Interview, Evaluation.overall_score, Evaluation.overall_assessment, Evaluation.panel_perception)
        .outerjoin(Evaluation, Interview.id == Evaluation.interview_id)
        .where(Interview.user_id == user.id)
        .order_by(Interview.started_at.desc())
    )
    # result.all() returns tuples of (Interview, overall_score, overall_assessment, panel_perception)
    rows = result.all()

    return [
        {
            "id": i.id,
            "status": i.status,
            "interview_type": i.interview_type,
            "target_iim": i.target_iim,
            "started_at": str(i.started_at),
            "ended_at": str(i.ended_at) if i.ended_at else None,
            "persona": (i.panel_config or {}).get("persona", "Unknown"),
            "overall_score": score,
            "overall_assessment": assessment,
            "panel_perception": perception,
        }
        for (i, score, assessment, perception) in rows
    ]


@router.get("/{interview_id}")
async def get_interview(
    interview_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current state of an interview."""
    # Check DB record
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Get live state from memory engine if active
    live_state = interview_engine.get_interview_state(interview_id)

    # Try to restore from DB if session was lost (e.g., server restart)
    if not live_state and interview.status == "active":
        from core.memory_engine import restore_session
        restored = await restore_session(interview_id, db=db)
        if restored:
            live_state = interview_engine.get_interview_state(interview_id)
            if live_state:
                live_state["persona"] = (interview.panel_config or {}).get("persona", "iim_general")
                return live_state

    if live_state:
        live_state["persona"] = (interview.panel_config or {}).get("persona", "iim_general")
        return live_state

    # Return persisted state if completed
    return {
        "id": interview.id,
        "status": interview.status,
        "interview_type": interview.interview_type,
        "target_iim": interview.target_iim,
        "persona": (interview.panel_config or {}).get("persona", "iim_general"),
        "conversation_log": interview.conversation_log or [],
        "started_at": str(interview.started_at),
        "ended_at": str(interview.ended_at) if interview.ended_at else None,
    }


@router.post("/{interview_id}/end")
async def end_interview(
    interview_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually end an interview and persist the final state.
    Triggers evaluation generation.
    """
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    try:
        final_state = interview_engine.end_interview(interview_id)
    except ValueError:
        # Already ended — return current state
        return {"status": interview.status, "message": "Interview already ended"}

    # Update DB record
    interview.status = "completed"
    interview.ended_at = datetime.now(timezone.utc)
    interview.conversation_log = final_state.get("conversation_log", [])
    interview.contradiction_tracker = {
        "claims": final_state.get("claims", []),
        "contradictions": final_state.get("contradictions", []),
        "weak_answers": final_state.get("weak_answers", []),
    }
    interview.behavioral_metrics = final_state.get("vision_summary", {})

    return {
        "status": "completed",
        "final_state": final_state,
        "message": "Interview ended. Call /api/evaluation/{interview_id} to generate scores.",
    }


@router.delete("/user/history/all")
async def delete_all_interviews(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all interviews and their evaluations for the current user."""
    # Find all interviews for this user
    result = await db.execute(select(Interview).where(Interview.user_id == user.id))
    interviews = result.scalars().all()
    
    if not interviews:
        return {"status": "success", "message": "No interviews to delete", "deleted_count": 0}
        
    interview_ids = [i.id for i in interviews]
    
    # Delete associated evaluations
    await db.execute(delete(Evaluation).where(Evaluation.interview_id.in_(interview_ids)))
    
    # Delete the interviews
    await db.execute(delete(Interview).where(Interview.id.in_(interview_ids)))
    await db.commit()
    
    # Try to clean up from memory engine
    try:
        from core.memory_engine import get_session
        from core.interview_engine import interview_engine
        for i_id in interview_ids:
            if get_session(i_id):
                interview_engine.end_interview(i_id)
    except Exception:
        pass
        
    return {"status": "success", "message": f"Deleted {len(interview_ids)} interviews", "deleted_count": len(interview_ids)}


@router.delete("/{interview_id}")
async def delete_interview(
    interview_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an interview and its associated evaluation."""
    # Verify ownership
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Delete associated evaluation first if it exists
    await db.execute(delete(Evaluation).where(Evaluation.interview_id == interview_id))
    
    # Delete the interview
    await db.delete(interview)
    await db.commit()
    
    # Optional: also remove from in-memory engine if active
    try:
        from core.memory_engine import get_session
        if get_session(interview_id):
            from core.interview_engine import interview_engine
            interview_engine.end_interview(interview_id)
    except Exception:
        pass
        
    return {"status": "success", "message": "Interview deleted"}

@router.post("/{interview_id}/telemetry", response_model=TelemetryResponse)
async def process_telemetry(
    interview_id: str,
    req: TelemetryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Process in-progress audio telemetry for interjections."""
    # Verify the session is active in memory
    if not interview_engine.get_interview_state(interview_id):
        return TelemetryResponse(should_interject=False)
        
    # Verify the interview belongs to the current user
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
        
    result_telemetry = await interview_engine.process_telemetry(
        interview_id=interview_id,
        interim_text=req.interim_text,
        stutter_count=req.stutter_count,
        mumbling=req.mumbling,
        vision_metrics=req.vision_metrics.model_dump() if req.vision_metrics else None
    )
    
    return TelemetryResponse(**result_telemetry)
