"""Exceptions raised by the PSTN2 SDK.

Number Discovery itself never raises for protocol outcomes: ``discover()`` returns a
:class:`~pstn2.types.DiscoveryResult` whose ``result`` says what happened
(SPECIFICATION.md §9.3, §10.2). Exceptions are for transport failures, error
responses from a CP, and service calls that cannot proceed because discovery did not
find a holder.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from .types import DiscoveryResult


class ErrorCode(str, Enum):
    """Error codes from SPECIFICATION.md §10.2 / ErrorResponse in API-SPECIFICATION.yaml."""

    CALL_NOT_FOUND = "call_not_found"
    INVALID_SIGNATURE = "invalid_signature"
    CAPACITY_EXCEEDED = "capacity_exceeded"
    UNSUPPORTED_CODEC = "unsupported_codec"
    NUMBER_NOT_FOUND = "number_not_found"
    HOP_LIMIT_EXCEEDED = "hop_limit_exceeded"
    LOOP_DETECTED = "loop_detected"
    LOCATION_UNAVAILABLE = "location_unavailable"
    UNAUTHORIZED_PSAP = "unauthorized_psap"
    TIMEOUT = "timeout"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    INVALID_REQUEST = "invalid_request"
    INTERNAL_ERROR = "internal_error"
    # SDK-side codes (not on the wire)
    NETWORK_ERROR = "network_error"
    INVALID_RESPONSE = "invalid_response"
    NOT_HELD = "not_held"
    DISCOVERY_FAILED = "discovery_failed"


class PSTN2Error(Exception):
    """Base class for every SDK exception."""

    def __init__(
        self,
        code: ErrorCode | str,
        message: str,
        *,
        status: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code.value if isinstance(code, ErrorCode) else code
        self.message = message
        self.status = status
        self.details = details or {}

    def __str__(self) -> str:
        prefix = f"[{self.code}]"
        if self.status is not None:
            prefix += f" HTTP {self.status}"
        return f"{prefix} {self.message}"


class PSTN2TimeoutError(PSTN2Error):
    """No response within the configured timeout (after §10.3 retries)."""

    def __init__(self, message: str = "Request timed out", **kw: Any) -> None:
        super().__init__(ErrorCode.TIMEOUT, message, **kw)


class NetworkError(PSTN2Error):
    """Connection failure (after §10.3 retries)."""

    def __init__(self, message: str = "Network error", **kw: Any) -> None:
        super().__init__(ErrorCode.NETWORK_ERROR, message, **kw)


class InvalidResponseError(PSTN2Error):
    """The CP answered with something that is not a valid PSTN2 response."""

    def __init__(self, message: str = "Invalid response", **kw: Any) -> None:
        super().__init__(ErrorCode.INVALID_RESPONSE, message, **kw)


class ApiError(PSTN2Error):
    """A CP answered with an HTTP error and (usually) an ErrorResponse body."""


class CallNotFoundError(ApiError):
    """404 ``call_not_found``: the claimed originating CP has no such call (possible spoofing)."""


class RateLimitError(ApiError):
    """429 ``rate_limit_exceeded``."""

    def __init__(self, *args: Any, retry_after: int | None = None, **kw: Any) -> None:
        super().__init__(*args, **kw)
        self.retry_after = retry_after


class DiscoveryError(PSTN2Error):
    """A service call could not proceed because Number Discovery found no holder.

    ``discovery`` carries the full :class:`DiscoveryResult` (result, hops, error).
    The caller MUST fall back to traditional PSTN handling (§9.3).
    """

    def __init__(self, discovery: "DiscoveryResult", message: str | None = None) -> None:
        detail = discovery.error or discovery.result
        super().__init__(
            ErrorCode.DISCOVERY_FAILED,
            message or f"Number Discovery for {discovery.number} returned {detail}",
            details={"result": discovery.result, "error": discovery.error, "hops": list(discovery.hops)},
        )
        self.discovery = discovery


class NotHeldError(PSTN2Error):
    """The CP still answered ``not_held`` after the one permitted rediscover-and-retry."""

    def __init__(self, number: str, cp_id: str) -> None:
        super().__init__(ErrorCode.NOT_HELD, f"{cp_id} does not hold {number} (after rediscovery)")
        self.number = number
        self.cp_id = cp_id


class ValidationError(PSTN2Error):
    """Invalid input supplied to an SDK method."""

    def __init__(self, message: str, **kw: Any) -> None:
        super().__init__(ErrorCode.INVALID_REQUEST, message, **kw)


_CODE_CLASSES: dict[str, type[ApiError]] = {
    "call_not_found": CallNotFoundError,
    "rate_limit_exceeded": RateLimitError,
}


def api_error_from_response(status: int, body: Any, headers: dict[str, str] | None = None) -> ApiError:
    """Build the most specific :class:`ApiError` for an HTTP error response."""
    code: str = "internal_error" if status >= 500 else "invalid_request"
    message = f"HTTP {status}"
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            code = str(err.get("code") or code)
            message = str(err.get("message") or message)
        elif isinstance(err, str):  # legacy flat form {"error": "...", "message": "..."}
            code = err
            message = str(body.get("message") or message)
        elif isinstance(body.get("reason"), str):  # RoutingRejection
            code = body["reason"]
    if status == 429:
        code = "rate_limit_exceeded"
    cls = _CODE_CLASSES.get(code, ApiError)
    if cls is RateLimitError:
        retry = (headers or {}).get("retry-after")
        return RateLimitError(
            code, message, status=status, details={"body": body},
            retry_after=int(retry) if retry and retry.isdigit() else None,
        )
    return cls(code, message, status=status, details={"body": body})


__all__ = [
    "ApiError",
    "CallNotFoundError",
    "DiscoveryError",
    "ErrorCode",
    "InvalidResponseError",
    "NetworkError",
    "NotHeldError",
    "PSTN2Error",
    "PSTN2TimeoutError",
    "RateLimitError",
    "ValidationError",
    "api_error_from_response",
]
