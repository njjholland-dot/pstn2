"""Integration tests against the local mock network (test-environment/mock-network/server.mjs)
on a free port: scenarios A–G over real HTTP, then auth / token pool / routing /
emergency including the not_held → purge → rediscover → retry-once path."""

from __future__ import annotations

import httpx
import pytest

from pstn2 import DiscoveryError, PSTN2Client, USER_AGENT
from pstn2.types import CpRef

from .conftest import requires_node

pytestmark = requires_node

ALPHA, BRAVO, CHARLIE = "CP1-UK-0101", "CP1-UK-0102", "CP1-UK-0103"
PORTED = "+441134960456"  # Charlie's range, ported to Bravo


def _client(base: str, cp_id: str = ALPHA, **kw) -> PSTN2Client:
    return PSTN2Client(cp_id, numbering_list_url=f"{base}/numbering-list.json", **kw)


def _admin(base: str, path: str, body: dict | None = None):
    r = httpx.request("POST" if body is not None else "GET", f"{base}/admin/{path}", json=body,
                      headers={"User-Agent": "pstn2-python-sdk-tests"})
    r.raise_for_status()
    return r.json()


async def test_scenarios_a_to_g_over_http(mock, scenarios) -> None:
    async with _client(mock) as client:
        for s in scenarios:
            if s.get("before", {}).get("port"):
                _admin(mock, "port", s["before"]["port"])
            assert s["callerCp"] == ALPHA
            r = await client.discover(s["number"])
            e = s["expect"]
            sid = s["id"]
            assert r.result == e["result"], sid
            assert r.hops == e["hops"], sid
            if "holderCpId" in e:
                assert r.holder.cp_id == e["holderCpId"], sid
                assert r.holder.url.startswith(mock + "/cp/"), sid
            if "ported" in e:
                assert r.ported == e["ported"], sid
            if "fromCache" in e:
                assert r.from_cache == e["fromCache"], sid
            assert r.invalidated == e.get("invalidated", False), sid
    log = _admin(mock, "log")
    assert log and all(entry["userAgent"] == USER_AGENT for entry in log if "result" in entry)


async def test_numbering_list_etag(mock) -> None:
    async with _client(mock) as client:
        nl = client.numbering_list
        assert await nl.refresh(force=True) is True
        etag = nl.etag
        assert etag
        assert await nl.refresh(force=True) is False  # 304
        assert nl.etag == etag


async def test_event_stream(mock) -> None:
    events = []
    async with _client(mock, on_event=lambda e: events.append(e)) as client:
        await client.discover(PORTED)
    types = [e.type for e in events]
    assert types == ["cache-miss", "list-lookup", "query", "response", "redirect", "query", "response", "cache-store", "result"]
    assert events[2]["url"].endswith("/cp/charlie/pstn2/v1/numbers/441134960456")
    assert events[4]["to"]["cpId"] == BRAVO


async def test_direct_query_verification(mock) -> None:
    async with _client(mock, CHARLIE) as charlie:
        v = await charlie.verify_call("+442079460100", "+441134960789")
        assert v.verified and v.holder.cp_id == ALPHA and v.trust_level == "verified"
        assert v.discovery.hops == [ALPHA] and not v.rediscovered

        v = await charlie.verify_call(PORTED, "+441134960789")  # own range, ported to Bravo
        assert v.verified and v.holder.cp_id == BRAVO and v.discovery.hops == [CHARLIE, BRAVO]

        v = await charlie.verify_call("+441614960999", "+441134960789")  # not in service: spoofed
        assert not v.verified and v.fallback_to_pstn and v.reason == "discovery_unknown"
        assert v.discovery.result == "unknown"

        v = await charlie.verify_call("+441174960555", "+441134960789")
        assert not v.verified and v.reason == "discovery_not_participating"


async def test_verification_not_held_rediscovers_and_retries(mock) -> None:
    async with _client(mock, CHARLIE) as charlie:
        d = await charlie.discover(PORTED)
        assert d.holder.cp_id == BRAVO
        _admin(mock, "port", {"number": PORTED, "fromCpId": BRAVO, "toCpId": CHARLIE})
        # Use the stale holder: Bravo answers 200 not_held + invalidate → purge, rediscover, retry at Charlie
        v = await charlie.verify_call(PORTED, "+441134960789", holder=d)
        assert v.verified and v.rediscovered
        assert v.holder.cp_id == CHARLIE and v.discovery.hops == [CHARLIE] and not v.discovery.ported
        assert charlie.cache.get(PORTED).holder.cp_id == CHARLIE
    ops = [(e["cpId"], e.get("op")) for e in _admin(mock, "log") if e.get("op") == "auth/verify"]
    assert ops == [(BRAVO, "auth/verify"), (CHARLIE, "auth/verify")]


