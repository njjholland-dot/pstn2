/**
 * Test helpers: repo paths, fixtures, the reference engine runner, and
 * spawning the mock network / static emulator of the dummy test CP.
 */

import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { NumberDatabase, RangeHolderResponder, NumberingList, CpRef } from '../../src';

export const SDK_DIR = resolve(__dirname, '..', '..');
export const REPO = resolve(SDK_DIR, '..', '..');
export const FIXTURES = join(REPO, 'test-environment', 'fixtures');
export const HARNESS_FIXTURE = join(FIXTURES, 'harness-network.json');
export const TESTCP_FIXTURE = join(FIXTURES, 'testcp-network.json');
export const SCENARIOS = join(FIXTURES, 'scenarios.json');

export interface FixtureCp extends NumberDatabase {
  key: string;
}
export interface Fixture {
  numberingList: { listVersion: string; blocks: Array<{ prefix: string; numberLength: number; status: string; cpId: string; cpName?: string; rangeHolderUrl?: string }> };
  cps: FixtureCp[];
  testNumbers?: Array<{ number: string; expect: string }>;
  baseUrl?: string;
}
export interface Scenario {
  id: string;
  title: string;
  callerCp: string;
  number: string;
  before?: { port?: { number: string; fromCpId: string; toCpId: string } };
  expect: { result: string; holderCpId?: string; ported?: boolean; fromCache?: boolean; invalidated?: boolean; hops: string[] };
}

export const loadJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
export const loadFixture = (file: string) => loadJson<Fixture>(file);
export const loadScenarios = () => loadJson<{ scenarios: Scenario[] }>(SCENARIOS).scenarios;

/** Run the reference engine (child process) and parse its JSON output. */
export function runReference<T>(...args: string[]): T {
  const out = execFileSync(process.execPath, [join(__dirname, 'reference-runner.mjs'), ...args], { encoding: 'utf8' });
  return JSON.parse(out) as T;
}

/** In-memory network of RangeHolderResponders built from a fixture (mirrors the reference Network). */
export class MemoryNetwork {
  readonly fixture: Fixture;
  readonly list: NumberingList;
  readonly dbs = new Map<string, FixtureCp>();
  readonly responders = new Map<string, RangeHolderResponder>();

  constructor(fixture: Fixture) {
    this.fixture = JSON.parse(JSON.stringify(fixture));
    this.list = NumberingList.fromObject(this.fixture.numberingList as never);
    for (const cp of this.fixture.cps) {
      cp.inService ||= [];
      cp.portedIn ||= [];
      cp.portedOut ||= [];
      cp.previouslyHeld ||= [];
      this.dbs.set(cp.cpId, cp);
    }
    const resolveRef = (cpId: string): CpRef | undefined => {
      const cp = this.dbs.get(cpId);
      return cp ? { cpId: cp.cpId, cpName: cp.cpName, url: cp.url } : undefined;
    };
    for (const cp of this.dbs.values()) {
      this.responders.set(cp.cpId, new RangeHolderResponder(cp, { resolve: resolveRef, numberingList: this.list }));
    }
  }

  byUrl(url: string): RangeHolderResponder | undefined {
    const u = url.replace(/\/$/, '');
    return [...this.responders.values()].find((r) => r.db.url === u);
  }

  /** Transport for DiscoveryClient. */
  transport = async (cp: CpRef, number: string) => {
    const r = this.byUrl(cp.url);
    if (!r) throw new Error(`no CP at ${cp.url}`);
    return r.respond(number);
  };

  /** Same database updates as the reference Network.port(). */
  port(number: string, fromCpId: string, toCpId: string): void {
    const from = this.dbs.get(fromCpId)!;
    const to = this.dbs.get(toCpId)!;
    const block = this.list.findBlock(number)!;
    const rh = this.dbs.get(block.cpId)!;
    from.inService = from.inService!.filter((x) => x !== number);
    from.portedIn = from.portedIn!.filter((p) => p.number !== number);
    if (from !== rh && !from.previouslyHeld!.includes(number)) from.previouslyHeld!.push(number);
    if (to === rh) {
      rh.portedOut = rh.portedOut!.filter((p) => p.number !== number);
      if (!rh.inService!.includes(number)) rh.inService!.push(number);
    } else {
      to.portedIn!.push({ number, fromCpId });
      to.previouslyHeld = to.previouslyHeld!.filter((x) => x !== number);
      const rec = rh.portedOut!.find((p) => p.number === number);
      if (rec) rec.toCpId = toCpId;
      else rh.portedOut!.push({ number, toCpId });
      rh.inService = rh.inService!.filter((x) => x !== number);
    }
  }
}

