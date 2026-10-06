"""Unit tests: NumberingList (longest prefix, length check, ETag/304, refresh) and
DiscoveryCache (TTL, purge, clear)."""

from __future__ import annotations

import json

import httpx
import pytest

from pstn2 import CpRef, DiscoveryCache, DiscoveryClient, HttpTransport, NumberingList, TransportResponse

LIST = {
    "listVersion": "v1",
    "blocks": [
        {"prefix": "4416", "numberLength": 12, "status": "Allocated", "cpId": "CP1-UK-0001", "cpName": "Wide", "rangeHolderUrl": "https://wide.example"},
        {"prefix": "441614960", "numberLength": 12, "status": "Allocated", "cpId": "CP1-UK-0002", "cpName": "Narrow", "rangeHolderUrl": "https://narrow.example"},
        {"prefix": "4416149601", "numberLength": 12, "status": "Allocated", "cpId": "CP1-UK-0003", "cpName": "Narrowest", "rangeHolderUrl": ""},
        {"prefix": "441614960", "numberLength": 11, "status": "Allocated", "cpId": "CP1-UK-0004", "cpName": "Short", "rangeHolderUrl": "https://short.example"},
    ],
}


class Clock:
    def __init__(self, t: float = 1_000_000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


def test_longest_prefix_wins() -> None:
    nl = NumberingList(LIST)
    assert nl.find_block("+441614960123").cp_id == "CP1-UK-0003"  # 4416149601 is longest
    assert nl.find_block("+441614960023").cp_id == "CP1-UK-0002"
    assert nl.find_block("+441619999999").cp_id == "CP1-UK-0001"
    assert nl.find_block("441614960023").cp_id == "CP1-UK-0002"  # '+' optional


def test_number_length_must_match() -> None:
    nl = NumberingList(LIST)
    assert nl.find_block("+44161496012").cp_id == "CP1-UK-0004"  # 11 digits: only the 11-digit block
    assert nl.find_block("+4416149601234") is None  # 13 digits: nothing
    assert nl.find_block("+442079460100") is None  # no prefix


def _list_server(etag: str = '"v1"'):
    calls: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        if req.headers.get("if-none-match") == etag:
            return httpx.Response(304)
        # octet-stream on purpose: JSON must be accepted regardless of content type
        return httpx.Response(200, content=json.dumps(LIST).encode(), headers={"ETag": etag, "Content-Type": "application/octet-stream"})

    return calls, httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_etag_304_keeps_local_copy() -> None:
    calls, client = _list_server()
    clock = Clock()
    http = HttpTransport(client=client)
    nl = await NumberingList.load("https://reg.example/numbering-list.json", http=http, refresh_seconds=100, now=clock)
    assert nl.list_version == "v1" and nl.etag == '"v1"' and len(nl.blocks) == 4
    assert "if-none-match" not in calls[0].headers
    assert calls[0].headers["user-agent"].startswith("pstn2-python-sdk/1.1.0")
    assert calls[0].headers["x-pstn2-version"] == "1.1"
    assert "content-type" not in calls[0].headers and calls[0].content == b""  # GET: no body, no Content-Type

    await nl.ensure_fresh()  # not stale: no request
    assert len(calls) == 1
    clock.t += 101
    assert nl.is_stale()
    await nl.ensure_fresh()
    assert len(calls) == 2 and calls[1].headers["if-none-match"] == '"v1"'
    assert nl.list_version == "v1" and not nl.is_stale()  # 304 refreshed the timestamp
    changed = await nl.refresh(force=True)
    assert changed is False and len(calls) == 3
    await client.aclose()


async def test_refresh_failure_keeps_old_copy() -> None:
    state = {"fail": False}

    def handler(req: httpx.Request) -> httpx.Response:
        if state["fail"]:
            return httpx.Response(500)
        return httpx.Response(200, json=LIST, headers={"ETag": '"x"'})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    clock = Clock()
    nl = await NumberingList.load("https://reg.example/l.json", http=HttpTransport(client=client), refresh_seconds=10, now=clock)
    state["fail"] = True
    clock.t += 11
    await nl.ensure_fresh()  # logs a warning, does not raise
    assert nl.find_block("+441614960023").cp_id == "CP1-UK-0002"
    await client.aclose()


def test_cache_ttl_and_purge() -> None:
    clock = Clock()
    cache = DiscoveryCache(now=clock)
    ref = CpRef(cp_id="CP1-UK-0002", cp_name="B", url="https://b.example")
    cache.set("441614960123", ref, ported=True, ttl=10)
    e = cache.get("+441614960123")
    assert e is not None and e.holder == ref and e.ported and e.number == "+441614960123"
    assert "+441614960123" in cache and len(cache) == 1
    clock.t += 9.9
    assert cache.get("+441614960123") is not None
    clock.t += 0.2
    assert cache.get("+441614960123") is None  # expired → purged
    assert len(cache) == 0
    cache.set("+441614960123", ref)
    assert cache.peek("+441614960123").expires_at == clock.t + 86400  # default TTL
    assert cache.purge("+441614960123") is True and cache.purge("+441614960123") is False
    cache.set("+1", ref)
    cache.set("+2", {"cpId": "X", "url": "https://x"})
    assert len(cache.entries()) == 2
    cache.clear()
    assert cache.entries() == []


async def test_discovery_uses_response_ttl() -> None:
    clock = Clock()
    holder = {"cpId": "CP1-UK-0002", "cpName": "Narrow", "url": "https://narrow.example"}
    queries: list[str] = []

    async def transport(url: str, number: str) -> TransportResponse:
        queries.append(url)
        return TransportResponse(200, {"version": "1.1", "result": "held", "number": number, "holder": holder,
                                       "ported": False, "cache": {"ttl": 60}})

    dc = DiscoveryClient(LIST, transport=transport, now=clock)
    r1 = await dc.discover("+441614960023")
    assert r1.result == "held" and not r1.from_cache
    assert dc.cache.peek("+441614960023").expires_at == clock.t + 60
    clock.t += 30
    r2 = await dc.discover("+441614960023")
    assert r2.from_cache and r2.hops == ["CP1-UK-0002"]
    assert dc.cache.peek("+441614960023").expires_at == clock.t + 60  # the hit's answer re-stored it
    clock.t += 61
    events: list[str] = []
    r3 = await dc.discover("+441614960023", on_event=lambda e: events.append(e.type))
    assert not r3.from_cache and events[0] == "cache-miss"
    assert len(queries) == 3
    await dc.aclose()


def test_cache_never_block_level() -> None:
    cache = DiscoveryCache()
    cache.set("+441614960123", CpRef(cp_id="A", url="https://a"))
    assert cache.get("+441614960124") is None
