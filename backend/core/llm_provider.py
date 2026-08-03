"""
LLM Provider Abstraction Layer with Automatic Backup.

Uses OpenRouter API (OpenAI-compatible) with auto-routing to the best
available free model via 'openrouter/free'.
If OpenRouter fails or is rate-limited (429), immediately switches to Groq API
as a ultra-fast backup.
"""

import asyncio
import json
import logging
from typing import Type

import httpx
from pydantic import BaseModel

from config import settings

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    """Raised when all AI providers (primary and backup) are rate limited."""
    pass


class LLMProvider:
    """Unified LLM interface using OpenRouter API with Groq API backup."""

    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        self.model = settings.LLM_MODEL
        self.api_keys = [k for k in [settings.OPENROUTER_API_KEY, getattr(settings, 'OPENROUTER_API_KEY_2', '')] if k]
        self.current_key_idx = 0
        self.base_url = "https://openrouter.ai/api/v1"

        if not self.api_keys:
            raise ValueError("OPENROUTER_API_KEY is required.")

        self.api_key = self.api_keys[self.current_key_idx]

        # Groq backup configuration
        self.groq_api_key = getattr(settings, 'GROQ_API_KEY', '')
        self.groq_model = getattr(settings, 'GROQ_MODEL', '') or "llama-3.3-70b-versatile"

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "IIM Interview Simulator",
        }

        logger.info(
            f"LLM Provider initialized: OpenRouter ({self.model}) with {len(self.api_keys)} keys | "
            f"Backup: Groq ({self.groq_model})"
        )

    def _rotate_key(self):
        self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
        self.api_key = self.api_keys[self.current_key_idx]
        self.headers["Authorization"] = f"Bearer {self.api_key}"

    def _mask_key(self, text: str) -> str:
        """Redact API keys from any strings for secure logging."""
        if not text or not isinstance(text, str):
            return str(text)
        if self.api_key:
            text = text.replace(self.api_key, "[OPENROUTER_KEY_REDACTED]")
        for k in self.api_keys:
            if k:
                text = text.replace(k, "[OPENROUTER_KEY_REDACTED]")
        if getattr(self, 'groq_api_key', None):
            text = text.replace(self.groq_api_key, "[GROQ_KEY_REDACTED]")
        return text

    async def _make_groq_request(self, payload: dict) -> dict:
        """Make backup API request to Groq when OpenRouter fails or is rate-limited."""
        if not self.groq_api_key:
            raise RateLimitError("AI service rate limited and no backup GROQ_API_KEY is configured.")

        groq_payload = dict(payload)
        groq_payload["model"] = self.groq_model

        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json",
        }
        logger.info(f"⚡ Using backup Groq API ({self.groq_model})...")

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=45) as client:
                    response = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        json=groq_payload,
                    )
                if response.status_code == 200:
                    logger.info("✓ Groq backup API request successful!")
                    return response.json()
                if response.status_code == 429 and attempt < 2:
                    logger.warning(f"Groq backup hit rate limit, retrying in 2s... (attempt {attempt+1}/3)")
                    await asyncio.sleep(2)
                    continue
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", f"HTTP {response.status_code}")
                except Exception:
                    error_msg = f"HTTP {response.status_code}: {response.text}"
                if attempt < 2:
                    await asyncio.sleep(2)
                    continue
                raise Exception(self._mask_key(f"Groq API error: {error_msg}"))
            except Exception as e:
                if attempt < 2 and ("timeout" in str(e).lower() or "429" in str(e) or "connection" in str(e).lower()):
                    await asyncio.sleep(2)
                    continue
                raise Exception(self._mask_key(f"Groq backup failed: {str(e)}"))

        raise RateLimitError("AI services (both OpenRouter and Groq backup) are currently busy. Please try again in 15 seconds.")

    async def _make_request(self, payload: dict) -> dict:
        """Make an API request to OpenRouter, with immediate fallback to Groq on failure or rate limits.
        
        This prevents indefinite loading by switching to Groq instantly if OpenRouter is rate-limited.
        """
        openrouter_attempts = min(len(self.api_keys), 2)

        for attempt in range(openrouter_attempts):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self.headers,
                        json=payload,
                    )

                if response.status_code == 200:
                    return response.json()

                if response.status_code == 429:
                    if attempt < openrouter_attempts - 1:
                        logger.warning(f"OpenRouter key {attempt+1} rate limited (429). Rotating key...")
                        self._rotate_key()
                        await asyncio.sleep(1)
                        continue
                    logger.warning("OpenRouter rate limited on all keys. Immediately switching to Groq backup API...")
                    return await self._make_groq_request(payload)

                # Other HTTP errors
                logger.warning(f"OpenRouter returned HTTP {response.status_code}. Switching to Groq backup API...")
                return await self._make_groq_request(payload)

            except Exception as e:
                if attempt < openrouter_attempts - 1 and not isinstance(e, RateLimitError):
                    logger.warning(f"OpenRouter attempt {attempt+1} failed ({str(e)}). Rotating key...")
                    self._rotate_key()
                    await asyncio.sleep(1)
                    continue
                logger.warning(f"OpenRouter failed ({str(e)}). Immediately switching to Groq backup API...")
                return await self._make_groq_request(payload)

        return await self._make_groq_request(payload)

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        schema: Type[BaseModel] | None = None,
        temperature: float = 0.7,
    ) -> dict | str:
        """
        Generate a response from the LLM.

        Args:
            system_prompt: System instructions (persona, rules, context)
            user_message: The user's input
            schema: Optional Pydantic model for structured JSON output
            temperature: Creativity control (0.0-1.0)

        Returns:
            dict if schema is provided (parsed JSON), str otherwise
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 4096,
        }

        if schema is not None:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            messages[0]["content"] += f"\n\nYou MUST respond with valid JSON matching this schema:\n```json\n{schema_json}\n```\nRespond ONLY with the JSON object, no markdown fences or extra text."

        for attempt in range(2):
            data = await self._make_request(payload)

            if "choices" not in data or not data["choices"]:
                error_msg = data.get("error", {}).get("message", str(data))
                logger.error(f"LLM returned no choices: {error_msg}")
                if attempt == 0:
                    logger.warning("Retrying LLM call after empty choices...")
                    await asyncio.sleep(1)
                    continue
                raise Exception("Interview engine error: LLM returned no valid response. Try again.")

            text = data["choices"][0]["message"]["content"]

            if schema is not None:
                text = text.strip() if text else ""
                import re
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
                if match:
                    text = match.group(1).strip()
                else:
                    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
                    if match:
                        text = match.group(1).strip()
                try:
                    return json.loads(text)
                except json.JSONDecodeError as e:
                    if attempt == 0:
                        logger.warning(f"JSON decode failed, retrying generation. Error: {e}")
                        continue
                    logger.error(f"Failed to parse JSON: {e}\nRaw text: {text}")
                    raise Exception("LLM returned malformed JSON that could not be parsed.")
            else:
                return text

    async def generate_with_history(
        self,
        system_prompt: str,
        conversation_history: list[dict],
        schema: Type[BaseModel] | None = None,
        temperature: float = 0.7,
    ) -> dict | str:
        """
        Generate with full conversation history (for multi-turn interviews).

        Args:
            system_prompt: System instructions
            conversation_history: List of {"role": "user"|"model"|"assistant", "content": "..."}
            schema: Optional Pydantic schema for structured output
            temperature: Creativity control
        """
        messages = [{"role": "system", "content": system_prompt}]

        for msg in conversation_history:
            role = msg["role"]
            if role in ("model", "interviewer"):
                role = "assistant"
            elif role in ("candidate",):
                role = "user"
            messages.append({"role": role, "content": msg["content"]})

        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 4096,
        }

        if schema is not None:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            messages[0]["content"] += f"\n\nRespond with valid JSON matching this schema:\n```json\n{schema_json}\n```"

        for attempt in range(2):
            data = await self._make_request(payload)

            if "choices" not in data or not data["choices"]:
                error_msg = data.get("error", {}).get("message", str(data))
                logger.error(f"LLM returned no choices (history): {error_msg}")
                if attempt == 0:
                    logger.warning("Retrying LLM call after empty choices...")
                    await asyncio.sleep(1)
                    continue
                raise Exception("Interview engine error: LLM returned no valid response. Try again.")

            text = data["choices"][0]["message"]["content"]

            if schema is not None:
                text = text.strip() if text else ""
                import re
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
                if match:
                    text = match.group(1).strip()
                else:
                    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
                    if match:
                        text = match.group(1).strip()
                try:
                    return json.loads(text)
                except json.JSONDecodeError as e:
                    if attempt == 0:
                        logger.warning(f"JSON decode failed in history, retrying generation. Error: {e}")
                        continue
                    logger.error(f"Failed to parse JSON in history generate: {e}\nRaw text: {text}")
                    raise Exception("LLM returned malformed JSON that could not be parsed.")
            else:
                return text


# Singleton instance
llm = LLMProvider()
