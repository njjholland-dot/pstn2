"""
Example 1: Basic Authentication

This example demonstrates how to verify an inbound call using
PSTN2 authentication (Option 1: Direct Query).
"""

import asyncio
import os
from pstn2.client import PSTN2Client, AuthenticationMode


async def main():
    # Initialize PSTN2 client
    client = PSTN2Client(
        cp_id='CP1-UK-0001',
        api_endpoint='https://api.yourcp.com/pstn2/v1',
        private_key=os.environ['PSTN2_PRIVATE_KEY'],
        auth_mode=AuthenticationMode.DIRECT_QUERY,
        timeout=2.0,
        retries=3,
        log_level='info',
    )

    print('PSTN2 Client initialized')
    print(f'CP ID: {client.config.cp_id}')
    print(f'Auth Mode: {client.config.auth_mode}')
    print('---')

    # Scenario: Verify an inbound call
    print('Verifying inbound call...')

    try:
        verification = await client.auth.verify_call(
            caller_id='+441234567890',
            called_id='+447700900123',
            call_reference='abc-123-def-456',
        )

        if verification.verified:
            print('✓ Call verified successfully!')
            print(f'  Caller Name: {verification.caller_name or "Unknown"}')
            print(f'  Organization: {verification.caller_org or "N/A"}')
            print(f'  Call Purpose: {verification.call_purpose or "General"}')
            print(f'  Trust Level: {verification.trust_level}')

            if verification.branding:
                print('  Branding:')
                print(f'    Display Name: {verification.branding.display_name}')
                print(f'    Logo: {verification.branding.logo}')
                print(f'    Colors: {verification.branding.background_color}')

            if verification.porting_chain and len(verification.porting_chain) > 1:
                print(f'  Porting Chain: {" → ".join(verification.porting_chain)}')
        else:
            print('✗ Call NOT verified')
            print('  This may indicate caller ID spoofing')
            print('  Recommended: Block or warn user')
    except Exception as error:
        print(f'Error during verification: {error}')

        # Fallback: proceed with traditional PSTN
        print('Falling back to traditional PSTN routing')

    # Cleanup
    await client.close()


# Run the example
if __name__ == '__main__':
    asyncio.run(main())
