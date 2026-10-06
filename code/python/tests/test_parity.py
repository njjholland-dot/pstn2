"""Parity with the reference engine (harness-engine.js):

* RangeHolderResponder.respond() == Network.respond() for every CP × number, both fixtures;
* DiscoveryClient over an in-memory network gives the same results, hops and event
  sequence as the reference DiscoveryClient for scenarios A–G;
* failure modes: loop, hop limit, timeout, invalid response, invalid signature.
"""

from __future__ import annotations

from typing import Any

import pytest

from pstn2 import DiscoveryClient, KeyStore, RangeHolderResponder, TransportResponse, generate_key_pair
from pstn2.types import CpRef

from .conftest import FIXTURES, load_fixture, requires_node, run_reference
from .memnet import MemoryNetwork

ISSUED = "2026-10-06T09:00:00Z"


def _numbers(fixture: dict[str, Any]) -> list[str]:
    nums: set[str] = set()
    for cp in fixture["cps"]:
        nums.update(cp.get("inService", []))
        nums.update(p["number"] for p in cp.get("portedIn", []))
        nums.update(p["number"] for p in cp.get("portedOut", []))
        nums.update(cp.get("previouslyHeld", []))
    for b in fixture["numberingList"]["blocks"]:
        p = b["prefix"]
        nums.add("+" + p + "9" * (b["numberLength"] - len(p)))  # in-range, not in service
    nums.update({"+441154960555", "+441174960555", "+15551234567", "+4416149601"})
    return sorted(nums)


@requires_node
@pytest.mark.parametrize("fixture_name", ["harness-network.json", "testcp-network.json"])
def test_responder_matches_reference(fixture_name: str) -> None:
    fixture = load_fixture(fixture_name)
    numbers = _numbers(fixture)
    expected = run_reference("respond", str(FIXTURES / fixture_name), ISSUED, *numbers)
    net = MemoryNetwork(fixture)
    assert len(expected) == len(fixture["cps"]) * len(numbers)
    for exp in expected:
        ans = net.responder(exp["cpId"]).respond(exp["number"], issued=ISSUED)
        assert (ans.status, ans.body) == (exp["status"], exp["body"]), (exp["cpId"], exp["number"])


def _assert_expect(result, expect: dict[str, Any], sid: str) -> None:
    assert result.result == expect["result"], sid
    assert result.hops == expect["hops"], sid
    if "holderCpId" in expect:
        assert result.holder is not None and result.holder.cp_id == expect["holderCpId"], sid
    if "ported" in expect:
        assert result.ported == expect["ported"], sid
    if "fromCache" in expect:
        assert result.from_cache == expect["fromCache"], sid
    assert result.invalidated == expect.get("invalidated", False), sid


async def test_scenarios_in_memory(harness_fixture, scenarios) -> None:
    net = MemoryNetwork(harness_fixture)
    clients: dict[str, DiscoveryClient] = {}
    for s in scenarios:
        if s.get("before", {}).get("port"):
            p = s["before"]["port"]
            net.port(p["number"], p["fromCpId"], p["toCpId"])
        dc = clients.setdefault(s["callerCp"], DiscoveryClient(net.numbering_list, cp_id=s["callerCp"], transport=net.transport))
        _assert_expect(await dc.discover(s["number"]), s["expect"], s["id"])
    for dc in clients.values():
        await dc.aclose()


@requires_node
async def test_scenarios_match_reference_engine(harness_fixture, scenarios) -> None:
    ref = run_reference("scenarios", str(FIXTURES / "harness-network.json"), str(FIXTURES / "scenarios.json"))
    net = MemoryNetwork(harness_fixture)
    clients: dict[str, DiscoveryClient] = {}
    for s, r in zip(scenarios, ref):
        if s.get("before", {}).get("port"):
            p = s["before"]["port"]
            net.port(p["number"], p["fromCpId"], p["toCpId"])
        dc = clients.setdefault(s["callerCp"], DiscoveryClient(net.numbering_list, transport=net.transport))
        events: list[str] = []
        got = await dc.discover(s["number"], on_event=lambda e: events.append(e.type))
        exp = r["result"]
        mine = got.to_wire()
        for key in ("number", "result", "hops", "fromCache", "invalidated", "holder", "error", "rangeHolder"):
            assert mine.get(key) == exp.get(key), (s["id"], key)
        assert got.ported == bool(exp.get("ported")), s["id"]
        assert events == r["events"], s["id"]
    for dc in clients.values():
        await dc.aclose()


