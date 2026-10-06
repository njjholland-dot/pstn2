package pstn2

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Networks selectable with PSTN2_NETWORK.
const (
	NetworkLocal = "local"
	NetworkLive  = "live"
)

// LiveNumberingListURL is the numbering list of the live dummy test CPs.
const LiveNumberingListURL = "https://pstn2.org/testcp/numbering-list.json"

// DefaultMockPort is the default port of test-environment/mock-network/server.mjs.
const DefaultMockPort = 47901

// Config configures a Client.
type Config struct {
	CPID   string // acting CP's RCPID (X-PSTN2-CP-ID, requestingCP)
	CPName string // optional, for logging

	// NumberingListURL is downloaded lazily (ETag/If-None-Match, refreshed
	// every ListRefresh). Alternatively give NumberingList (in-memory data)
	// or List (a shared *NumberingList).
	NumberingListURL string
	NumberingList    *NumberingListData
	List             *NumberingList
	ListRefresh      time.Duration // default 24h

	VerifySignatures bool // require signed discovery answers (§9.6)
	HopLimit         int  // default 5
	DefaultTTL       int  // seconds, default 86400

	Timeout    time.Duration // per HTTP attempt, default 2s
	Retries    int           // 503/504/network retries; 0 = default 3, negative = none
	HTTPClient *http.Client

	// PrivateKey, when set, signs request bodies (Ed25519 over CanonicalJSON
	// of the body without "signature", §3.3.2).
	PrivateKey ed25519.PrivateKey

	Cache   *DiscoveryCache      // optional shared cache
	OnEvent func(DiscoveryEvent) // discovery events for every lookup
	Now     func() time.Time
}

// Env is the example/client configuration read from the environment:
//
//	PSTN2_NETWORK=local|live          (default local)
//	PSTN2_MOCK_PORT                   (local, default 47901)
//	PSTN2_NUMBERING_LIST_URL          (overrides both)
//	PSTN2_CP_ID                       (default CP1-UK-0101 local, CP1-UK-TEST-CLIENT live)
//	PSTN2_VERIFY_SIGNATURES=1|0       (default on for live, off for local)
type Env struct {
	Network          string
	NumberingListURL string
	CPID             string
	VerifySignatures bool
	// VerifySignaturesSet is true when PSTN2_VERIFY_SIGNATURES was given.
	VerifySignaturesSet bool
}

// LoadEnv reads the PSTN2_* environment variables.
func LoadEnv() Env {
	e := Env{Network: strings.ToLower(strings.TrimSpace(os.Getenv("PSTN2_NETWORK")))}
	if e.Network != NetworkLive {
		e.Network = NetworkLocal
	}
	if e.Network == NetworkLive {
		e.NumberingListURL = LiveNumberingListURL
		e.CPID = "CP1-UK-TEST-CLIENT"
		e.VerifySignatures = true
	} else {
		port := DefaultMockPort
		if p, err := strconv.Atoi(os.Getenv("PSTN2_MOCK_PORT")); err == nil && p > 0 {
			port = p
		}
		e.NumberingListURL = "http://127.0.0.1:" + strconv.Itoa(port) + "/numbering-list.json"
		e.CPID = "CP1-UK-0101"
	}
	if u := strings.TrimSpace(os.Getenv("PSTN2_NUMBERING_LIST_URL")); u != "" {
		e.NumberingListURL = u
	}
	if id := strings.TrimSpace(os.Getenv("PSTN2_CP_ID")); id != "" {
		e.CPID = id
	}
	if v, ok := os.LookupEnv("PSTN2_VERIFY_SIGNATURES"); ok && strings.TrimSpace(v) != "" {
		e.VerifySignaturesSet = true
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			e.VerifySignatures = true
		default:
			e.VerifySignatures = false
		}
	}
	return e
}

// BaseURL returns the numbering list URL without its file name (for the
// local mock network this is the server root, e.g. http://127.0.0.1:47901).
func (e Env) BaseURL() string {
	u := e.NumberingListURL
	if i := strings.LastIndex(u, "/"); i > len("https://") {
		return u[:i]
	}
	return u
}

// Config returns a Config for this environment.
func (e Env) Config() Config {
	return Config{CPID: e.CPID, NumberingListURL: e.NumberingListURL, VerifySignatures: e.VerifySignatures}
}

// Client is a PSTN2 client for one CP. Create it with NewClient; it is safe
// for concurrent use. Every module finds the number's holder with Discover().
type Client struct {
	cfg       Config
	http      *transport
	discovery *DiscoveryClient
	auth      *AuthModule
	routing   *RoutingModule
	emergency *EmergencyModule
}

