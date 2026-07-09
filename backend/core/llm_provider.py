"""
LLM Provider Abstraction Layer.

Uses OpenRouter API (OpenAI-compatible) with auto-routing to the best
available free model via the 'openrouter/free' model identifier.
No credit card needed.

Switch models via .env:
  LLM_MODEL=openrouter/free  → Auto-route to best free model (default)
"""

import json
import logging
from typing import Type

import httpx
from pydantic import BaseModel

from config import settings
from core.circuit_breaker import llm_circuit, CircuitOpenError

logger = logging.getLogger(__name__)

# Retry config for rate limits
MAX_RETRIES = 4
RETRY_DELAY = 5  # fallback delay if API doesn't tell us how long to wait


class LLMProvider:
    """Unified LLM interface using OpenRouter API."""

    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        self.model = settings.LLM_MODEL
        self.api_keys = [k for k in [settings.OPENROUTER_API_KEY, getattr(settings, 'OPENROUTER_API_KEY_2', '')] if k]
        self.current_key_idx = 0
        self.base_url = "https://openrouter.ai/api/v1"

        if not self.api_keys:
            raise ValueError("OPENROUTER_API_KEY is required. Get one free at https://openrouter.ai")

        self.api_key = self.api_keys[self.current_key_idx]

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "IIM Interview Simulator",
        }

        logger.info(f"LLM Provider initialized: OpenRouter ({self.model}) with {len(self.api_keys)} keys")

    def _rotate_key(self):
        self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
        self.api_key = self.api_keys[self.current_key_idx]
        self.headers["Authorization"] = f"Bearer {self.api_key}"
        logger.info(f"Rotated to API key {self.current_key_idx + 1}/{len(self.api_keys)}")


    def _mask_key(self, text: str) -> str:
        """Redact the API key from any strings for secure logging."""
        if not text or not isinstance(text, str) or not self.api_key:
            return str(text)
        return text.replace(self.api_key, "[API_KEY_REDACTED]")

    async def _make_request(self, payload: dict) -> dict:
        """Make an API request with retry logic for rate limits."""
        import asyncio
        
        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self.headers,
                        json=payload,
                    )

                if response.status_code == 200:
                    return response.json()

                if response.status_code == 429:
                    if len(self.api_keys) > 1:
                        logger.warning(f"Rate limited (429). Rotating key... (attempt {attempt+1}/{MAX_RETRIES})")
                        self._rotate_key()
                        continue
                        
                    # Rate limited — use the API's suggested wait time if available
                    error_data = response.json()
                    retry_after = (
                        error_data.get("error", {})
                        .get("metadata", {})
                        .get("retry_after_seconds", RETRY_DELAY * (attempt + 1))
                    )
                    wait = min(retry_after + 1, 30)  # cap at 30s
                    logger.warning(f"Rate limited (429). Waiting {wait:.0f}s... (attempt {attempt+1}/{MAX_RETRIES})")
                    await asyncio.sleep(wait)
                    continue

                # Other errors
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", f"HTTP {response.status_code}")
                raise Exception(self._mask_key(f"OpenRouter API error: {error_msg}"))

            except httpx.TimeoutException:
                if attempt < MAX_RETRIES - 1:
                    logger.warning(f"Request timed out. Retrying... (attempt {attempt+1})")
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                raise Exception("Request timed out after retries")
            except Exception as e:
                # Catch any other exception (like httpx.RequestError) and mask it just in case
                raise Exception(self._mask_key(f"Request failed: {str(e)}"))

        raise Exception("Max retries exceeded due to rate limiting. Try again in a few seconds.")

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
            "max_tokens": 8192,
        }

        # If schema is provided, instruct the model to return JSON
        if schema is not None:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            messages[0]["content"] += f"\n\nYou MUST respond with valid JSON matching this schema:\n```json\n{schema_json}\n```\nRespond ONLY with the JSON object, no markdown fences or extra text."
            # Note: Removed strict response_format as some free models fail silently with it.

        for attempt in range(2):
            try:
                data = await llm_circuit.call(self._make_request, payload)
            except CircuitOpenError as e:
                raise Exception(str(e))

            # Defensive: some free models return errors or empty responses
            if "choices" not in data or not data["choices"]:
                error_msg = data.get("error", {}).get("message", str(data))
                logger.error(f"LLM returned no choices: {error_msg}")
                raise Exception(f"Interview engine error: LLM returned no valid response. Try again.")

            text = data["choices"][0]["message"]["content"]

            if schema is not None:
                # Clean up common LLM response issues using regex
                text = text.strip() if text else ""
                import re
                # Try to find JSON block enclosed in ```json ... ``` or just ``` ... ```
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
                if match:
                    text = match.group(1).strip()
                else:
                    # Attempt to extract the first { ... } or [ ... ]
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
        # Build messages array
        messages = [{"role": "system", "content": system_prompt}]

        for msg in conversation_history:
            # Normalize role names
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
            "max_tokens": 8192,
        }

        if schema is not None:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            messages[0]["content"] += f"\n\nRespond with valid JSON matching this schema:\n```json\n{schema_json}\n```"
            # Note: Removed strict response_format as some free models fail silently with it.

        for attempt in range(2):
            try:
                data = await llm_circuit.call(self._make_request, payload)
            except CircuitOpenError as e:
                raise Exception(str(e))

            # Defensive: some free models return errors or empty responses
            if "choices" not in data or not data["choices"]:
                error_msg = data.get("error", {}).get("message", str(data))
                logger.error(f"LLM returned no choices (history): {error_msg}")
                raise Exception(f"Interview engine error: LLM returned no valid response. Try again.")

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
