"""
Example 4: Complete call flow

Alice (+442079460100, Alpha Telecom) calls Bob on +441134960456. Bob's number is in
Charlie Comms' range but has been ported to Bravo Networks.

  Phase 1  Number Discovery  Alpha: numbering list → Charlie (Range Holder) → redirect → Bravo
  Phase 2  Authentication    Bravo verifies Alice's caller ID with its holder (Alpha)
  Phase 3  Direct routing    Alpha asks Bravo for a direct media route (reusing Phase 1's answer)
  Phase 4  Summary
  …then Alice calls Bob again: discovery is answered from the cache, straight to Bravo.

Any failure falls back to traditional PSTN — PSTN2 never blocks a call.

Run the local mock network first:
    node test-environment/mock-network/server.mjs
then:
    python examples/04_complete_call_flow.py
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
import os
import sys
import time

from pstn2 import DiscoveryEvent, MediaCapabilities, NetworkConfig, PSTN2Client, PSTN2Error, display_number

ALICE = {"number": "+442079460100", "name": "Alice Smith"}
BOB = {"number": "+441134960456", "name": "Bob Johnson"}


def show_event(e: DiscoveryEvent) -> None:
    if e.type == "cache-hit":
        print(f"     cache hit → {e['entry']['holder']['cpName']}")
    elif e.type == "list-lookup":
        b = e["block"]
        print(f"     numbering list: block {b['display']} → Range Holder {b['cpName']}" if b else "     numbering list: no block")
    elif e.type == "query":
        print(f"     GET {e['url']}")
    elif e.type == "response":
        body = e["body"] or {}
        print(f"       ← {e['status']} {body.get('result', '')}")
    elif e.type == "redirect":
        print(f"     redirect: ported to {e['to']['cpName']}")
    elif e.type == "cache-purge":
        print(f"     cache purged ({e['reason']})")


def ms(t0: float) -> int:
    return round((time.perf_counter() - t0) * 1000)


async def place_call(alpha: PSTN2Client, bravo: PSTN2Client, label: str) -> bool:
    print("=" * 64)
    print(f"{label}: {ALICE['name']} {ALICE['number']} → {BOB['name']} {BOB['number']} ({display_number(BOB['number'])})")
    print("=" * 64)
    timings: dict[str, int] = {}
    t_call = time.perf_counter()

    # Phase 1 — Number Discovery
    print("\nPhase 1: Number Discovery (who holds Bob's number?)")
    t0 = time.perf_counter()
    d = await alpha.discover(BOB["number"], on_event=show_event)
    timings["Number Discovery"] = ms(t0)
    if not d.held:
        print(f"  ✗ {d.result} {d.error or ''} → route via traditional PSTN")
        return False
    print(f"  ✓ Holder: {d.holder}  ported={d.ported}  hops={' → '.join(d.hops)}  fromCache={d.from_cache}")

    # Phase 2 — Authentication (at the terminating CP)
    print(f"\nPhase 2: Authentication ({bravo.cp_id} verifies Alice's caller ID)")
    t0 = time.perf_counter()
    call_ref = alpha.generate_call_reference()
    v = await bravo.auth.verify_call(ALICE["number"], BOB["number"], call_ref)
    timings["Authentication"] = ms(t0)
    if v.verified:
        print(f"  ✓ Verified by {v.holder} — {v.caller_name}, trust {v.trust_level}"
              f" (discovery hops {' → '.join(v.discovery.hops) if v.discovery else '-'})")
    else:
        print(f"  ✗ Not verified ({v.reason}) → flag the call; continue on traditional PSTN")
        return False

    # Phase 3 — Direct routing
    print("\nPhase 3: Direct routing")
    t0 = time.perf_counter()
    r = await alpha.routing.request_routing(
        BOB["number"], ALICE["number"],
        MediaCapabilities(codecs=["opus", "g722", "pcmu"], encryption=["srtp-aes256", "srtp-aes128"]),
        call_ref, holder=d, branding={"displayName": ALICE["name"], "callPurpose": "Personal call"},
    )
    timings["Routing request"] = ms(t0)
    if not r.accepted:
        print(f"  ✗ Rejected ({r.reason}) → route via traditional PSTN")
        return False
    cd = r.connection_details
    print(f"  ✓ {r.holder} accepted: {cd.fqdn}:{cd.port}/{cd.protocol}, codec {r.agreed_capabilities.codecs[0]},"
          f" {r.agreed_capabilities.encryption[0]}{'  (rediscovered)' if r.rediscovered else ''}")

    # Phase 4 — Summary
    total = ms(t_call)
    print("\nPhase 4: Summary")
    for k, val in timings.items():
        print(f"  {k:<18} {val:>5} ms")
    print(f"  {'Total':<18} {total:>5} ms")
    print(f"  Bob's screen: \"{ALICE['name']}\" ✓ verified caller — Personal call")
    print("  Media: direct, DTLS-SRTP encrypted, no transit")
    return True


async def main() -> int:
    logging.basicConfig(level=os.environ.get("PSTN2_LOG_LEVEL", "WARNING"))
    alpha_cfg = NetworkConfig.from_env(default_cp_id="CP1-UK-0101")
    bravo_cfg = dataclasses.replace(alpha_cfg, cp_id=os.environ.get("PSTN2_TERMINATING_CP_ID", "CP1-UK-0102"))
    print("PSTN2 Example 4: Complete Call Flow")
    print(f"  Network: {alpha_cfg.network}  ({alpha_cfg.numbering_list_url})\n")
    ok = True
    async with PSTN2Client.from_config(alpha_cfg) as alpha, PSTN2Client.from_config(bravo_cfg) as bravo:
        try:
            ok = await place_call(alpha, bravo, "Call 1")
            print()
            ok = await place_call(alpha, bravo, "Call 2 (same number again)") and ok
            entry = alpha.cache.get(BOB["number"])
            if entry:
                print(f"\nAlpha's cache: {BOB['number']} → {entry.holder.cp_name} (ported={entry.ported})")
        except PSTN2Error as error:
            ok = False
            print(f"\n✗ Call setup error: {error}\n→ Fallback: route via traditional PSTN (the call still connects)")
    print("\nDone.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
