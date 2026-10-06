/**
 * Example 3: Token Pool Authentication (Option 2)
 *
 * Alpha Telecom (originating CP) creates a short-lived token for a call from
 * +442079460100 to +441614960123 before sending the INVITE. Bravo Networks
 * (terminating CP) receives the token id in the INVITE, finds the caller ID's
 * holder with Number Discovery, and verifies the token there.
 *
 * Run:  node test-environment/mock-network/server.mjs   (repo root)
 *       npm run example:03
 */

// In your application: import { PSTN2Client, AuthenticationMode } from '@pstn2/core';
import { PSTN2Client, AuthenticationMode } from '../src';
import { banner, describeDiscovery, fmt, startOrExit, rule } from './shared';

const CALLER = '+442079460100';
const CALLED = '+441614960123';

async function main() {
  banner('PSTN2 Example 3 — Token Pool', 'Originating CP creates a token; terminating CP verifies it');
  const alpha = PSTN2Client.fromEnv({ cpId: 'CP1-UK-0101', cpName: 'Alpha Telecom', authMode: AuthenticationMode.TokenPool });
  // The terminating side is a different CP (PSTN2_CP_ID only changes the originating CP).
  const bravo = new PSTN2Client({
    cpId: 'CP1-UK-0102',
    cpName: 'Bravo Networks',
    numberingListUrl: alpha.numberingList.url,
    verifySignatures: alpha.discovery.verifySignatures,
    authMode: AuthenticationMode.TokenPool,
  });
  await startOrExit(alpha);

  try {
    console.log(`Step 1 — ${alpha.config.cpId} creates a token for ${fmt(CALLER)} → ${fmt(CALLED)}`);
    const token = await alpha.createToken({
      callerID: CALLER,
      calledID: CALLED,
      callReference: alpha.generateCallReference(),
      ttl: 30,
      branding: { displayName: 'Alpha Telecom', callPurpose: 'Delivery update' },
    });
    console.log(`  ✓ Token ${token.tokenId} held by ${token.pool.cpName || token.pool.cpId}, expires ${token.expiresAt}`);
    if (token.discovery) console.log(`  Discovery (caller ID): ${describeDiscovery(alpha, token.discovery)}`);
    console.log('');
    console.log('Step 2 — INVITE carries the token:');
    console.log(`  X-PSTN2-Token: ${token.tokenId}`);
    console.log('');

    console.log(`Step 3 — ${bravo.config.cpId} verifies the token on the inbound call`);
    const data = await bravo.verifyToken(token.tokenId, CALLER);
    if (data && data.verified && data.callerID === CALLER && data.calledID === CALLED) {
      console.log('  ✓ Token verified');
      console.log(`    Originating CP: ${data.originatingCP}`);
      console.log(`    Caller → called: ${data.callerID} → ${data.calledID}`);
      console.log(`    Expires: ${data.expiresAt}`);
    } else {
      console.log('  ✗ Token not verified — flag the call / fall back to direct query');
    }

    console.log('');
    console.log('Step 4 — the same check through verifyCall() (token first, direct query fallback):');
    const v = await bravo.verifyCall({ callerID: CALLER, calledID: CALLED, tokenId: token.tokenId });
    console.log(`  ${v.verified ? '✓ verified' : '✗ not verified'} (trust level ${v.trustLevel})`);

    console.log('');
    console.log('Step 5 — a forged token id is rejected:');
    const forged = await bravo.verifyToken('TK-AAAAAAAAAAAAAAAA', CALLER);
    console.log(`  ${forged ? '✗ unexpectedly accepted' : '✓ unknown token → null (treat as unverified)'}`);
    console.log(rule());
    console.log('Token Pool: one create per call, verified with a single GET; short TTL limits the fraud window.');
  } catch (err) {
    console.log(`✗ Token pool error: ${(err as Error).message} — fall back to direct query / traditional PSTN`);
  } finally {
    await alpha.close();
    await bravo.close();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
