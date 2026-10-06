"""Number Discovery (SPECIFICATION.md §9): "which CP currently holds this number?"

There is no central database. The regulator's numbering list names each block's Range
Holder (and its PSTN2 URL); the Range Holder knows where its ported-out numbers went;
every CP knows the numbers it serves. :class:`DiscoveryClient` walks that chain:

    cache → numbering list → Range Holder → (redirect →) holder → cache

The algorithm, hop accounting and event stream match the reference engine
(``animations/src/test-harness/harness-engine.js``, ``DiscoveryClient.discover``).
:class:`RangeHolderResponder` is the server side (``Network.respond()``).
"""

from __future__ import annotations

import inspect
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Iterable, Mapping, Optional, Union

from pydantic import Field

from ._version import PROTOCOL_VERSION
from .crypto import public_key_of, sign_body, verify_body
from .errors import InvalidResponseError, PSTN2Error
from .transport import HttpTransport
from .types import (
    CpRef,
    DiscoveryResult,
    KeySet,
    Model,
    NumberingBlock,
    NumberingListData,
    PublicKeyInfo,
    RangeHolderRef,
    digits_of,
    e164,
)

logger = logging.getLogger("pstn2.discovery")

DEFAULT_TTL = 86400
DEFAULT_HOP_LIMIT = 5
DEFAULT_LIST_REFRESH = 86400


# ---------------------------------------------------------------------------
# Numbering list (§9.1)
# ---------------------------------------------------------------------------


def find_block(blocks: Iterable[NumberingBlock], number: str) -> NumberingBlock | None:
    """Longest-prefix match; a block's ``numberLength`` must equal the number's digit count."""
    digits = digits_of(number)
    best: NumberingBlock | None = None
    for block in blocks:
        if block.number_length and block.number_length != len(digits):
            continue
        if not digits.startswith(block.prefix):
            continue
        if best is None or len(block.prefix) > len(best.prefix):
            best = block
    return best


