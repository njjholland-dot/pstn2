"""
Example 3: Token Pool authentication

Option 2 of §5: the originating CP creates a short-lived token *before* placing the
call; the terminating CP verifies the token instead of making a Direct Query.

  * Alpha Telecom (originating, CP1-UK-0101) creates a token for +442079460100 →
    +441614960123 in the pool of the caller ID's holder (itself, found by discovery).
  * Bravo Networks (terminating, CP1-UK-0102) verifies the token presented with the
    call: it discovers the caller ID's holder and reads GET /auth/tokens/{tokenId}.
  * A forged token does not verify → Bravo falls back to Direct Query.

Run the local mock network first:
    node test-environment/mock-network/server.mjs
then:
    python examples/03_token_pool.py
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
import os
import sys

from pstn2 import NetworkConfig, PSTN2Client, PSTN2Error

CALLER_ID = "+442079460100"  # Alpha customer
CALLED_ID = "+441614960123"  # Bravo customer


async def main() -> int:
    logging.basicConfig(level=os.environ.get("PSTN2_LOG_LEVEL", "WARNING"))
    alpha_cfg = NetworkConfig.from_env(default_cp_id="CP1-UK-0101")
    bravo_cfg = dataclasses.replace(alpha_cfg, cp_id=os.environ.get("PSTN2_TERMINATING_CP_ID", "CP1-UK-0102"))
    print("PSTN2 Example 3: Token Pool")
    print(f"  Network:         {alpha_cfg.network}  ({alpha_cfg.numbering_list_url})")
    print(f"  Originating CP:  {alpha_cfg.cp_id}")
    print(f"  Terminating CP:  {bravo_cfg.cp_id}")
    print("---")

    async with PSTN2Client.from_config(alpha_cfg) as alpha, PSTN2Client.from_config(bravo_cfg) as bravo:
        call_ref = alpha.generate_call_reference()
        print(f"\n1. {alpha_cfg.cp_id} creates a token before calling {CALLED_ID}")
        try:
            token = await alpha.auth.create_token(
                CALLER_ID, CALLED_ID, call_ref, ttl=30,
                branding={"displayName": "Alpha Telecom", "callPurpose": "Appointment reminder"},
            )
        except PSTN2Error as error:
            print(f"  ! Could not create token: {error}\n  → Place the call without a token (Direct Query will be used)")
            return 1
        print(f"  ✓ Token {token.token_id} created at {token.holder}")
        print(f"    Expires: {token.expires_at}")
        print(f"    Pool found by discovery: hops {' → '.join(token.discovery.hops) if token.discovery else '-'}")

        print(f"\n2. {bravo_cfg.cp_id} receives the call with token {token.token_id} and verifies it")
        tok = await bravo.auth.verify_token(token.token_id, CALLER_ID)
        if tok and tok.verified:
            print(f"  ✓ Token verified: originatingCP={tok.originating_cp} callerID={tok.caller_id} calledID={tok.called_id}")
            print(f"    callReference matches: {tok.call_reference == call_ref}")
        else:
            print("  ✗ Token did not verify → Direct Query fallback")

        print("\n3. A call arrives with a forged token TK-AAAAAAAAAAAAAAAA")
        v = await bravo.auth.verify_call(CALLER_ID, CALLED_ID, token_id="TK-AAAAAAAAAAAAAAAA")
        print("  Token pool: not found → fell back to Direct Query")
        print(f"  {'✓' if v.verified else '✗'} Direct Query result: verified={v.verified} trust={v.trust_level}"
              f" (by {v.holder})")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
