from fastapi import APIRouter, Query, Depends
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.current_affairs_engine import get_relevant_headlines, _ensure_cache_loaded
from api.auth import get_current_user
from db.database import get_db
from db.tables import Profile, User

router = APIRouter()

@router.get("/")
async def get_daily_news(
    categories: str = Query(""),
    state: str = Query(""),
    n: int = Query(50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Fetch relevant daily news based on selected categories and optional state.
    Also returns the daily big picture synthesis and personalized priority topics.
    """
    interest_list = [c.strip() for c in categories.split(",")] if categories else []
    
    # Fetch user's latest profile to get priority interests
    priority_topics = []
    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id).order_by(Profile.created_at.desc()).limit(1)
    )
    profile = result.scalar_one_or_none()
    
    if profile and profile.parsed_profile:
        # Use existing interests categories filed by candidates
        priority_topics = profile.parsed_profile.get("interests", [])
        
        # If no explicit categories were passed, we can optionally use the profile interests
        # as the default filters, but we'll let the frontend decide that logic.
        
    headlines = get_relevant_headlines(interests=interest_list, state=state, n=n)
    
    cache = _ensure_cache_loaded()
    big_picture = cache.get("big_picture", {
        "synthesis": "Current affairs are evolving rapidly across major sectors today.",
        "themes": ["Current Affairs"]
    })
    
    return {
        "headlines": headlines,
        "big_picture": big_picture,
        "priority_topics": priority_topics
    }
 
