// Runs the REFERENCE discovery engine (animations/src/test-harness/harness-engine.js)
// and prints JSON, so the TypeScript tests can compare the SDK against it.
//
//   node reference-runner.mjs respond <fixture.json> <issued>
//       → [{ cpId, number, status, body }] for every CP × every interesting number
//   node reference-runner.mjs scenarios <fixture.json> <scenarios.json>
//       → [{ id, result, events: [types] }] running the scenarios in order
//         with one persistent client per calling CP (caches persist)

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const engine = await import(pathToFileURL(join(repo, 'animations', 'src', 'test-harness', 'harness-engine.js')).href);
const { Network, DiscoveryClient, networkTransport } = engine;

const [mode, fixtureFile, extra] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));

export function interestingNumbers(fx) {
  const s = new Set();
  for (const cp of fx.cps) {
    for (const n of cp.inService || []) s.add(n);
    for (const p of cp.portedIn || []) s.add(p.number);
    for (const p of cp.portedOut || []) s.add(p.number);
    for (const n of cp.previouslyHeld || []) s.add(n);
  }
  for (const t of fx.testNumbers || []) s.add(t.number);
  for (const n of ['+441614960999', '+441174960555', '+441154960555', '+447700900099', '+447700900199', '+442079460999', '+15551234567']) s.add(n);
  return [...s].sort();
}

if (mode === 'respond') {
  const network = new Network(fixture);
  const out = [];
  for (const cp of network.cps.values()) {
    for (const number of interestingNumbers(fixture)) {
      const { status, body } = network.respond(cp.cpId, number, extra);
      out.push({ cpId: cp.cpId, number, status, body });
    }
  }
  process.stdout.write(JSON.stringify(out));
} else if (mode === 'scenarios') {
  const { scenarios } = JSON.parse(readFileSync(extra, 'utf8'));
  const network = new Network(fixture);
  const clients = new Map();
  const out = [];
  for (const sc of scenarios) {
    if (sc.before && sc.before.port) {
      const p = sc.before.port;
      network.port(p.number, p.fromCpId, p.toCpId);
    }
    if (!clients.has(sc.callerCp)) {
      clients.set(sc.callerCp, new DiscoveryClient({ cpId: sc.callerCp, numberingList: network.numberingList, transport: networkTransport(network) }));
    }
    const events = [];
    const result = await clients.get(sc.callerCp).discover(sc.number, { onEvent: (e) => { events.push(e.type); } });
    out.push({ id: sc.id, result, events });
  }
  process.stdout.write(JSON.stringify(out));
} else {
  console.error('usage: reference-runner.mjs respond|scenarios <fixture> <arg>');
  process.exit(2);
}
