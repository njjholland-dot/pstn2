package pstn2

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestDiscoveryCacheTTLAndPurge(t *testing.T) {
	now := time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC)
	c := NewDiscoveryCache(func() time.Time { return now })
	bravo := CpRef{CPID: "CP1-UK-0102", CPName: "Bravo", URL: "https://bravo.example"}

	e := c.Set("441134960456", bravo, true, 60)
	if e.Number != "+441134960456" || !e.ExpiresAt.Equal(now.Add(time.Minute)) {
		t.Fatalf("Set = %+v", e)
	}
	if got, ok := c.Get("+441134960456"); !ok || got.Holder != bravo || !got.Ported {
		t.Fatalf("Get = %+v %v", got, ok)
	}
	// Number-level only: a neighbour in the same block is not affected.
	if _, ok := c.Get("+441134960457"); ok {
		t.Fatal("cache must never apply an entry to a whole block")
	}
	now = now.Add(59 * time.Second)
	if _, ok := c.Get("+441134960456"); !ok {
		t.Fatal("entry expired early")
	}
	now = now.Add(time.Second) // expires at exactly ttl
	if _, ok := c.Get("+441134960456"); ok {
		t.Fatal("entry should have expired")
	}
	if c.Len() != 0 {
		t.Fatal("expired entry not removed on Get")
	}

	// Default TTL.
	e = c.Set("+441614960123", bravo, false, 0)
	if !e.ExpiresAt.Equal(now.Add(DefaultTTL * time.Second)) {
		t.Fatalf("default ttl: %v", e.ExpiresAt)
	}
	c.Set("+442079460100", CpRef{CPID: "CP1-UK-0101"}, false, 10)
	entries := c.Entries()
	if len(entries) != 2 || entries[0].Number != "+441614960123" || entries[1].Number != "+442079460100" {
		t.Fatalf("Entries = %+v", entries)
	}
	if !c.Purge("441614960123") || c.Purge("+441614960123") {
		t.Fatal("Purge")
	}
	c.Clear()
	if c.Len() != 0 {
		t.Fatal("Clear")
	}
}

func TestDiscoveryCacheConcurrent(t *testing.T) {
	c := NewDiscoveryCache(nil)
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				n := fmt.Sprintf("+4416149%05d", i)
				c.Set(n, CpRef{CPID: fmt.Sprint(g)}, false, 60)
				c.Get(n)
				if i%3 == 0 {
					c.Purge(n)
				}
				_ = c.Entries()
			}
		}(g)
	}
	wg.Wait()
}