LOOP_LIST = {"listVersion": "x", "blocks": [
    {"prefix": "4410", "numberLength": 12, "status": "Allocated", "cpId": "CP-A", "cpName": "A", "rangeHolderUrl": "https://a"},
]}


def _redirect(to: str):
    return {"version": "1.1", "result": "redirect", "portedTo": {"cpId": f"CP-{to.upper()}", "cpName": to, "url": f"https://{to}"}}


async def test_loop_detected() -> None:
    nxt = {"https://a": "b", "https://b": "a"}

    async def t(url: str, number: str) -> TransportResponse:
        return TransportResponse(200, _redirect(nxt[url]))

    r = await DiscoveryClient(LOOP_LIST, transport=t).discover("+441000000001")
    assert (r.result, r.error, r.hops) == ("error", "loop_detected", ["CP-A", "CP-B"])


async def test_hop_limit_exceeded() -> None:
    chain = "abcdefgh"

    async def t(url: str, number: str) -> TransportResponse:
        i = chain.index(url[-1])
        return TransportResponse(200, _redirect(chain[i + 1]))

    r = await DiscoveryClient(LOOP_LIST, transport=t).discover("+441000000001")
    assert (r.result, r.error) == ("error", "hop_limit_exceeded")
    assert r.hops == ["CP-A", "CP-B", "CP-C", "CP-D", "CP-E"]


async def test_timeout_and_invalid_response() -> None:
    async def boom(url: str, number: str) -> TransportResponse:
        raise TimeoutError("slow")

    r = await DiscoveryClient(LOOP_LIST, transport=boom).discover("+441000000001")
    assert (r.result, r.error, r.hops) == ("error", "timeout", ["CP-A"])

    async def junk(url: str, number: str) -> TransportResponse:
        return TransportResponse(500, None)

    r = await DiscoveryClient(LOOP_LIST, transport=junk).discover("+441000000001")
    assert (r.result, r.error) == ("error", "invalid_response")


async def test_signed_in_memory_network(harness_fixture) -> None:
    keys = {cp["cpId"]: generate_key_pair() for cp in harness_fixture["cps"]}
    signing = {cp_id: (kp.private_key, f"{cp_id}-k1") for cp_id, kp in keys.items()}
    net = MemoryNetwork(harness_fixture, signing=signing)

    class _NoHttp:  # KeyStore never fetches: keys are pinned
        async def get(self, url):  # pragma: no cover
            raise AssertionError("unexpected fetch " + url)

    ks = KeyStore(_NoHttp())  # type: ignore[arg-type]
    for cp in harness_fixture["cps"]:
        ks.add(cp["url"], net.responder(cp["cpId"]).keys_document())
    dc = DiscoveryClient(net.numbering_list, transport=net.transport, verify_signatures=True, key_store=ks)
    r = await dc.discover("+441134960456")
    assert r.result == "held" and r.hops == ["CP1-UK-0103", "CP1-UK-0102"] and r.ported

    # A Range Holder signing with the wrong key → invalid_signature
    net.signing["CP1-UK-0103"] = (generate_key_pair().private_key, "CP1-UK-0103-k1")
    dc.cache.clear()
    r = await dc.discover("+441134960456")
    assert (r.result, r.error, r.hops) == ("error", "invalid_signature", ["CP1-UK-0103"])

    # Unsigned answers are rejected when verification is on
    net.signing.clear()
    r = await dc.discover("+441614960123")
    assert (r.result, r.error) == ("error", "invalid_signature")
    await dc.aclose()


def test_responder_signs_and_validates_kid() -> None:
    kp = generate_key_pair()
    db = {"cpId": "CP1-UK-9001", "cpName": "A", "url": "https://a", "ranges": ["4477009000"], "inService": ["+447700900001"]}
    with pytest.raises(ValueError):
        RangeHolderResponder(db, {}, signing_key=kp.private_key)
    rh = RangeHolderResponder(db, {}, signing_key=kp.private_key, kid="a-1")
    ans = rh.respond("+447700900001")
    assert ans.status == 200 and ans.body["kid"] == "a-1" and ans.body["holder"] == CpRef(cp_id="CP1-UK-9001", cp_name="A", url="https://a").to_wire()
    assert rh.keys_document()["keys"][0]["publicKey"] == kp.public_key
    assert rh.respond("+447700900002").status == 404
    assert rh.holds("+447700900001") and not rh.holds("+447700900002")
