"""
Profile API routes.
Handles resume upload, parsing, and profile intelligence generation.

Supported input formats:
  - File upload: PDF, DOCX, DOC, TXT
  - Text paste: Raw text via /paste endpoint
"""

import os
import uuid
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from config import settings
from db.database import get_db
from db.tables import User, Profile
from api.auth import get_current_user
from core.profile_engine import extract_text_from_file, parse_profile, analyze_profile, classify_candidate_type
from core.vector_store import vector_store

from core.security import mask_pii_enhanced

def chunk_text(text: str, chunk_size: int = 150) -> list:
    words = text.split()
    return [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]

router = APIRouter()


class PasteResumeRequest(BaseModel):
    text: str
    name: str = "Pasted Resume"  # Optional label


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a resume (PDF/DOCX/TXT), parse it, and generate profile intelligence.

    Returns the parsed profile with strengths, weaknesses, and pressure points.
    """

    # Enforce limit of 5 personas
    count_res = await db.execute(select(func.count(Profile.id)).where(Profile.user_id == user.id))
    if count_res.scalar() >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 personas allowed. Delete an existing one to add more.")

    # Validate file type
    allowed_extensions = {".pdf", ".docx", ".doc", ".txt"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(allowed_extensions)}"
        )
        
    content = await file.read()
    if len(content) > 10_485_760:  # 10 MB limit
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Save file to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    save_filename = f"{file_id}{ext}"  # Secure filename to prevent path traversal
    save_path = os.path.join(settings.UPLOAD_DIR, save_filename)

    with open(save_path, "wb") as f:
        f.write(content)

    try:
        # Extract text
        raw_text = await extract_text_from_file(save_path)

        # Delete raw file immediately after extraction (Data Minimization)
        try:
            os.remove(save_path)
        except Exception:
            pass

        raw_text = mask_pii_enhanced(raw_text)

        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file. Is it empty or image-only?")

        # Parse profile via LLM
        parsed = await parse_profile(raw_text)

        # Generate intelligence report
        intelligence = await analyze_profile(parsed)

        # Save to database
        profile = Profile(
            user_id=user.id,
            resume_filename=save_filename,
            raw_text=raw_text,
            parsed_profile=parsed,
            strengths=intelligence.get("strengths", []),
            weaknesses=intelligence.get("weaknesses", []),
            pressure_points=intelligence.get("pressure_points", []),
            likely_questions=intelligence.get("likely_questions", []),
        )
        db.add(profile)
        await db.flush()

        # Index resume for semantic search
        try:
            chunks = chunk_text(raw_text)
            import asyncio
            await asyncio.to_thread(vector_store.index_resume, str(profile.id), chunks)
        except Exception as e:
            print(f"Warning: Failed to index resume: {e}")

        candidate_type = classify_candidate_type(parsed)

        return {
            "id": profile.id,
            "user_id": user.id,
            "resume_filename": save_filename,
            "parsed_profile": parsed,
            "candidate_type": candidate_type,
            "strengths": intelligence.get("strengths", []),
            "weaknesses": intelligence.get("weaknesses", []),
            "pressure_points": intelligence.get("pressure_points", []),
            "likely_questions": intelligence.get("likely_questions", []),
            "created_at": str(profile.created_at),
        }

    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Profile processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail="An internal error occurred while processing the profile.")



@router.get("/")
async def list_profiles(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all profiles for the current user."""
    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id).order_by(Profile.created_at.desc())
    )
    profiles = result.scalars().all()

    return [
        {
            "id": p.id,
            "resume_filename": p.resume_filename,
            "persona_name": p.persona_name,
            "name": (p.parsed_profile or {}).get("name", "Unknown"),
            "candidate_type": str(classify_candidate_type(p.parsed_profile or {}).get("type", "fresher")).title(),
            "created_at": str(p.created_at),
        }
        for p in profiles
    ]