export async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

function waitForOutput(child: ChildProcess, pattern: RegExp, timeoutMs = 10000): Promise<void> {
  return new Promise((resolveWait, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`server did not start: ${buf}`)), timeoutMs);
    const onData = (d: Buffer) => {
      buf += d.toString();
      if (pattern.test(buf)) {
        clearTimeout(timer);
        resolveWait();
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (d: Buffer) => (buf += d.toString()));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited (${code}): ${buf}`));
    });
  });
}

export interface RunningServer {
  port: number;
  base: string;
  listUrl: string;
  stop: () => Promise<void>;
}

function stopper(child: ChildProcess, cleanup?: () => void) {
  return () =>
    new Promise<void>((done) => {
      child.removeAllListeners('exit');
      if (child.exitCode !== null) {
        cleanup?.();
        return done();
      }
      child.once('exit', () => {
        cleanup?.();
        done();
      });
      child.kill('SIGTERM');
    });
}

/** Spawn `node test-environment/mock-network/server.mjs --port <free>`. */
export async function startMockNetwork(): Promise<RunningServer & { admin: (path: string, body?: unknown) => Promise<unknown> }> {
  const port = await freePort();
  const child = spawn(process.execPath, [join(REPO, 'test-environment', 'mock-network', 'server.mjs'), '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForOutput(child, /numbering list:/);
  const base = `http://127.0.0.1:${port}`;
  const admin = async (path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method: body === undefined && path === '/admin/log' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'pstn2-test-admin' },
      body: body === undefined ? (path === '/admin/log' ? undefined : '{}') : JSON.stringify(body),
    });
    return res.json();
  };
  return { port, base, listUrl: `${base}/numbering-list.json`, admin, stop: stopper(child) };
}

/** Build the dummy test CP into a temp dir and serve it with the static-host emulator. */
export async function startStaticTestCp(): Promise<RunningServer & { dir: string; keysFile: string }> {
  const port = await freePort();
  const tmp = mkdtempSync(join(tmpdir(), 'pstn2-ts-testcp-'));
  const dir = join(tmp, 'site');
  const keysFile = join(tmp, 'keys.json');
  const base = `http://127.0.0.1:${port}/testcp`;
  execFileSync(process.execPath, [join(REPO, 'tools', 'testcp', 'build.mjs'), '--base', base, '--out', dir], {
    env: { ...process.env, PSTN2_TESTCP_KEYS: keysFile },
    stdio: 'pipe',
  });
  const child = spawn(
    process.execPath,
    [join(REPO, 'test-environment', 'mock-network', 'static-server.mjs'), '--dir', dir, '--mount', '/testcp', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await waitForOutput(child, /static host emulator/);
  return {
    port,
    base,
    dir,
    keysFile,
    listUrl: `${base}/numbering-list.json`,
    stop: stopper(child, () => rmSync(tmp, { recursive: true, force: true })),
  };
}

/** Build the dummy test CP site only (no server). */
export function buildTestCp(base = 'http://127.0.0.1:1/testcp'): { dir: string; keysFile: string; cleanup: () => void } {
  const tmp = mkdtempSync(join(tmpdir(), 'pstn2-ts-build-'));
  const dir = join(tmp, 'site');
  const keysFile = join(tmp, 'keys.json');
  execFileSync(process.execPath, [join(REPO, 'tools', 'testcp', 'build.mjs'), '--base', base, '--out', dir], {
    env: { ...process.env, PSTN2_TESTCP_KEYS: keysFile },
    stdio: 'pipe',
  });
  return { dir, keysFile, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}
