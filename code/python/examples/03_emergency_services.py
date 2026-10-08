"""
Example 3: Emergency Services location

A 999 call arrives at the PSAP from +441614960123. The PSAP (here acting through
the SDK) discovers the caller ID's holder — Bravo Networks — and asks it for the
caller's live location (POST /pstn2/v1/emergency/location).

A second 999 call from a number not in service (+441614960999) cannot be located
via PSTN2: discovery returns "unknown", the SDK raises DiscoveryError, and the PSAP
uses its other location sources (cell, billing address).

Run the local mock network first:
    node test-environment/mock-network/server.mjs
then:
    python examples/03_emergency_services.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time

from pstn2 import DiscoveryError, NetworkConfig, PSTN2Client, PSTN2Error, display_number

PSAP_ID = os.environ.get("PSTN2_PSAP_ID", "UK-999-MANCHESTER-01")


async def locate(client: PSTN2Client, caller_id: str) -> bool:
    print(f"\n999 call from {caller_id} ({display_number(caller_id)})")
    start = time.perf_counter()
    try:
        loc = await client.emergency.get_location(caller_id, PSAP_ID)
    except DiscoveryError as error:
        print(f"  ✗ No PSTN2 holder for the caller ID (discovery: {error.discovery.result},"
              f" hops {error.discovery.hops})")
        print("  → Use network cell location / billing address (traditional emergency handling)")
        return False
    except PSTN2Error as error:
        print(f"  ✗ Location query failed: {error}")
        print("  → Use network cell location / billing address (traditional emergency handling)")
        return False
    ms = (time.perf_counter() - start) * 1000
    p, a = loc.location, loc.address
    print(f"  ✓ Location from {loc.holder} in {ms:.0f} ms")
    print(f"    Position: {p.latitude:.4f}, {p.longitude:.4f}  ±{p.accuracy:g} m  (source: {p.source})")
    if a:
        print(f"    Address:  {a.street}, {a.city} {a.postcode}, {a.country}")
    print("    → Dispatch to the caller's position")
    return True


async def main() -> int:
    logging.basicConfig(level=os.environ.get("PSTN2_LOG_LEVEL", "WARNING"))
    config = NetworkConfig.from_env()
    print("PSTN2 Example 3: Emergency Services")
    print(f"  Network:   {config.network}  ({config.numbering_list_url})")
    print(f"  PSAP:      {PSAP_ID}  (requests sent as {config.cp_id})")
    print("---")
    async with PSTN2Client.from_config(config) as client:
        located = await locate(client, "+441614960123")
        await locate(client, "+441614960999")  # expected to fall back
    print("\nDone.")
    return 0 if located else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
