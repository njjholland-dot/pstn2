"""
Example 1: Basic Authentication (Direct Query)

Charlie Comms (CP1-UK-0103) is the terminating CP. Calls arrive claiming four caller
IDs; for each one Charlie finds the CP that currently holds the caller ID with Number
Discovery, then asks that CP "did you place this call?" (POST /pstn2/v1/auth/verify).

  1. +442079460100  Alpha Telecom, unported        → verified
  2. +441614960123  Bravo Networks                 → verified
  3. +441614960999  not in service (spoofed)       → discovery "unknown" → flag, PSTN fallback
  4. +441134960456  Charlie's own range, ported to Bravo → Range Holder redirect → Bravo verifies

Run the local mock network first:
    node test-environment/mock-network/server.mjs
then:
    python examples/01_basic_authentication.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from pstn2 import NetworkConfig, PSTN2Client, PSTN2Error, display_number

CALLED_ID = "+441134960789"  # a Charlie Comms customer receiving the calls

INBOUND_CALLS = [
    ("+442079460100", "Alpha Telecom customer (unported)"),
    ("+441614960123", "Bravo Networks customer"),
    ("+441614960999", "Spoofed caller ID (number not in service)"),
    ("+441134960456", "Charlie range, ported to Bravo"),
]


async def main() -> int:
    logging.basicConfig(level=os.environ.get("PSTN2_LOG_LEVEL", "WARNING"))
    config = NetworkConfig.from_env(default_cp_id="CP1-UK-0103")
    print("PSTN2 Example 1: Basic Authentication (Direct Query)")
    print(f"  Network:        {config.network}  ({config.numbering_list_url})")
    print(f"  Acting CP:      {config.cp_id} (terminating CP)")
    print(f"  Verify sigs:    {config.verify_signatures}")
    print("---")

    failures = 0
    async with PSTN2Client.from_config(config) as client:
        for caller_id, label in INBOUND_CALLS:
            print(f"\nInbound call from {caller_id} ({display_number(caller_id)}) — {label}")
            try:
                v = await client.auth.verify_call(caller_id, CALLED_ID)
            except PSTN2Error as error:
                failures += 1
                print(f"  ! Verification error: {error}")
                print("  → Falling back to traditional PSTN handling (call still connects)")
                continue

            if v.discovery is not None:
                hops = " → ".join(v.discovery.hops) or "(none)"
                print(f"  Discovery: {v.discovery.result}  hops: {hops}"
                      f"{'  (ported)' if v.discovery.ported else ''}")
            if v.verified:
                print(f"  ✓ Verified by {v.holder}")
                print(f"    Caller name:  {v.caller_name or 'Unknown'}")
                print(f"    Organisation: {v.caller_org or 'N/A'}")
                print(f"    Trust level:  {v.trust_level}")
            else:
                print(f"  ✗ NOT verified ({v.reason})")
                print("    Possible caller ID spoofing: flag the call to the user / apply policy")
                print("    → Falling back to traditional PSTN handling")

    print("\nDone.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
