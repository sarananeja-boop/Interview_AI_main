"""
Deepgram STT WebSocket Proxy.

Proxies audio from the browser to Deepgram's real-time transcription API.
The Deepgram API key stays server-side only — never exposed to the frontend.

Flow: Browser Mic → Backend WS → Deepgram WS → Transcripts → Browser
"""

import asyncio
import json
import logging
import urllib.parse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import jwt, JWTError

from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"
DEEPGRAM_PARAMS = {
    "model": "nova-2",
    "language": "en-IN",
    "smart_format": "true",
    "punctuate": "true",
    "interim_results": "true",
    "utterance_end_ms": "1500",
    "vad_events": "true",
    "encoding": "linear16",
    "sample_rate": "16000",
    "channels": "1",
    "filler_words": "false",
}


@router.websocket("/stream")
async def stt_stream(ws: WebSocket):
    """
    WebSocket proxy for Deepgram STT.
    
    The browser sends raw audio bytes. We forward them to Deepgram and
    relay transcription results back to the browser.
    
    Security: Deepgram API key is read from server-side config only.
    """
    await ws.accept()

    # Authenticate via cookie or query param
    token = ws.cookies.get("auth_token") or ws.query_params.get("token")
    if not token:
        await ws.send_json({"type": "error", "message": "Authentication required"})
        await ws.close(code=1008)
        return
        
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise JWTError()
    except JWTError:
        await ws.send_json({"type": "error", "message": "Invalid or expired token"})
        await ws.close(code=1008)
        return

    if not settings.DEEPGRAM_API_KEY:
        await ws.send_json({"type": "error", "message": "Deepgram API key not configured"})
        await ws.close(code=1011)
        return

    # Build Deepgram URL with query params
    params_dict = dict(DEEPGRAM_PARAMS)
    params_dict["keywords"] = []
    
    # Extract dynamic keywords for boosting from candidate's profile
    unique_keywords = set()
    
    # 1. Common IIM/MBA domain terms — moderate boost so Deepgram recognizes
    #    these when actually spoken, but NOT so high it hallucinates them
    common_boosts = [
        "MBA:2", "IIM:2", "CAT:1.5", "BBA:2", "CGPA:2",
        "Ahmedabad:1.5", "Bangalore:1.5", "Calcutta:1.5", "Lucknow:1.5",
        "internship:1.3", "percentile:1.5", "semester:1.3",
        "Symbiosis:1.5", "SCMS:1.5",
    ]
    for kw in common_boosts:
        unique_keywords.add(kw)
        
    # 2. Add LIGHT dynamic boosts from profile — IMPORTANT: keep weights LOW
    #    to prevent Deepgram from hallucinating profile words when unsure.
    #    Previously weights were 1.5x which caused "AND" → "Aneja" and
    #    "it" → "itmtb" because Deepgram preferred boosted profile tokens.
    interview_id = ws.query_params.get("interview_id")
    if interview_id:
        try:
            from db import async_session
            from db.tables import Interview, Profile
            from sqlalchemy import select
            
            async with async_session() as db:
                result = await db.execute(
                    select(Interview).where(Interview.id == interview_id, Interview.user_id == user_id)
                )
                interview = result.scalar_one_or_none()
                if not interview:
                    await ws.send_json({"type": "error", "message": "Interview not found or unauthorized"})
                    await ws.close(code=1008)
                    return
                    
                if interview:
                    profile_result = await db.execute(
                        select(Profile).where(Profile.id == interview.profile_id)
                    )
                    profile = profile_result.scalar_one_or_none()
                    if profile and profile.parsed_profile:
                        profile_data = profile.parsed_profile
                        
                        # Boost candidate FULL name only (not individual parts)
                        # Using low weight to avoid hallucination
                        name = profile_data.get("name")
                        if name and len(name) > 4:
                            unique_keywords.add(f"{name.strip()}:1.2")
                        
                        # Boost company names ONLY if they are long enough
                        # to not conflict with common English words
                        experience = profile_data.get("work_experience", [])
                        for exp in experience:
                            company = exp.get("company")
                            if company and len(company) > 5:
                                # Use full company name, not individual words
                                unique_keywords.add(f"{company.strip()}:1.2")
                                    
                        # Boost institution names (full name only)
                        education = profile_data.get("education", [])
                        for edu in education:
                            inst = edu.get("institution")
                            if inst and len(inst) > 5:
                                unique_keywords.add(f"{inst.strip()}:1.1")
        except Exception as e:
            logger.error(f"Failed to fetch profile keywords for STT: {e}")
            
    # Add keywords to parameters
    for kw in unique_keywords:
        params_dict["keywords"].append(kw)
        
    # URL encode all parameters (including multiple keywords)
    query_string = urllib.parse.urlencode(params_dict, doseq=True)
    deepgram_url = f"{DEEPGRAM_WS_URL}?{query_string}"

    try:
        import websockets
        import ssl
        
        extra_headers = {
            "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        }

        # Enforce strict SSL verification using certifi
        ssl_context = ssl.create_default_context()
        try:
            import certifi
            ssl_context.load_verify_locations(certifi.where())
        except ImportError:
            logger.warning("certifi not installed, SSL verification might fail on some platforms.")
        
        async with websockets.connect(
            deepgram_url,
            additional_headers=extra_headers,
            ssl=ssl_context,
        ) as dg_ws:
            
            async def browser_to_deepgram():
                """Forward audio bytes from browser → Deepgram."""
                try:
                    while True:
                        data = await ws.receive_bytes()
                        await dg_ws.send(data)
                except WebSocketDisconnect:
                    # Browser disconnected — tell Deepgram to finalize
                    await dg_ws.send(json.dumps({"type": "CloseStream"}))
                except Exception as e:
                    logger.error(f"Browser→Deepgram relay error: {e}")
                    try:
                        await ws.send_json({"type": "error", "message": "Voice input connection lost. Please type your answer."})
                    except Exception:
                        pass

            async def deepgram_to_browser():
                """Forward transcription results from Deepgram → browser."""
                try:
                    async for message in dg_ws:
                        result = json.loads(message)
                        
                        # Only forward transcript events, not metadata
                        msg_type = result.get("type")
                        if msg_type == "Results":
                            channel = result.get("channel", {})
                            alternatives = channel.get("alternatives", [])
                            if alternatives:
                                transcript = alternatives[0].get("transcript", "")
                                is_final = result.get("is_final", False)
                                speech_final = result.get("speech_final", False)
                                
                                if transcript:
                                    await ws.send_json({
                                        "type": "transcript",
                                        "transcript": transcript,
                                        "is_final": is_final,
                                        "speech_final": speech_final,
                                    })
                        elif msg_type == "UtteranceEnd":
                            await ws.send_json({"type": "utterance_end"})
                            
                except Exception as e:
                    logger.error(f"Deepgram→Browser relay error: {e}")
                    try:
                        await ws.send_json({"type": "error", "message": "Transcription service interrupted. Please type your answer."})
                    except Exception:
                        pass

            # Run both directions concurrently
            await asyncio.gather(
                browser_to_deepgram(),
                deepgram_to_browser(),
            )

    except Exception as e:
        logger.error(f"Deepgram proxy error: {e}")
        try:
            await ws.send_json({
                "type": "error",
                "code": "stt_fallback",
                "message": "Deepgram streaming credits exhausted or restricted. Switching to browser speech recognition."
            })
            await ws.close()
        except Exception:
            pass
