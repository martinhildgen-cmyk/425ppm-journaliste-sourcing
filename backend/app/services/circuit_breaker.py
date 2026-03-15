"""
Circuit breaker pattern for external API calls.

Prevents cascading failures when an external service is down.
After `failure_threshold` consecutive failures, the breaker opens
and rejects calls for `recovery_timeout` seconds before allowing
a single test request (half-open state).

Usage:
    from app.services.circuit_breaker import CircuitBreaker

    dropcontact_breaker = CircuitBreaker("dropcontact", failure_threshold=3, recovery_timeout=60)

    async with dropcontact_breaker:
        result = await call_dropcontact(...)
"""

import logging
import time
from enum import Enum

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Rejecting calls
    HALF_OPEN = "half_open"  # Testing single request


class CircuitBreakerOpen(Exception):
    """Raised when the circuit breaker is open."""

    def __init__(self, service: str):
        self.service = service
        super().__init__(f"Circuit breaker open for {service}")


class CircuitBreaker:
    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 3,
        recovery_timeout: int = 60,
    ):
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: float = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if time.monotonic() - self._last_failure_time >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                logger.info("Circuit breaker %s → HALF_OPEN", self.service_name)
        return self._state

    def record_success(self):
        self._failure_count = 0
        if self._state != CircuitState.CLOSED:
            logger.info("Circuit breaker %s → CLOSED", self.service_name)
        self._state = CircuitState.CLOSED

    def record_failure(self):
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker %s → OPEN after %d failures",
                self.service_name,
                self._failure_count,
            )

    async def __aenter__(self):
        if self.state == CircuitState.OPEN:
            raise CircuitBreakerOpen(self.service_name)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self.record_success()
        else:
            self.record_failure()
        return False  # Don't suppress exceptions


# Global breakers for each external service
dropcontact_breaker = CircuitBreaker("dropcontact", failure_threshold=3, recovery_timeout=60)
brave_search_breaker = CircuitBreaker("brave_search", failure_threshold=5, recovery_timeout=30)
trafilatura_breaker = CircuitBreaker("trafilatura", failure_threshold=10, recovery_timeout=30)
