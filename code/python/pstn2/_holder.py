"""Calling a number's current holder, with the §5.1.2 / §9.5 not_held recovery.

Every service call (verify, token pool, routing, emergency) is addressed to the CP that
currently holds a number:

1. find the holder with ``discover(number)`` (or use one the caller already resolved);
2. call ``{holder.url}/pstn2/v1/{path}``;
3. if that CP answers HTTP 200 ``{"result": "not_held", "cache": {"invalidate": true}}``,
   purge the cache entry, rediscover from the Range Holder and retry **once** at the new
   holder.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional, Union

from .discovery import DiscoveryClient
from .errors import DiscoveryError, NotHeldError, api_error_from_response
from .transport import HttpResponse, HttpTransport
from .types import CpRef, DiscoveryResult, e164

logger = logging.getLogger("pstn2.holder")

HolderHint = Union[CpRef, DiscoveryResult, None]


@dataclass
class HolderCall:
    response: HttpResponse
    holder: CpRef
    discovery: Optional[DiscoveryResult]
    rediscovered: bool

    @property
    def status(self) -> int:
        return self.response.status

    @property
    def body(self) -> Any:
        return self.response.body

    def raise_for_error(self) -> None:
        if self.response.status >= 400:
            raise api_error_from_response(self.response.status, self.response.body, self.response.headers)


def is_not_held(resp: HttpResponse) -> bool:
    return resp.status == 200 and isinstance(resp.body, dict) and resp.body.get("result") == "not_held"


class HolderCaller:
    def __init__(self, discovery: DiscoveryClient, http: HttpTransport) -> None:
        self.discovery = discovery
        self.http = http

    async def resolve(self, number: str, hint: HolderHint = None) -> tuple[CpRef, Optional[DiscoveryResult]]:
        if isinstance(hint, CpRef):
            return hint, None
        if isinstance(hint, DiscoveryResult) and hint.held and hint.holder is not None:
            return hint.holder, hint
        result = await self.discovery.discover(number)
        if not result.held or result.holder is None:
            raise DiscoveryError(result)
        return result.holder, result

    async def call(
        self,
        number: str,
        method: str,
        path: str,
        body: Any = None,
        *,
        hint: HolderHint = None,
        headers: Optional[dict[str, str]] = None,
        on_retry: Optional[Callable[[CpRef, DiscoveryResult], None]] = None,
    ) -> HolderCall:
        """Call ``path`` (relative to ``/pstn2/v1``) at the holder of ``number``.

        Raises :class:`DiscoveryError` if no holder can be found, :class:`NotHeldError`
        if the rediscovered holder also answers ``not_held``, and transport errors from
        :class:`HttpTransport`. HTTP error statuses are returned (see
        :meth:`HolderCall.raise_for_error`)."""
        n = e164(number)
        holder, disc = await self.resolve(n, hint)
        resp = await self._send(holder, method, path, body, headers)
        if not is_not_held(resp):
            return HolderCall(resp, holder, disc, False)

        logger.info("%s answered not_held for %s: purging cache and rediscovering", holder.cp_id, n)
        self.discovery.cache.purge(n)
        cache_ctl = resp.body.get("cache") if isinstance(resp.body.get("cache"), dict) else {}
        if cache_ctl.get("scope") == "block":
            await self.discovery.numbering_list.refresh(force=True)
        disc2 = await self.discovery.discover(n)
        if not disc2.held or disc2.holder is None:
            raise DiscoveryError(disc2)
        if on_retry:
            on_retry(holder, disc2)
        resp2 = await self._send(disc2.holder, method, path, body, headers)
        if is_not_held(resp2):
            self.discovery.cache.purge(n)
            raise NotHeldError(n, disc2.holder.cp_id)
        return HolderCall(resp2, disc2.holder, disc2, True)

    async def _send(self, holder: CpRef, method: str, path: str, body: Any, headers: Optional[dict[str, str]]) -> HttpResponse:
        url = f"{holder.api_base}/{path.lstrip('/')}"
        logger.debug("%s %s", method, url)
        return await self.http.request(method, url, json_body=body, headers=headers)


class ServiceContext:
    """What every service module needs: the acting CP, the holder caller and a signing key."""

    def __init__(self, cp_id: str, caller: HolderCaller, private_key: Any) -> None:
        from .crypto import load_private_key, public_key_of

        self.cp_id = cp_id
        self.caller = caller
        self.private_key = load_private_key(private_key)
        self.public_key = public_key_of(self.private_key)

    @property
    def discovery(self) -> DiscoveryClient:
        return self.caller.discovery

    @property
    def http(self) -> HttpTransport:
        return self.caller.http

    def sign(self, body: dict[str, Any]) -> dict[str, Any]:
        """Body-level Ed25519 signature over the canonical JSON of the body (§3.3.2, §4.1)."""
        from .crypto import sign_body

        return sign_body(body, self.private_key)
