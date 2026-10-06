#!/usr/bin/env node
// Build the static PSTN2 dummy test CP site (deployed to https://pstn2.org/testcp/).
//
// The web host is static-only, so every Number Discovery answer is generated here
// as a file. Responses are signed with Ed25519 test keys (SPECIFICATION.md §9.6).
//
//   node tools/testcp/build.mjs                       # → testcp/ for https://pstn2.org/testcp
//   node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp
//                                                     # local copy for SDK tests
//
// Signing keys: read from $PSTN2_TESTCP_KEYS (path) or tools/testcp/.keys.json
// (gitignored). If neither exists, new test keys are generated and written to
// tools/testcp/.keys.json — copy them to the credentials vault, never commit them.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { Network, digitsOf, displayNumber } from '../../animations/src/test-harness/harness-engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const fixture = JSON.parse(readFileSync(join(repo, 'test-environment', 'fixtures', 'testcp-network.json'), 'utf8'));
const LIVE_BASE = fixture.baseUrl;
const base = (arg('--base', LIVE_BASE)).replace(/\/$/, '');
const out = arg('--out', join(repo, 'testcp'));
const issued = arg('--issued', fixture.numberingList.listVersion);

// Rebase every URL in the fixture onto --base
const rebase = (u) => (u ? u.replace(LIVE_BASE, base) : u);
for (const cp of fixture.cps) cp.url = rebase(cp.url);
for (const b of fixture.numberingList.blocks) b.rangeHolderUrl = rebase(b.rangeHolderUrl);
const network = new Network(fixture);

// ---- keys -------------------------------------------------------------------
const keyFile = process.env.PSTN2_TESTCP_KEYS || join(here, '.keys.json');
let keys;
if (existsSync(keyFile)) {
    keys = JSON.parse(readFileSync(keyFile, 'utf8'));
} else {
    keys = {};
    for (const cp of fixture.cps) {
        const { privateKey } = generateKeyPairSync('ed25519');
        keys[cp.cpId] = {
            kid: `${cp.key}-test-2026-10`,
            privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        };
    }
    writeFileSync(keyFile, JSON.stringify(keys, null, 2) + '\n', { mode: 0o600 });
    console.log(`Generated new test signing keys → ${keyFile} (add to the credentials vault; never commit)`);
}

const rawPublicKey = (pem) => {
    const der = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' });
    return der.subarray(der.length - 32).toString('base64');
};

// Canonical JSON (§9.6): keys sorted at every level, no whitespace.
export function canonicalJson(v) {
    if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
    if (v && typeof v === 'object') {
        return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
}

const signBody = (cpId, body) => {
    const k = keys[cpId];
    const unsigned = { ...body, kid: k.kid };
    const sig = sign(null, Buffer.from(canonicalJson(unsigned), 'utf8'), createPrivateKey(k.privateKeyPem)).toString('base64');
    return { ...unsigned, signature: sig };
};

// ---- write the site -----------------------------------------------------------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const write = (rel, data) => {
    const p = join(out, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
};

write('numbering-list.json', fixture.numberingList);
write('numbering-list.csv',
    'Number Block,Status,Communications Provider,Date Allocated,Range Holder URL\n' +
    fixture.numberingList.blocks.map((b) => `${b.display},${b.status},${b.cpName},${issued.slice(0, 10)},${b.rangeHolderUrl}`).join('\n') + '\n');

const jsonHtaccess = [
    '# Serve extensionless discovery answers as JSON and allow browser clients.',
    '<IfModule mod_mime.c>',
    '  ForceType application/json',
    '</IfModule>',
    '<IfModule mod_headers.c>',
    '  Header set Access-Control-Allow-Origin "*"',
    '  Header set Cache-Control "public, max-age=300"',
    '</IfModule>',
    '',
].join('\n');

const answered = [];
for (const cp of network.cps.values()) {
    const kid = keys[cp.cpId].kid;
    write(`${cp.key}/pstn2/v1/keys`, {
        cpId: cp.cpId,
        keys: [{ kid, algorithm: 'ed25519', publicKey: rawPublicKey(keys[cp.cpId].privateKeyPem), validFrom: '2026-10-01T00:00:00Z', validTo: '2027-10-01T00:00:00Z' }],
    });
    write(`${cp.key}/pstn2/v1/.htaccess`, jsonHtaccess);
    write(`${cp.key}/pstn2/v1/numbers/.htaccess`, jsonHtaccess);

    // Every number this CP has something to say about (others fall through to the host's 404)
    const subjects = new Set([...cp.inService, ...cp.portedIn.map((p) => p.number), ...cp.portedOut.map((p) => p.number), ...cp.previouslyHeld]);
    for (const n of [...subjects].sort()) {
        const { status, body } = network.respond(cp.cpId, n, issued);
        if (status !== 200) continue;
        write(`${cp.key}/pstn2/v1/numbers/${digitsOf(n)}`, signBody(cp.cpId, body));
        answered.push({ cp: cp.cpName, number: n, result: body.result });
    }
}

// Human-readable landing page
const rows = fixture.testNumbers.map((t) => `<tr><td><code>${t.number}</code></td><td>${displayNumber(t.number)}</td><td>${t.expect}</td></tr>`).join('\n');
const tmpl = readFileSync(join(here, 'index.template.html'), 'utf8');
write('index.html', tmpl
    .replaceAll('{{BASE}}', base)
    .replaceAll('{{ROWS}}', rows)
    .replaceAll('{{ISSUED}}', issued));
copyFileSync(join(here, 'testcp.css'), join(out, 'testcp.css'));

console.log(`Built dummy test CP → ${out} (base ${base})`);
for (const a of answered) console.log(`  ${a.cp.padEnd(16)} ${a.number}  ${a.result}`);
