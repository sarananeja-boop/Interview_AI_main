import asyncio
from config import settings
from db.database import async_session
from sqlalchemy import select
from db.tables import User, Profile

async def check():
    async with async_session() as db:
        result = await db.execute(select(Profile).order_by(Profile.created_at.desc()))
        profiles = result.scalars().all()
        for p in profiles:
            print(p.id, p.user_id)
            print("Parsed Profile:", type(p.parsed_profile))

asyncio.run(check())
