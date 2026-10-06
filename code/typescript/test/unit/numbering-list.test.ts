import http from 'node:http';
import { AddressInfo } from 'node:net';
import { NumberingList, findBlock, NumberingListDocument, USER_AGENT, HttpClient } from '../../src';
import { loadFixture, HARNESS_FIXTURE } from '../helpers/env';

const doc: NumberingListDocument = {
  listVersion: 'v1',
  blocks: [
    { prefix: '44161', numberLength: 12, status: 'Allocated', cpId: 'CP1-UK-0001', cpName: 'Wide', rangeHolderUrl: 'https://wide.example' },
    { prefix: '441614960', numberLength: 12, status: 'Allocated', cpId: 'CP1-UK-0002', cpName: 'Narrow', rangeHolderUrl: 'https://narrow.example' },
    { prefix: '4416149601', numberLength: 12, status: 'Allocated', cpId: 'CP1-UK-0003', cpName: 'Narrower', rangeHolderUrl: '' },
    { prefix: '447700', numberLength: 13, status: 'Allocated', cpId: 'CP1-UK-0004', cpName: 'Long numbers', rangeHolderUrl: 'https://long.example' },
  ],
};

describe('NumberingList.findBlock', () => {
  const list = NumberingList.fromObject(doc);

  it('chooses the longest matching prefix', () => {
    expect(list.findBlock('+441614960123')!.cpId).toBe('CP1-UK-0003');
    expect(list.findBlock('+441614960999')!.cpId).toBe('CP1-UK-0002');
    expect(list.findBlock('+441619999999')!.cpId).toBe('CP1-UK-0001');
  });

  it('accepts numbers with or without +', () => {
    expect(list.findBlock('441614960999')!.cpId).toBe('CP1-UK-0002');
  });

  it('requires numberLength to equal the digit count', () => {
    // 12-digit 07700 number does not match the 13-digit block
    expect(list.findBlock('+447700900123')).toBeNull();
    expect(list.findBlock('+4477009001234')!.cpId).toBe('CP1-UK-0004');
    // too long for the 44161 blocks
    expect(list.findBlock('+4416149601234')).toBeNull();
  });

  it('returns null for unallocated numbers', () => {
    expect(list.findBlock('+441154960555')).toBeNull();
  });

  it('matches the harness fixture as the reference engine does', () => {
    const fx = loadFixture(HARNESS_FIXTURE);
    const blocks = fx.numberingList.blocks as never;
    expect(findBlock(blocks, '+442079460100')!.cpId).toBe('CP1-UK-0101');
    expect(findBlock(blocks, '+441134960456')!.cpId).toBe('CP1-UK-0103');
    expect(findBlock(blocks, '+441174960555')!.rangeHolderUrl).toBe('');
    expect(findBlock(blocks, '+441154960555')).toBeNull();
  });

  it('lists blocks per CP', () => {
    expect(list.blocksFor('CP1-UK-0002').map((b) => b.prefix)).toEqual(['441614960']);
  });
});

describe('NumberingList over HTTP (ETag / If-None-Match)', () => {
  let server: http.Server;
  let url: string;
  const seen: Array<{ inm?: string; ua?: string; ct?: string }> = [];
  let version = 1;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ inm: req.headers['if-none-match'] as string, ua: req.headers['user-agent'], ct: req.headers['content-type'] });
      const etag = `"v${version}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304);
        res.end();
        return;
      }
      res.writeHead(200, { ETag: etag, 'Content-Type': 'application/octet-stream' });
      res.end(JSON.stringify({ ...doc, listVersion: `v${version}` }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/numbering-list.json`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    seen.length = 0;
  });

  it('loads, then revalidates with If-None-Match and accepts 304', async () => {
    const list = await NumberingList.load(url, { http: new HttpClient() });
    expect(list.listVersion).toBe('v1');
    expect(list.etag).toBe('"v1"');
    expect(await list.load()).toBe('not-modified');
    expect(seen[0].inm).toBeUndefined();
    expect(seen[1].inm).toBe('"v1"');
    expect(seen[0].ua).toBe(USER_AGENT);
    expect(seen[0].ct).toBeUndefined(); // GET without body → no Content-Type
    expect(list.listVersion).toBe('v1');

    version = 2;
    expect(await list.load()).toBe('updated');
    expect(list.listVersion).toBe('v2');
    expect(list.etag).toBe('"v2"');
    version = 1;
  });

  it('refreshes only after refreshSeconds', async () => {
    let now = 1_000_000;
    const list = NumberingList.fromUrl(url, { refreshSeconds: 60, now: () => now });
    expect(list.isStale).toBe(true);
    await list.ensureLoaded();
    expect(seen.length).toBe(1);
    await list.ensureLoaded();
    await list.refresh();
    expect(seen.length).toBe(1);
    now += 61_000;
    expect(list.isStale).toBe(true);
    await list.ensureLoaded();
    expect(seen.length).toBe(2);
    expect(seen[1].inm).toBe('"v1"');
    expect(list.isStale).toBe(false);
  });

  it('keeps the cached copy when a refresh fails', async () => {
    let now = 0;
    const list = NumberingList.fromUrl(url, { refreshSeconds: 1, now: () => now });
    await list.ensureLoaded();
    const broken = NumberingList.fromUrl('http://127.0.0.1:1/none.json', { http: new HttpClient({ retries: 0, timeout: 500 }) });
    await expect(broken.ensureLoaded()).rejects.toThrow();
    now += 5000;
    await list.ensureLoaded();
    expect(list.blocks.length).toBe(4);
  });
});
