"""Pydantic models for the PSTN2 v1.1 wire format (docs/API-SPECIFICATION.yaml).

Python attributes are snake_case; the wire names (camelCase, plus the spec's
``callerID``/``calledID``/``requestingCP``/``originatingCP``/``requestingPSAP``) are
aliases. Models accept either form on input and :meth:`Model.to_wire` serialises with
the wire names. Response models are deliberately lenient (unknown fields are kept,
most fields optional) so that the SDK interoperates with CPs on newer minor versions.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, ClassVar, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

E164_PATTERN = re.compile(r"^\+[1-9]\d{1,14}$")


def digits_of(number: str | int) -> str:
    """E.164 digits without the ``+`` (non-digits stripped), e.g. ``+44 161…`` → ``44161…``."""
    s = str(number)
    if s.startswith("+"):
        s = s[1:]
    return re.sub(r"\D", "", s)


def e164(number: str | int) -> str:
    """Normalise to E.164 wire form, e.g. ``441614960123`` → ``+441614960123``."""
    return "+" + digits_of(number)


def is_e164(number: str) -> bool:
    return bool(E164_PATTERN.match(number))


def display_number(number: str) -> str:
    """UK national display form for a +44 number (mirrors harness-engine.js ``displayNumber``)."""
    d = digits_of(number)
    if not d.startswith("44"):
        return "+" + d
    n = "0" + d[2:]
    if re.match(r"^02\d", n):
        return f"{n[:3]} {n[3:7]} {n[7:]}"
    if n.startswith("07"):
        return f"{n[:5]} {n[5:]}"
    if re.match(r"^01\d1", n) or n.startswith("011"):
        return f"{n[:4]} {n[4:7]} {n[7:]}"
    return f"{n[:5]} {n[5:]}"


def now_iso() -> str:
    """Current time as ISO 8601 with milliseconds and ``Z`` (§3.2)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Model(BaseModel):
    """Base model: snake_case attributes, camelCase wire names, unknown fields kept."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel, extra="allow")

    #: SDK-only fields excluded from :meth:`to_wire`.
    _sdk_fields: ClassVar[frozenset[str]] = frozenset()

    def to_wire(self) -> dict[str, Any]:
        """Serialise with wire (alias) names, omitting ``None`` and SDK-only fields."""
        return self.model_dump(by_alias=True, exclude_none=True, mode="json", exclude=set(self._sdk_fields) or None)


# ---------------------------------------------------------------------------
# Number Discovery (§9)
# ---------------------------------------------------------------------------


class CpRef(Model):
    """A CP and the base URL of its PSTN2 API (endpoints are ``{url}/pstn2/v1/...``)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel, extra="ignore", frozen=True)

    cp_id: str
    cp_name: str = ""
    url: str

    @property
    def api_base(self) -> str:
        """``{url}/pstn2/v1``."""
        return f"{self.url.rstrip('/')}/pstn2/v1"

    def discovery_url(self, number: str) -> str:
        """``{url}/pstn2/v1/numbers/{digits}``."""
        return f"{self.api_base}/numbers/{digits_of(number)}"

    def __str__(self) -> str:
        return f"{self.cp_name or self.cp_id} ({self.cp_id})"


class RangeHolderRef(Model):
    """The Range Holder named in the numbering list (used for ``not_participating``)."""

    cp_id: str
    cp_name: str = ""


class CacheControl(Model):
    """``cache`` instruction carried by any PSTN2 response (§9.4–9.5)."""

    ttl: Optional[int] = None
    invalidate: Optional[bool] = None
    scope: Optional[Literal["number", "block"]] = None


class NumberingBlock(Model):
    """One block of the regulator numbering list (§9.1)."""

    prefix: str
    display: Optional[str] = None
    number_length: Optional[int] = None
    status: Optional[str] = None
    cp_id: str
    cp_name: str = ""
    range_holder_url: Optional[str] = None

    @property
    def participating(self) -> bool:
        return bool(self.range_holder_url)

    def range_holder(self) -> CpRef | None:
        """The Range Holder as a :class:`CpRef`, or ``None`` if it does not participate."""
        if not self.range_holder_url:
            return None
        return CpRef(cp_id=self.cp_id, cp_name=self.cp_name, url=self.range_holder_url)


class NumberingListData(Model):
    """The numbering list document (``NumberingList`` schema)."""

    list_version: str = ""
    publisher: Optional[str] = None
    source: Optional[str] = None
    blocks: list[NumberingBlock] = Field(default_factory=list)


class DiscoveryResponse(Model):
    """A CP's answer to ``GET {url}/pstn2/v1/numbers/{digits}`` (§9.2)."""

    version: Optional[str] = None
    result: str
    number: Optional[str] = None
    holder: Optional[CpRef] = None
    ported: Optional[bool] = None
    ported_to: Optional[CpRef] = None
    cache: Optional[CacheControl] = None
    issued: Optional[str] = None
    kid: Optional[str] = None
    signature: Optional[str] = None


