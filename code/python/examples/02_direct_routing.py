"""
Example 2: Direct Routing with media negotiation

Alpha Telecom (CP1-UK-0101) places a call from +442079460100 to +441614960123.
It discovers the destination's holder (Bravo Networks) and asks Bravo for direct
routing (POST /pstn2/v1/routing/request), offering codecs and SRTP suites. Bravo
returns its media endpoint and the agreed capabilities.

Then two calls that must fall back to traditional PSTN:
  * a destination whose Range Holder does not participate (+441174960555, Delta Voice)
  * an offer with no codec Bravo supports (g729 only)

Run the local mock network first:
    node test-environment/mock-network/server.mjs
then:
    python examples/02_direct_routing.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from pstn2 import MediaCapabilities, NetworkConfig, PSTN2Client, PSTN2Error, display_number, fingerprint

CALLER_ID = "+442079460100"


async def route(client: PSTN2Client, destination: str, caps: MediaCapabilities, label: str) -> bool:
    print(f"\n{label}: {CALLER_ID} → {destination} ({display_number(destination)})")
    print(f"  Offer: codecs={caps.codecs} encryption={caps.encryption} video={caps.video}")
    try:
        r = await client.routing.request_routing(destination, CALLER_ID, caps,
                                                 branding={"displayName": "Alpha Telecom", "callPurpose": "Demo call"})
    except PSTN2Error as error:
        print(f"  ! Routing error: {error}\n  → Route via traditional PSTN")
        return False
    if r.discovery is not None:
        print(f"  Discovery: {r.discovery.result}  hops: {' → '.join(r.discovery.hops) or '(none)'}")
    if r.accepted:
        cd, agreed = r.connection_details, r.agreed_capabilities
        print(f"  ✓ Accepted by {r.holder}")
        print(f"    Media endpoint: {cd.fqdn} ({cd.ipv4} / {cd.ipv6}) port {cd.port}/{cd.protocol}")
        print(f"    Agreed codec:   {agreed.codecs[0] if agreed.codecs else '-'}")
        print(f"    Agreed SRTP:    {agreed.encryption[0] if agreed.encryption else '-'}")
        if cd.public_key:
            print(f"    Peer identity:  {fingerprint(cd.public_key)[:23]}…  (authenticates its DTLS fingerprint)")
        print("    → Send SIP INVITE directly to the media endpoint (DTLS-SRTP)")
    else:
        print(f"  ✗ Not accepted ({r.reason})")
        print("    → Route via traditional PSTN")
    return True


async def main() -> int:
    logging.basicConfig(level=os.environ.get("PSTN2_LOG_LEVEL", "WARNING"))
    config = NetworkConfig.from_env()
    print("PSTN2 Example 2: Direct Routing")
    print(f"  Network:   {config.network}  ({config.numbering_list_url})")
    print(f"  Acting CP: {config.cp_id} (originating CP)")
    print("---")
    ok = True
    async with PSTN2Client.from_config(config) as client:
        print(f"  Our identity key: {fingerprint(client.public_key)[:23]}…")
        full = MediaCapabilities(codecs=["opus", "g722", "pcmu"], encryption=["srtp-aes256", "srtp-aes128"],
                                 video=False, max_bandwidth=128000)
        ok &= await route(client, "+441614960123", full, "Call 1 — direct route to Bravo")
        ok &= await route(client, "+441174960555", full, "Call 2 — Range Holder not participating")
        ok &= await route(client, "+441614960123",
                          MediaCapabilities(codecs=["g729"], encryption=["srtp-aes256"]), "Call 3 — no common codec")
    print("\nDone.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