class NumberingList:
    """The regulator numbering list, held locally.

    Either built from data (``NumberingList(data)`` / :meth:`from_dict`) or downloaded
    (:meth:`from_url` / :meth:`load`). URL-backed lists are fetched with
    ``ETag``/``If-None-Match`` and refreshed when older than ``refresh_seconds``
    (default one day); a ``304`` keeps the local copy. If a refresh fails the previous
    copy stays in use.
    """

    def __init__(
        self,
        data: NumberingListData | Mapping[str, Any] | None = None,
        *,
        url: str | None = None,
        refresh_seconds: float = DEFAULT_LIST_REFRESH,
        http: HttpTransport | None = None,
        now: Callable[[], float] = time.time,
    ) -> None:
        self.url = url
        self.refresh_seconds = refresh_seconds
        self._http = http
        self._owns_http = False
        self._now = now
        self.etag: str | None = None
        self.fetched_at: float | None = None
        self._data: NumberingListData | None = None
        if data is not None:
            self._data = data if isinstance(data, NumberingListData) else NumberingListData.model_validate(data)
            self.fetched_at = now()

    # -- construction -----------------------------------------------------

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | NumberingListData) -> "NumberingList":
        return cls(data)

    @classmethod
    def from_url(cls, url: str, *, refresh_seconds: float = DEFAULT_LIST_REFRESH, http: HttpTransport | None = None,
                 now: Callable[[], float] = time.time) -> "NumberingList":
        """A URL-backed list; nothing is fetched until :meth:`refresh`/:meth:`ensure_fresh`."""
        return cls(None, url=url, refresh_seconds=refresh_seconds, http=http, now=now)

    @classmethod
    async def load(cls, url: str, *, refresh_seconds: float = DEFAULT_LIST_REFRESH, http: HttpTransport | None = None,
                   now: Callable[[], float] = time.time) -> "NumberingList":
        """Create a URL-backed list and download it now."""
        nl = cls.from_url(url, refresh_seconds=refresh_seconds, http=http, now=now)
        await nl.refresh(force=True)
        return nl

    def attach_http(self, http: HttpTransport) -> None:
        if self._http is None:
            self._http = http

    # -- data -------------------------------------------------------------

    @property
    def loaded(self) -> bool:
        return self._data is not None

    @property
    def data(self) -> NumberingListData:
        if self._data is None:
            raise PSTN2Error("invalid_request", "numbering list not loaded yet (call refresh())")
        return self._data

    @property
    def blocks(self) -> list[NumberingBlock]:
        return self._data.blocks if self._data else []

    @property
    def list_version(self) -> str | None:
        return self._data.list_version if self._data else None

    def find_block(self, number: str) -> NumberingBlock | None:
        return find_block(self.blocks, number)

    def is_stale(self) -> bool:
        if self._data is None:
            return True
        if not self.url or self.fetched_at is None:
            return False
        return self._now() - self.fetched_at >= self.refresh_seconds

    # -- fetching ---------------------------------------------------------

    async def ensure_fresh(self) -> None:
        """Download if never loaded, or refresh if older than ``refresh_seconds``.

        Raises only when there is no local copy at all."""
        if not self.url or not self.is_stale():
            return
        try:
            await self.refresh()
        except PSTN2Error:
            if self._data is None:
                raise
            logger.warning("numbering list refresh failed; keeping listVersion %s", self.list_version)

    async def refresh(self, *, force: bool = False) -> bool:
        """Conditional GET of the list. Returns True if the content changed.

        ``force`` skips the age check (and is used for ``cache.scope = "block"``
        invalidations); the request is still conditional on the ETag."""
        if not self.url:
            return False
        if not force and not self.is_stale():
            return False
        http = self._http
        if http is None:
            http = self._http = HttpTransport()
            self._owns_http = True
        headers = {"If-None-Match": self.etag} if self.etag and self._data is not None else None
        resp = await http.get(self.url, headers=headers)
        if resp.status == 304 and self._data is not None:
            self.fetched_at = self._now()
            logger.debug("numbering list unchanged (304, %s)", self.etag)
            return False
        if resp.status != 200 or not isinstance(resp.body, dict):
            raise InvalidResponseError(f"numbering list {self.url} unavailable", status=resp.status)
        try:
            data = NumberingListData.model_validate(resp.body)
        except Exception as exc:  # pydantic.ValidationError
            raise InvalidResponseError(f"numbering list {self.url}: {exc}") from exc
        self._data = data
        self.etag = resp.headers.get("etag")
        self.fetched_at = self._now()
        logger.info("numbering list loaded: %d blocks, listVersion %s", len(data.blocks), data.list_version)
        return True

    async def aclose(self) -> None:
        if self._owns_http and self._http is not None:
            await self._http.aclose()


# ---------------------------------------------------------------------------
# Cache (§9.4)
# ---------------------------------------------------------------------------


@dataclass
class CacheEntry:
    number: str
    holder: CpRef
    ported: bool
    expires_at: float  # epoch seconds

    def to_dict(self) -> dict[str, Any]:
        return {"number": self.number, "holder": self.holder.to_wire(), "ported": self.ported,
                "expires": int(self.expires_at * 1000)}


class DiscoveryCache:
    """number → {holder, ported, expires_at}. Number-level only: ports are never applied
    to a whole block (§9.4). Entries are hints; the Range Holder is the authority."""

    def __init__(self, *, default_ttl: int = DEFAULT_TTL, now: Callable[[], float] = time.time) -> None:
        self.default_ttl = default_ttl
        self._now = now
        self._entries: dict[str, CacheEntry] = {}

    def get(self, number: str) -> CacheEntry | None:
        """The unexpired entry for ``number`` (an expired one is purged)."""
        n = e164(number)
        entry = self._entries.get(n)
        if entry is None:
            return None
        if entry.expires_at <= self._now():
            del self._entries[n]
            return None
        return entry

    def peek(self, number: str) -> CacheEntry | None:
        """The stored entry, expired or not."""
        return self._entries.get(e164(number))

    def set(self, number: str, holder: CpRef | Mapping[str, Any], *, ported: bool = False, ttl: int | None = None) -> CacheEntry:
        n = e164(number)
        ref = holder if isinstance(holder, CpRef) else CpRef.model_validate(holder)
        entry = CacheEntry(number=n, holder=ref, ported=bool(ported),
                           expires_at=self._now() + (ttl if ttl else self.default_ttl))
        self._entries[n] = entry
        return entry

    def purge(self, number: str) -> bool:
        return self._entries.pop(e164(number), None) is not None

    def clear(self) -> None:
        self._entries.clear()

    def entries(self) -> list[CacheEntry]:
        return list(self._entries.values())

    def __len__(self) -> int:
        return len(self._entries)

    def __contains__(self, number: object) -> bool:
        return isinstance(number, str) and self.get(number) is not None


