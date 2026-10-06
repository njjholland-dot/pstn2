import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  HttpClient,
  errorFromResponse,
  networkConfigFromEnv,
  LIVE_NUMBERING_LIST_URL,
  PSTN2Client,
  PSTN2Error,
  TimeoutError,
  NetworkError,
  USER_AGENT,
  SDK_VERSION,
  PROTOCOL_VERSION,
} from '../../src';

describe('HttpClient', () => {
  let server: http.Server;
  let base: string;
  const hits = new Map<string, number>();
  const headers: http.IncomingHttpHeaders[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.set(req.url!, (hits.get(req.url!) || 0) + 1);
      headers.push(req.headers);
      const n = hits.get(req.url!)!;
      if (req.url === '/503') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: false, reason: 'capacity_exceeded' }));
      } else if (req.url === '/503-then-ok') {
        res.writeHead(n < 3 ? 503 : 200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } else if (req.url === '/400') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'invalid_request', message: 'bad', timestamp: 'now' } }));
      } else if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('{}');
        }, 400);
      } else if (req.url === '/html') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>Not Found</h1>');
      } else {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(JSON.stringify({ echo: body || null }));
        });
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    hits.clear();
    headers.length = 0;
  });

  const client = new HttpClient({ retryBaseDelay: 1, cpId: 'CP1-UK-0101' });

  it('sends the SDK headers; Content-Type only with a body', async () => {
    const g = await client.get(`${base}/echo`);
    expect(g.data).toEqual({ echo: null }); // octet-stream parsed as JSON
    await client.post(`${base}/echo`, { a: 1 });
    expect(headers[0]['user-agent']).toBe(USER_AGENT);
    expect(headers[0]['x-pstn2-version']).toBe('1.1');
    expect(headers[0]['x-pstn2-cp-id']).toBe('CP1-UK-0101');
    expect(headers[0]['content-type']).toBeUndefined();
    expect(headers[1]['content-type']).toMatch(/^application\/json/);
  });

  it('retries 503 up to 3 times then returns the response', async () => {
    const r = await client.get(`${base}/503`);
    expect(r.status).toBe(503);
    expect(hits.get('/503')).toBe(4);
    const ok = await client.get(`${base}/503-then-ok`);
    expect(ok.status).toBe(200);
    expect(hits.get('/503-then-ok')).toBe(3);
  });

  it('does not retry 400 and maps the spec ErrorResponse', async () => {
    const r = await client.get(`${base}/400`);
    expect(hits.get('/400')).toBe(1);
    const err = errorFromResponse(r, '/400');
    expect(err).toBeInstanceOf(PSTN2Error);
    expect(err.code).toBe('invalid_request');
    expect(err.message).toBe('bad');
    expect(err.toJSON()).toMatchObject({ error: { code: 'invalid_request', message: 'bad' } });
  });

  it('returns null data for non-JSON bodies', async () => {
    const r = await client.get(`${base}/html`);
    expect(r.status).toBe(404);
    expect(r.data).toBeNull();
    expect(r.text).toContain('Not Found');
  });

  it('times out (with retries) and reports network errors', async () => {
    const c = new HttpClient({ timeout: 100, retries: 1, retryBaseDelay: 1 });
    await expect(c.get(`${base}/slow`)).rejects.toBeInstanceOf(TimeoutError);
    expect(hits.get('/slow')).toBe(2);
    await expect(new HttpClient({ retries: 0 }).get('http://127.0.0.1:1/')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('environment config', () => {
  it('defaults to the local mock network', () => {
    expect(networkConfigFromEnv({})).toMatchObject({
      network: 'local',
      numberingListUrl: 'http://127.0.0.1:47901/numbering-list.json',
      cpId: 'CP1-UK-0101',
      verifySignatures: false,
    });
    expect(networkConfigFromEnv({ PSTN2_MOCK_PORT: '5000' }, { cpId: 'CP1-UK-0103' })).toMatchObject({
      numberingListUrl: 'http://127.0.0.1:5000/numbering-list.json',
      cpId: 'CP1-UK-0103',
    });
  });

  it('live mode uses the dummy test CP and verifies signatures', () => {
    expect(networkConfigFromEnv({ PSTN2_NETWORK: 'live' })).toMatchObject({
      network: 'live',
      numberingListUrl: LIVE_NUMBERING_LIST_URL,
      cpId: 'CP1-UK-TEST-CLIENT',
      verifySignatures: true,
    });
  });

  it('honours overrides', () => {
    const e = networkConfigFromEnv({ PSTN2_NETWORK: 'live', PSTN2_NUMBERING_LIST_URL: 'http://x/l.json', PSTN2_CP_ID: 'CP1-UK-0102', PSTN2_VERIFY_SIGNATURES: '0' });
    expect(e).toMatchObject({ numberingListUrl: 'http://x/l.json', cpId: 'CP1-UK-0102', verifySignatures: false, verifySignaturesExplicit: true, numberingListUrlOverridden: true });
  });

  it('PSTN2Client.fromEnv and version constants', () => {
    const c = PSTN2Client.fromEnv({}, { PSTN2_NUMBERING_LIST_URL: 'http://127.0.0.1:1/l.json', PSTN2_CP_ID: 'CP1-UK-0102' });
    expect(c.config.cpId).toBe('CP1-UK-0102');
    expect(c.numberingList.url).toBe('http://127.0.0.1:1/l.json');
    expect(SDK_VERSION).toBe('1.1.0');
    expect(PROTOCOL_VERSION).toBe('1.1');
    expect(Buffer.from(c.publicKey, 'base64')).toHaveLength(32);
  });
});
