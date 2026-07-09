from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import httpx
import logging

from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

class TTSRequest(BaseModel):
    text: str
    voice: str = "aura-stella-en"  # Default female professional voice

from api.auth import get_current_user
from db.tables import User
from fastapi import Depends

@router.post("/")
async def generate_tts(req: TTSRequest, user: User = Depends(get_current_user)):
    """
    Generate Text-to-Speech using Deepgram Aura.
    Proxies the request so the API key stays server-side.
    """
    if not settings.DEEPGRAM_API_KEY:
        raise HTTPException(status_code=500, detail="Deepgram API key not configured")

    url = f"https://api.deepgram.com/v1/speak?model={req.voice}"
    headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {"text": req.text}

    logger.info(f"TTS request: voice={req.voice}, text_length={len(req.text)}, url={url}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            
            logger.info(f"Deepgram TTS response: status={response.status_code}, content_type={response.headers.get('content-type')}, size={len(response.content)} bytes")
            
            if response.status_code != 200:
                logger.error(f"Deepgram TTS error: {response.text}")
                raise HTTPException(status_code=500, detail="TTS generation failed")
                
            # Return the audio file directly
            return Response(
                content=response.content, 
                media_type="audio/mpeg",
                headers={
                    "Cache-Control": "no-cache",
                    "Accept-Ranges": "bytes"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS proxy error: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred during TTS generation")