# ---------------------------------------------------------------------------
# Public keys (§9.6)
# ---------------------------------------------------------------------------


class KeyStore:
    """Fetches and caches each CP's ``/keys`` document (keyed by CP URL)."""

    def __init__(self, http: HttpTransport, *, now: Callable[[], float] = time.time) -> None:
        self._http = http
        self._now = now
        self._sets: dict[str, KeySet] = {}

    def add(self, cp: CpRef | str, key_set: KeySet | Mapping[str, Any]) -> None:
        """Pin a key set for a CP (by CpRef or URL) without fetching."""
        url = cp.url if isinstance(cp, CpRef) else cp
        self._sets[url.rstrip("/")] = key_set if isinstance(key_set, KeySet) else KeySet.model_validate(key_set)

    def clear(self) -> None:
        self._sets.clear()

    async def get_key(self, cp: CpRef, kid: str | None) -> PublicKeyInfo | None:
        url = cp.url.rstrip("/")
        found = self._select(self._sets.get(url), kid)
        if found is None:
            # unknown CP, or a kid we have not seen (key rotation): (re)fetch once
            try:
                resp = await self._http.get(f"{url}/pstn2/v1/keys")
            except PSTN2Error as exc:
                logger.warning("could not fetch keys for %s: %s", cp.cp_id, exc)
                return None
            if resp.status != 200 or not isinstance(resp.body, dict):
                logger.warning("keys for %s: HTTP %s", cp.cp_id, resp.status)
                return None
            try:
                self._sets[url] = KeySet.model_validate(resp.body)
            except Exception:
                return None
            found = self._select(self._sets[url], kid)
        return found

    def _select(self, ks: KeySet | None, kid: str | None) -> PublicKeyInfo | None:
        if ks is None:
            return None
        now = self._now()
        for k in ks.keys:
            if kid is not None and k.kid != kid:
                continue
            if (k.algorithm or "ed25519").lower() != "ed25519":
                continue
            if k.valid_from and _epoch(k.valid_from) > now:
                continue
            if k.valid_to and _epoch(k.valid_to) <= now:
                continue
            return k
        return None


def _epoch(ts: str) -> float:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc).timestamp()
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# Discovery client (§9.3)
# ---------------------------------------------------------------------------


@dataclass
class TransportResponse:
    status: int
    body: Any = None


#: ``transport(url, number)`` → TransportResponse. ``url`` is the CP base URL.
Transport = Callable[[str, str], Awaitable[TransportResponse]]


@dataclass
class DiscoveryEvent:
    """One step of a discovery, same ``type`` names and data keys as the reference engine:
    ``cache-hit {entry}``, ``cache-miss``, ``list-lookup {block}``, ``query {to, url}``,
    ``response {from, status, body[, error]}``, ``redirect {from, to}``,
    ``cache-purge {reason, from}``, ``cache-store {entry}``, ``result {result}``."""

    type: str
    number: str
    data: dict[str, Any] = field(default_factory=dict)

    def __getitem__(self, key: str) -> Any:
        return self.data[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)


EventHandler = Callable[[DiscoveryEvent], Union[None, Awaitable[None]]]


