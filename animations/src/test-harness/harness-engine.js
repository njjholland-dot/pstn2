// PSTN2 Number Discovery — reference engine (protocol v1.1, SPECIFICATION.md §9).
//
// One ES module, three uses:
//   • the in-browser test harness (animations/src/test-harness/)
//   • the local mock network used by the SDK conformance tests
//     (test-environment/mock-network/server.mjs)
//   • the harness engine unit tests (test-environment/conformance/engine.test.mjs)
//
// It is transport-agnostic: Range Holder responses are produced by `Network.respond()`,
// and `DiscoveryClient` sends queries through whatever `transport` it is given
// (an in-page simulated bus, or real HTTP).

export const PROTOCOL_VERSION = '1.1';

export const digitsOf = (number) => String(number).replace(/^\+/, '').replace(/\D/g, '');
export const e164 = (number) => '+' + digitsOf(number);

/** Longest-prefix match of a number against a numbering list (§9.1). */
export function findBlock(numberingList, number) {
    const digits = digitsOf(number);
    let best = null;
    for (const block of numberingList.blocks) {
        if (block.numberLength && block.numberLength !== digits.length) continue;
        if (!digits.startsWith(block.prefix)) continue;
        if (!best || block.prefix.length > best.prefix.length) best = block;
    }
    return best;
}

