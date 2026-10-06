#!/usr/bin/env node
// PSTN2 local mock network — no dependencies.
//
// Serves a fixture network (default: the 3-CP harness network) over real HTTP on
// localhost so the TypeScript, Python and Go SDKs can be tested end to end:
//
//   GET /numbering-list.json                     regulator numbering list (ETag/304)
//   GET /cp/{key}/pstn2/v1/numbers/{digits}      Number Discovery (held/redirect/not_held/404)
//   GET /cp/{key}/pstn2/v1/keys                  (empty key set — mock responses are unsigned)
//   POST /cp/{key}/pstn2/v1/auth/verify          caller ID verification (Direct Query, §5.1)
//   POST /cp/{key}/pstn2/v1/auth/tokens          create token (Token Pool, §5.2)
//   GET  /cp/{key}/pstn2/v1/auth/tokens/{id}     verify token
//   POST /cp/{key}/pstn2/v1/routing/request      direct routing (§6)
//   POST /cp/{key}/pstn2/v1/emergency/location   emergency location (§8)
//
// Mock semantics (deterministic, for examples and tests):
//   • A CP answers auth/routing/emergency only for numbers it currently holds.
//     Otherwise it returns 200 {result:"not_held", cache:{invalidate:true}} (§5.1.2, §9.5),
//     so clients must rediscover and retry.
//   • Every held caller ID is treated as having an active outbound call → verified.
//   POST /admin/port {number, fromCpId, toCpId}  port a number (for invalidation tests)
//   POST /admin/reset                            reload the fixture
//   GET /admin/log                               queries received, in order
//
// Usage: node server.mjs [--port 47901] [--fixture harness|testcp]
// Each CP's URL in the served numbering list is rewritten to http://127.0.0.1:{port}/cp/{key}.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Network } from '../../animations/src/test-harness/harness-engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
};
const port = Number(arg('--port', process.env.PSTN2_MOCK_PORT || 47901));
const fixtureName = arg('--fixture', 'harness');
const fixtureFile = join(here, '..', 'fixtures', fixtureName === 'testcp' ? 'testcp-network.json' : 'harness-network.json');
const base = `http://127.0.0.1:${port}`;

function loadNetwork() {
    const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));
    const urlMap = new Map();
    for (const cp of fixture.cps) {
        const local = `${base}/cp/${cp.key}`;
        urlMap.set(cp.url, local);
        cp.url = local;
    }
    for (const block of fixture.numberingList.blocks) {
        if (block.rangeHolderUrl) block.rangeHolderUrl = urlMap.get(block.rangeHolderUrl) || block.rangeHolderUrl;
    }
    return new Network(fixture);
}

let network = loadNetwork();
let log = [];
const tokens = new Map();
let listVersion = 1;

const now = () => new Date().toISOString();
const send = (res, status, body, headers = {}) => {
    const data = body === undefined ? '' : JSON.stringify(body, null, 2);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
    res.end(data);
};

