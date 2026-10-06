"""Direct routing (SPECIFICATION.md §6).

The originating CP discovers the destination number's current holder and asks it
``POST /routing/request`` for connection details, negotiating codecs and SRTP. A
rejection is *returned* (``accepted=False``, ``fallback_to_pstn=True``), never raised,
so callers fall back to traditional PSTN with a simple ``if``.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Iterable, Optional

from ._holder import HolderHint, ServiceContext
from ._version import PROTOCOL_VERSION
from .errors import DiscoveryError, NotHeldError, ValidationError
from .types import BrandingInfo, MediaCapabilities, RoutingRequest, RoutingResult, e164, is_e164, now_iso

logger = logging.getLogger("pstn2.routing")

REQUIRED_CODECS = ("opus", "g722", "pcmu", "pcma")
REQUIRED_ENCRYPTION = ("srtp-aes256", "srtp-aes128")


def negotiate(requested: Iterable[str], supported: Iterable[str]) -> list[str]:
    """Items of ``requested`` (in the requester's preference order) that are ``supported``."""
    sup = set(supported)
    return [x for x in requested if x in sup]


class RoutingModule:
    """``client.routing``."""

    def __init__(self, ctx: ServiceContext) -> None:
        self._ctx = ctx

    async def request_routing(
        self,
        destination_number: str,
        caller_id: str,
        media_capabilities: MediaCapabilities | dict[str, Any] | None = None,
        call_reference: Optional[str] = None,
        *,
        branding: BrandingInfo | dict[str, Any] | None = None,
        public_key: Optional[str] = None,
        holder: HolderHint = None,
    ) -> RoutingResult:
        """Ask the destination's holder for direct-routing connection details.

        ``holder`` may be a :class:`CpRef` or a held :class:`DiscoveryResult` from an
        earlier ``discover()`` (saves a query). ``public_key`` defaults to this client's
        Ed25519 identity key (§6.3)."""
        dest = e164(destination_number)
        caller = e164(caller_id)
        for n, what in ((dest, "destinationNumber"), (caller, "callerID")):
            if not is_e164(n):
                raise ValidationError(f"{what} {n!r} is not an E.164 number")
        ref = call_reference or str(uuid.uuid4())
        caps = media_capabilities if isinstance(media_capabilities, MediaCapabilities) else \
            MediaCapabilities.model_validate(media_capabilities or {})
        req = RoutingRequest(
            message_id=str(uuid.uuid4()), timestamp=now_iso(), version=PROTOCOL_VERSION,
            requesting_cp=self._ctx.cp_id, caller_id=caller, destination_number=dest, call_reference=ref,
            media_capabilities=caps, public_key=public_key or self._ctx.public_key,
            branding=BrandingInfo.model_validate(branding) if isinstance(branding, dict) else branding,
        )
        try:
            call = await self._ctx.caller.call(dest, "POST", "routing/request", self._ctx.sign(req.to_wire()), hint=holder)
        except DiscoveryError as exc:
            d = exc.discovery
            logger.info("no direct route to %s (discovery %s): use traditional PSTN", dest, d.error or d.result)
            return RoutingResult(accepted=False, call_reference=ref, reason=f"discovery_{d.error or d.result}",
                                 fallback_to_traditional=True, fallback_to_pstn=True, discovery=d, timestamp=now_iso())
        except NotHeldError as exc:
            return RoutingResult(accepted=False, call_reference=ref, reason=f"not_held_by_{exc.cp_id}",
                                 fallback_to_traditional=True, fallback_to_pstn=True, rediscovered=True,
                                 timestamp=now_iso())

        body = call.body if isinstance(call.body, dict) else {}
        if call.status == 200 and body.get("accepted"):
            result = RoutingResult.model_validate(body)
        else:
            reason = body.get("reason")
            err = body.get("error")
            if isinstance(err, dict):
                reason = reason or err.get("code")
            result = RoutingResult(
                accepted=False, call_reference=body.get("callReference", ref),
                reason=reason or f"http_{call.status}", fallback_to_traditional=body.get("fallbackToTraditional", True),
                retry_after=body.get("retryAfter"), timestamp=body.get("timestamp") or now_iso(),
            )
            result.fallback_to_pstn = True
            logger.info("routing to %s rejected by %s: %s", dest, call.holder.cp_id, result.reason)
        result.holder, result.discovery, result.rediscovered = call.holder, call.discovery, call.rediscovered
        if result.call_reference is None:
            result.call_reference = ref
        return result

    @staticmethod
    def negotiate_codecs(requested: Iterable[str], supported: Iterable[str] = REQUIRED_CODECS) -> list[str]:
        return negotiate(requested, supported)

    @staticmethod
    def negotiate_encryption(requested: Iterable[str], supported: Iterable[str] = REQUIRED_ENCRYPTION) -> list[str]:
        return negotiate(requested, supported)


__all__ = ["REQUIRED_CODECS", "REQUIRED_ENCRYPTION", "RoutingModule", "negotiate"]
