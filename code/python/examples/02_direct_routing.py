"""
Example 2: Direct Routing

This example demonstrates how to request direct peer-to-peer routing
for an outbound call, including media capability negotiation.
"""

import asyncio
import os
from pstn2.client import PSTN2Client, AuthenticationMode
from pstn2.types import MediaCapabilities, CallBranding


async def main():
    client = PSTN2Client(
        cp_id='CP1-UK-0001',
        api_endpoint='https://api.yourcp.com/pstn2/v1',
        private_key=os.environ['PSTN2_PRIVATE_KEY'],
        auth_mode=AuthenticationMode.DIRECT_QUERY,
    )

    print('Requesting direct routing for outbound call...')
    print('---')

    try:
        # Request routing with media capabilities
        routing = await client.routing.request_routing(
            destination_number='+447700900123',
            caller_id='+441234567890',
            call_reference='xyz-789-abc-012',
            media_capabilities=MediaCapabilities(
                codecs=['opus', 'g722', 'pcmu'],
                encryption=['srtp-aes256', 'srtp-aes128'],
                video=False,
                max_bandwidth=128000,  # 128 kbps
            ),
            branding=CallBranding(
                display_name='ACME Support',
                logo='https://cdn.acme.com/logo.png',
                background_color='#0066cc',
                text_color='#ffffff',
                call_purpose='Account Security Alert',
            ),
        )

        if routing.accepted:
            print('✓ Routing accepted!')
            print('')
            print('Connection Details:')
            print(f'  FQDN: {routing.connection_details.fqdn}')
            print(f'  IPv4: {routing.connection_details.ipv4}')
            print(f'  IPv6: {routing.connection_details.ipv6 or "N/A"}')
            print(f'  Port: {routing.connection_details.port}')
            print(f'  Protocol: {routing.connection_details.protocol}')
            print('')
            print('Agreed Capabilities:')
            print(f'  Codecs: {", ".join(routing.agreed_capabilities.codecs)}')
            print(f'  Encryption: {", ".join(routing.agreed_capabilities.encryption)}')
            print(f'  Video: {"Yes" if routing.agreed_capabilities.video else "No"}')
            print('')
            print('Encryption:')
            pk = routing.connection_details.public_key
            print(f'  Public Key: {pk[:32] + "..." if pk else "N/A"}')
            print('  Algorithm: Ed25519')
            print('')

            # Now you can establish the media connection
            print('Ready to establish encrypted media connection!')
            print(f'Connect to: {routing.connection_details.fqdn}:{routing.connection_details.port}')

            # Simulate media connection
            await simulate_media_connection(routing.connection_details)

        else:
            print('✗ Routing rejected')
            print(f'Reason: {routing.reason}')
            print('Falling back to traditional PSTN')
    except Exception as error:
        print(f'Error requesting routing: {error}')
        print('Falling back to traditional PSTN')

    await client.close()


async def simulate_media_connection(details):
    print('')
    print('Establishing media connection...')
    print('  1. Performing DTLS handshake')
    print('  2. Exchanging SRTP keys')
    print('  3. Setting up Opus codec')
    print('  4. Media connection established!')
    print('')
    print('✓ Call connected - encrypted HD audio ready')


if __name__ == '__main__':
    asyncio.run(main())