const readBody = (req) => new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    const p = url.pathname;

    if (req.method === 'GET' && p === '/numbering-list.json') {
        const etag = `"list-${listVersion}"`;
        if (req.headers['if-none-match'] === etag) return send(res, 304);
        return send(res, 200, network.numberingList, { ETag: etag });
    }

    let m = p.match(/^\/cp\/([a-z0-9-]+)\/pstn2\/v1\/numbers\/(\d{2,15})$/);
    if (req.method === 'GET' && m) {
        const cp = [...network.cps.values()].find((c) => c.key === m[1]);
        if (!cp) return send(res, 404, { result: 'unknown' });
        const { status, body } = network.respond(cp.cpId, '+' + m[2]);
        log.push({ at: new Date().toISOString(), cpId: cp.cpId, number: '+' + m[2], status, result: body.result, userAgent: req.headers['user-agent'] || '' });
        return send(res, status, body);
    }

    m = p.match(/^\/cp\/([a-z0-9-]+)\/pstn2\/v1\/keys$/);
    if (req.method === 'GET' && m) {
        const cp = [...network.cps.values()].find((c) => c.key === m[1]);
        return cp ? send(res, 200, { cpId: cp.cpId, keys: [] }) : send(res, 404, { result: 'unknown' });
    }


    m = p.match(/^\/cp\/([a-z0-9-]+)\/pstn2\/v1\/(auth\/verify|auth\/tokens|routing\/request|emergency\/location)$/);
    const t = p.match(/^\/cp\/([a-z0-9-]+)\/pstn2\/v1\/auth\/tokens\/([A-Za-z0-9-]+)$/);
    if ((req.method === 'POST' && m) || (req.method === 'GET' && t)) {
        const key = (m || t)[1];
        const cp = [...network.cps.values()].find((c) => c.key === key);
        if (!cp) return send(res, 404, { error: { code: 'invalid_request', message: 'unknown CP', timestamp: now() } });
        const holds = (n) => { const h = network.currentHolder(n); return h && h.cpId === cp.cpId; };
        const notHeld = (extra = {}) => ({ result: 'not_held', cache: { invalidate: true, scope: 'number' }, timestamp: now(), ...extra });

        if (t) {
            const tok = tokens.get(t[2]);
            log.push({ at: now(), cpId: cp.cpId, op: 'auth/tokens/get', tokenId: t[2] });
            if (!tok || tok.cpId !== cp.cpId) return send(res, 404, { error: { code: 'invalid_token', message: 'Token not found', timestamp: now() } });
            if (Date.parse(tok.expiresAt) < Date.now()) return send(res, 410, { error: { code: 'expired_token', message: 'Token has expired', timestamp: now() } });
            return send(res, 200, { ...tok.body, verified: true, expiresAt: tok.expiresAt });
        }

        const body = await readBody(req);
        const op = m[2];
        log.push({ at: now(), cpId: cp.cpId, op, body, userAgent: req.headers['user-agent'] || '' });
        if (op === 'auth/verify') {
            if (!holds(body.callerID)) return send(res, 200, notHeld({ verified: false, callReference: body.callReference }));
            return send(res, 200, {
                verified: true, callReference: body.callReference, callerName: `${cp.cpName} customer`,
                callerOrg: cp.cpName, trustLevel: 'verified', timestamp: now(),
            });
        }
        if (op === 'auth/tokens') {
            if (!holds(body.callerID)) return send(res, 200, notHeld({ callReference: body.callReference }));
            const tokenId = 'TK-' + Array.from({ length: 16 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]).join('');
            const ttl = Math.min(Math.max(Number(body.ttl) || 30, 1), 300);
            const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
            tokens.set(tokenId, { cpId: cp.cpId, expiresAt, body: { tokenId, originatingCP: cp.cpId, callerID: body.callerID, calledID: body.calledID, callReference: body.callReference } });
            return send(res, 201, { tokenId, expiresAt, callReference: body.callReference });
        }
        if (op === 'routing/request') {
            if (!holds(body.destinationNumber)) return send(res, 200, notHeld({ accepted: false, callReference: body.callReference }));
            const caps = body.mediaCapabilities || {};
            const codecs = (caps.codecs || []).filter((c) => ['opus', 'g722', 'pcmu', 'pcma'].includes(c));
            const enc = (caps.encryption || []).filter((e) => ['srtp-aes256', 'srtp-aes128'].includes(e));
            if (!codecs.length) return send(res, 400, { error: { code: 'unsupported_codec', message: 'No common codec', timestamp: now() } });
            const octet = 10 + [...network.cps.keys()].indexOf(cp.cpId);
            return send(res, 200, {
                accepted: true, callReference: body.callReference,
                connectionDetails: { fqdn: `media.${cp.key}.example`, ipv4: `203.0.113.${octet}`, ipv6: `2001:db8::${octet}`, port: 5061, protocol: 'tls', publicKey: Buffer.from(`${cp.cpId}-mock-media-key-32bytes!`).subarray(0, 32).toString('base64') },
                agreedCapabilities: { codecs: [codecs[0]], encryption: enc.slice(0, 1), video: false },
                timestamp: now(),
            });
        }
        if (op === 'emergency/location') {
            if (!holds(body.callerID)) return send(res, 200, notHeld({ callReference: body.callReference }));
            return send(res, 200, {
                callReference: body.callReference,
                location: { latitude: 53.4808, longitude: -2.2426, accuracy: 12, source: 'gps' },
                address: { street: '1 Example Street', city: 'Manchester', postcode: 'M1 1AA', country: 'GB' },
                timestamp: now(),
            });
        }
    }

    if (req.method === 'POST' && p === '/admin/port') {
        const { number, fromCpId, toCpId } = await readBody(req);
        try {
            network.port(number, fromCpId, toCpId);
            return send(res, 200, { ok: true });
        } catch (e) {
            return send(res, 400, { ok: false, error: String(e.message || e) });
        }
    }
    if (req.method === 'POST' && p === '/admin/reset') {
        network = loadNetwork();
        log = [];
        tokens.clear();
        listVersion += 1;
        return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/admin/log') return send(res, 200, log);
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, fixture: fixtureName });

    return send(res, 404, { result: 'unknown' });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`PSTN2 mock network (${fixtureName}) on ${base}`);
    console.log(`  numbering list: ${base}/numbering-list.json`);
    for (const cp of network.cps.values()) console.log(`  ${cp.cpName.padEnd(16)} ${cp.url}`);
});
