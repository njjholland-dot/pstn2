import { DiscoveryCache, DEFAULT_TTL_SECONDS } from '../../src';

const bravo = { cpId: 'CP1-UK-0102', cpName: 'Bravo Networks', url: 'https://bravo.example' };
const charlie = { cpId: 'CP1-UK-0103', cpName: 'Charlie Comms', url: 'https://charlie.example' };

describe('DiscoveryCache', () => {
  it('stores per number with the response TTL and expires entries', () => {
    let now = 0;
    const cache = new DiscoveryCache({ now: () => now });
    cache.set('+441134960456', bravo, true, 60);
    expect(cache.get('+441134960456')).toEqual({ holder: bravo, ported: true, expiresAt: 60_000 });
    now = 59_999;
    expect(cache.get('441134960456')).toBeDefined(); // + optional
    now = 60_000;
    expect(cache.get('+441134960456')).toBeUndefined();
    expect(cache.size).toBe(0); // expired entry swept
  });

  it('defaults the TTL to 86400 s', () => {
    const cache = new DiscoveryCache({ now: () => 0 });
    expect(DEFAULT_TTL_SECONDS).toBe(86400);
    expect(cache.set('+441614960123', bravo, false).expiresAt).toBe(86_400_000);
  });

  it('never applies a port to a whole block', () => {
    const cache = new DiscoveryCache();
    cache.set('+441134960456', bravo, true);
    expect(cache.get('+441134960457')).toBeUndefined();
    expect(cache.get('+441134960789')).toBeUndefined();
  });

  it('purges, clears and lists entries', () => {
    const cache = new DiscoveryCache();
    cache.set('+441134960456', bravo, true);
    cache.set('+441134960789', charlie, false);
    expect(cache.entries().map((e) => e.number).sort()).toEqual(['+441134960456', '+441134960789']);
    expect(cache.purge('+441134960456')).toBe(true);
    expect(cache.purge('+441134960456')).toBe(false);
    expect(cache.get('+441134960456')).toBeUndefined();
    expect(cache.get('+441134960789')!.holder).toEqual(charlie);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
