package pstn2

import (
	"sort"
	"sync"
	"time"
)

// CacheEntry is a cached number → holder hint (§9.4).
type CacheEntry struct {
	Number    string    `json:"number"`
	Holder    CpRef     `json:"holder"`
	Ported    bool      `json:"ported"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// DiscoveryCache maps numbers (never blocks) to their last known holder.
// Entries are hints, not authority: a stale entry costs one extra query.
// It is safe for concurrent use.
type DiscoveryCache struct {
	mu      sync.Mutex
	now     func() time.Time
	entries map[string]CacheEntry
}

// NewDiscoveryCache returns an empty cache. now may be nil (time.Now).
func NewDiscoveryCache(now func() time.Time) *DiscoveryCache {
	if now == nil {
		now = time.Now
	}
	return &DiscoveryCache{now: now, entries: map[string]CacheEntry{}}
}

// Get returns the unexpired entry for number. An expired entry is removed.
func (c *DiscoveryCache) Get(number string) (CacheEntry, bool) {
	n := E164(number)
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[n]
	if !ok {
		return CacheEntry{}, false
	}
	if !e.ExpiresAt.After(c.now()) {
		delete(c.entries, n)
		return CacheEntry{}, false
	}
	return e, true
}

// Peek returns the entry for number even if expired, without removing it.
func (c *DiscoveryCache) Peek(number string) (CacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[E164(number)]
	return e, ok
}

// Set stores number → holder for ttl seconds (DefaultTTL when ttl <= 0).
func (c *DiscoveryCache) Set(number string, holder CpRef, ported bool, ttl int) CacheEntry {
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	n := E164(number)
	c.mu.Lock()
	defer c.mu.Unlock()
	e := CacheEntry{Number: n, Holder: holder, Ported: ported, ExpiresAt: c.now().Add(time.Duration(ttl) * time.Second)}
	c.entries[n] = e
	return e
}

// Purge removes the entry for number and reports whether one existed.
func (c *DiscoveryCache) Purge(number string) bool {
	n := E164(number)
	c.mu.Lock()
	defer c.mu.Unlock()
	_, ok := c.entries[n]
	delete(c.entries, n)
	return ok
}

// Clear removes every entry.
func (c *DiscoveryCache) Clear() {
	c.mu.Lock()
	c.entries = map[string]CacheEntry{}
	c.mu.Unlock()
}

// Len returns the number of entries (including expired ones not yet removed).
func (c *DiscoveryCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// Entries returns all entries sorted by number.
func (c *DiscoveryCache) Entries() []CacheEntry {
	c.mu.Lock()
	out := make([]CacheEntry, 0, len(c.entries))
	for _, e := range c.entries {
		out = append(out, e)
	}
	c.mu.Unlock()
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out
}
