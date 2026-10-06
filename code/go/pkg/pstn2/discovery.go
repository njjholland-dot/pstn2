package pstn2

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// Discovery results (§9.3, §10.2).
const (
	ResultHeld             = "held"
	ResultUnknown          = "unknown"
	ResultUnallocated      = "unallocated"
	ResultNotParticipating = "not_participating"
	ResultError            = "error"
)

// Discovery error codes carried in DiscoveryResult.Error.
const (
	DiscoveryHopLimitExceeded = "hop_limit_exceeded"
	DiscoveryLoopDetected     = "loop_detected"
	DiscoveryTimeout          = "timeout"
	DiscoveryInvalidResponse  = "invalid_response"
	DiscoveryInvalidSignature = "invalid_signature"
)

// Discovery event types (same names as the reference engine's onEvent).
const (
	EventCacheHit   = "cache-hit"
	EventCacheMiss  = "cache-miss"
	EventListLookup = "list-lookup"
	EventQuery      = "query"
	EventResponse   = "response"
	EventRedirect   = "redirect"
	EventCachePurge = "cache-purge"
	EventCacheStore = "cache-store"
	EventResult     = "result"
)

// Signature states reported on response events.
const (
	SignatureNotChecked = ""
	SignatureVerified   = "verified"
	SignatureUnsigned   = "unsigned"
	SignatureInvalid    = "invalid"
)

// DiscoveryResult is the outcome of Discover (§9.3).
type DiscoveryResult struct {
	Number      string   `json:"number"` // E.164
	Result      string   `json:"result"` // held | unknown | unallocated | not_participating | error
	Holder      *CpRef   `json:"holder,omitempty"`
	Ported      bool     `json:"ported"`
	Hops        []string `json:"hops"` // cpIds queried, in order
	FromCache   bool     `json:"fromCache"`
	Invalidated bool     `json:"invalidated"`
	Error       string   `json:"error,omitempty"` // when Result == "error"
	// RangeHolder names the non-participating Range Holder (not_participating).
	RangeHolder *CpRef `json:"rangeHolder,omitempty"`
	// Detail is a human-readable explanation of an error result (Go SDK only).
	Detail string `json:"detail,omitempty"`
	// Duration is the wall-clock time Discover took.
	Duration time.Duration `json:"-"`
}

// Held reports whether a PSTN2 holder was found.
func (r *DiscoveryResult) Held() bool { return r != nil && r.Result == ResultHeld && r.Holder != nil }

// Fallback reports whether the call must use traditional PSTN handling.
func (r *DiscoveryResult) Fallback() bool { return !r.Held() }

// DiscoveryEvent is emitted at each step of Discover, mirroring the reference
// engine's events. Only the fields relevant to the Type are set.
type DiscoveryEvent struct {
	Type   string
	Number string

	Entry     *CacheEntry     // cache-hit, cache-store
	Block     *NumberingBlock // list-lookup (nil: no block matched)
	To        *CpRef          // query, redirect
	URL       string          // query
	From      *CpRef          // response, redirect, cache-purge
	Status    int             // response (0: no HTTP response)
	Body      map[string]any  // response (nil if not JSON)
	Err       string          // response: transport error
	Signature string          // response: verified | unsigned | invalid | "" (not checked)
	Reason    string          // cache-purge: the result that carried the invalidation
	Result    *DiscoveryResult
}

// QueryFunc sends one discovery query (GET {target.URL}/pstn2/v1/numbers/{digits})
// and returns the HTTP status and raw body. A non-nil error means no response.
type QueryFunc func(ctx context.Context, target CpRef, number string) (status int, body []byte, err error)

// DiscoveryConfig configures a DiscoveryClient.
type DiscoveryConfig struct {
	CPID          string         // acting CP (sent as X-PSTN2-CP-ID)
	NumberingList *NumberingList // required
	Cache         *DiscoveryCache
	HopLimit      int // default 5
	DefaultTTL    int // seconds, default 86400
	// VerifySignatures requires every 200 discovery answer to carry a valid
	// Ed25519 signature from the answering CP (§9.6); otherwise the result is
	// "error"/"invalid_signature".
	VerifySignatures bool
	Keys             *KeyStore // default: a KeyStore over HTTP
	HTTP             HTTPOptions
	Query            QueryFunc // default: HTTP GET
	OnEvent          func(DiscoveryEvent)
	Now              func() time.Time
}

// DiscoveryClient answers "which CP currently holds this number?" (§9).
// It is safe for concurrent use.
type DiscoveryClient struct {
	cfg   DiscoveryConfig
	list  *NumberingList
	cache *DiscoveryCache
	keys  *KeyStore
	http  *transport
	query QueryFunc
	now   func() time.Time
}