/** UK national display form for a +44 number, e.g. +441614960123 → 0161 496 0123. */
export function displayNumber(number) {
    const d = digitsOf(number);
    if (!d.startsWith('44')) return '+' + d;
    const n = '0' + d.slice(2);
    if (/^02\d/.test(n)) return `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}`;
    if (/^07/.test(n)) return `${n.slice(0, 5)} ${n.slice(5)}`;
    if (/^01\d1/.test(n) || /^011/.test(n)) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
    return `${n.slice(0, 5)} ${n.slice(5)}`;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * The network of CP number databases. Each CP knows only its own data:
 * its allocated ranges, numbers in service, numbers ported in, and (as Range Holder)
 * where its ported-out numbers went.
 */
export class Network {
    constructor(fixture) {
        this.fixture = clone(fixture);
        this.numberingList = this.fixture.numberingList;
        this.defaults = { ttl: 86400, hopLimit: 5, ...(this.fixture.defaults || {}) };
        this.cps = new Map(this.fixture.cps.map((cp) => [cp.cpId, cp]));
        for (const cp of this.cps.values()) {
            cp.portedIn ||= [];
            cp.portedOut ||= [];
            cp.inService ||= [];
            cp.previouslyHeld ||= [];
        }
    }

    cp(cpId) { return this.cps.get(cpId); }
    cpByUrl(url) { return [...this.cps.values()].find((cp) => cp.url === url.replace(/\/$/, '')); }
    ref(cpId) {
        const cp = this.cp(cpId);
        return { cpId: cp.cpId, cpName: cp.cpName, url: cp.url };
    }

    /** The CP named against the number's block in the numbering list. */
    rangeHolderOf(number) {
        const block = findBlock(this.numberingList, number);
        return block ? this.cp(block.cpId) || null : null;
    }

    isRangeHolder(cp, number) {
        const digits = digitsOf(number);
        return cp.ranges.some((prefix) => digits.startsWith(prefix));
    }

    /** Which CP serves the number right now (ground truth, for tests and display). */
    currentHolder(number) {
        const n = e164(number);
        for (const cp of this.cps.values()) {
            if (cp.portedIn.some((p) => p.number === n)) return cp;
        }
        const rh = this.rangeHolderOf(n);
        if (rh && rh.inService.includes(n)) return rh;
        return null;
    }

    /**
     * A CP's answer to GET {url}/pstn2/v1/numbers/{digits} (§9.2).
     * Returns { status, body } exactly as it would go on the wire (minus signature).
     */
    respond(cpId, number, issued = new Date().toISOString()) {
        const cp = this.cp(cpId);
        const n = e164(number);
        const base = { version: PROTOCOL_VERSION, number: n };
        const ttl = this.defaults.ttl;
        const tail = { issued };

        if (this.isRangeHolder(cp, n)) {
            const out = cp.portedOut.find((p) => p.number === n);
            if (out) {
                return { status: 200, body: { ...base, result: 'redirect', portedTo: this.ref(out.toCpId), cache: { ttl }, ...tail } };
            }
            if (cp.inService.includes(n)) {
                return { status: 200, body: { ...base, result: 'held', holder: this.ref(cp.cpId), ported: false, cache: { ttl }, ...tail } };
            }
            return { status: 404, body: { result: 'unknown', number: n } };
        }
        if (cp.portedIn.some((p) => p.number === n)) {
            return { status: 200, body: { ...base, result: 'held', holder: this.ref(cp.cpId), ported: true, cache: { ttl }, ...tail } };
        }
        if (cp.previouslyHeld.includes(n) || this.rangeHolderOf(n)) {
            return { status: 200, body: { ...base, result: 'not_held', cache: { invalidate: true, scope: 'number' }, ...tail } };
        }
        return { status: 404, body: { result: 'unknown', number: n } };
    }

    /**
     * Port a number from one CP to another, updating only the databases a real
     * port touches: the losing CP, the gaining CP, and the Range Holder's record.
     */
    port(number, fromCpId, toCpId) {
        const n = e164(number);
        const from = this.cp(fromCpId);
        const to = this.cp(toCpId);
        const rh = this.rangeHolderOf(n);
        if (!from || !to || !rh) throw new Error(`cannot port ${n}`);

        from.inService = from.inService.filter((x) => x !== n);
        from.portedIn = from.portedIn.filter((p) => p.number !== n);
        if (from !== rh && !from.previouslyHeld.includes(n)) from.previouslyHeld.push(n);

        if (to === rh) {
            rh.portedOut = rh.portedOut.filter((p) => p.number !== n);
            if (!rh.inService.includes(n)) rh.inService.push(n);
        } else {
            to.portedIn.push({ number: n, fromCpId });
            to.previouslyHeld = to.previouslyHeld.filter((x) => x !== n);
            const rec = rh.portedOut.find((p) => p.number === n);
            if (rec) rec.toCpId = toCpId;
            else rh.portedOut.push({ number: n, toCpId });
            rh.inService = rh.inService.filter((x) => x !== n);
        }
    }
}

/**
 * A CP's discovery client (§9.3): cache → numbering list → Range Holder → redirect → cache.
 *
 * transport(url, number) must resolve to { status, body }.
 * onEvent(event) may return a promise; the client waits for it, which lets the harness
 * pace the animation to the protocol.
 */
export class DiscoveryClient {
    constructor({ cpId, numberingList, transport, hopLimit = 5, defaultTtl = 86400, now = () => Date.now() }) {
        this.cpId = cpId;
        this.numberingList = numberingList;
        this.transport = transport;
        this.hopLimit = hopLimit;
        this.defaultTtl = defaultTtl;
        this.now = now;
        this.cache = new Map(); // e164 → { holder, ported, expires }
    }

    cacheEntries() {
        return [...this.cache.entries()].map(([number, e]) => ({ number, ...e }));
    }

    purge(number) { this.cache.delete(e164(number)); }

    async discover(number, { onEvent = () => {} } = {}) {
        const n = e164(number);
        const hops = [];
        const visited = new Set();
        let invalidated = false;
        let fromCache = false;
        const emit = async (type, data = {}) => { await onEvent({ type, number: n, ...data }); };
        const finish = async (result) => {
            const out = { number: n, hops, invalidated, fromCache, ...result };
            await emit('result', { result: out });
            return out;
        };

        let target = null;
        const cached = this.cache.get(n);
        if (cached && cached.expires > this.now()) {
            await emit('cache-hit', { entry: { number: n, ...cached } });
            target = cached.holder;
            fromCache = true;
        } else {
            if (cached) this.cache.delete(n);
            await emit('cache-miss');
        }

        while (true) {
            if (!target) {
                const block = findBlock(this.numberingList, n);
                await emit('list-lookup', { block });
                if (!block) return finish({ result: 'unallocated' });
                if (!block.rangeHolderUrl) return finish({ result: 'not_participating', rangeHolder: { cpId: block.cpId, cpName: block.cpName } });
                target = { cpId: block.cpId, cpName: block.cpName, url: block.rangeHolderUrl };
                fromCache = false;
            }

            if (hops.length >= this.hopLimit) return finish({ result: 'error', error: 'hop_limit_exceeded' });
            if (visited.has(target.cpId)) return finish({ result: 'error', error: 'loop_detected' });
            visited.add(target.cpId);
            hops.push(target.cpId);

            const url = `${target.url.replace(/\/$/, '')}/pstn2/v1/numbers/${digitsOf(n)}`;
            await emit('query', { to: target, url });
            let res;
            try {
                res = await this.transport(target.url, n);
            } catch (err) {
                await emit('response', { from: target, status: 0, body: null, error: String(err) });
                return finish({ result: 'error', error: 'timeout' });
            }
            await emit('response', { from: target, status: res.status, body: res.body });

            if (res.status === 404) return finish({ result: 'unknown' });
            const body = res.body || {};

            if (body.cache && body.cache.invalidate) {
                this.cache.delete(n);
                invalidated = true;
                await emit('cache-purge', { reason: body.result, from: target });
            }

            if (body.result === 'held') {
                const ttl = (body.cache && body.cache.ttl) || this.defaultTtl;
                const entry = { holder: body.holder, ported: !!body.ported, expires: this.now() + ttl * 1000 };
                this.cache.set(n, entry);
                await emit('cache-store', { entry: { number: n, ...entry } });
                return finish({ result: 'held', holder: body.holder, ported: !!body.ported });
            }
            if (body.result === 'redirect') {
                await emit('redirect', { from: target, to: body.portedTo });
                target = body.portedTo;
                continue;
            }
            if (body.result === 'not_held') {
                target = null; // restart from the numbering list (Range Holder is the authority)
                visited.clear();
                continue;
            }
            return finish({ result: 'error', error: 'invalid_response' });
        }
    }
}

/** Convenience: an in-memory transport over a Network, with optional simulated latency. */
export function networkTransport(network, { latencyMs = 0 } = {}) {
    return async (url, number) => {
        const cp = network.cpByUrl(url);
        if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
        if (!cp) throw new Error(`no CP at ${url}`);
        return network.respond(cp.cpId, number);
    };
}