async def test_stale_cache_is_caught_by_discovery_itself(mock) -> None:
    async with _client(mock) as alpha:
        await alpha.discover(PORTED)
        _admin(mock, "port", {"number": PORTED, "fromCpId": BRAVO, "toCpId": CHARLIE})
        r = await alpha.request_routing(PORTED, "+442079460100")
        assert r.accepted and r.holder.cp_id == CHARLIE
        assert r.discovery.hops == [BRAVO, CHARLIE] and r.discovery.invalidated and not r.rediscovered


async def test_token_pool(mock) -> None:
    async with _client(mock) as alpha, _client(mock, BRAVO) as bravo:
        tok = await alpha.create_token("+442079460100", "+441614960123", ttl=30)
        assert tok.token_id.startswith("TK-") and len(tok.token_id) == 19 and tok.holder.cp_id == ALPHA
        got = await bravo.verify_token(tok.token_id, "+442079460100")
        assert got is not None and got.verified and got.originating_cp == ALPHA and got.caller_id == "+442079460100"
        assert await bravo.verify_token("TK-AAAAAAAAAAAAAAAA", "+442079460100") is None
        assert await bravo.verify_token("not-a-token", "+442079460100") is None
        # verify_call with a token, and with a bad token falling back to direct query
        v = await bravo.verify_call("+442079460100", "+441614960123", token_id=tok.token_id)
        assert v.verified and v.trust_level == "high"
        v = await bravo.verify_call("+442079460100", "+441614960123", token_id="TK-AAAAAAAAAAAAAAAA")
        assert v.verified and v.trust_level == "verified"  # direct query answered


async def test_token_pool_not_held_retry(mock) -> None:
    async with _client(mock, BRAVO) as bravo:
        stale = CpRef(cp_id=CHARLIE, cp_name="Charlie Comms", url=f"{mock}/cp/charlie")
        tok = await bravo.create_token(PORTED, "+442079460100", holder=stale)  # Charlie no longer holds it
        assert tok.rediscovered and tok.holder.cp_id == BRAVO


async def test_routing(mock) -> None:
    async with _client(mock) as alpha:
        r = await alpha.request_routing("+441614960123", "+442079460100",
                                        {"codecs": ["opus", "g722", "pcmu"], "encryption": ["srtp-aes256", "srtp-aes128"]})
        assert r.accepted and r.holder.cp_id == BRAVO
        assert r.connection_details.fqdn == "media.bravo.example" and r.connection_details.port == 5061
        assert r.agreed_capabilities.codecs == ["opus"] and r.agreed_capabilities.encryption == ["srtp-aes256"]

        r = await alpha.request_routing("+441614960123", "+442079460100", {"codecs": ["g729"], "encryption": ["srtp-aes256"]})
        assert not r.accepted and r.reason == "unsupported_codec" and r.fallback_to_pstn

        r = await alpha.request_routing("+441174960555", "+442079460100")
        assert not r.accepted and r.reason == "discovery_not_participating" and r.fallback_to_pstn

        stale = CpRef(cp_id=CHARLIE, cp_name="Charlie Comms", url=f"{mock}/cp/charlie")
        r = await alpha.request_routing(PORTED, "+442079460100", holder=stale)
        assert r.accepted and r.rediscovered and r.holder.cp_id == BRAVO


async def test_emergency(mock) -> None:
    async with _client(mock) as client:
        loc = await client.get_emergency_location("+441614960123", "UK-999-MANCHESTER-01")
        assert loc.holder.cp_id == BRAVO and loc.location.latitude == pytest.approx(53.4808)
        assert loc.address.postcode == "M1 1AA"
        with pytest.raises(DiscoveryError) as ei:
            await client.get_emergency_location("+441614960999", "UK-999-MANCHESTER-01")
        assert ei.value.discovery.result == "unknown"
        stale = CpRef(cp_id=ALPHA, cp_name="Alpha Telecom", url=f"{mock}/cp/alpha")
        loc = await client.get_emergency_location(PORTED, "UK-999-LEEDS-01", holder=stale)
        assert loc.rediscovered and loc.holder.cp_id == BRAVO


async def test_requests_carry_headers_and_signature(mock) -> None:
    async with _client(mock, CHARLIE) as charlie:
        await charlie.verify_call("+442079460100", "+441134960789")
    entry = [e for e in _admin(mock, "log") if e.get("op") == "auth/verify"][-1]
    assert entry["userAgent"] == USER_AGENT
    body = entry["body"]
    assert body["requestingCP"] == CHARLIE and body["callerID"] == "+442079460100" and body["version"] == "1.1"
    assert body["signature"] and body["messageId"]


async def test_unsigned_mock_fails_when_verifying(mock) -> None:
    async with _client(mock, verify_signatures=True) as client:
        r = await client.discover("+441614960123")
        assert (r.result, r.error) == ("error", "invalid_signature")


async def test_unreachable_numbering_list() -> None:
    from .conftest import free_port

    async with PSTN2Client(ALPHA, numbering_list_url=f"http://127.0.0.1:{free_port()}/numbering-list.json", retries=0) as c:
        r = await c.discover("+441614960123")
        assert (r.result, r.error) == ("error", "timeout")
