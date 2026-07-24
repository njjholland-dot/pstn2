/**
 * Example 4: Emergency Services
 *
 * This example demonstrates how PSAPs query real-time location
 * data for emergency calls (999/112/911).
 */

import { PSTN2Client, AuthenticationMode } from '@pstn2/core';

async function main() {
  // Initialize as a PSAP (Public Safety Answering Point)
  const psapClient = new PSTN2Client({
    cpId: 'PSAP-UK-LONDON-01',
    apiEndpoint: 'https://api.psap-london.gov.uk/pstn2/v1',
    privateKey: process.env.PSAP_PRIVATE_KEY!,
    authMode: AuthenticationMode.DirectQuery,
  });

  console.log('Emergency Services Location Query');
  console.log('PSAP: London Central 999');
  console.log('---');

  // Scenario: Someone calls 999
  const emergencyCall = {
    callerID: '+441234567890',
    callReference: 'emergency-456-789',
    timestamp: new Date(),
  };

  console.log('Emergency call received:');
  console.log('  From:', emergencyCall.callerID);
  console.log('  Time:', emergencyCall.timestamp.toISOString());
  console.log('');
  console.log('Querying real-time location...');

  try {
    // Query the CP for caller's location
    const location = await psapClient.emergency.getLocation({
      callerID: emergencyCall.callerID,
      callReference: emergencyCall.callReference,
      psapID: 'UK-999-LONDON-CENTRAL',
    });

    console.log('✓ Location retrieved successfully');
    console.log('');
    console.log('GPS Coordinates:');
    console.log('  Latitude:', location.location.latitude);
    console.log('  Longitude:', location.location.longitude);
    console.log('  Accuracy:', location.location.accuracy, 'meters');
    console.log('  Altitude:', location.location.altitude || 'N/A', 'meters');
    console.log('  Source:', location.location.source);
    console.log('');
    console.log('Address:');
    console.log('  Street:', location.address.street);
    console.log('  City:', location.address.city);
    console.log('  Postcode:', location.address.postcode);
    console.log('  Country:', location.address.country);
    console.log('');

    if (location.additionalInfo) {
      console.log('Additional Information:');
      if (location.additionalInfo.cellTowerId) {
        console.log('  Cell Tower:', location.additionalInfo.cellTowerId);
      }
      if (location.additionalInfo.wifiAccessPoints?.length) {
        console.log('  WiFi APs:', location.additionalInfo.wifiAccessPoints.length, 'detected');
      }
      console.log('  Last Updated:', location.additionalInfo.lastUpdated);
      console.log('');
    }

    // Calculate response recommendations
    const accuracy = location.location.accuracy;
    console.log('Dispatch Recommendations:');
    if (accuracy < 20) {
      console.log('  ✓ Excellent accuracy - dispatch to exact location');
      console.log('  ✓ GPS lock strong');
    } else if (accuracy < 100) {
      console.log('  ⚠ Good accuracy - dispatch to general area');
      console.log('  ⚠ May need caller confirmation');
    } else {
      console.log('  ⚠ Low accuracy - use cell tower triangulation');
      console.log('  ⚠ Caller assistance required');
    }
    console.log('');

    // Compare with traditional PSTN
    console.log('Traditional PSTN comparison:');
    console.log('  Old: Billing address (often incorrect)');
    console.log('  Old: 100-1000m accuracy');
    console.log('  Old: 30-60 second delay');
    console.log('  ---');
    console.log('  New: Real-time GPS location');
    console.log('  New: 5-15m accuracy');
    console.log('  New: < 100ms response time');
    console.log('  Result: Faster response, lives saved! 🚑');

  } catch (error) {
    console.error('Error retrieving location:', error);
    console.log('Falling back to billing address...');
  }

  await psapClient.close();
}

main().catch(console.error);
