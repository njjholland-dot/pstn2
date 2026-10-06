"""Integration tests against the static-host emulator of the live dummy test CP
(tools/testcp/build.mjs → test-environment/mock-network/static-server.mjs), with
signature verification on: the six test numbers, stale-cache invalidation for …004,
and the WAF user-agent check."""

from __future__ import annotations

import httpx
import pytest

from pstn2 import USER_AGENT, KeyStore, PSTN2Client
from pstn2.types import CpRef

from .conftest import requires_node

pytestmark = requires_node

A, B = "CP1-UK-9001", "CP1-UK-9002"
KEY_VALID_AT = 1_791_331_200.0  # 2026-10-07T00:00:00Z — inside the test keys' validFrom/validTo window


def _client(site, **kw) -> PSTN2Client:
    client = PSTN2Client("CP1-UK-TEST-CLIENT", numbering_list_url=site["list_url"], verify_signatures=True, **kw)
    # pin the key-validity clock so this suite does not expire with the fixture's test keys
    client.discovery.key_store = KeyStore(client.http, now=lambda: KEY_VALID_AT)
    return client


@pytest.mark.parametrize(
    "number,result,holder,ported,hops",
    [
        ("+447700900001", "held", A, False, [A]),
        ("+447700900002", "held", A, False, [A]),
        ("+447700900003", "held", B, True, [A, B]),
        ("+447700900004", "held", A, False, [A]),
        ("+447700900101", "held", B, False, [B]),
        ("+447700900099", "unknown", None, False, [A]),
    ],
)
async def test_test_numbers(testcp_site, number, result, holder, ported, hops) -> None:
    async with _client(testcp_site) as client:
        r = await client.discover(number)
        assert r.result == result and r.hops == hops and r.ported == ported and r.error is None
        if holder:
            assert r.holder.cp_id == holder and r.holder.url.startswith(testcp_site["base"])


async def test_stale_cache_invalidation_004(testcp_site) -> None:
    async with _client(testcp_site) as client:
        await client.numbering_list.refresh(force=True)
        b = client.numbering_list.find_block("+447700900101").range_holder()
        assert b.cp_id == B
        client.cache.set("+447700900004", b, ported=True)  # stale: …004 never left Test CP A
        events = []
        r = await client.discover("+447700900004", on_event=lambda e: events.append(e.type))
        assert r.result == "held" and r.holder.cp_id == A and not r.ported
        assert r.hops == [B, A] and r.invalidated and not r.from_cache
        assert "cache-hit" in events and "cache-purge" in events
        assert client.cache.get("+447700900004").holder.cp_id == A


async def test_cache_hit_then_direct(testcp_site) -> None:
    async with _client(testcp_site) as client:
        await client.discover("+447700900003")
        r = await client.discover("+447700900003")
        assert r.from_cache and r.hops == [B] and r.ported


async def test_tampered_key_is_rejected(testcp_site) -> None:
    from pstn2 import generate_key_pair

    async with _client(testcp_site) as client:
        await client.numbering_list.refresh(force=True)
        a = client.numbering_list.find_block("+447700900001").range_holder()
        client.discovery.key_store.add(a, {"cpId": A, "keys": [{"kid": "a-test-2026-10", "algorithm": "ed25519",
                                                                 "publicKey": generate_key_pair().public_key}]})
        # build.mjs names freshly generated keys "<key>-test-2026-10"; pin a wrong key under that kid
        r = await client.discover("+447700900001")
        assert (r.result, r.error, r.hops) == ("error", "invalid_signature", [A])


def test_waf_rejects_generic_user_agents(testcp_site) -> None:
    url = testcp_site["list_url"]
    for ua in ("curl/8.7.1", "Go-http-client/1.1"):
        assert httpx.get(url, headers={"User-Agent": ua}).status_code == 403
    assert httpx.get(url, headers={"User-Agent": USER_AGENT}).status_code == 200


async def test_sdk_user_agent_accepted(testcp_site) -> None:
    async with _client(testcp_site) as client:
        resp = await client.http.get(testcp_site["list_url"])
        assert resp.status == 200 and resp.body["blocks"]
        assert client.http.base_headers()["User-Agent"] == USER_AGENT
        missing = await client.http.get(f"{testcp_site['base']}/a/pstn2/v1/numbers/447700900099")
        assert missing.status == 404 and missing.body is None and "<html" in missing.text.lower()
