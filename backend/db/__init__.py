"""
SQLite database setup via SQLAlchemy async engine.
"""

import os
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from config import settings
from db.base import Base

# Ensure data directory exists
_db_path = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "")
os.makedirs(os.path.dirname(_db_path), exist_ok=True)

# Async engine for SQLite with 30s busy timeout
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False, "timeout": 30.0},
)

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

# Session factory
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Run Alembic migrations on startup (creates/updates tables)."""
    import db.tables  # noqa: F401 — register models
    
    from alembic.config import Config
    from alembic import command
    import os
    
    # Run Alembic upgrade in a thread (it uses sync engine internally)
    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    
    import asyncio
    # await asyncio.to_thread(command.upgrade, alembic_cfg, "head")


async def get_db() -> AsyncSession:
    """Dependency injection for route handlers."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