@router.post("/paste")
async def paste_resume(
    body: PasteResumeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a profile from pasted resume text.

    No file needed — just paste your resume content as plain text.
    Works with any text you can copy: LinkedIn About, resume copy-paste, CV text, etc.
    """
    raw_text = body.text.strip()
    raw_text = mask_pii_enhanced(raw_text)

    if not raw_text:
        raise HTTPException(status_code=400, detail="Resume text cannot be empty.")

    if len(raw_text) < 100:
        raise HTTPException(
            status_code=400,
            detail="Text is too short to be a resume. Please paste more content (at least 100 characters)."
        )

    try:
        # Parse profile via LLM (same pipeline as file upload)
        parsed = await parse_profile(raw_text)

        # Generate intelligence report
        intelligence = await analyze_profile(parsed)

        # Save to database — mark as pasted
        profile = Profile(
            user_id=user.id,
            resume_filename=f"pasted_{body.name.replace(' ', '_')}.txt",
            raw_text=raw_text,
            parsed_profile=parsed,
            strengths=intelligence.get("strengths", []),
            weaknesses=intelligence.get("weaknesses", []),
            pressure_points=intelligence.get("pressure_points", []),
            likely_questions=intelligence.get("likely_questions", []),
        )
        db.add(profile)
        await db.flush()

        # Index resume for semantic search
        try:
            chunks = chunk_text(raw_text)
            import asyncio
            await asyncio.to_thread(vector_store.index_resume, str(profile.id), chunks)
        except Exception as e:
            print(f"Warning: Failed to index resume: {e}")

        candidate_type = classify_candidate_type(parsed)

        return {
            "id": profile.id,
            "user_id": user.id,
            "resume_filename": profile.resume_filename,
            "parsed_profile": parsed,
            "candidate_type": candidate_type,
            "strengths": intelligence.get("strengths", []),
            "weaknesses": intelligence.get("weaknesses", []),
            "pressure_points": intelligence.get("pressure_points", []),
            "likely_questions": intelligence.get("likely_questions", []),
            "created_at": str(profile.created_at),
        }

    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Profile pasting failed: {str(e)}")
        raise HTTPException(status_code=500, detail="An internal error occurred while processing the profile.")

@router.delete("/account/delete")
async def delete_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the user account and all associated data."""
    from db.tables import Interview, Evaluation
    from sqlalchemy import delete
    
    # 1. Delete all evaluations
    interviews = await db.execute(select(Interview.id).where(Interview.user_id == user.id))
    interview_ids = [row[0] for row in interviews.all()]
    if interview_ids:
        await db.execute(delete(Evaluation).where(Evaluation.interview_id.in_(interview_ids)))
        
    # 2. Delete all interviews
    await db.execute(delete(Interview).where(Interview.user_id == user.id))
    
    # 3. Delete all profiles
    await db.execute(delete(Profile).where(Profile.user_id == user.id))
    
    # 4. Delete the user
    await db.execute(delete(User).where(User.id == user.id))
    
    await db.commit()
    
    return {"status": "success", "message": "Account and all associated data deleted completely."}

@router.delete("/{profile_id}")
async def delete_profile(
    profile_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a profile."""
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    from db.tables import Interview, Evaluation
    from sqlalchemy import delete

    # Delete associated evaluations (since they depend on interviews)
    interviews = await db.execute(select(Interview.id).where(Interview.profile_id == profile_id))
    interview_ids = [row[0] for row in interviews.all()]
    if interview_ids:
        await db.execute(delete(Evaluation).where(Evaluation.interview_id.in_(interview_ids)))

    # Delete associated interviews
    await db.execute(delete(Interview).where(Interview.profile_id == profile_id))

    # Delete the profile
    await db.delete(profile)
    await db.commit()

    return {"status": "success", "message": "Profile deleted"}


class UpdatePersonaRequest(BaseModel):
    persona_name: str | None = None   # User-facing label for this persona
    name: str | None = None           # Full name from parsed resume
    hometown: str | None = None
    state: str | None = None
    interests: list[str] | None = None

@router.get("/{profile_id}")
async def get_profile(
    profile_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Persona not found")

    candidate_type_data = classify_candidate_type(profile.parsed_profile or {})
    candidate_type = str(candidate_type_data.get("type", "fresher")).title()

    import json
    def safe_parse(val):
        if isinstance(val, str):
            try: return json.loads(val)
            except: return val
        return val

    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "resume_filename": profile.resume_filename,
        "persona_name": profile.persona_name,
        "parsed_profile": profile.parsed_profile,
        "candidate_type": candidate_type,
        "strengths": safe_parse(profile.strengths),
        "weaknesses": safe_parse(profile.weaknesses),
        "pressure_points": safe_parse(profile.pressure_points),
        "likely_questions": safe_parse(profile.likely_questions),
        "created_at": str(profile.created_at),
    }

@router.patch("/{profile_id}")
async def update_profile(
    profile_id: str,
    data: UpdatePersonaRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Persona not found")

    # Update persona_name (top-level column)
    if data.persona_name is not None:
        profile.persona_name = data.persona_name

    # Update fields stored inside parsed_profile JSON
    p_data = profile.parsed_profile or {}
    if data.name is not None:
        p_data["name"] = data.name
    if data.hometown is not None:
        p_data["hometown"] = data.hometown
    if data.state is not None:
        p_data["state"] = data.state
    if data.interests is not None:
        p_data["interests"] = data.interests

    # Trigger SQLAlchemy to detect JSON mutation
    profile.parsed_profile = dict(p_data)
    flag_modified(profile, "parsed_profile")

    await db.commit()
    return {
        "status": "success",
        "persona_name": profile.persona_name,
        "parsed_profile": profile.parsed_profile,
    }

@router.get("/{profile_id}/history")
async def get_profile_history(
    profile_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from db.tables import Interview, Evaluation

    # Verify profile ownership
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Persona not found")

    # Get interviews with evaluations in one query
    result = await db.execute(
        select(Interview, Evaluation)
        .outerjoin(Evaluation, Interview.id == Evaluation.interview_id)
        .where(Interview.profile_id == profile_id, Interview.user_id == user.id)
        .order_by(Interview.started_at.desc())
    )

    history = []
    for interview, evaluation in result.all():
        history.append({
            "id": interview.id,
            "status": interview.status,
            "interview_type": interview.interview_type,
            "target_iim": interview.target_iim,
            "started_at": interview.started_at.isoformat() if interview.started_at else None,
            "ended_at": interview.ended_at.isoformat() if interview.ended_at else None,
            "persona": interview.panel_config.get("persona", "general") if interview.panel_config else "general",
            "overall_score": evaluation.overall_score if evaluation else None,
            "evaluation_id": evaluation.id if evaluation else None,
        })

    return history


@router.get("/{profile_id}/analytics")
async def get_profile_analytics(
    profile_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns aggregated analytics for a persona — pure DB queries, no LLM calls.
    Used to power the performance trend chart, dimension scores, and SWOT card.
    """
    from db.tables import Interview, Evaluation
    from statistics import median

    # Verify profile ownership
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Persona not found")

    # Fetch all completed interviews with evaluations for this persona
    result = await db.execute(
        select(Interview, Evaluation)
        .join(Evaluation, Interview.id == Evaluation.interview_id)
        .where(
            Interview.profile_id == profile_id,
            Interview.user_id == user.id,
            Interview.status == "completed",
        )
        .order_by(Interview.started_at.asc())
    )
    rows = result.all()

    if not rows:
        return {
            "score_history": [],
            "median_score": None,
            "dimension_averages": {},
            "swot": {"strengths": [], "weaknesses": [], "opportunities": [], "threats": []},
            "interview_count": 0,
        }

    # --- Score history (for line chart) ---
    score_history = []
    all_scores = []
    dimension_totals: dict[str, list[float]] = {}
    all_strengths: list[str] = []
    all_weaknesses: list[str] = []
    all_improvements: list[str] = []
    all_high_risks: list[str] = []

    for interview, evaluation in rows:
        score = evaluation.overall_score
        if score is not None:
            all_scores.append(score)

        score_history.append({
            "interview_id": interview.id,
            "date": interview.started_at.isoformat() if interview.started_at else None,
            "score": score,
            "target_iim": interview.target_iim or "General",
            "panel": (interview.panel_config or {}).get("persona", "general"),
        })

        # Aggregate dimension scores
        if evaluation.dimension_scores:
            for dim in evaluation.dimension_scores:
                dim_name = dim.get("dimension", "")
                dim_score = dim.get("score")
                if dim_name and dim_score is not None:
                    dimension_totals.setdefault(dim_name, []).append(float(dim_score))

        # Aggregate SWOT source data
        if evaluation.strengths:
            for s in evaluation.strengths:
                text = s.get("strength", "") if isinstance(s, dict) else str(s)
                if text: all_strengths.append(text)

        if evaluation.weak_answers:
            for w in evaluation.weak_answers:
                text = w.get("issue", "") if isinstance(w, dict) else str(w)
                if text: all_weaknesses.append(text)

        if evaluation.improvement_plan:
            for item in evaluation.improvement_plan:
                if item: all_improvements.append(str(item))

        # high_risk_areas may not exist on older evaluations
        high_risks = getattr(evaluation, "high_risk_areas", None)
        if high_risks:
            for h in high_risks:
                if h: all_high_risks.append(str(h))

    # --- Dimension averages ---
    dimension_averages = {
        dim: round(sum(scores) / len(scores), 2)
        for dim, scores in dimension_totals.items()
    }

    # --- Deduplicate SWOT items (keep first N unique) ---
    def dedup(items: list[str], limit: int = 6) -> list[str]:
        seen = set()
        result = []
        for item in items:
            key = item.lower().strip()[:80]
            if key not in seen:
                seen.add(key)
                result.append(item)
            if len(result) >= limit:
                break
        return result

    return {
        "score_history": score_history,
        "median_score": round(median(all_scores), 2) if all_scores else None,
        "best_score": round(max(all_scores), 2) if all_scores else None,
        "latest_score": round(all_scores[-1], 2) if all_scores else None,
        "dimension_averages": dimension_averages,
        "swot": {
            "strengths": dedup(all_strengths),
            "weaknesses": dedup(all_weaknesses),
            "opportunities": dedup(all_improvements),
            "threats": dedup(all_high_risks),
        },
        "interview_count": len(rows),
    }