class DiscoveryClient:
    """A CP's discovery client.

    ``discover(number)`` → :class:`DiscoveryResult`. Never raises for protocol
    outcomes; on any failure ``result`` is ``"error"`` (with ``error`` set) and the caller
    falls back to traditional PSTN.
    """

    def __init__(
        self,
        numbering_list: NumberingList | NumberingListData | Mapping[str, Any],
        *,
        cp_id: str | None = None,
        cache: DiscoveryCache | None = None,
        http: HttpTransport | None = None,
        transport: Transport | None = None,
        hop_limit: int = DEFAULT_HOP_LIMIT,
        default_ttl: int = DEFAULT_TTL,
        verify_signatures: bool = False,
        key_store: KeyStore | None = None,
        on_event: EventHandler | None = None,
        timeout: float = 2.0,
        now: Callable[[], float] = time.time,
    ) -> None:
        self.cp_id = cp_id
        self._owns_http = http is None
        self.http = http or HttpTransport(cp_id=cp_id, timeout=timeout)
        self.numbering_list = numbering_list if isinstance(numbering_list, NumberingList) else NumberingList(numbering_list)
        self.numbering_list.attach_http(self.http)
        self.cache = cache or DiscoveryCache(default_ttl=default_ttl, now=now)
        self.hop_limit = hop_limit
        self.default_ttl = default_ttl
        self.verify_signatures = verify_signatures
        self.key_store = key_store or KeyStore(self.http)
        self.on_event = on_event
        self._transport: Transport = transport or self._http_transport
        self._now = now

    async def _http_transport(self, url: str, number: str) -> TransportResponse:
        resp = await self.http.get(f"{url.rstrip('/')}/pstn2/v1/numbers/{digits_of(number)}")
        return TransportResponse(resp.status, resp.body)

    def purge(self, number: str) -> bool:
        return self.cache.purge(number)

    def cache_entries(self) -> list[CacheEntry]:
        return self.cache.entries()

    async def aclose(self) -> None:
        await self.numbering_list.aclose()
        if self._owns_http:
            await self.http.aclose()

    async def discover(self, number: str, *, on_event: EventHandler | None = None) -> DiscoveryResult:
        n = e164(number)
        hops: list[str] = []
        visited: set[str] = set()
        state = {"invalidated": False, "from_cache": False}
        handlers = [h for h in (self.on_event, on_event) if h is not None]

        async def emit(type_: str, **data: Any) -> None:
            if not handlers:
                return
            ev = DiscoveryEvent(type_, n, data)
            for h in handlers:
                r = h(ev)
                if inspect.isawaitable(r):
                    await r

        async def finish(result: str, **kw: Any) -> DiscoveryResult:
            out = DiscoveryResult(number=n, result=result, hops=list(hops), invalidated=state["invalidated"],
                                  from_cache=state["from_cache"], **kw)
            await emit("result", result=out)
            logger.debug("discover %s → %s %s", n, out.result, out.hops)
            return out

        target: CpRef | None = None
        cached = self.cache.peek(n)
        if cached is not None and cached.expires_at > self._now():
            await emit("cache-hit", entry=cached.to_dict())
            target = cached.holder
            state["from_cache"] = True
        else:
            if cached is not None:
                self.cache.purge(n)
            await emit("cache-miss")

        while True:
            if target is None:
                try:
                    await self.numbering_list.ensure_fresh()
                except PSTN2Error as exc:
                    logger.warning("numbering list unavailable: %s", exc)
                    return await finish("error", error="timeout" if exc.code in ("timeout", "network_error") else "invalid_response")
                block = self.numbering_list.find_block(n)
                await emit("list-lookup", block=block.to_wire() if block else None)
                if block is None:
                    return await finish("unallocated")
                if not block.range_holder_url:
                    return await finish("not_participating",
                                        range_holder=RangeHolderRef(cp_id=block.cp_id, cp_name=block.cp_name))
                target = CpRef(cp_id=block.cp_id, cp_name=block.cp_name, url=block.range_holder_url)
                state["from_cache"] = False

            if len(hops) >= self.hop_limit:
                return await finish("error", error="hop_limit_exceeded")
            if target.cp_id in visited:
                return await finish("error", error="loop_detected")
            visited.add(target.cp_id)
            hops.append(target.cp_id)

            await emit("query", to=target.to_wire(), url=target.discovery_url(n))
            try:
                res = await self._transport(target.url, n)
            except Exception as exc:  # transport failure of any kind → timeout (reference engine)
                await emit("response", **{"from": target.to_wire(), "status": 0, "body": None, "error": str(exc)})
                return await finish("error", error="timeout")
            await emit("response", **{"from": target.to_wire(), "status": res.status, "body": res.body})

            if res.status == 404:
                return await finish("unknown")
            body: dict[str, Any] = res.body if isinstance(res.body, dict) else {}

            if self.verify_signatures:
                problem = await self._check_signed(target, n, body)
                if problem:
                    return await finish("error", error=problem)

            cache_ctl = body.get("cache") if isinstance(body.get("cache"), dict) else {}
            if cache_ctl.get("invalidate"):
                self.cache.purge(n)
                state["invalidated"] = True
                await emit("cache-purge", reason=body.get("result"), **{"from": target.to_wire()})
                if cache_ctl.get("scope") == "block":
                    try:
                        await self.numbering_list.refresh(force=True)
                    except PSTN2Error as exc:
                        logger.warning("block-scope invalidation: list refresh failed: %s", exc)

            result = body.get("result")
            if result == "held":
                try:
                    holder = CpRef.model_validate(body.get("holder"))
                except Exception:
                    return await finish("error", error="invalid_response")
                ttl = cache_ctl.get("ttl") or self.default_ttl
                entry = self.cache.set(n, holder, ported=bool(body.get("ported")), ttl=ttl)
                await emit("cache-store", entry=entry.to_dict())
                return await finish("held", holder=holder, ported=bool(body.get("ported")))
            if result == "redirect":
                try:
                    to = CpRef.model_validate(body.get("portedTo"))
                except Exception:
                    return await finish("error", error="invalid_response")
                await emit("redirect", **{"from": target.to_wire(), "to": to.to_wire()})
                target = to
                continue
            if result == "not_held":
                target = None  # restart from the numbering list: the Range Holder is the authority
                visited.clear()
                continue
            return await finish("error", error="invalid_response")

    async def _check_signed(self, cp: CpRef, number: str, body: dict[str, Any]) -> str | None:
        """None if ``body`` is validly signed by ``cp`` and about ``number``; else an error code."""
        if not body.get("signature"):
            return "invalid_signature"
        key = await self.key_store.get_key(cp, body.get("kid"))
        if key is None or not verify_body(body, key.public_key):
            return "invalid_signature"
        if body.get("number") is not None and body.get("number") != number:
            return "invalid_response"  # a validly signed answer about a different number
        return None