class PublicKeyInfo(Model):
    kid: str
    algorithm: str = "ed25519"
    public_key: str
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None


class KeySet(Model):
    """``GET {url}/pstn2/v1/keys`` (§9.6)."""

    cp_id: Optional[str] = None
    keys: list[PublicKeyInfo] = Field(default_factory=list)


DiscoveryOutcome = Literal["held", "unknown", "unallocated", "not_participating", "error"]
DiscoveryErrorCode = Literal["hop_limit_exceeded", "loop_detected", "timeout", "invalid_response", "invalid_signature"]


class DiscoveryResult(Model):
    """Outcome of :meth:`DiscoveryClient.discover` (§9.3).

    ``hops`` lists the cpId of every CP queried, in order. ``from_cache`` is true when the
    final answer came from querying a cached holder; ``invalidated`` when any response in
    this discovery told us to purge the cache.
    """

    number: str
    result: DiscoveryOutcome
    holder: Optional[CpRef] = None
    ported: bool = False
    hops: list[str] = Field(default_factory=list)
    from_cache: bool = False
    invalidated: bool = False
    error: Optional[DiscoveryErrorCode] = None
    range_holder: Optional[RangeHolderRef] = None

    @property
    def held(self) -> bool:
        return self.result == "held"

    @property
    def fallback_to_pstn(self) -> bool:
        """True whenever the caller must use traditional PSTN handling."""
        return self.result != "held"


class NotHeldResponse(Model):
    """HTTP 200 ``not_held`` from a CP that no longer holds the number (§5.1.2, §9.5)."""

    verified: Optional[bool] = None
    result: Literal["not_held"] = "not_held"
    call_reference: Optional[str] = None
    cache: Optional[CacheControl] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Authentication (§5)
# ---------------------------------------------------------------------------


class BrandingInfo(Model):
    logo: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    display_name: Optional[str] = Field(default=None, max_length=50)
    call_purpose: Optional[str] = Field(default=None, max_length=100)


class CallVerificationRequest(Model):
    message_id: str
    timestamp: str
    version: str
    requesting_cp: str = Field(alias="requestingCP")
    caller_id: str = Field(alias="callerID")
    called_id: str = Field(alias="calledID")
    call_reference: str
    signature: Optional[str] = None


class CallVerificationResponse(Model):
    verified: bool = False
    call_reference: Optional[str] = None
    caller_name: Optional[str] = None
    caller_org: Optional[str] = None
    call_purpose: Optional[str] = None
    trust_level: Optional[str] = None
    branding: Optional[BrandingInfo] = None
    timestamp: Optional[str] = None
    signature: Optional[str] = None


class TokenCreateRequest(Model):
    message_id: str
    timestamp: str
    version: str
    originating_cp: str = Field(alias="originatingCP")
    caller_id: str = Field(alias="callerID")
    called_id: str = Field(alias="calledID")
    call_reference: str
    ttl: int = Field(default=30, ge=10, le=60)
    branding: Optional[BrandingInfo] = None
    signature: Optional[str] = None


class TokenCreateResponse(Model):
    token_id: str
    expires_at: Optional[str] = None
    call_reference: Optional[str] = None


class TokenVerifyResponse(Model):
    token_id: str
    originating_cp: Optional[str] = Field(default=None, alias="originatingCP")
    caller_id: Optional[str] = Field(default=None, alias="callerID")
    called_id: Optional[str] = Field(default=None, alias="calledID")
    call_reference: Optional[str] = None
    verified: bool = False
    branding: Optional[BrandingInfo] = None
    expires_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Routing (§6)
# ---------------------------------------------------------------------------


class MediaCapabilities(Model):
    codecs: list[str] = Field(default_factory=lambda: ["opus", "g722", "pcmu", "pcma"])
    encryption: list[str] = Field(default_factory=lambda: ["srtp-aes256", "srtp-aes128"])
    video: bool = False
    max_bandwidth: Optional[int] = None


class ConnectionDetails(Model):
    fqdn: Optional[str] = None
    ipv4: Optional[str] = None
    ipv6: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    public_key: Optional[str] = None


class RoutingRequest(Model):
    message_id: str
    timestamp: str
    version: str
    requesting_cp: str = Field(alias="requestingCP")
    caller_id: str = Field(alias="callerID")
    destination_number: str
    call_reference: str
    media_capabilities: MediaCapabilities
    public_key: str
    branding: Optional[BrandingInfo] = None
    signature: Optional[str] = None


class RoutingResponse(Model):
    accepted: bool = False
    call_reference: Optional[str] = None
    connection_details: Optional[ConnectionDetails] = None
    agreed_capabilities: Optional[MediaCapabilities] = None
    timestamp: Optional[str] = None
    signature: Optional[str] = None
    # RoutingRejection fields (503)
    reason: Optional[str] = None
    fallback_to_traditional: Optional[bool] = None
    retry_after: Optional[int] = None


