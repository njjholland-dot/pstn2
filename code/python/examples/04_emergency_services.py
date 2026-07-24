"""
Example 4: Emergency Services

This example demonstrates how PSAPs query real-time location
data for emergency calls (999/112/911).
"""

import asyncio
import os
from datetime import datetime
from pstn2.client import PSTN2Client, AuthenticationMode


async def main():
    # Initialize as a PSAP (Public Safety Answering Point)
    psap_client = PSTN2Client(
        cp_id='PSAP-UK-LONDON-01',
        api_endpoint='https://api.psap-london.gov.uk/pstn2/v1',
        private_key=os.environ['PSAP_PRIVATE_KEY'],
        auth_mode=AuthenticationMode.DIRECT_QUERY,
    )

    print('Emergency Services Location Query')
    print('PSAP: London Central 999')
    print('---')

    # Scenario: Someone calls 999
    emergency_call = {
        'caller_id': '+441234567890',
        'call_reference': 'emergency-456-789',
        'timestamp': datetime.now(),
    }

    print('Emergency call received:')
    print(f'  From: {emergency_call["caller_id"]}')
    print(f'  Time: {emergency_call["timestamp"].isoformat()}')
    print('')
    print('Querying real-time location...')

    try:
        # Query the CP for caller's location
        location = await psap_client.emergency.get_location(
            caller_id=emergency_call['caller_id'],
            call_reference=emergency_call['call_reference'],
            psap_id='UK-999-LONDON-CENTRAL',
        )

        print('✓ Location retrieved successfully')
        print('')
        print('GPS Coordinates:')
        print(f'  Latitude: {location.location.latitude}')
        print(f'  Longitude: {location.location.longitude}')
        print(f'  Accuracy: {location.location.accuracy} meters')
        print(f'  Altitude: {location.location.altitude or "N/A"} meters')
        print(f'  Source: {location.location.source}')
        print('')
        print('Address:')
        print(f'  Street: {location.address.street}')
        print(f'  City: {location.address.city}')
        print(f'  Postcode: {location.address.postcode}')
        print(f'  Country: {location.address.country}')
        print('')

        if location.additional_info:
            print('Additional Information:')
            if location.additional_info.cell_tower_id:
                print(f'  Cell Tower: {location.additional_info.cell_tower_id}')
            if location.additional_info.wifi_access_points:
                print(f'  WiFi APs: {len(location.additional_info.wifi_access_points)} detected')
            print(f'  Last Updated: {location.additional_info.last_updated}')
            print('')

        # Calculate response recommendations
        accuracy = location.location.accuracy
        print('Dispatch Recommendations:')
        if accuracy < 20:
            print('  ✓ Excellent accuracy - dispatch to exact location')
            print('  ✓ GPS lock strong')
        elif accuracy < 100:
            print('  ⚠ Good accuracy - dispatch to general area')
            print('  ⚠ May need caller confirmation')
        else:
            print('  ⚠ Low accuracy - use cell tower triangulation')
            print('  ⚠ Caller assistance required')
        print('')

        # Compare with traditional PSTN
        print('Traditional PSTN comparison:')
        print('  Old: Billing address (often incorrect)')
        print('  Old: 100-1000m accuracy')
        print('  Old: 30-60 second delay')
        print('  ---')
        print('  New: Real-time GPS location')
        print('  New: 5-15m accuracy')
        print('  New: < 100ms response time')
        print('  Result: Faster response, lives saved! 🚑')

    except Exception as error:
        print(f'Error retrieving location: {error}')
        print('Falling back to billing address...')

    await psap_client.close()


if __name__ == '__main__':
    asyncio.run(main())