// NewClient returns a client. It does no network I/O; the numbering list is
// downloaded on first use.
func NewClient(cfg Config) (*Client, error) {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	hopts := HTTPOptions{Client: cfg.HTTPClient, Timeout: cfg.Timeout, Retries: cfg.Retries, CPID: cfg.CPID}
	list := cfg.List
	switch {
	case list != nil:
	case cfg.NumberingList != nil:
		list = NewNumberingList(*cfg.NumberingList)
	case cfg.NumberingListURL != "":
		list = NewNumberingListFromURL(cfg.NumberingListURL, NumberingListOptions{HTTP: hopts, RefreshInterval: cfg.ListRefresh, Now: cfg.Now})
	default:
		return nil, errors.New("pstn2: Config needs NumberingListURL, NumberingList or List")
	}
	d, err := NewDiscoveryClient(DiscoveryConfig{
		CPID: cfg.CPID, NumberingList: list, Cache: cfg.Cache, HopLimit: cfg.HopLimit, DefaultTTL: cfg.DefaultTTL,
		VerifySignatures: cfg.VerifySignatures, HTTP: hopts, OnEvent: cfg.OnEvent, Now: cfg.Now,
	})
	if err != nil {
		return nil, err
	}
	c := &Client{cfg: cfg, http: newTransport(hopts), discovery: d}
	c.auth = &AuthModule{c: c}
	c.routing = &RoutingModule{c: c}
	c.emergency = &EmergencyModule{c: c}
	return c, nil
}

// Config returns the client's configuration.
func (c *Client) Config() Config { return c.cfg }

// Discovery returns the Number Discovery client.
func (c *Client) Discovery() *DiscoveryClient { return c.discovery }

// Auth returns the authentication module (Direct Query and Token Pool).
func (c *Client) Auth() *AuthModule { return c.auth }

// Routing returns the direct routing module.
func (c *Client) Routing() *RoutingModule { return c.routing }

// Emergency returns the emergency location module.
func (c *Client) Emergency() *EmergencyModule { return c.emergency }

// Discover is shorthand for c.Discovery().Discover.
func (c *Client) Discover(ctx context.Context, number string, opts ...DiscoverOption) *DiscoveryResult {
	return c.discovery.Discover(ctx, number, opts...)
}

// Close releases cached state (number cache and keys). Idle HTTP
// connections of the default transport are closed too.
func (c *Client) Close() error {
	c.discovery.Cache().Clear()
	c.discovery.Keys().Clear()
	if c.cfg.HTTPClient == nil {
		defaultHTTPClient.CloseIdleConnections()
	}
	return nil
}

// envelope adds the common message fields (§4.1) and signs the body when a
// private key is configured.
func (c *Client) envelope(fields map[string]any) map[string]any {
	body := map[string]any{
		"messageId": newUUID(),
		"timestamp": Timestamp(c.cfg.Now()),
		"version":   ProtocolVersion,
	}
	for k, v := range fields {
		body[k] = v
	}
	if c.cfg.PrivateKey != nil {
		if signed, err := SignBody(body, "", c.cfg.PrivateKey); err == nil {
			return signed
		}
	}
	return body
}

// notHeld reports whether a module response is a not_held answer (§5.1.2)
// and returns its cache instruction.
func notHeld(res *httpResponse) (*CacheControl, bool) {
	if res.Status != http.StatusOK {
		return nil, false
	}
	var b struct {
		Result string        `json:"result"`
		Cache  *CacheControl `json:"cache"`
	}
	if json.Unmarshal(res.Body, &b) != nil || b.Result != "not_held" {
		return nil, false
	}
	if b.Cache == nil {
		b.Cache = &CacheControl{Invalidate: true, Scope: "number"}
	}
	return b.Cache, true
}

// callHolder discovers number's holder and sends method {holder}/pstn2/v1{path}.
// A 200 not_held answer purges the cache entry, rediscovers and retries once.
func (c *Client) callHolder(ctx context.Context, number, method, path string, body any) (*httpResponse, *HolderCall, error) {
	n := E164(number)
	call := &HolderCall{Number: n}
	disc := c.discovery.Discover(ctx, n)
	call.Discovery = disc
	if !disc.Held() {
		return nil, call, &DiscoveryError{Result: disc}
	}
	call.Holder = *disc.Holder
	res, err := c.http.do(ctx, method, disc.Holder.APIBase()+path, body, nil)
	if err != nil {
		return nil, call, err
	}
	cc, stale := notHeld(res)
	if !stale {
		return res, call, nil
	}

	// The holder we used no longer holds the number: purge, rediscover, retry once.
	first := *disc.Holder
	c.discovery.ApplyCacheControl(ctx, n, &CacheControl{Invalidate: true, Scope: cc.Scope})
	call.Retried, call.FirstDiscovery, call.NotHeldBy = true, disc, &first
	disc = c.discovery.Discover(ctx, n)
	call.Discovery = disc
	if !disc.Held() {
		return nil, call, &DiscoveryError{Result: disc}
	}
	call.Holder = *disc.Holder
	res, err = c.http.do(ctx, method, disc.Holder.APIBase()+path, body, nil)
	if err != nil {
		return nil, call, err
	}
	if _, stale := notHeld(res); stale {
		c.discovery.Cache().Purge(n)
		return nil, call, &Error{Code: CodeNotHeld, Message: disc.Holder.CPID + " does not hold " + n + " after rediscovery", HTTPStatus: res.Status, URL: res.URL}
	}
	return res, call, nil
}
