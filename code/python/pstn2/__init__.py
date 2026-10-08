"""PSTN2 Python SDK (protocol v1.1).

Number Discovery — "which CP currently holds this number?" — answered from the
regulator numbering list and the Range Holder, with no central database — plus caller
ID verification (Direct Query), direct routing and emergency location,
all addressed to the holder that discovery finds.
"""

from ._version import PROTOCOL_VERSION, USER_AGENT, __version__
from .auth import AuthenticationModule, DirectQueryAuth
from .client import PSTN2Client
from .config import NetworkConfig
from .crypto import (
    KeyPair,
    canonical_json,
    fingerprint,
    generate_key_pair,
    public_key_of,
    sign_body,
    verify_body,
)
from .discovery import (
    CacheEntry,
    DiscoveryCache,
    DiscoveryClient,
    DiscoveryEvent,
    KeyStore,
    NumberDatabase,
    NumberingList,
    RangeHolderResponder,
    ResponderAnswer,
    TransportResponse,
    find_block,
)
from .emergency import EmergencyModule
from .errors import (
    ApiError,
    CallNotFoundError,
    DiscoveryError,
    ErrorCode,
    InvalidResponseError,
    NetworkError,
    NotHeldError,
    PSTN2Error,
    PSTN2TimeoutError,
    RateLimitError,
    ValidationError,
)
from .routing import RoutingModule
from .transport import HttpTransport
from .types import (
    BrandingInfo,
    CpRef,
    DiscoveryResult,
    MediaCapabilities,
    digits_of,
    display_number,
    e164,
)

#: Alias: the contract allows ``Discovery`` or ``DiscoveryClient``.
Discovery = DiscoveryClient

__all__ = [
    "PROTOCOL_VERSION",
    "USER_AGENT",
    "__version__",
    "ApiError",
    "AuthenticationModule",
    "BrandingInfo",
    "CacheEntry",
    "CallNotFoundError",
    "CpRef",
    "DirectQueryAuth",
    "Discovery",
    "DiscoveryCache",
    "DiscoveryClient",
    "DiscoveryError",
    "DiscoveryEvent",
    "DiscoveryResult",
    "EmergencyModule",
    "ErrorCode",
    "HttpTransport",
    "InvalidResponseError",
    "KeyPair",
    "KeyStore",
    "MediaCapabilities",
    "NetworkConfig",
    "NetworkError",
    "NotHeldError",
    "NumberDatabase",
    "NumberingList",
    "PSTN2Client",
    "PSTN2Error",
    "PSTN2TimeoutError",
    "RangeHolderResponder",
    "RateLimitError",
    "ResponderAnswer",
    "RoutingModule",
    "TransportResponse",
    "ValidationError",
    "canonical_json",
    "digits_of",
    "display_number",
    "e164",
    "find_block",
    "fingerprint",
    "generate_key_pair",
    "public_key_of",
    "sign_body",
    "verify_body",
]
