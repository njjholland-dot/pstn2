"""
Example 3: Token Pool Authentication

This example demonstrates Token Pool authentication (Option 2),
which creates a shared token before placing the call.
"""

import asyncio
import os
from pstn2.client import PSTN2Client, AuthenticationMode
from pstn2.types import CallBranding


async def main():
    # Initialize client with Token Pool mode
    client = PSTN2Client(
        cp_id='CP1-UK-0001',
        api_endpoint='https://api.yourcp.com/pstn2/v1',
        private_key=os.environ['PSTN2_PRIVATE_KEY'],
        auth_mode=AuthenticationMode.TOKEN_POOL,
        token_pool_endpoint='https://tokenpool.pstn2.org',
        token_pool_auth=os.environ['TOKEN_POOL_JWT'],
    )

    print('Token Pool Authentication Example')
    print('---')

    # STEP 1: Create token before placing call (Originating CP)
    print('Step 1: Creating authentication token...')

    try:
        token = await client.auth.create_token(
            caller_id='+441234567890',
            called_id='+447700900123',
            call_reference='token-call-123',
            ttl=30,  # 30 seconds
            branding=CallBranding(
                display_name='ACME Corp',
                call_purpose='Customer Service',
            ),
        )

        print('✓ Token created successfully')
        print(f'  Token ID: {token.token_id}')
        print(f'  Expires: {token.expires_at}')
        print(f'  Call Reference: {token.call_reference}')
        print('')

        # STEP 2: Place call with token in SIP INVITE
        print('Step 2: Placing call with token...')
        print('  SIP INVITE Header:')
        print(f'    X-PSTN2-Token: {token.token_id}')
        print('')

        # Simulate some time passing
        await asyncio.sleep(1)

        # STEP 3: Recipient CP verifies token (on different CP)
        print('Step 3: Recipient CP verifying token...')

        verification = await client.auth.verify_token(token.token_id)

        if verification:
            print('✓ Token verified successfully')
            print(f'  Originating CP: {verification.originating_cp}')
            print(f'  Caller ID: {verification.caller_id}')
            print(f'  Called ID: {verification.called_id}')
            print(f'  Verified: {verification.verified}')

            if verification.branding:
                print(f'  Display Name: {verification.branding.display_name}')
                print(f'  Call Purpose: {verification.branding.call_purpose}')
            print('')
            print('Call can proceed with confidence!')
        else:
            print('✗ Token verification failed')
            print('Token may have expired or been tampered with')

        # STEP 4: Show token pool benefits
        print('')
        print('Token Pool Benefits:')
        print('  ✓ Reduced query load (one create, many verifies)')
        print('  ✓ Works with any SIP header')
        print('  ✓ Short TTL limits fraud window')
        print('  ✓ Shared pool enables analytics')

    except Exception as error:
        print(f'Error with token pool: {error}')

    await client.close()


if __name__ == '__main__':
    asyncio.run(main())
