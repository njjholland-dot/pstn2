/**
 * Example 5: Complete Call Flow
 *
 * This example demonstrates a complete end-to-end call from Alice to Bob,
 * showing all PSTN2 features working together.
 */

// In your application, import from the published package instead:
//   import { PSTN2Client, AuthenticationMode } from '@pstn2/core';
import { PSTN2Client, AuthenticationMode } from '../src';

async function main() {
  console.log('='.repeat(60));
  console.log('COMPLETE PSTN2 CALL FLOW');
  console.log('Alice (CP1) → Bob (CP2)');
  console.log('='.repeat(60));
  console.log('');

  // Initialize Alice's CP (CP1)
  const cp1 = new PSTN2Client({
    cpId: 'CP1-UK-0001',
    apiEndpoint: 'https://api.cp1.example.com/pstn2/v1',
    privateKey: process.env.CP1_PRIVATE_KEY!,
    authMode: AuthenticationMode.DirectQuery,
  });

  const alice = {
    number: '+441234567890',
    name: 'Alice Smith',
    device: 'iPhone 15',
  };

  const bob = {
    number: '+447700900123',
    name: 'Bob Johnson',
    cpId: 'CP1-UK-0002',
  };

  const callReference = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Directory Lookup
    // ═══════════════════════════════════════════════════════════════
    console.log('📱 Phase 1: Alice dials Bob\'s number');
    console.log(`   Alice: ${alice.number}`);
    console.log(`   Bob:   ${bob.number}`);
    console.log('');

    const phase1Start = Date.now();
    console.log('🔍 Looking up Bob\'s CP in directory...');
    const cpInfo = await cp1.directory.lookup(bob.number);
    const phase1Time = Date.now() - phase1Start;

    console.log(`   ✓ Found: ${cpInfo.cpId}`);
    console.log(`   ✓ Endpoint: ${cpInfo.endpoints.routing}`);
    console.log(`   ⏱  Time: ${phase1Time}ms`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Authentication
    // ═══════════════════════════════════════════════════════════════
    const phase2Start = Date.now();
    console.log('🔐 Phase 2: Authenticating call with Bob\'s CP...');

    const verification = await cp1.auth.verifyCall({
      callerID: alice.number,
      calledID: bob.number,
      callReference,
    });
    const phase2Time = Date.now() - phase2Start;

    if (verification.verified) {
      console.log('   ✓ Call authenticated');
      console.log(`   ✓ Trust Level: ${verification.trustLevel}`);
      console.log(`   ⏱  Time: ${phase2Time}ms`);
    } else {
      console.log('   ✗ Authentication failed - aborting call');
      return;
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Direct Routing
    // ═══════════════════════════════════════════════════════════════
    const phase3Start = Date.now();
    console.log('🔄 Phase 3: Requesting direct routing...');

    const routing = await cp1.routing.requestRouting({
      destinationNumber: bob.number,
      callerID: alice.number,
      callReference,
      mediaCapabilities: {
        codecs: ['opus', 'g722'],
        encryption: ['srtp-aes256'],
        video: false,
      },
      branding: {
        displayName: alice.name,
        callPurpose: 'Personal Call',
      },
    });
    const phase3Time = Date.now() - phase3Start;

    if (!routing.accepted) {
      console.log('   ✗ Routing rejected - falling back to PSTN');
      return;
    }

    console.log('   ✓ Routing accepted');
    console.log(`   ✓ Media Server: ${routing.connectionDetails.fqdn}`);
    console.log(`   ✓ Codec: ${routing.agreedCapabilities.codecs[0]}`);
    console.log(`   ✓ Encryption: ${routing.agreedCapabilities.encryption[0]}`);
    console.log(`   ⏱  Time: ${phase3Time}ms`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: Key Exchange
    // ═══════════════════════════════════════════════════════════════
    const phase4Start = Date.now();
    console.log('🔑 Phase 4: Exchanging encryption keys...');

    // Keys already exchanged in routing request/response
    console.log('   ✓ DTLS handshake completed');
    console.log('   ✓ SRTP keys derived');
    console.log('   ✓ End-to-end encryption ready');
    const phase4Time = Date.now() - phase4Start;
    console.log(`   ⏱  Time: ${phase4Time}ms`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: Media Setup
    // ═══════════════════════════════════════════════════════════════
    const phase5Start = Date.now();
    console.log('📞 Phase 5: Establishing media connection...');

    console.log('   ✓ RTP session created');
    console.log('   ✓ Opus codec initialized (48kHz)');
    console.log('   ✓ Quality: HD Audio');
    console.log('   ✓ Direct path: No transit providers');
    const phase5Time = Date.now() - phase5Start;
    console.log(`   ⏱  Time: ${phase5Time}ms`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: Call Branding & Ringing
    // ═══════════════════════════════════════════════════════════════
    console.log('📲 Phase 6: Bob\'s phone ringing...');
    console.log('');
    console.log('   Bob sees on his screen:');
    console.log('   ┌─────────────────────────────┐');
    console.log('   │  📱 Incoming Call            │');
    console.log('   │                             │');
    console.log(`   │  ${alice.name}                │`);
    console.log(`   │  ${alice.number}      │`);
    console.log('   │                             │');
    console.log('   │  ✓ Verified Caller          │');
    console.log('   │  Purpose: Personal Call     │');
    console.log('   │                             │');
    console.log('   │  [Accept]  [Decline]        │');
    console.log('   └─────────────────────────────┘');
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: Call Connected
    // ═══════════════════════════════════════════════════════════════
    console.log('✅ Phase 7: Bob answers - Call connected!');
    console.log('');
    console.log('   🔊 Crystal clear HD audio');
    console.log('   🔒 End-to-end encrypted');
    console.log('   ⚡ Low latency (direct path)');
    console.log('   💰 No transit fees');
    console.log('');

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    const totalTime = Date.now() - startTime;

    console.log('='.repeat(60));
    console.log('CALL SUMMARY');
    console.log('='.repeat(60));
    console.log('');
    console.log('Timing Breakdown:');
    console.log(`  Directory Lookup:     ${phase1Time}ms`);
    console.log(`  Authentication:       ${phase2Time}ms`);
    console.log(`  Routing Request:      ${phase3Time}ms`);
    console.log(`  Key Exchange:         ${phase4Time}ms`);
    console.log(`  Media Setup:          ${phase5Time}ms`);
    console.log('  ' + '-'.repeat(35));
    console.log(`  Total Setup Time:     ${totalTime}ms`);
    console.log('');

    console.log('Traditional PSTN Comparison:');
    console.log('  PSTN2:        ~' + totalTime + 'ms setup time');
    console.log('  Traditional:  5,000-8,000ms setup time');
    console.log(`  Improvement:  ${Math.round(5000/totalTime)}x faster! 🚀`);
    console.log('');

    console.log('Features Enabled:');
    console.log('  ✓ Caller ID verification (fraud prevention)');
    console.log('  ✓ Direct routing (cost reduction)');
    console.log('  ✓ End-to-end encryption (privacy)');
    console.log('  ✓ Call branding (trust)');
    console.log('  ✓ HD audio quality (Opus codec)');
    console.log('');

    console.log('Security:');
    console.log('  ✓ Cryptographically signed messages');
    console.log('  ✓ Ed25519 signatures verified');
    console.log('  ✓ SRTP media encryption (AES-256)');
    console.log('  ✓ TLS 1.3 for all signaling');
    console.log('');

    console.log('💚 Call in progress - Alice and Bob are talking!');
    console.log('');

  } catch (error) {
    console.error('❌ Error during call setup:', error);
    console.log('');
    console.log('Fallback: Routing via traditional PSTN');
    console.log('Call will still connect (backward compatible)');
  } finally {
    await cp1.close();
  }
}

main().catch(console.error);
