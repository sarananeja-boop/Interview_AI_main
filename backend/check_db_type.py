import asyncio
from db.database import async_session
from db.tables import Profile
from sqlalchemy import select

async def main():
    async with async_session() as db:
        result = await db.execute(
            select(Profile).where(Profile.id == "e9672a8b-66d9-4f17-8800-eedc112e94ba")
        )
        row = result.scalar_one_or_none()
        if row:
            print(f"Type of pressure_points: {type(row.pressure_points)}")
            print(f"Value of pressure_points: {row.pressure_points}")
            print(f"Type of parsed_profile: {type(row.parsed_profile)}")
        else:
            print("Profile not found")

if __name__ == "__main__":
    asyncio.run(main())
