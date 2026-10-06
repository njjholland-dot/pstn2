"""Emergency services location (SPECIFICATION.md §8).

A PSAP (or the CP acting for it) discovers the caller ID's current holder and asks it
``POST /emergency/location``. Unlike routing, failures are **raised**: a PSAP must see
that the PSTN2 location query failed so it can use other sources (cell, billing
address).
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Optional

from ._holder import HolderHint, ServiceContext
from ._version import PROTOCOL_VERSION
from .errors import ValidationError
from .types import EmergencyLocationRequest, EmergencyLocationResult, e164, is_e164, now_iso

logger = logging.getLogger("pstn2.emergency")

PSAP_PATTERN = re.compile(r"^[A-Z]{2}-[0-9]{3}-[A-Z0-9-]+$")


class EmergencyModule:
    """``client.emergency``."""

    def __init__(self, ctx: ServiceContext) -> None:
        self._ctx = ctx

    async def get_location(
        self,
        caller_id: str,
        psap_id: str,
        call_reference: Optional[str] = None,
        *,
        holder: HolderHint = None,
    ) -> EmergencyLocationResult:
        """Live location of an emergency caller.

        Raises :class:`~pstn2.errors.DiscoveryError` if the caller ID has no PSTN2
        holder, :class:`~pstn2.errors.ApiError` (e.g. ``location_unavailable``,
        ``unauthorized_psap``) for error responses, and transport errors."""
        caller = e164(caller_id)
        if not is_e164(caller):
            raise ValidationError(f"callerID {caller_id!r} is not an E.164 number")
        if not PSAP_PATTERN.match(psap_id):
            raise ValidationError(f"PSAP id {psap_id!r} does not match {PSAP_PATTERN.pattern}")
        ref = call_reference or str(uuid.uuid4())
        req = EmergencyLocationRequest(
            message_id=str(uuid.uuid4()), timestamp=now_iso(), version=PROTOCOL_VERSION,
            requesting_psap=psap_id, caller_id=caller, call_reference=ref,
        )
        call = await self._ctx.caller.call(caller, "POST", "emergency/location", self._ctx.sign(req.to_wire()), hint=holder)
        call.raise_for_error()
        result = EmergencyLocationResult.model_validate(call.body if isinstance(call.body, dict) else {})
        if result.location is None:
            from .errors import ApiError

            raise ApiError("location_unavailable", f"{call.holder.cp_id} returned no location", status=call.status)
        result.holder, result.discovery, result.rediscovered = call.holder, call.discovery, call.rediscovered
        logger.info("location for %s from %s: %.4f,%.4f ±%sm", caller, call.holder.cp_id,
                    result.location.latitude, result.location.longitude, result.location.accuracy)
        return result


__all__ = ["EmergencyModule", "PSAP_PATTERN"]
