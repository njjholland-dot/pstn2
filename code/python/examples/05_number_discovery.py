"""
Example 5: Number Discovery — "who has this number?"

Walks through Number Discovery (SPECIFICATION.md §9) hop by hop:

    cache → numbering list (longest prefix) → Range Holder → redirect → holder → cache

Two modes, chosen from the numbering list you point it at:

* Local mock network (default): scenarios A–G from test-environment/fixtures/scenarios.json —
  unported, ported (redirect), cache hit, port-back with stale-cache invalidation
  (via the mock's POST /admin/port), not in service, Range Holder not participating,
  unallocated.
      node test-environment/mock-network/server.mjs
      python examples/05_number_discovery.py

* The dummy test CP (live at https://pstn2.org/testcp, or its local static emulator):
  test numbers 447700900001/002/003/004/101/099, with Ed25519 signatures verified.
  …004 is run with a stale cache entry pre-seeded (Test CP B) to show invalidation.
      PSTN2_NETWORK=live python examples/05_number_discovery.py
      PSTN2_NUMBERING_LIST_URL=http://127.0.0.1:47902/testcp/numbering-list.json \\
          python examples/05_number_discovery.py

Exit status is 0 only if every lookup matched its expected outcome.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Any, Optional

from pstn2 import (
    DiscoveryEvent,
    DiscoveryResult,
    HttpTransport,
    NetworkConfig,
    PSTN2Client,
    PSTN2Error,
    display_number,
)
from pstn2.config import parse_flag

# Scenarios A–G (test-environment/fixtures/scenarios.json), run in order with one client.
LOCAL_SCENARIOS: list[dict[str, Any]] = [
    {"id": "A", "title": "Unported number", "number": "+441614960123",
     "expect": {"result": "held", "holder": "CP1-UK-0102", "ported": False, "fromCache": False, "hops": ["CP1-UK-0102"]}},
    {"id": "B", "title": "Ported number (Range Holder redirects)", "number": "+441134960456",
     "expect": {"result": "held", "holder": "CP1-UK-0102", "ported": True, "fromCache": False,
                "hops": ["CP1-UK-0103", "CP1-UK-0102"]}},
    {"id": "C", "title": "Repeat call goes direct from cache", "number": "+441134960456",
     "expect": {"result": "held", "holder": "CP1-UK-0102", "ported": True, "fromCache": True, "hops": ["CP1-UK-0102"]}},
    {"id": "D", "title": "Number ports back: stale cache is invalidated", "number": "+441134960456",
     "port": {"number": "+441134960456", "fromCpId": "CP1-UK-0102", "toCpId": "CP1-UK-0103"},
     "expect": {"result": "held", "holder": "CP1-UK-0103", "ported": False, "fromCache": False, "invalidated": True,
                "hops": ["CP1-UK-0102", "CP1-UK-0103"]}},
    {"id": "E", "title": "Number not in service", "number": "+441614960999",
     "expect": {"result": "unknown", "hops": ["CP1-UK-0102"]}},
    {"id": "F", "title": "Range Holder not participating", "number": "+441174960555",
     "expect": {"result": "not_participating", "hops": []}},
    {"id": "G", "title": "Number not allocated by Ofcom", "number": "+441154960555",
     "expect": {"result": "unallocated", "hops": []}},
]

A, B = "CP1-UK-9001", "CP1-UK-9002"
TESTCP_NUMBERS: list[dict[str, Any]] = [
    {"id": "001", "title": "Held by Test CP A (unported)", "number": "+447700900001",
     "expect": {"result": "held", "holder": A, "ported": False, "hops": [A]}},
    {"id": "002", "title": "Held by Test CP A (unported)", "number": "+447700900002",
     "expect": {"result": "held", "holder": A, "ported": False, "hops": [A]}},
    {"id": "003", "title": "Ported: Test CP A redirects to Test CP B", "number": "+447700900003",
     "expect": {"result": "held", "holder": B, "ported": True, "hops": [A, B]}},
    {"id": "004", "title": "Stale cache (pre-seeded: Test CP B) is invalidated", "number": "+447700900004",
     "seed": "+447700900101",  # seed the cache with the holder of this number's block (Test CP B)
     "expect": {"result": "held", "holder": A, "ported": False, "invalidated": True, "fromCache": False, "hops": [B, A]}},
    {"id": "101", "title": "Held by Test CP B (unported)", "number": "+447700900101",
     "expect": {"result": "held", "holder": B, "ported": False, "hops": [B]}},
    {"id": "099", "title": "Not in service: Test CP A answers 404", "number": "+447700900099",
     "expect": {"result": "unknown", "hops": [A]}},
]


class HopPrinter:
    def __init__(self, verify: bool) -> None:
        self.verify = verify

    def __call__(self, e: DiscoveryEvent) -> None:
        if e.type == "cache-hit":
            print(f"    cache:     hit → {e['entry']['holder']['cpName']}")
        elif e.type == "cache-miss":
            print("    cache:     miss")
        elif e.type == "list-lookup":
            b = e["block"]
            if b is None:
                print("    list:      no block matches → not allocated")
            else:
                rh = b.get("rangeHolderUrl") or "(no PSTN2 URL)"
                print(f"    list:      block {b.get('display') or b['prefix']} → Range Holder {b['cpName']}  {rh}")
        elif e.type == "query":
            print(f"    query:     GET {e['url']}")
        elif e.type == "response":
            body = e["body"] if isinstance(e["body"], dict) else None
            if e.get("error"):
                print(f"    response:  no answer ({e['error']})")
            elif body is None:
                print(f"    response:  {e['status']} (no JSON body)")
            else:
                sig = f"  signed kid={body['kid']}" if body.get("kid") and self.verify else ""
                print(f"    response:  {e['status']} {body.get('result', '')}{sig}")
        elif e.type == "redirect":
            print(f"    redirect:  ported to {e['to']['cpName']} ({e['to']['cpId']})")
        elif e.type == "cache-purge":
            print(f"    cache:     purged (answer was {e['reason']})")
        elif e.type == "cache-store":
            print(f"    cache:     stored → {e['entry']['holder']['cpName']}")


def check(r: DiscoveryResult, expect: dict[str, Any]) -> list[str]:
    problems = []
    if r.result != expect["result"]:
        problems.append(f"result {r.result} != {expect['result']}")
    if r.hops != expect["hops"]:
        problems.append(f"hops {r.hops} != {expect['hops']}")
    if "holder" in expect and (r.holder is None or r.holder.cp_id != expect["holder"]):
        problems.append(f"holder {r.holder.cp_id if r.holder else None} != {expect['holder']}")
    for key, attr in (("ported", "ported"), ("fromCache", "from_cache"), ("invalidated", "invalidated")):
        if key in expect and getattr(r, attr) != expect[key]:
            problems.append(f"{key} {getattr(r, attr)} != {expect[key]}")
    return problems


def summarise(r: DiscoveryResult) -> str:
    if r.result == "held":
        s = f"HELD by {r.holder.cp_name} ({r.holder.cp_id})" + ("  [ported]" if r.ported else "")
    elif r.result == "not_participating":
        s = f"NOT PARTICIPATING (Range Holder {r.range_holder.cp_name if r.range_holder else '?'}) → traditional PSTN"
    elif r.result == "error":
        s = f"ERROR {r.error} → traditional PSTN"
    else:
        s = f"{r.result.upper()} → traditional PSTN"
    flags = [f for f, on in (("fromCache", r.from_cache), ("invalidated", r.invalidated)) if on]
    return s + f"   hops: {' → '.join(r.hops) or '(none)'}" + (f"   ({', '.join(flags)})" if flags else "")


async def admin(http: HttpTransport, base: Optional[str], path: str, body: Optional[dict] = None) -> None:
    if base is None:
        raise RuntimeError("mock /admin endpoints need PSTN2_NUMBERING_LIST_URL ending in /numbering-list.json")
    resp = await http.post(f"{base}/admin/{path}", body or {})
    if resp.status != 200:
        raise RuntimeError(f"POST /admin/{path}: HTTP {resp.status} {resp.text[:200]}")


async def main() -> int:
    logging.basicConfig(level=os.environ.get("PSTN2_LOG_LEVEL", "WARNING"))
    config = NetworkConfig.from_env()

    # Which network is this? Peek at the numbering list.
    probe = PSTN2Client.from_config(config)
    try:
        await probe.numbering_list.refresh(force=True)
    except PSTN2Error as error:
        print(f"Cannot load the numbering list {config.numbering_list_url}: {error}")
        if config.is_live:
            print("The live dummy test CP may not be deployed yet; try the local emulator (see the docstring).")
        else:
            print("Start the mock network (node test-environment/mock-network/server.mjs) or set PSTN2_NETWORK=live.")
        await probe.close()
        return 1
    testcp = any(b.prefix.startswith("44770090") for b in probe.numbering_list.blocks)
    await probe.close()

    # Signatures: the dummy test CP signs its answers, so verify them there unless told not to.
    verify = parse_flag(os.environ.get("PSTN2_VERIFY_SIGNATURES"), True if testcp else config.verify_signatures)
    steps = TESTCP_NUMBERS if testcp else LOCAL_SCENARIOS
    print("PSTN2 Example 5: Number Discovery — who has this number?")
    print(f"  Network:        {'dummy test CP' if testcp else 'local mock network'}  ({config.network})")
    print(f"  Numbering list: {config.numbering_list_url}")
    print(f"  Acting CP:      {config.cp_id}")
    print(f"  Verify sigs:    {verify}")

    failures = 0
    async with PSTN2Client.from_config(config, verify_signatures=verify) as client:
        await client.numbering_list.refresh(force=True)
        print(f"  listVersion:    {client.numbering_list.list_version}  ({len(client.numbering_list.blocks)} blocks)")
        if not testcp:
            await admin(client.http, config.mock_base_url, "reset")
        printer = HopPrinter(verify)
        try:
            for step in steps:
                n = step["number"]
                print(f"\n[{step['id']}] {step['title']}: {n} ({display_number(n)})")
                if "port" in step:
                    p = step["port"]
                    await admin(client.http, config.mock_base_url, "port", p)
                    print(f"    (number ported {p['fromCpId']} → {p['toCpId']} — only their own databases change)")
                if "seed" in step:
                    stale = client.numbering_list.find_block(step["seed"]).range_holder()
                    client.cache.set(n, stale, ported=True)
                    print(f"    (cache pre-seeded with a stale entry: {n} → {stale.cp_name})")
                r = await client.discover(n, on_event=printer)
                print(f"    result:    {summarise(r)}")
                problems = check(r, step["expect"])
                if problems:
                    failures += 1
                    print(f"    ✗ UNEXPECTED: {'; '.join(problems)}")
                else:
                    print("    ✓ as expected" + ("  (all answers' signatures verified)" if verify and r.result == "held" else ""))
        finally:
            if not testcp:
                await admin(client.http, config.mock_base_url, "reset")  # leave the mock as we found it

        print("\nCache now holds:")
        for e in client.cache.entries():
            print(f"    {e.number} → {e.holder.cp_name} ({e.holder.cp_id}){'  [ported]' if e.ported else ''}")

    print(f"\n{len(steps) - failures}/{len(steps)} lookups as expected.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
