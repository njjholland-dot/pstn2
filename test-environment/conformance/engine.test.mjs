// Unit tests for the reference Number Discovery engine used by the test harness
// and the mock network. Run: node --test test-environment/conformance/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    Network, DiscoveryClient, networkTransport, findBlock, displayNumber,
} from '../../animations/src/test-harness/harness-engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, '..', 'fixtures', f), 'utf8'));
const harness = load('harness-network.json');
const { scenarios } = load('scenarios.json');
const testcp = load('testcp-network.json');

function makeClient(network, cpId, events) {
    return new DiscoveryClient({
        cpId,
        numberingList: network.numberingList,
        transport: networkTransport(network),
        onEvent: undefined,
    });
}

test('scenarios A–G run in order with a persistent cache', async () => {
    const network = new Network(harness);
    const clients = new Map();
    for (const s of scenarios) {
        if (s.before?.port) {
            const p = s.before.port;
            network.port(p.number, p.fromCpId, p.toCpId);
        }
        if (!clients.has(s.callerCp)) clients.set(s.callerCp, makeClient(network, s.callerCp));
        const r = await clients.get(s.callerCp).discover(s.number);
        assert.equal(r.result, s.expect.result, `${s.id} result`);
        assert.deepEqual(r.hops, s.expect.hops, `${s.id} hops`);
        if (s.expect.holderCpId) assert.equal(r.holder.cpId, s.expect.holderCpId, `${s.id} holder`);
        if ('ported' in s.expect) assert.equal(r.ported, s.expect.ported, `${s.id} ported`);
        if ('fromCache' in s.expect) assert.equal(r.fromCache, s.expect.fromCache, `${s.id} fromCache`);
        if ('invalidated' in s.expect) assert.equal(r.invalidated, s.expect.invalidated, `${s.id} invalidated`);
    }
});

test('event sequence for a ported number tells the full story', async () => {
    const network = new Network(harness);
    const client = makeClient(network, 'CP1-UK-0101');
    const types = [];
    await client.discover('+441134960456', { onEvent: (e) => { types.push(e.type); } });
    assert.deepEqual(types, [
        'cache-miss', 'list-lookup', 'query', 'response', 'redirect', 'query', 'response', 'cache-store', 'result',
    ]);
});

test('Range Holder answers: held, redirect, 404; non-holder answers not_held', () => {
    const network = new Network(harness);
    assert.equal(network.respond('CP1-UK-0102', '+441614960123').body.result, 'held');
    assert.equal(network.respond('CP1-UK-0103', '+441134960456').body.result, 'redirect');
    assert.equal(network.respond('CP1-UK-0103', '+441134960456').body.portedTo.cpId, 'CP1-UK-0102');
    assert.equal(network.respond('CP1-UK-0102', '+441614960999').status, 404);
    const nh = network.respond('CP1-UK-0101', '+441134960456').body;
    assert.equal(nh.result, 'not_held');
    assert.equal(nh.cache.invalidate, true);
});

test('hop limit is enforced', async () => {
    const network = new Network(harness);
    // Build a pathological redirect chain: Charlie → Bravo → (claims) Charlie …
    const transport = async (url) => ({
        status: 200,
        body: { result: 'redirect', portedTo: { cpId: 'X' + Math.random(), url: url + '/x' } },
    });
    const client = new DiscoveryClient({ cpId: 'CP1-UK-0101', numberingList: network.numberingList, transport, hopLimit: 5 });
    const r = await client.discover('+441134960456');
    assert.equal(r.result, 'error');
    assert.equal(r.error, 'hop_limit_exceeded');
    assert.equal(r.hops.length, 5);
});

test('redirect loops are detected', async () => {
    const network = new Network(harness);
    const charlie = network.ref('CP1-UK-0103');
    const bravo = network.ref('CP1-UK-0102');
    const transport = async (url) => ({
        status: 200,
        body: { result: 'redirect', portedTo: url === charlie.url ? bravo : charlie },
    });
    const client = new DiscoveryClient({ cpId: 'CP1-UK-0101', numberingList: network.numberingList, transport });
    const r = await client.discover('+441134960456');
    assert.equal(r.error, 'loop_detected');
});

test('expired cache entries are not used', async () => {
    let t = 0;
    const network = new Network(harness);
    const client = new DiscoveryClient({
        cpId: 'CP1-UK-0101', numberingList: network.numberingList, transport: networkTransport(network), now: () => t,
    });
    await client.discover('+441614960123');
    t += 86400 * 1000 + 1;
    const r = await client.discover('+441614960123');
    assert.equal(r.fromCache, false);
});

test('longest-prefix match and display formatting', () => {
    assert.equal(findBlock(harness.numberingList, '+441614960123').cpId, 'CP1-UK-0102');
    assert.equal(findBlock(harness.numberingList, '+441154960555'), null);
    assert.equal(displayNumber('+441614960123'), '0161 496 0123');
    assert.equal(displayNumber('+441134960456'), '0113 496 0456');
    assert.equal(displayNumber('+442079460321'), '020 7946 0321');
    assert.equal(displayNumber('+447700900003'), '07700 900003');
});

test('dummy test CP network resolves every published test number as documented', async () => {
    const network = new Network(testcp);
    const client = makeClient(network, 'CLIENT');
    const r1 = await client.discover('+447700900001');
    assert.equal(r1.holder.cpId, 'CP1-UK-9001');
    const r3 = await client.discover('+447700900003');
    assert.deepEqual(r3.hops, ['CP1-UK-9001', 'CP1-UK-9002']);
    assert.equal(r3.ported, true);
    assert.equal((await client.discover('+447700900099')).result, 'unknown');
    assert.equal((await client.discover('+447700900101')).holder.cpId, 'CP1-UK-9002');
    assert.equal(network.respond('CP1-UK-9002', '+447700900004').body.result, 'not_held');
    // Stale cache: pretend the client thinks B holds 004
    client.cache.set('+447700900004', { holder: network.ref('CP1-UK-9002'), ported: true, expires: Date.now() + 1e6 });
    const r4 = await client.discover('+447700900004');
    assert.equal(r4.invalidated, true);
    assert.equal(r4.holder.cpId, 'CP1-UK-9001');
});
