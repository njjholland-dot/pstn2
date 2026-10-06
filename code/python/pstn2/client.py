"""PSTN2Client: one object per acting CP, wiring discovery into every service."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Callable, Mapping, Optional

import httpx

from ._holder import HolderCaller, HolderHint, ServiceContext
from ._version import __version__
from .auth import AuthenticationModule
from .config import NetworkConfig
from .crypto import generate_key_pair
from .discovery import (
    DEFAULT_HOP_LIMIT,
    DEFAULT_LIST_REFRESH,
    DEFAULT_TTL,
    DiscoveryCache,
    DiscoveryClient,
    EventHandler,
    KeyStore,
    NumberingList,
    Transport,
)
from .emergency import EmergencyModule
from .routing import RoutingModule
from .transport import HttpTransport
from .types import (
    DiscoveryResult,
    EmergencyLocationResult,
    MediaCapabilities,
    NumberingListData,
    RoutingResult,
    TokenCreateResult,
    TokenVerifyResponse,
    VerificationResult,
)

logger = logging.getLogger("pstn2")


class PSTN2Client:
    """The PSTN2 SDK entry point for one Communication Provider.

    >>> async with PSTN2Client(cp_id="CP1-UK-0101",
    ...                        numbering_list_url="http://127.0.0.1:47901/numbering-list.json") as client:
    ...     result = await client.discover("+441614960123")

    Exactly one of ``numbering_list_url`` / ``numbering_list`` is required.

    Attributes: ``discovery`` (:class:`DiscoveryClient`), ``numbering_list``, ``cache``,
    ``auth`` (``direct_query`` + ``token_pool``), ``routing``, ``emergency``, ``http``.
    """

    def __init__(
        self,
        cp_id: str,
        *,
        numbering_list_url: Optional[str] = None,
        numbering_list: NumberingList | NumberingListData | Mapping[str, Any] | None = None,
        verify_signatures: bool = False,
        timeout: float = 2.0,
        retries: int = 3,
        hop_limit: int = DEFAULT_HOP_LIMIT,
        default_ttl: int = DEFAULT_TTL,
        list_refresh_seconds: float = DEFAULT_LIST_REFRESH,
        private_key: Any = None,
        token_pool_url: Optional[str] = None,
        token_pool_auth: Optional[str] = None,
        on_event: EventHandler | None = None,
        http_client: httpx.AsyncClient | None = None,
        transport: Transport | None = None,
        cache: DiscoveryCache | None = None,
        key_store: KeyStore | None = None,
        log_level: str | int | None = None,
        now: Callable[[], float] = time.time,
    ) -> None:
        if (numbering_list_url is None) == (numbering_list is None):
            raise ValueError("pass exactly one of numbering_list_url or numbering_list")
        if log_level is not None:
            logger.setLevel(log_level.upper() if isinstance(log_level, str) else log_level)
        self.cp_id = cp_id
        self.http = HttpTransport(cp_id=cp_id, timeout=timeout, retries=retries, client=http_client)
        if numbering_list_url is not None:
            nl = NumberingList.from_url(numbering_list_url, refresh_seconds=list_refresh_seconds, http=self.http, now=now)
        elif isinstance(numbering_list, NumberingList):
            nl = numbering_list
            nl.attach_http(self.http)
        else:
            nl = NumberingList(numbering_list, now=now)
        self.numbering_list = nl
        self.discovery = DiscoveryClient(
            nl, cp_id=cp_id, cache=cache, http=self.http, transport=transport, hop_limit=hop_limit,
            default_ttl=default_ttl, verify_signatures=verify_signatures,
            key_store=key_store or KeyStore(self.http, now=now), on_event=on_event, now=now,
        )
        if private_key is None:
            private_key = generate_key_pair().private_key
            logger.debug("no private key configured: using an ephemeral Ed25519 key")
        self._ctx = ServiceContext(cp_id, HolderCaller(self.discovery, self.http), private_key)
        self.auth = AuthenticationModule(self._ctx, token_pool_url=token_pool_url, token_pool_auth=token_pool_auth)
        self.routing = RoutingModule(self._ctx)
        self.emergency = EmergencyModule(self._ctx)
        logger.debug("PSTN2Client %s ready (pstn2-python-sdk %s)", cp_id, __version__)

    # -- construction from the environment ----------------------------------

    @classmethod
    def from_config(cls, config: NetworkConfig, **kw: Any) -> "PSTN2Client":
        kw.setdefault("verify_signatures", config.verify_signatures)
        if config.private_key:
            kw.setdefault("private_key", config.private_key)
        return cls(config.cp_id, numbering_list_url=config.numbering_list_url, **kw)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None, *, default_cp_id: Optional[str] = None,
                 **kw: Any) -> "PSTN2Client":
        """Build from ``PSTN2_NETWORK`` / ``PSTN2_NUMBERING_LIST_URL`` / ``PSTN2_CP_ID`` /
        ``PSTN2_VERIFY_SIGNATURES`` (see :mod:`pstn2.config`)."""
        return cls.from_config(NetworkConfig.from_env(env, default_cp_id=default_cp_id), **kw)

    # -- properties -----------------------------------------------------------

    @property
    def cache(self) -> DiscoveryCache:
        return self.discovery.cache

    @property
    def public_key(self) -> str:
        """This client's Ed25519 identity public key (base64, raw 32 bytes)."""
        return self._ctx.public_key

    # -- shortcuts --------------------------------------------------------------

    async def discover(self, number: str, *, on_event: EventHandler | None = None) -> DiscoveryResult:
        """Who holds this number? (§9.3)"""
        return await self.discovery.discover(number, on_event=on_event)

    async def verify_call(self, caller_id: str, called_id: str, call_reference: Optional[str] = None,
                          **kw: Any) -> VerificationResult:
        return await self.auth.verify_call(caller_id, called_id, call_reference, **kw)

    async def create_token(self, caller_id: str, called_id: str, call_reference: Optional[str] = None,
                           **kw: Any) -> TokenCreateResult:
        return await self.auth.create_token(caller_id, called_id, call_reference, **kw)

    async def verify_token(self, token_id: str, caller_id: Optional[str] = None, **kw: Any) -> Optional[TokenVerifyResponse]:
        return await self.auth.verify_token(token_id, caller_id, **kw)

    async def request_routing(self, destination_number: str, caller_id: str,
                              media_capabilities: MediaCapabilities | dict[str, Any] | None = None,
                              call_reference: Optional[str] = None, **kw: Any) -> RoutingResult:
        return await self.routing.request_routing(destination_number, caller_id, media_capabilities, call_reference, **kw)

    async def get_emergency_location(self, caller_id: str, psap_id: str, call_reference: Optional[str] = None,
                                     *, holder: HolderHint = None) -> EmergencyLocationResult:
        return await self.emergency.get_location(caller_id, psap_id, call_reference, holder=holder)

    @staticmethod
    def generate_call_reference() -> str:
        """A UUID v4 call reference (§3.1.3)."""
        return str(uuid.uuid4())

    # -- lifecycle ----------------------------------------------------------------

    async def close(self) -> None:
        """Clear the discovery cache and close HTTP connections."""
        self.discovery.cache.clear()
        await self.http.aclose()

    async def __aenter__(self) -> "PSTN2Client":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()
