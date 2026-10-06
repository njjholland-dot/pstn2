/**
 * Server-side Number Discovery: build a CP's answer to
 * `GET {url}/pstn2/v1/numbers/{digits}` (SPECIFICATION.md §9.2) from its
 * own number database. Matches `Network.respond()` in the reference engine.
 *
 *   Range Holder for the number:
 *     ported out        → 200 redirect {portedTo}
 *     in service        → 200 held {holder: self, ported: false}
 *     otherwise         → 404 unknown
 *   Not the Range Holder:
 *     ported in         → 200 held {holder: self, ported: true}
 *     previously held, or the number is in another participating CP's block
 *                       → 200 not_held + cache.invalidate (scope number)
 *     otherwise         → 404 unknown
 *
 * A CP answers only about its own numbers and reveals only the CpRef of the
 * CP a number was ported to (§9.7).
 */

import { KeyObject } from 'node:crypto';
import { CpRef, DiscoveryResponse, KeySet, RCPID } from '../types';
import { NumberingList } from './numbering-list';
import { signBody, rawPublicKey } from './signatures';
import { digitsOf, toE164 } from '../utils/numbering';
import { PROTOCOL_VERSION } from '../version';

/** A CP's own number database. */
export interface NumberDatabase {
  cpId: RCPID;
  cpName?: string;
  url: string;
  /** Block prefixes this CP is Range Holder for. */
  ranges: string[];
  /** Numbers in service from its own ranges. */
  inService?: string[];
  /** Numbers ported in from other CPs. */
  portedIn?: Array<{ number: string; fromCpId: RCPID }>;
  /** (Range Holder) numbers ported out, and to whom. */
  portedOut?: Array<{ number: string; toCpId: RCPID }>;
  /** Numbers this CP served before they ported away. */
  previouslyHeld?: string[];
}

export interface RangeHolderResponderOptions {
  /** Resolve a cpId to its CpRef (for redirect targets). Return undefined if unknown. */
  resolve: (cpId: RCPID) => CpRef | undefined;
  /**
   * The numbering list. A non-Range-Holder answers not_held (rather than 404)
   * for a number whose block's Range Holder is resolvable — exactly the
   * reference engine's rule. Without a list only `previouslyHeld` gives not_held.
   */
  numberingList?: NumberingList;
  /** cache.ttl in answers (default 86400). */
  ttl?: number;
  /** Sign 200 answers with this Ed25519 key. */
  signer?: { privateKey: KeyObject | string; kid: string };
}

export interface ResponderAnswer {
  status: number;
  body: Record<string, unknown>;
}

export class RangeHolderResponder {
  readonly db: NumberDatabase;
  private readonly options: RangeHolderResponderOptions;

  constructor(db: NumberDatabase, options: RangeHolderResponderOptions) {
    this.db = db;
    this.options = options;
  }

  private self(): CpRef {
    return { cpId: this.db.cpId, cpName: this.db.cpName, url: this.db.url };
  }

  /** Is this CP the Range Holder for `number`? */
  isRangeHolder(number: string): boolean {
    const d = digitsOf(number);
    return this.db.ranges.some((p) => d.startsWith(p));
  }

  private inParticipatingBlock(number: string): boolean {
    const list = this.options.numberingList;
    if (!list) return false;
    const block = list.findBlock(number);
    return !!block && !!this.options.resolve(block.cpId);
  }

  /** The answer to a discovery query for `number`. */
  respond(number: string, issued: string = new Date().toISOString()): ResponderAnswer {
    const n = toE164(number);
    const db = this.db;
    const ttl = this.options.ttl ?? 86400;
    const base = { version: PROTOCOL_VERSION, number: n };
    const unknown: ResponderAnswer = { status: 404, body: { result: 'unknown', number: n } };

    let body: Record<string, unknown> | null = null;
    if (this.isRangeHolder(n)) {
      const out = (db.portedOut || []).find((p) => p.number === n);
      if (out) {
        const to = this.options.resolve(out.toCpId);
        if (!to) return unknown;
        body = { ...base, result: 'redirect', portedTo: { cpId: to.cpId, cpName: to.cpName, url: to.url }, cache: { ttl }, issued };
      } else if ((db.inService || []).includes(n)) {
        body = { ...base, result: 'held', holder: this.self(), ported: false, cache: { ttl }, issued };
      } else {
        return unknown;
      }
    } else if ((db.portedIn || []).some((p) => p.number === n)) {
      body = { ...base, result: 'held', holder: this.self(), ported: true, cache: { ttl }, issued };
    } else if ((db.previouslyHeld || []).includes(n) || this.inParticipatingBlock(n)) {
      body = { ...base, result: 'not_held', cache: { invalidate: true, scope: 'number' }, issued };
    } else {
      return unknown;
    }

    const signer = this.options.signer;
    return { status: 200, body: signer ? signBody(body, signer.privateKey, signer.kid) : body };
  }

  /**
   * Handle a request path: `/…/pstn2/v1/numbers/{digits}` → answer, or
   * `/…/pstn2/v1/keys` → key set. Returns null for other paths.
   */
  handle(path: string): ResponderAnswer | null {
    const m = path.match(/\/pstn2\/v1\/numbers\/(\d{2,15})$/);
    if (m) return this.respond('+' + m[1]);
    if (/\/pstn2\/v1\/keys$/.test(path)) return { status: 200, body: this.keySet() as unknown as Record<string, unknown> };
    return null;
  }

  /** This CP's published key set (empty when unsigned). */
  keySet(): KeySet {
    const s = this.options.signer;
    return {
      cpId: this.db.cpId,
      keys: s ? [{ kid: s.kid, algorithm: 'ed25519', publicKey: rawPublicKey(s.privateKey) }] : [],
    };
  }
}

/** Typed view of a responder answer body. */
export type ResponderBody = Partial<DiscoveryResponse>;
