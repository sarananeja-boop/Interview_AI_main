"""
Circuit Breaker for LLM calls.

Prevents cascading failures when the LLM provider is down.
States: CLOSED (normal) → OPEN (failing, fast-fail) → HALF_OPEN (testing recovery)
"""

import asyncio
import logging
import time
from enum import Enum
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing — reject requests immediately
    HALF_OPEN = "half_open" # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker for async calls.
    
    Args:
        failure_threshold: Number of consecutive failures before opening circuit
        recovery_timeout: Seconds to wait before trying again (half-open)
        name: Identifier for logging
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
        name: str = "llm",
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.name = name
        
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: float = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """Current circuit state, with automatic half-open transition."""
        if self._state == CircuitState.OPEN:
            if time.time() - self._last_failure_time >= self.recovery_timeout:
                return CircuitState.HALF_OPEN
        return self._state

    async def call(self, func: Callable[..., Awaitable[Any]], *args, **kwargs) -> Any:
        """
        Execute a function through the circuit breaker.
        
        Raises CircuitOpenError if circuit is open.
        """
        current_state = self.state

        if current_state == CircuitState.OPEN:
            logger.warning(f"Circuit breaker [{self.name}] is OPEN — rejecting request")
            raise CircuitOpenError(
                f"Service '{self.name}' is temporarily unavailable. "
                f"Circuit will retry in {self.recovery_timeout - (time.time() - self._last_failure_time):.0f}s."
            )

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure()
            raise

    async def _on_success(self):
        """Reset failure count on success."""
        async with self._lock:
            self._failure_count = 0
            if self._state != CircuitState.CLOSED:
                logger.info(f"Circuit breaker [{self.name}] recovered → CLOSED")
                self._state = CircuitState.CLOSED

    async def _on_failure(self):
        """Track failure and potentially open the circuit."""
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            
            if self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.error(
                    f"Circuit breaker [{self.name}] OPENED after {self._failure_count} failures. "
                    f"Will retry in {self.recovery_timeout}s."
                )

    def reset(self):
        """Manually reset the circuit breaker."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = 0


class CircuitOpenError(Exception):
    """Raised when the circuit breaker is open."""
    pass


# Singleton for LLM calls
llm_circuit = CircuitBreaker(failure_threshold=3, recovery_timeout=30.0, name="llm")