# ---------------------------------------------------------------------------
# Range Holder / holder responder (§9.2, server side)
# ---------------------------------------------------------------------------


class PortedIn(Model):
    number: str
    from_cp_id: Optional[str] = None


class PortedOut(Model):
    number: str
    to_cp_id: str


class NumberDatabase(Model):
    """A CP's own number data — everything it needs to answer discovery queries."""

    cp_id: str
    cp_name: str = ""
    url: str
    ranges: list[str] = Field(default_factory=list)
    in_service: list[str] = Field(default_factory=list)
    ported_in: list[PortedIn] = Field(default_factory=list)
    ported_out: list[PortedOut] = Field(default_factory=list)
    previously_held: list[str] = Field(default_factory=list)

    def ref(self) -> CpRef:
        return CpRef(cp_id=self.cp_id, cp_name=self.cp_name, url=self.url)


@dataclass
class ResponderAnswer:
    status: int
    body: dict[str, Any]


Resolver = Union[Callable[[str], Union[CpRef, Mapping[str, Any], None]], Mapping[str, Union[CpRef, Mapping[str, Any]]]]


class RangeHolderResponder:
    """Builds this CP's answer to ``GET {url}/pstn2/v1/numbers/{digits}`` (§9.2).

    Mirrors ``Network.respond()`` in harness-engine.js:

    * As Range Holder (number in one of ``ranges``): ``redirect`` for a ported-out number,
      ``held`` (``ported: false``) for one in service, otherwise 404 ``unknown``.
    * For a ported-in number: ``held`` with ``ported: true``.
    * For a number it previously held, or any number in another participating CP's block
      of the numbering list: ``not_held`` with ``cache.invalidate``.
    * Otherwise 404 ``unknown``.

    ``resolver`` maps a cpId to that CP's :class:`CpRef` (callable or mapping) and returns
    ``None`` for CPs that do not participate. Pass ``signing_key`` (+ ``kid``) to sign every
    200 answer (§9.6).
    """

    def __init__(
        self,
        database: NumberDatabase | Mapping[str, Any],
        resolver: Resolver,
        *,
        numbering_list: NumberingList | NumberingListData | Mapping[str, Any] | None = None,
        ttl: int = DEFAULT_TTL,
        signing_key: Any = None,
        kid: str | None = None,
    ) -> None:
        self.db = database if isinstance(database, NumberDatabase) else NumberDatabase.model_validate(database)
        self._resolver = resolver
        if numbering_list is None or isinstance(numbering_list, NumberingList):
            self.numbering_list = numbering_list
        else:
            self.numbering_list = NumberingList(numbering_list)
        self.ttl = ttl
        self.signing_key = signing_key
        self.kid = kid
        if signing_key is not None and kid is None:
            raise ValueError("kid is required when signing_key is given")

    def resolve(self, cp_id: str) -> CpRef | None:
        if cp_id == self.db.cp_id:
            return self.db.ref()
        r = self._resolver.get(cp_id) if isinstance(self._resolver, Mapping) else self._resolver(cp_id)
        if r is None:
            return None
        return r if isinstance(r, CpRef) else CpRef.model_validate(r)

    def is_range_holder(self, number: str) -> bool:
        digits = digits_of(number)
        return any(digits.startswith(p) for p in self.db.ranges)

    def _in_participating_block(self, number: str) -> bool:
        if self.numbering_list is None:
            return False
        block = self.numbering_list.find_block(number)
        return block is not None and self.resolve(block.cp_id) is not None

    def respond(self, number: str, issued: str | None = None) -> ResponderAnswer:
        n = e164(number)
        issued = issued or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        base = {"version": PROTOCOL_VERSION, "number": n}
        ttl = self.ttl

        if self.is_range_holder(n):
            out = next((p for p in self.db.ported_out if p.number == n), None)
            if out is not None:
                to = self.resolve(out.to_cp_id)
                if to is None:
                    raise ValueError(f"resolver has no CP {out.to_cp_id} for ported-out {n}")
                return self._ok({**base, "result": "redirect", "portedTo": to.to_wire(), "cache": {"ttl": ttl}, "issued": issued})
            if n in self.db.in_service:
                return self._ok({**base, "result": "held", "holder": self.db.ref().to_wire(), "ported": False,
                                 "cache": {"ttl": ttl}, "issued": issued})
            return ResponderAnswer(404, {"result": "unknown", "number": n})
        if any(p.number == n for p in self.db.ported_in):
            return self._ok({**base, "result": "held", "holder": self.db.ref().to_wire(), "ported": True,
                             "cache": {"ttl": ttl}, "issued": issued})
        if n in self.db.previously_held or self._in_participating_block(n):
            return self._ok({**base, "result": "not_held", "cache": {"invalidate": True, "scope": "number"}, "issued": issued})
        return ResponderAnswer(404, {"result": "unknown", "number": n})

    def holds(self, number: str) -> bool:
        """True if this CP currently serves ``number`` (in service and not ported out, or ported in)."""
        n = e164(number)
        if any(p.number == n for p in self.db.ported_in):
            return True
        return self.is_range_holder(n) and n in self.db.in_service and not any(p.number == n for p in self.db.ported_out)

    def keys_document(self, *, valid_from: str | None = None, valid_to: str | None = None) -> dict[str, Any]:
        """The ``/keys`` document for this CP's signing key (empty if unsigned)."""
        keys = []
        if self.signing_key is not None:
            k = {"kid": self.kid, "algorithm": "ed25519", "publicKey": public_key_of(self.signing_key)}
            if valid_from:
                k["validFrom"] = valid_from
            if valid_to:
                k["validTo"] = valid_to
            keys.append(k)
        return {"cpId": self.db.cp_id, "keys": keys}

    def _ok(self, body: dict[str, Any]) -> ResponderAnswer:
        if self.signing_key is not None:
            body = sign_body(body, self.signing_key, self.kid)
        return ResponderAnswer(200, body)


__all__ = [
    "CacheEntry",
    "DiscoveryCache",
    "DiscoveryClient",
    "DiscoveryEvent",
    "EventHandler",
    "KeyStore",
    "NumberDatabase",
    "NumberingList",
    "PortedIn",
    "PortedOut",
    "RangeHolderResponder",
    "ResponderAnswer",
    "Transport",
    "TransportResponse",
    "find_block",
]