// NewDiscoveryClient returns a discovery client.
func NewDiscoveryClient(cfg DiscoveryConfig) (*DiscoveryClient, error) {
	if cfg.NumberingList == nil {
		return nil, errors.New("pstn2: DiscoveryConfig.NumberingList is required")
	}
	if cfg.HopLimit <= 0 {
		cfg.HopLimit = DefaultHopLimit
	}
	if cfg.DefaultTTL <= 0 {
		cfg.DefaultTTL = DefaultTTL
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	d := &DiscoveryClient{cfg: cfg, list: cfg.NumberingList, cache: cfg.Cache, keys: cfg.Keys, query: cfg.Query, now: cfg.Now}
	if d.cache == nil {
		d.cache = NewDiscoveryCache(cfg.Now)
	}
	h := cfg.HTTP
	if h.CPID == "" {
		h.CPID = cfg.CPID
	}
	d.http = newTransport(h)
	if d.keys == nil {
		d.keys = &KeyStore{http: d.http, sets: map[string]map[string]ed25519.PublicKey{}}
	}
	if d.query == nil {
		d.query = d.httpQuery
	}
	return d, nil
}

func (d *DiscoveryClient) httpQuery(ctx context.Context, target CpRef, number string) (int, []byte, error) {
	res, err := d.http.do(ctx, http.MethodGet, target.DiscoveryURL(number), nil, nil)
	if err != nil {
		return 0, nil, err
	}
	return res.Status, res.Body, nil
}

// Cache returns the client's number cache.
func (d *DiscoveryClient) Cache() *DiscoveryCache { return d.cache }

// NumberingList returns the client's numbering list.
func (d *DiscoveryClient) NumberingList() *NumberingList { return d.list }

// Keys returns the client's public-key store.
func (d *DiscoveryClient) Keys() *KeyStore { return d.keys }

// VerifySignatures reports whether discovery answers must be signed.
func (d *DiscoveryClient) VerifySignatures() bool { return d.cfg.VerifySignatures }

// ApplyCacheControl acts on a cache instruction carried by any PSTN2 response
// about number (§9.5): purge the number, and for scope "block" re-download the
// numbering list. It reports whether anything was invalidated.
func (d *DiscoveryClient) ApplyCacheControl(ctx context.Context, number string, cc *CacheControl) bool {
	if cc == nil || !cc.Invalidate {
		return false
	}
	d.cache.Purge(number)
	if cc.Scope == "block" {
		_, _ = d.list.Refresh(ctx)
	}
	return true
}

// DiscoverOption customises one Discover call.
type DiscoverOption func(*discoverOptions)

type discoverOptions struct{ onEvent []func(DiscoveryEvent) }

// WithEvents receives the events of this Discover call (in addition to
// DiscoveryConfig.OnEvent).
func WithEvents(fn func(DiscoveryEvent)) DiscoverOption {
	return func(o *discoverOptions) {
		if fn != nil {
			o.onEvent = append(o.onEvent, fn)
		}
	}
}

// Discover finds the CP that currently holds number (§9.3):
//
//  1. cache: an unexpired entry is queried directly;
//  2. list: longest-prefix block (none → unallocated, no URL → not_participating);
//  3. Range Holder query; held → cache and done, redirect → follow,
//     not_held → purge and restart from the list, 404 → unknown;
//  4. at most HopLimit queries; a CP seen twice in one pass → loop_detected.
//
// Discover never returns an error: failures are results ("error" with an
// Error code) and mean traditional PSTN handling.
func (d *DiscoveryClient) Discover(ctx context.Context, number string, opts ...DiscoverOption) *DiscoveryResult {
	var o discoverOptions
	for _, fn := range opts {
		fn(&o)
	}
	start := time.Now()
	n := E164(number)
	out := &DiscoveryResult{Number: n, Hops: []string{}}
	emit := func(ev DiscoveryEvent) {
		ev.Number = n
		if d.cfg.OnEvent != nil {
			d.cfg.OnEvent(ev)
		}
		for _, fn := range o.onEvent {
			fn(ev)
		}
	}
	finish := func(result, code, detail string) *DiscoveryResult {
		out.Result, out.Error, out.Detail = result, code, detail
		out.Duration = time.Since(start)
		r := *out
		emit(DiscoveryEvent{Type: EventResult, Result: &r})
		return out
	}

	var target *CpRef
	if e, ok := d.cache.Get(n); ok {
		ec := e
		emit(DiscoveryEvent{Type: EventCacheHit, Entry: &ec})
		h := e.Holder
		target = &h
		out.FromCache = true
	} else {
		emit(DiscoveryEvent{Type: EventCacheMiss})
	}

	visited := map[string]bool{}
	for {
		if target == nil {
			if err := d.list.EnsureFresh(ctx); err != nil && !d.list.Loaded() {
				code := DiscoveryTimeout
				if ErrorCode(err) == CodeInvalidResponse {
					code = DiscoveryInvalidResponse
				}
				return finish(ResultError, code, "numbering list unavailable: "+err.Error())
			}
			block := d.list.FindBlock(n)
			emit(DiscoveryEvent{Type: EventListLookup, Block: block})
			if block == nil {
				return finish(ResultUnallocated, "", "")
			}
			if !block.Participating() {
				out.RangeHolder = &CpRef{CPID: block.CPID, CPName: block.CPName}
				return finish(ResultNotParticipating, "", "")
			}
			rh := block.RangeHolder()
			target = &rh
			out.FromCache = false
		}

		if len(out.Hops) >= d.cfg.HopLimit {
			return finish(ResultError, DiscoveryHopLimitExceeded, "")
		}
		if visited[target.CPID] {
			return finish(ResultError, DiscoveryLoopDetected, "")
		}
		visited[target.CPID] = true
		out.Hops = append(out.Hops, target.CPID)

		to := *target
		emit(DiscoveryEvent{Type: EventQuery, To: &to, URL: to.DiscoveryURL(n)})
		status, raw, err := d.query(ctx, to, n)
		if err != nil {
			emit(DiscoveryEvent{Type: EventResponse, From: &to, Err: err.Error()})
			return finish(ResultError, DiscoveryTimeout, err.Error())
		}
		var obj map[string]any
		_ = json.Unmarshal(raw, &obj)
		sigState := SignatureNotChecked
		var sigErr error
		if status == http.StatusOK && d.cfg.VerifySignatures && obj != nil {
			sigErr = d.keys.VerifyFrom(ctx, to, obj)
			switch {
			case sigErr == nil:
				sigState = SignatureVerified
			case errors.Is(sigErr, ErrUnsigned):
				sigState = SignatureUnsigned
			default:
				sigState = SignatureInvalid
			}
		}
		emit(DiscoveryEvent{Type: EventResponse, From: &to, Status: status, Body: obj, Signature: sigState})

		switch {
		case status == http.StatusNotFound:
			return finish(ResultUnknown, "", "")
		case status == http.StatusServiceUnavailable || status == http.StatusGatewayTimeout:
			return finish(ResultError, DiscoveryTimeout, http.StatusText(status))
		case status != http.StatusOK || obj == nil:
			return finish(ResultError, DiscoveryInvalidResponse, "HTTP "+http.StatusText(status))
		}
		if d.cfg.VerifySignatures && sigState != SignatureVerified {
			return finish(ResultError, DiscoveryInvalidSignature, sigErr.Error())
		}
		var body DiscoveryResponse
		if err := json.Unmarshal(raw, &body); err != nil {
			return finish(ResultError, DiscoveryInvalidResponse, err.Error())
		}
		if body.Number != "" && E164(body.Number) != n {
			return finish(ResultError, DiscoveryInvalidResponse, "answer is about "+body.Number)
		}

		if body.Cache != nil && body.Cache.Invalidate {
			d.cache.Purge(n)
			out.Invalidated = true
			emit(DiscoveryEvent{Type: EventCachePurge, From: &to, Reason: body.Result})
			if body.Cache.Scope == "block" {
				_, _ = d.list.Refresh(ctx)
			}
		}

		switch body.Result {
		case "held":
			if body.Holder == nil || body.Holder.URL == "" || body.Holder.CPID == "" {
				return finish(ResultError, DiscoveryInvalidResponse, "held answer without holder")
			}
			ttl := 0
			if body.Cache != nil {
				ttl = body.Cache.TTL
			}
			if ttl <= 0 {
				ttl = d.cfg.DefaultTTL
			}
			e := d.cache.Set(n, *body.Holder, body.Ported, ttl)
			emit(DiscoveryEvent{Type: EventCacheStore, Entry: &e})
			h := *body.Holder
			out.Holder, out.Ported = &h, body.Ported
			return finish(ResultHeld, "", "")
		case "redirect":
			if body.PortedTo == nil || body.PortedTo.URL == "" || body.PortedTo.CPID == "" {
				return finish(ResultError, DiscoveryInvalidResponse, "redirect without portedTo")
			}
			next := *body.PortedTo
			emit(DiscoveryEvent{Type: EventRedirect, From: &to, To: &next})
			target = &next
			continue
		case "not_held":
			target = nil // restart from the numbering list: the Range Holder is the authority
			visited = map[string]bool{}
			continue
		}
		return finish(ResultError, DiscoveryInvalidResponse, "unexpected result "+body.Result)
	}
}
