"""Caller ID authentication (SPECIFICATION.md §5).

Direct Query is the only authentication method: :class:`DirectQueryAuth` — the
terminating CP finds the CP that currently holds the caller ID with Number Discovery and
asks it ``POST /auth/verify``. It follows the not_held recovery of §5.1.2: purge,
rediscover, retry once.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from ._holder import HolderHint, ServiceContext
from ._version import PROTOCOL_VERSION
from .errors import DiscoveryError, NotHeldError, ValidationError, api_error_from_response
from .types import (
    CallVerificationRequest,
    VerificationResult,
    e164,
    is_e164,
    now_iso,
)

logger = logging.getLogger("pstn2.auth")


def _number(value: str, what: str) -> str:
    n = e164(value)
    if not is_e164(n):
        raise ValidationError(f"{what} {value!r} is not an E.164 number")
    return n


class DirectQueryAuth:
    """Direct Query to the CP that currently holds the caller ID."""

    def __init__(self, ctx: ServiceContext) -> None:
        self._ctx = ctx

    async def verify_call(
        self,
        caller_id: str,
        called_id: str,
        call_reference: Optional[str] = None,
        *,
        holder: HolderHint = None,
    ) -> VerificationResult:
        """Verify an inbound call's caller ID.

        Never raises for protocol outcomes: if discovery finds no holder (unknown,
        unallocated, not participating, error) or the holder has no matching call, the
        result has ``verified=False``, a ``reason`` and ``fallback_to_pstn=True``.
        Transport failures (timeouts) raise :class:`~pstn2.errors.PSTN2Error`.
        """
        caller = _number(caller_id, "callerID")
        called = _number(called_id, "calledID")
        ref = call_reference or str(uuid.uuid4())
        req = CallVerificationRequest(
            message_id=str(uuid.uuid4()), timestamp=now_iso(), version=PROTOCOL_VERSION,
            requesting_cp=self._ctx.cp_id, caller_id=caller, called_id=called, call_reference=ref,
        )
        body = self._ctx.sign(req.to_wire())
        try:
            call = await self._ctx.caller.call(caller, "POST", "auth/verify", body, hint=holder)
        except DiscoveryError as exc:
            d = exc.discovery
            logger.info("caller ID %s not verifiable: discovery %s", caller, d.error or d.result)
            return VerificationResult(verified=False, call_reference=ref, trust_level="low", timestamp=now_iso(),
                                      discovery=d, reason=f"discovery_{d.error or d.result}", fallback_to_pstn=True)
        except NotHeldError as exc:
            return VerificationResult(verified=False, call_reference=ref, trust_level="low", timestamp=now_iso(),
                                      reason=f"not_held_by_{exc.cp_id}", fallback_to_pstn=True, rediscovered=True)

        if call.status == 404 or (call.status >= 400 and _code(call.body) == "call_not_found"):
            logger.warning("caller ID %s: %s has no matching call (possible spoofing)", caller, call.holder.cp_id)
            return VerificationResult(verified=False, call_reference=ref, trust_level="low", timestamp=now_iso(),
                                      holder=call.holder, discovery=call.discovery, rediscovered=call.rediscovered,
                                      reason="call_not_found", fallback_to_pstn=True)
        call.raise_for_error()
        result = VerificationResult.model_validate(call.body if isinstance(call.body, dict) else {})
        result.holder = call.holder
        result.discovery = call.discovery
        result.rediscovered = call.rediscovered
        if result.call_reference is None:
            result.call_reference = ref
        if not result.verified:
            result.reason = result.reason or "not_verified"
            result.fallback_to_pstn = True
        return result


class AuthenticationModule:
    """``client.auth``: Direct Query (the only authentication method)."""

    def __init__(self, ctx: ServiceContext) -> None:
        self.direct_query = DirectQueryAuth(ctx)

    async def verify_call(
        self,
        caller_id: str,
        called_id: str,
        call_reference: Optional[str] = None,
        *,
        holder: HolderHint = None,
    ) -> VerificationResult:
        """Verify an inbound call's caller ID with the CP that holds it (Direct Query)."""
        return await self.direct_query.verify_call(caller_id, called_id, call_reference, holder=holder)


def _code(body: Any) -> Optional[str]:
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return err.get("code")
        if isinstance(err, str):
            return err
    return None


__all__ = ["AuthenticationModule", "DirectQueryAuth", "api_error_from_response"]
