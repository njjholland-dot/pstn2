#!/usr/bin/env node
// PSTN2 local mock network — no dependencies.
//
// Serves a fixture network (default: the 3-CP harness network) over real HTTP on
// localhost so the TypeScript, Python and Go SDKs can be tested end to end:
//
//   GET /numbering-list.json                     regulator numbering list (ETag/304)
//   GET /cp/{key}/pstn2/v1/numbers/{digits}      Number Discovery (held/redirect/not_held/404)
//   GET /cp/{key}/pstn2/v1/keys                  (empty key set — mock responses are unsigned)
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
let listVersion = 1;

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
