"""
IIM Interview Simulator — FastAPI Application Entry Point.

Starts the server, registers routes, configures CORS and lifespan events.
"""

from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import settings
from db.database import init_db
from api import auth, profile, interview, evaluation, stt_proxy, tts, news
from core.rate_limit import limiter
from core.current_affairs_engine import start_news_refresh_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # --- Startup ---
    await init_db()
    print(f"✓ LLM Provider: {settings.LLM_PROVIDER} ({settings.LLM_MODEL})")
    print(f"✓ Deepgram STT: {'configured' if settings.DEEPGRAM_API_KEY else 'NOT configured'}")
    print(f"✓ {settings.APP_NAME} is ready")
    
    # Start background news polling (now optimized to save API limits)
    news_task = asyncio.create_task(start_news_refresh_loop())
    yield
    # --- Shutdown ---
    print("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered IIM interview simulation with adaptive grilling",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type", "Content-Length"],
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Skip security headers for TTS audio responses (they break audio playback)
    if request.url.path.startswith("/api/tts"):
        return response
    
    # HSTS
    if not settings.DEBUG:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Content Security Policy (CSP)
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
    # Prevent MIME-sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

# Register route modules
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(interview.router, prefix="/api/interview", tags=["Interview"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["Evaluation"])
app.include_router(stt_proxy.router, prefix="/api/stt", tags=["STT"])
app.include_router(tts.router, prefix="/api/tts", tags=["TTS"])
app.include_router(news.router, prefix="/api/news", tags=["News"])


@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    from core.question_engine import get_bank_stats
    bank = get_bank_stats()
    return {
        "status": "healthy",
        "provider": settings.LLM_PROVIDER,
        "model": settings.LLM_MODEL,
        "question_bank": {
            "total": bank["total_questions"],
            "categories": len(bank["categories"]),
        },
    }
