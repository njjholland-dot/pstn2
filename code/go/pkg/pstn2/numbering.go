package pstn2

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

// NumberingBlock is one block of the regulator numbering list (§9.1).
type NumberingBlock struct {
	Prefix         string `json:"prefix"`
	Display        string `json:"display,omitempty"`
	NumberLength   int    `json:"numberLength"`
	Status         string `json:"status,omitempty"`
	CPID           string `json:"cpId"`
	CPName         string `json:"cpName,omitempty"`
	RangeHolderURL string `json:"rangeHolderUrl,omitempty"` // empty = not participating
}

// Participating reports whether the block's Range Holder has a PSTN2 URL.
func (b NumberingBlock) Participating() bool { return b.RangeHolderURL != "" }

// RangeHolder returns the block's Range Holder as a CpRef.
func (b NumberingBlock) RangeHolder() CpRef {
	return CpRef{CPID: b.CPID, CPName: b.CPName, URL: b.RangeHolderURL}
}

// NumberingListData is the JSON form of the numbering list.
type NumberingListData struct {
	ListVersion string           `json:"listVersion"`
	Publisher   string           `json:"publisher,omitempty"`
	Source      string           `json:"source,omitempty"`
	Blocks      []NumberingBlock `json:"blocks"`
}

// FindBlock returns the block with the longest prefix matching number whose
// numberLength (when set) equals the number's digit count, or nil (§9.1).
func FindBlock(blocks []NumberingBlock, number string) *NumberingBlock {
	digits := Digits(number)
	var best *NumberingBlock
	for i := range blocks {
		b := &blocks[i]
		if b.NumberLength != 0 && b.NumberLength != len(digits) {
			continue
		}
		if !strings.HasPrefix(digits, b.Prefix) {
			continue
		}
		if best == nil || len(b.Prefix) > len(best.Prefix) {
			best = b
		}
	}
	if best == nil {
		return nil
	}
	cp := *best
	return &cp
}

// NumberingListOptions configures a URL-backed NumberingList.
type NumberingListOptions struct {
	HTTP HTTPOptions
	// RefreshInterval is how long a downloaded copy is used before it is
	// revalidated with If-None-Match (default 24h, i.e. refreshSeconds 86400).
	RefreshInterval time.Duration
	// Now overrides the clock (tests).
	Now func() time.Time
}

// NumberingList is a CP's local copy of the regulator numbering list. Load it
// from a URL (fetched lazily, revalidated with ETag/If-None-Match after
// RefreshInterval) or from data. It is safe for concurrent use.
type NumberingList struct {
	url     string
	http    *transport
	refresh time.Duration
	now     func() time.Time

	mu        sync.RWMutex
	data      *NumberingListData
	etag      string
	fetchedAt time.Time

	fetchMu sync.Mutex // serialises downloads
}

// NewNumberingList returns a list backed by in-memory data (never refreshed).
func NewNumberingList(data NumberingListData) *NumberingList {
	d := data
	d.Blocks = append([]NumberingBlock(nil), data.Blocks...)
	return &NumberingList{data: &d, now: time.Now}
}

// NewNumberingListFromURL returns a list that downloads url on first use.
func NewNumberingListFromURL(url string, opts NumberingListOptions) *NumberingList {
	l := &NumberingList{url: url, http: newTransport(opts.HTTP), refresh: opts.RefreshInterval, now: opts.Now}
	if l.refresh <= 0 {
		l.refresh = DefaultRefreshInterval
	}
	if l.now == nil {
		l.now = time.Now
	}
	return l
}

// LoadNumberingList downloads url now and returns the list.
func LoadNumberingList(ctx context.Context, url string, opts NumberingListOptions) (*NumberingList, error) {
	l := NewNumberingListFromURL(url, opts)
	if _, err := l.Refresh(ctx); err != nil {
		return nil, err
	}
	return l, nil
}

// URL returns the source URL ("" for an in-memory list).
func (l *NumberingList) URL() string { return l.url }

// ETag returns the ETag of the current copy.
func (l *NumberingList) ETag() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.etag
}

// Loaded reports whether a copy is held.
func (l *NumberingList) Loaded() bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.data != nil
}

// Data returns a copy of the current list (zero value if not loaded).
func (l *NumberingList) Data() NumberingListData {
	l.mu.RLock()
	defer l.mu.RUnlock()
	if l.data == nil {
		return NumberingListData{}
	}
	d := *l.data
	d.Blocks = append([]NumberingBlock(nil), l.data.Blocks...)
	return d
}

// FindBlock looks number up in the current copy (no network access).
func (l *NumberingList) FindBlock(number string) *NumberingBlock {
	l.mu.RLock()
	defer l.mu.RUnlock()
	if l.data == nil {
		return nil
	}
	return FindBlock(l.data.Blocks, number)
}

// Refresh downloads the list, sending If-None-Match when a copy is held.
// It reports whether the content changed (false on 304 Not Modified).
// In-memory lists return (false, nil).
func (l *NumberingList) Refresh(ctx context.Context) (bool, error) {
	if l.url == "" {
		return false, nil
	}
	l.fetchMu.Lock()
	defer l.fetchMu.Unlock()

	l.mu.RLock()
	etag, have := l.etag, l.data != nil
	l.mu.RUnlock()
	var hdr http.Header
	if have && etag != "" {
		hdr = http.Header{"If-None-Match": []string{etag}}
	}
	res, err := l.http.do(ctx, http.MethodGet, l.url, nil, hdr)
	if err != nil {
		return false, err
	}
	now := l.now()
	if res.Status == http.StatusNotModified && have {
		l.mu.Lock()
		l.fetchedAt = now
		l.mu.Unlock()
		return false, nil
	}
	if res.Status != http.StatusOK {
		return false, errorFromResponse(res, CodeInvalidResponse)
	}
	var data NumberingListData
	if err := decodeJSON(res, &data); err != nil {
		return false, err
	}
	if data.Blocks == nil {
		return false, &Error{Code: CodeInvalidResponse, Message: "numbering list has no blocks", URL: l.url}
	}
	l.mu.Lock()
	l.data, l.etag, l.fetchedAt = &data, res.Header.Get("ETag"), now
	l.mu.Unlock()
	return true, nil
}

// EnsureFresh downloads the list if no copy is held, or revalidates it when it
// is older than the refresh interval. If revalidation fails but a copy is
// held, the copy stays in use and the error is returned for logging only.
func (l *NumberingList) EnsureFresh(ctx context.Context) error {
	if l.url == "" {
		if !l.Loaded() {
			return errors.New("pstn2: numbering list not loaded")
		}
		return nil
	}
	l.mu.RLock()
	have, age := l.data != nil, l.now().Sub(l.fetchedAt)
	l.mu.RUnlock()
	if have && age < l.refresh {
		return nil
	}
	_, err := l.Refresh(ctx)
	return err
}
