package pstn2

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var testBlocks = []NumberingBlock{
	{Prefix: "441614960", NumberLength: 12, CPID: "CP1-UK-0102", CPName: "Bravo", RangeHolderURL: "https://bravo.example"},
	{Prefix: "4416149609", NumberLength: 12, CPID: "CP1-UK-0105", CPName: "Echo", RangeHolderURL: "https://echo.example"},
	{Prefix: "44161", NumberLength: 12, CPID: "CP1-UK-0106", CPName: "Wide"},
	{Prefix: "4477009000", NumberLength: 12, CPID: "CP1-UK-9001", RangeHolderURL: "https://a.example"},
	{Prefix: "4480", CPID: "CP1-UK-0107"}, // no numberLength: any length
}

func TestFindBlockLongestPrefix(t *testing.T) {
	cases := []struct{ number, want string }{
		{"+441614960123", "CP1-UK-0102"},
		{"441614960123", "CP1-UK-0102"},
		{"+44 161 496 0123", "CP1-UK-0102"},
		{"+441614960999", "CP1-UK-0105"}, // longer prefix wins
		{"+441619990000", "CP1-UK-0106"}, // only the short prefix matches
		{"+447700900001", "CP1-UK-9001"},
		{"+4480123", "CP1-UK-0107"},
		{"+448012345678901", "CP1-UK-0107"},
		{"+44161496012", ""},   // 11 digits: numberLength mismatch
		{"+4416149601234", ""}, // 13 digits
		{"+441154960555", ""},  // no block
		{"", ""},
	}
	for _, c := range cases {
		b := FindBlock(testBlocks, c.number)
		got := ""
		if b != nil {
			got = b.CPID
		}
		if got != c.want {
			t.Errorf("FindBlock(%q) = %q, want %q", c.number, got, c.want)
		}
	}
	l := NewNumberingList(NumberingListData{ListVersion: "x", Blocks: testBlocks})
	if b := l.FindBlock("+441614960123"); b == nil || b.CPID != "CP1-UK-0102" || !b.Participating() {
		t.Fatalf("list FindBlock = %+v", b)
	}
	if b := l.FindBlock("+441619990000"); b == nil || b.Participating() {
		t.Fatalf("non-participating block = %+v", b)
	}
	// The returned block is a copy.
	b := l.FindBlock("+441614960123")
	b.CPID = "changed"
	if l.FindBlock("+441614960123").CPID != "CP1-UK-0102" {
		t.Fatal("FindBlock leaked internal state")
	}
}

func TestNumberingListETag(t *testing.T) {
	var gets, notModified int32
	var lastUA, lastVersion string
	var mu sync.Mutex
	version := "v1"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&gets, 1)
		mu.Lock()
		lastUA, lastVersion = r.Header.Get("User-Agent"), r.Header.Get("X-PSTN2-Version")
		etag := `"` + version + `"`
		mu.Unlock()
		if r.Header.Get("Content-Type") != "" {
			t.Errorf("GET sent Content-Type %q", r.Header.Get("Content-Type"))
		}
		if r.Header.Get("If-None-Match") == etag {
			atomic.AddInt32(&notModified, 1)
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", etag)
		w.Header().Set("Content-Type", "application/octet-stream") // JSON accepted regardless
		_ = json.NewEncoder(w).Encode(NumberingListData{ListVersion: version, Blocks: testBlocks[:1]})
	}))
	defer srv.Close()

	now := time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC)
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	advance := func(d time.Duration) { mu.Lock(); now = now.Add(d); mu.Unlock() }

	ctx := context.Background()
	l := NewNumberingListFromURL(srv.URL, NumberingListOptions{Now: clock})
	if l.Loaded() {
		t.Fatal("URL list must load lazily")
	}
	if err := l.EnsureFresh(ctx); err != nil {
		t.Fatal(err)
	}
	if l.Data().ListVersion != "v1" || l.ETag() != `"v1"` {
		t.Fatalf("data = %+v etag %q", l.Data(), l.ETag())
	}
	if lastUA != UserAgent || lastVersion != "1.1" {
		t.Fatalf("headers UA=%q version=%q", lastUA, lastVersion)
	}
	// Within the refresh interval: no request.
	advance(time.Hour)
	_ = l.EnsureFresh(ctx)
	if gets != 1 {
		t.Fatalf("gets = %d, want 1", gets)
	}
	// After refreshSeconds (default 86400): conditional GET → 304.
	advance(24 * time.Hour)
	if err := l.EnsureFresh(ctx); err != nil {
		t.Fatal(err)
	}
	if gets != 2 || notModified != 1 {
		t.Fatalf("gets=%d 304s=%d, want 2/1", gets, notModified)
	}
	changed, err := l.Refresh(ctx)
	if err != nil || changed {
		t.Fatalf("Refresh = %v, %v; want unchanged", changed, err)
	}
	// New content → 200 with new ETag.
	mu.Lock()
	version = "v2"
	mu.Unlock()
	changed, err = l.Refresh(ctx)
	if err != nil || !changed || l.Data().ListVersion != "v2" || l.ETag() != `"v2"` {
		t.Fatalf("Refresh after change = %v, %v, %+v", changed, err, l.Data())
	}
}

func TestNumberingListKeepsCopyOnFailure(t *testing.T) {
	fail := int32(0)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&fail) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(NumberingListData{ListVersion: "v1", Blocks: testBlocks})
	}))
	defer srv.Close()
	now := time.Now()
	l, err := LoadNumberingList(context.Background(), srv.URL, NumberingListOptions{RefreshInterval: time.Minute, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	atomic.StoreInt32(&fail, 1)
	now = now.Add(2 * time.Minute)
	if err := l.EnsureFresh(context.Background()); err == nil {
		t.Fatal("expected refresh error")
	}
	if l.FindBlock("+441614960123") == nil {
		t.Fatal("old copy must stay in use")
	}
}

func TestLoadNumberingListErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html>not json</html>"))
	}))
	defer srv.Close()
	_, err := LoadNumberingList(context.Background(), srv.URL, NumberingListOptions{})
	if ErrorCode(err) != CodeInvalidResponse {
		t.Fatalf("err = %v", err)
	}
}

func TestDisplayNumberAndDigits(t *testing.T) {
	cases := map[string]string{
		"+442079460100": "020 7946 0100",
		"+441614960123": "0161 496 0123",
		"+441134960456": "0113 496 0456",
		"+447700900001": "07700 900001",
		"+12025550100":  "+12025550100",
	}
	for in, want := range cases {
		if got := DisplayNumber(in); got != want {
			t.Errorf("DisplayNumber(%s) = %q, want %q", in, got, want)
		}
	}
	if Digits("+44 (0161) 496-0123") != "4401614960123" || E164("441614960123") != "+441614960123" {
		t.Fatal("Digits/E164")
	}
}
