/**
 * PSTN2Client — one object per acting CP.
 *
 * Wires Number Discovery (numbering list + number cache + discovery client)
 * into authentication, routing, emergency and branding: every module finds
 * the subject number's holder with `discover()` and calls
 * `{holder.url}/pstn2/v1/...` there.
 */

import { KeyObject, createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { MessagingClient, HttpClient } from './messaging';
import { AuthenticationModule, VerifyCallParams } from './auth';
import { RoutingModule, RequestRoutingParams } from './routing';
import { EncryptionModule } from './encryption';
import { BrandingModule } from './branding';
import { EmergencyModule, GetLocationParams } from './emergency';
import { NumberingList, DiscoveryCache, DiscoveryClient, DiscoverOptions, KeyStore, rawPublicKey } from './discovery';
import {
  DiscoveryEventHandler,
  DiscoveryResult,
  FetchLike,
  NumberingListDocument,
  PhoneNumber,
  RCPID,
} from './types';
import { ValidationError } from './errors';
import { getLogger, LogLevel } from './utils/logger';
import { networkConfigFromEnv } from './config';

const logger = getLogger();

export interface PSTN2Config {
  /** The acting CP's RCPID. */
  cpId: RCPID;
  cpName?: string;

  /** Numbering list URL (downloaded, cached, refreshed with ETag). */
  numberingListUrl?: string;
  /** …or a numbering list instance / document. */
  numberingList?: NumberingList | NumberingListDocument;
  /** Numbering list refresh interval, seconds (default 86400). */
  listRefreshSeconds?: number;

  /** Ed25519 private key (PEM or KeyObject) for request signatures. A per-process key is generated if omitted. */
  privateKey?: string | KeyObject;

  /** Verify Ed25519 signatures on discovery answers (default false). */
  verifySignatures?: boolean;
  /** Max discovery queries per lookup (default 5). */
  hopLimit?: number;
  /** Number cache TTL when an answer has none (default 86400 s). */
  defaultTtl?: number;
  /** Share a cache between clients. */
  cache?: DiscoveryCache;
  /** Called for every discovery event (cache-hit, query, redirect, …). */
  onDiscoveryEvent?: DiscoveryEventHandler;

  /** Per-request timeout, ms (default 2000). */
  timeout?: number;
  /** Retries for 503/504/network errors (default 3). */
  retries?: number;
  /** Inject a fetch implementation. */
  fetch?: FetchLike;

  logLevel?: LogLevel;
}

export class PSTN2Client {
  readonly config: PSTN2Config;
  readonly http: HttpClient;
  readonly numberingList: NumberingList;
  readonly cache: DiscoveryCache;
  readonly discovery: DiscoveryClient;
  readonly messaging: MessagingClient;
  readonly auth: AuthenticationModule;
  readonly routing: RoutingModule;
  readonly emergency: EmergencyModule;
  readonly branding: BrandingModule;
  readonly encryption: EncryptionModule;
  /** Raw Ed25519 identity public key (base64), sent in routing requests. */
  readonly publicKey: string;

  constructor(config: PSTN2Config) {
    if (!config.cpId) throw new ValidationError('cpId is required');
    if (!config.numberingList && !config.numberingListUrl) {
      throw new ValidationError('numberingListUrl or numberingList is required');
    }
    if (config.logLevel) getLogger(config.logLevel);
    this.config = config;

    this.http = new HttpClient({ cpId: config.cpId, timeout: config.timeout, retries: config.retries, fetch: config.fetch });

    if (config.numberingList instanceof NumberingList) this.numberingList = config.numberingList;
    else if (config.numberingList) this.numberingList = NumberingList.fromObject(config.numberingList);
    else this.numberingList = NumberingList.fromUrl(config.numberingListUrl!, { http: this.http, refreshSeconds: config.listRefreshSeconds });

    this.cache = config.cache || new DiscoveryCache();
    this.discovery = new DiscoveryClient({
      cpId: config.cpId,
      numberingList: this.numberingList,
      cache: this.cache,
      http: this.http,
      hopLimit: config.hopLimit,
      defaultTtl: config.defaultTtl,
      verifySignatures: config.verifySignatures,
      keyStore: new KeyStore(this.http),
      onEvent: config.onDiscoveryEvent,
    });

    const privateKey: KeyObject =
      typeof config.privateKey === 'string'
        ? createPrivateKey(config.privateKey)
        : config.privateKey || generateKeyPairSync('ed25519').privateKey;
    this.publicKey = rawPublicKey(privateKey);

    this.messaging = new MessagingClient({ cpId: config.cpId, http: this.http, discovery: this.discovery, privateKey });
    this.auth = new AuthenticationModule(this.messaging);
    this.routing = new RoutingModule(this.messaging, this.publicKey);
    this.emergency = new EmergencyModule(this.messaging);
    this.branding = new BrandingModule(this.messaging);
    this.encryption = new EncryptionModule();

    logger.info('PSTN2 client initialised', { cpId: config.cpId, numberingList: config.numberingListUrl || 'in-memory' });
  }

  /**
   * Build a client from PSTN2_NETWORK / PSTN2_NUMBERING_LIST_URL / PSTN2_CP_ID /
   * PSTN2_VERIFY_SIGNATURES (see config.ts). `overrides` win.
   */
  static fromEnv(overrides: Partial<PSTN2Config> = {}, env: Record<string, string | undefined> = process.env): PSTN2Client {
    const e = networkConfigFromEnv(env, { cpId: overrides.cpId });
    return new PSTN2Client({
      numberingListUrl: e.numberingListUrl,
      verifySignatures: e.verifySignatures,
      ...overrides,
      cpId: env.PSTN2_CP_ID || overrides.cpId || e.cpId,
    });
  }

  /** Load the numbering list now (otherwise it loads on first discovery). */
  async start(): Promise<this> {
    await this.numberingList.ensureLoaded();
    return this;
  }

  /** Who holds this number? (§9.3) */
  discover(number: PhoneNumber, options?: DiscoverOptions): Promise<DiscoveryResult> {
    return this.discovery.discover(number, options);
  }

  /** Verify an inbound call's caller ID (Direct Query to the caller ID's holder). */
  verifyCall(params: VerifyCallParams) {
    return this.auth.verifyCall(params);
  }

  /** Request direct routing to a destination number. */
  requestRouting(params: RequestRoutingParams) {
    return this.routing.requestRouting(params);
  }

  /** Emergency location (PSAP use). */
  getEmergencyLocation(params: GetLocationParams) {
    return this.emergency.getLocation(params);
  }

  generateCallReference(): string {
    return this.messaging.generateCallReference();
  }

  getHealth() {
    return {
      cpId: this.config.cpId,
      numberingList: {
        url: this.numberingList.url,
        loaded: this.numberingList.isLoaded,
        listVersion: this.numberingList.listVersion,
        blocks: this.numberingList.blocks.length,
        etag: this.numberingList.etag,
      },
      discoveryCache: { entries: this.cache.size },
      verifySignatures: this.discovery.verifySignatures,
      encryption: this.encryption.getEncryptionInfo(),
    };
  }

  /** Release caches and ephemeral key material. Nothing keeps the process alive. */
  async close(): Promise<void> {
    logger.info('Closing PSTN2 client', { cpId: this.config.cpId });
    if (!this.config.cache) this.cache.clear();
    this.discovery.keyStore.clear();
    this.branding.clearCache();
    this.encryption.clearAllEphemeralKeys();
  }
}
