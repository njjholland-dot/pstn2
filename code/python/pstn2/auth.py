"""Caller ID authentication (SPECIFICATION.md §5).

* :class:`DirectQueryAuth` (Option 1): the terminating CP finds the CP that currently
  holds the caller ID with Number Discovery and asks it ``POST /auth/verify``.
* :class:`TokenPoolAuth` (Option 2): the originating CP creates a short-lived token
  (``POST /auth/tokens``); the terminating CP verifies it (``GET /auth/tokens/{id}``).
  The pool is the caller ID holder's own API (found by discovery), unless a dedicated
  ``token_pool_url`` is configured.

Both follow the not_held recovery of §5.1.2: purge, rediscover, retry once.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Optional

from ._holder import HolderHint, ServiceContext
from ._version import PROTOCOL_VERSION
from .errors import DiscoveryError, NotHeldError, PSTN2Error, ValidationError, api_error_from_response
from .types import (
    BrandingInfo,
    CallVerificationRequest,
    CpRef,
    TokenCreateRequest,
    TokenCreateResult,
    TokenVerifyResponse,
    VerificationResult,
    e164,
    is_e164,
    now_iso,
)

logger = logging.getLogger("pstn2.auth")

TOKEN_PATTERN = re.compile(r"^TK-[A-Za-z0-9]{16}$")


def _number(value: str, what: str) -> str:
    n = e164(value)
    if not is_e164(n):
        raise ValidationError(f"{what} {value!r} is not an E.164 number")
    return n


class DirectQueryAuth:
    """Option 1: Direct Query to the CP that currently holds the caller ID."""

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


class TokenPoolAuth:
    """Option 2: Token Pool."""

    def __init__(self, ctx: ServiceContext, *, token_pool_url: Optional[str] = None,
                 token_pool_auth: Optional[str] = None) -> None:
        self._ctx = ctx
        self.token_pool_url = token_pool_url
        self.token_pool_auth = token_pool_auth

    def _pool_hint(self, holder: HolderHint) -> HolderHint:
        if holder is not None:
            return holder
        if self.token_pool_url:
            return CpRef(cp_id="token-pool", cp_name="Token Pool", url=self.token_pool_url)
        return None

    def _headers(self) -> Optional[dict[str, str]]:
        return {"Authorization": f"Bearer {self.token_pool_auth}"} if self.token_pool_auth else None

    async def create_token(
        self,
        caller_id: str,
        called_id: str,
        call_reference: Optional[str] = None,
        *,
        ttl: int = 30,
        branding: BrandingInfo | dict[str, Any] | None = None,
        holder: HolderHint = None,
    ) -> TokenCreateResult:
        """Create a token before placing an outbound call (originating CP).

        The token is created in the pool of the CP that holds ``caller_id`` (normally
        this CP), or at ``token_pool_url`` if configured. Raises :class:`DiscoveryError`
        if the caller ID has no PSTN2 holder."""
        caller = _number(caller_id, "callerID")
        called = _number(called_id, "calledID")
        ref = call_reference or str(uuid.uuid4())
        req = TokenCreateRequest(
            message_id=str(uuid.uuid4()), timestamp=now_iso(), version=PROTOCOL_VERSION,
            originating_cp=self._ctx.cp_id, caller_id=caller, called_id=called, call_reference=ref, ttl=ttl,
            branding=BrandingInfo.model_validate(branding) if isinstance(branding, dict) else branding,
        )
        call = await self._ctx.caller.call(caller, "POST", "auth/tokens", self._ctx.sign(req.to_wire()),
                                           hint=self._pool_hint(holder), headers=self._headers())
        call.raise_for_error()
        result = TokenCreateResult.model_validate(call.body)
        result.holder, result.discovery, result.rediscovered = call.holder, call.discovery, call.rediscovered
        logger.info("token %s created at %s (expires %s)", result.token_id, call.holder.cp_id, result.expires_at)
        return result

    async def verify_token(
        self,
        token_id: str,
        caller_id: Optional[str] = None,
        *,
        holder: HolderHint = None,
    ) -> Optional[TokenVerifyResponse]:
        """Verify a token (terminating CP). Returns ``None`` if the token is unknown,
        expired or malformed. The pool is found by discovering ``caller_id`` unless
        ``holder`` or ``token_pool_url`` says where it is."""
        if not TOKEN_PATTERN.match(token_id):
            logger.info("malformed token id %r", token_id)
            return None
        hint = self._pool_hint(holder)
        if hint is None and caller_id is None:
            raise ValidationError("verify_token needs caller_id (to discover the pool), holder, or token_pool_url")
        number = _number(caller_id, "callerID") if caller_id else "+0"
        try:
            call = await self._ctx.caller.call(number, "GET", f"auth/tokens/{token_id}", hint=hint, headers=self._headers())
        except DiscoveryError as exc:
            logger.info("token pool for %s not found: %s", caller_id, exc)
            return None
        if call.status in (404, 410):
            logger.info("token %s %s", token_id, "expired" if call.status == 410 else "not found")
            return None
        call.raise_for_error()
        tok = TokenVerifyResponse.model_validate(call.body)
        if caller_id and tok.caller_id and tok.caller_id != e164(caller_id):
            logger.warning("token %s is for %s, not %s", token_id, tok.caller_id, caller_id)
            return None
        return tok


class AuthenticationModule:
    """``client.auth``: Direct Query plus Token Pool."""

    def __init__(self, ctx: ServiceContext, *, token_pool_url: Optional[str] = None,
                 token_pool_auth: Optional[str] = None) -> None:
        self.direct_query = DirectQueryAuth(ctx)
        self.token_pool = TokenPoolAuth(ctx, token_pool_url=token_pool_url, token_pool_auth=token_pool_auth)

    async def verify_call(
        self,
        caller_id: str,
        called_id: str,
        call_reference: Optional[str] = None,
        *,
        token_id: Optional[str] = None,
        holder: HolderHint = None,
    ) -> VerificationResult:
        """Verify an inbound call. With ``token_id``, try the token pool first and fall
        back to Direct Query if the token does not verify."""
        if token_id:
            try:
                tok = await self.token_pool.verify_token(token_id, caller_id, holder=holder)
            except PSTN2Error as exc:
                logger.warning("token pool error (%s); falling back to direct query", exc)
                tok = None
            if tok is not None and tok.verified:
                return VerificationResult(
                    verified=True, call_reference=tok.call_reference or call_reference, trust_level="high",
                    branding=tok.branding, timestamp=now_iso(),
                    caller_name=tok.branding.display_name if tok.branding else None,
                    call_purpose=tok.branding.call_purpose if tok.branding else None,
                )
            logger.info("token %s did not verify; falling back to direct query", token_id)
        return await self.direct_query.verify_call(caller_id, called_id, call_reference, holder=holder)

    async def create_token(self, caller_id: str, called_id: str, call_reference: Optional[str] = None,
                           **kw: Any) -> TokenCreateResult:
        return await self.token_pool.create_token(caller_id, called_id, call_reference, **kw)

    async def verify_token(self, token_id: str, caller_id: Optional[str] = None, **kw: Any) -> Optional[TokenVerifyResponse]:
        return await self.token_pool.verify_token(token_id, caller_id, **kw)


def _code(body: Any) -> Optional[str]:
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return err.get("code")
        if isinstance(err, str):
            return err
    return None


__all__ = ["AuthenticationModule", "DirectQueryAuth", "TokenPoolAuth", "api_error_from_response"]
