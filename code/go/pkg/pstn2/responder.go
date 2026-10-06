package pstn2

import (
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// PortedIn records a number this CP serves that was ported in from another CP.
type PortedIn struct {
	Number   string `json:"number"`
	FromCPID string `json:"fromCpId"`
}

// PortedOut records (at the Range Holder) where a ported-out number went.
type PortedOut struct {
	Number string `json:"number"`
	ToCPID string `json:"toCpId"`
}

// NumberDatabase is a CP's own number data: everything it needs to answer a
// discovery query about its numbers (§9). JSON tags match the fixtures in
// test-environment/fixtures.
type NumberDatabase struct {
	CPID           string      `json:"cpId"`
	CPName         string      `json:"cpName"`
	URL            string      `json:"url"`
	Ranges         []string    `json:"ranges"`         // E.164 digit prefixes this CP is Range Holder for
	InService      []string    `json:"inService"`      // numbers in its ranges it serves itself
	PortedIn       []PortedIn  `json:"portedIn"`       // numbers it serves that were ported in
	PortedOut      []PortedOut `json:"portedOut"`      // (Range Holder) numbers ported out, and where to
	PreviouslyHeld []string    `json:"previouslyHeld"` // numbers it used to serve (ported away again)
}

// Ref returns the CP's own CpRef.
func (db NumberDatabase) Ref() CpRef {
	return CpRef{CPID: db.CPID, CPName: db.CPName, URL: trimSlash(db.URL)}
}

// Resolver maps a cpId to its CpRef (for holder / portedTo in answers).
type Resolver func(cpID string) (CpRef, bool)

// ResolverFromList resolves cpIds through the numbering list's Range Holder URLs.
func ResolverFromList(l *NumberingList) Resolver {
	return func(cpID string) (CpRef, bool) {
		for _, b := range l.Data().Blocks {
			if b.CPID == cpID && b.RangeHolderURL != "" {
				return b.RangeHolder(), true
			}
		}
		return CpRef{}, false
	}
}

// ResponderConfig configures a RangeHolderResponder.
type ResponderConfig struct {
	DB      NumberDatabase
	Resolve Resolver // cpId → CpRef for portedTo / holder; the CP itself is always known
	// IsAllocated reports whether a number belongs to an allocated block of a
	// participating Range Holder (so a CP that does not serve it answers
	// not_held rather than 404). Default: NumberingList lookup, if set.
	IsAllocated   func(number string) bool
	NumberingList *NumberingList
	TTL           int                // cache.ttl in answers (default 86400)
	KeyID         string             // kid for signed answers
	PrivateKey    ed25519.PrivateKey // optional: sign 200 answers (§9.6)
	Now           func() time.Time
}

// RangeHolderResponder builds a CP's answers to GET /pstn2/v1/numbers/{digits}
// (§9.2) from its own number database: held, redirect (Range Holder of a
// ported-out number), not_held + invalidate, or 404 unknown. It produces the
// same answers as Network.respond() in the reference engine. It is safe for
// concurrent use; use Update to change the database.
type RangeHolderResponder struct {
	mu  sync.RWMutex
	cfg ResponderConfig
}

// NewRangeHolderResponder returns a responder.
func NewRangeHolderResponder(cfg ResponderConfig) *RangeHolderResponder {
	if cfg.TTL <= 0 {
		cfg.TTL = DefaultTTL
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.IsAllocated == nil && cfg.NumberingList != nil {
		l := cfg.NumberingList
		cfg.IsAllocated = func(n string) bool {
			b := l.FindBlock(n)
			return b != nil && b.Participating()
		}
	}
	return &RangeHolderResponder{cfg: cfg}
}

// Update changes the number database under the responder's lock.
func (r *RangeHolderResponder) Update(fn func(db *NumberDatabase)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	fn(&r.cfg.DB)
}

// Database returns a copy of the number database.
func (r *RangeHolderResponder) Database() NumberDatabase {
	r.mu.RLock()
	defer r.mu.RUnlock()
	db := r.cfg.DB
	db.Ranges = append([]string(nil), db.Ranges...)
	db.InService = append([]string(nil), db.InService...)
	db.PortedIn = append([]PortedIn(nil), db.PortedIn...)
	db.PortedOut = append([]PortedOut(nil), db.PortedOut...)
	db.PreviouslyHeld = append([]string(nil), db.PreviouslyHeld...)
	return db
}

// IsRangeHolder reports whether number is in one of this CP's ranges.
func (r *RangeHolderResponder) IsRangeHolder(number string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.isRangeHolder(Digits(number))
}

func (r *RangeHolderResponder) isRangeHolder(digits string) bool {
	for _, p := range r.cfg.DB.Ranges {
		if strings.HasPrefix(digits, p) {
			return true
		}
	}
	return false
}

func (r *RangeHolderResponder) ref(cpID string) map[string]any {
	db := r.cfg.DB
	ref := CpRef{CPID: cpID}
	if cpID == db.CPID {
		ref = db.Ref()
	} else if r.cfg.Resolve != nil {
		if c, ok := r.cfg.Resolve(cpID); ok {
			ref = c
		}
	}
	return map[string]any{"cpId": ref.CPID, "cpName": ref.CPName, "url": trimSlash(ref.URL)}
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// Respond answers a discovery query about number, issued now.
func (r *RangeHolderResponder) Respond(number string) (int, map[string]any) {
	return r.RespondAt(number, Timestamp(r.cfg.Now()))
}

// RespondAt answers a discovery query about number with the given "issued"
// timestamp. 200 answers are signed when a private key is configured; the
// 404 answer is {"result":"unknown","number":...} and never signed.
func (r *RangeHolderResponder) RespondAt(number, issued string) (int, map[string]any) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	db := r.cfg.DB
	n := E164(number)
	ttl := r.cfg.TTL
	body := func(result string, extra map[string]any) map[string]any {
		b := map[string]any{"version": ProtocolVersion, "number": n, "result": result, "issued": issued}
		for k, v := range extra {
			b[k] = v
		}
		return b
	}
	unknown := map[string]any{"result": "unknown", "number": n}
	var status int
	var out map[string]any

	inPortedIn := false
	for _, p := range db.PortedIn {
		if p.Number == n {
			inPortedIn = true
		}
	}

	switch {
	case r.isRangeHolder(Digits(n)):
		var out0 *PortedOut
		for i := range db.PortedOut {
			if db.PortedOut[i].Number == n {
				out0 = &db.PortedOut[i]
				break
			}
		}
		switch {
		case out0 != nil:
			status, out = 200, body("redirect", map[string]any{"portedTo": r.ref(out0.ToCPID), "cache": map[string]any{"ttl": ttl}})
		case contains(db.InService, n):
			status, out = 200, body("held", map[string]any{"holder": r.ref(db.CPID), "ported": false, "cache": map[string]any{"ttl": ttl}})
		default:
			return 404, unknown
		}
	case inPortedIn:
		status, out = 200, body("held", map[string]any{"holder": r.ref(db.CPID), "ported": true, "cache": map[string]any{"ttl": ttl}})
	case contains(db.PreviouslyHeld, n) || (r.cfg.IsAllocated != nil && r.cfg.IsAllocated(n)):
		status, out = 200, body("not_held", map[string]any{"cache": map[string]any{"invalidate": true, "scope": "number"}})
	default:
		return 404, unknown
	}

	if r.cfg.PrivateKey != nil {
		if signed, err := SignBody(out, r.cfg.KeyID, r.cfg.PrivateKey); err == nil {
			out = signed
		}
	}
	return status, out
}

// KeySet returns this CP's published key set (empty when unsigned).
func (r *RangeHolderResponder) KeySet() KeySet {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ks := KeySet{CPID: r.cfg.DB.CPID, Keys: []PublicKey{}}
	if r.cfg.PrivateKey != nil {
		pub := r.cfg.PrivateKey.Public().(ed25519.PublicKey)
		ks.Keys = append(ks.Keys, PublicKey{Kid: r.cfg.KeyID, Algorithm: "ed25519", PublicKey: PublicKeyBase64(pub)})
	}
	return ks
}

var numbersPath = regexp.MustCompile(`/pstn2/v1/numbers/(\d{2,15})$`)

// ServeHTTP serves GET …/pstn2/v1/numbers/{digits} and GET …/pstn2/v1/keys,
// so the responder can be mounted at a CP's PSTN2 base URL.
func (r *RangeHolderResponder) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if req.Method != http.MethodGet && req.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var status int
	var body any
	switch {
	case strings.HasSuffix(req.URL.Path, "/pstn2/v1/keys"):
		status, body = 200, r.KeySet()
	default:
		m := numbersPath.FindStringSubmatch(req.URL.Path)
		if m == nil {
			status, body = 404, map[string]any{"result": "unknown"}
		} else {
			status, body = r.Respond("+" + m[1])
		}
	}
	data, _ := json.Marshal(body)
	w.WriteHeader(status)
	_, _ = w.Write(data)
}
