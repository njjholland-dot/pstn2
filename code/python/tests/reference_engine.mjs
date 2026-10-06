// Runs the reference engine (animations/src/test-harness/harness-engine.js) and prints
// JSON for the Python parity tests:
//   node reference_engine.mjs <repo> respond <fixture.json> <issued> <numbers...>
//   node reference_engine.mjs <repo> scenarios <fixture.json> <scenarios.json>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [repo, mode, fixtureFile, ...rest] = process.argv.slice(2);
const { Network, DiscoveryClient, networkTransport } = await import(
    pathToFileURL(join(repo, 'animations', 'src', 'test-harness', 'harness-engine.js')).href
);
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));

if (mode === 'respond') {
    const [issued, ...numbers] = rest;
    const network = new Network(fixture);
    const out = [];
    for (const cp of network.cps.values()) {
        for (const n of numbers) out.push({ cpId: cp.cpId, number: n, ...network.respond(cp.cpId, n, issued) });
    }
    console.log(JSON.stringify(out));
} else if (mode === 'scenarios') {
    const { scenarios } = JSON.parse(readFileSync(rest[0], 'utf8'));
    const network = new Network(fixture);
    const clients = new Map();
    const out = [];
    for (const s of scenarios) {
        if (s.before && s.before.port) network.port(s.before.port.number, s.before.port.fromCpId, s.before.port.toCpId);
        if (!clients.has(s.callerCp)) {
            clients.set(s.callerCp, new DiscoveryClient({ cpId: s.callerCp, numberingList: network.numberingList, transport: networkTransport(network) }));
        }
        const events = [];
        const r = await clients.get(s.callerCp).discover(s.number, { onEvent: (e) => { events.push(e.type); } });
        out.push({ id: s.id, result: r, events });
    }
    console.log(JSON.stringify(out));
}
