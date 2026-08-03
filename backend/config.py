"""
Application configuration — loads from .env file.
All settings centralized here for easy environment switching.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Project root is one level up from backend/
PROJECT_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- AI Provider ---
    LLM_PROVIDER: str = "openrouter"
    LLM_MODEL: str = "openrouter/free"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_API_KEY_2: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # --- Deepgram STT (server-side only) ---
    DEEPGRAM_API_KEY: str = ""

    # --- Interview Duration ---
    INTERVIEW_MAX_SECONDS: int = 1200     # 20 minutes hard limit
    INTERVIEW_CLOSING_SECONDS: int = 900  # 15 minutes → auto-transition to closing

    # --- Auth & Security ---
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 2
    DB_ENCRYPTION_KEY: str

    # --- Database ---
    DATABASE_URL: str = f"sqlite+aiosqlite:///{PROJECT_ROOT}/data/interview.db"

    # --- ChromaDB ---
    CHROMA_PATH: str = str(PROJECT_ROOT / "data" / "chroma_db")

    # --- File Storage ---
    UPLOAD_DIR: str = str(PROJECT_ROOT / "data" / "uploads")

    # --- App ---
    APP_NAME: str = "IIM Interview Simulator"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3010", "http://localhost:3001"]

    model_config = {
        "env_file": str(PROJECT_ROOT / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


# Singleton settings instance
settings = Settings()