class RoutingRejection(Model):
    accepted: Literal[False] = False
    reason: str
    fallback_to_traditional: bool = True
    retry_after: Optional[int] = None
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Emergency (§8)
# ---------------------------------------------------------------------------


class EmergencyLocationRequest(Model):
    message_id: str
    timestamp: str
    version: str
    requesting_psap: str = Field(alias="requestingPSAP")
    caller_id: str = Field(alias="callerID")
    call_reference: str
    signature: Optional[str] = None


class LocationData(Model):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    altitude: Optional[float] = None
    source: Optional[str] = None


class AddressData(Model):
    street: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None


class AdditionalLocationInfo(Model):
    cell_tower_id: Optional[str] = None
    wifi_access_points: Optional[list[str]] = None
    last_updated: Optional[str] = None


class EmergencyLocationResponse(Model):
    call_reference: Optional[str] = None
    location: Optional[LocationData] = None
    address: Optional[AddressData] = None
    additional_info: Optional[AdditionalLocationInfo] = None
    timestamp: Optional[str] = None
    signature: Optional[str] = None


# ---------------------------------------------------------------------------
# Errors (§10.1)
# ---------------------------------------------------------------------------


class ErrorDetail(Model):
    code: str
    message: str = ""
    timestamp: Optional[str] = None
    request_id: Optional[str] = None


class ErrorResponse(Model):
    error: ErrorDetail


# ---------------------------------------------------------------------------
# SDK result types: wire response + how the SDK got there
# ---------------------------------------------------------------------------

_HOLDER_FIELDS = frozenset({"holder", "discovery", "rediscovered", "reason", "fallback_to_pstn"})


class VerificationResult(CallVerificationResponse):
    """:meth:`DirectQueryAuth.verify_call` result.

    The wire fields of ``CallVerificationResponse`` plus: ``holder`` (the CP that
    answered), ``discovery`` (how it was found), ``rediscovered`` (a ``not_held`` answer
    forced a purge-rediscover-retry), ``reason`` (why not verified) and
    ``fallback_to_pstn``.
    """

    _sdk_fields: ClassVar[frozenset[str]] = _HOLDER_FIELDS

    holder: Optional[CpRef] = None
    discovery: Optional[DiscoveryResult] = None
    rediscovered: bool = False
    reason: Optional[str] = None
    fallback_to_pstn: bool = False


class RoutingResult(RoutingResponse):
    """:meth:`RoutingModule.request_routing` result (``RoutingResponse`` + SDK fields)."""

    _sdk_fields: ClassVar[frozenset[str]] = _HOLDER_FIELDS

    holder: Optional[CpRef] = None
    discovery: Optional[DiscoveryResult] = None
    rediscovered: bool = False
    fallback_to_pstn: bool = False


class EmergencyLocationResult(EmergencyLocationResponse):
    """:meth:`EmergencyModule.get_location` result (``EmergencyLocationResponse`` + SDK fields)."""

    _sdk_fields: ClassVar[frozenset[str]] = _HOLDER_FIELDS

    holder: Optional[CpRef] = None
    discovery: Optional[DiscoveryResult] = None
    rediscovered: bool = False


class TokenCreateResult(TokenCreateResponse):
    """:meth:`TokenPoolAuth.create_token` result (``TokenCreateResponse`` + the pool used)."""

    _sdk_fields: ClassVar[frozenset[str]] = _HOLDER_FIELDS

    holder: Optional[CpRef] = None
    discovery: Optional[DiscoveryResult] = None
    rediscovered: bool = False


__all__ = [
    "AdditionalLocationInfo",
    "AddressData",
    "BrandingInfo",
    "CacheControl",
    "CallVerificationRequest",
    "CallVerificationResponse",
    "ConnectionDetails",
    "CpRef",
    "DiscoveryErrorCode",
    "DiscoveryOutcome",
    "DiscoveryResponse",
    "DiscoveryResult",
    "EmergencyLocationRequest",
    "EmergencyLocationResponse",
    "EmergencyLocationResult",
    "ErrorDetail",
    "ErrorResponse",
    "KeySet",
    "LocationData",
    "MediaCapabilities",
    "Model",
    "NotHeldResponse",
    "NumberingBlock",
    "NumberingListData",
    "PublicKeyInfo",
    "RangeHolderRef",
    "RoutingRejection",
    "RoutingRequest",
    "RoutingResponse",
    "RoutingResult",
    "TokenCreateRequest",
    "TokenCreateResponse",
    "TokenCreateResult",
    "TokenVerifyResponse",
    "VerificationResult",
    "digits_of",
    "display_number",
    "e164",
    "is_e164",
    "now_iso",
]
