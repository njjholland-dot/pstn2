package pstn2

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
)

// Verification reasons (Verification.Reason).
const (
	ReasonVerified         = "verified"
	ReasonNotVerified      = "not_verified"      // the holder answered verified:false
	ReasonCallNotFound     = "call_not_found"    // the holder has no matching call (404)
	ReasonCallerIDUnknown  = "caller_id_unknown" // discovery: not in service anywhere → likely spoofed
	ReasonUnallocated      = "unallocated"       // discovery: number not allocated → spoofed
	ReasonNotParticipating = "not_participating" // discovery: Range Holder not on PSTN2 → cannot verify
	ReasonDiscoveryError   = "discovery_error"   // discovery failed (timeout, signature, …)
)

// VerifyCallRequest asks the caller ID's holder whether the call is genuine (§5.1).
type VerifyCallRequest struct {
	CallerID      string
	CalledID      string
	CallReference string // UUID; generated when empty
}

// Verification is the result of VerifyCall.
type Verification struct {
	Verified      bool      `json:"verified"`
	Result        string    `json:"result,omitempty"`
	CallReference string    `json:"callReference,omitempty"`
	CallerName    string    `json:"callerName,omitempty"`
	CallerOrg     string    `json:"callerOrg,omitempty"`
	CallPurpose   string    `json:"callPurpose,omitempty"`
	TrustLevel    string    `json:"trustLevel,omitempty"`
	Branding      *Branding `json:"branding,omitempty"`
	Timestamp     string    `json:"timestamp,omitempty"`
	Signature     string    `json:"signature,omitempty"`

	// Reason explains the outcome (Reason* constants).
	Reason string `json:"-"`
	// Fallback is true when the call must be handled as traditional PSTN
	// (unverified: flag or warn per local policy).
	Fallback bool `json:"-"`
	// Via records discovery and any not_held retry.
	Via *HolderCall `json:"-"`
}

// TokenRequest creates a Token Pool token at the caller ID's holder (§5.2.1).
type TokenRequest struct {
	CallerID      string
	CalledID      string
	CallReference string    // generated when empty
	TTL           int       // seconds (default 30)
	Branding      *Branding // optional
}

// Token is a created token.
type Token struct {
	TokenID       string      `json:"tokenId"`
	ExpiresAt     string      `json:"expiresAt"`
	CallReference string      `json:"callReference"`
	Via           *HolderCall `json:"-"`
}

// TokenVerification is the result of VerifyToken (§5.2.2).
type TokenVerification struct {
	TokenID       string      `json:"tokenId"`
	OriginatingCP string      `json:"originatingCP"`
	CallerID      string      `json:"callerID"`
	CalledID      string      `json:"calledID"`
	CallReference string      `json:"callReference"`
	Verified      bool        `json:"verified"`
	Branding      *Branding   `json:"branding,omitempty"`
	ExpiresAt     string      `json:"expiresAt"`
	Via           *HolderCall `json:"-"`
}

// TokenPattern is the §5.2.3 token format.
var TokenPattern = regexp.MustCompile(`^TK-[A-Za-z0-9]{16}$`)

// AuthModule implements caller ID authentication.
type AuthModule struct{ c *Client }

// VerifyCall verifies an inbound caller ID with Direct Query (§5.1): discover
// the caller ID's holder, POST /auth/verify there, and on a not_held answer
// purge, rediscover and retry once (§5.1.2).
//
// A caller ID that cannot be verified is a normal outcome, not an error:
// Verified is false, Reason says why and Fallback is true. An error is
// returned only when the verification request itself failed.
func (a *AuthModule) VerifyCall(ctx context.Context, req VerifyCallRequest) (*Verification, error) {
	ref := req.CallReference
	if ref == "" {
		ref = newUUID()
	}
	body := a.c.envelope(map[string]any{
		"requestingCP":  a.c.cfg.CPID,
		"callerID":      E164(req.CallerID),
		"calledID":      E164(req.CalledID),
		"callReference": ref,
	})
	res, via, err := a.c.callHolder(ctx, req.CallerID, http.MethodPost, "/auth/verify", body)
	if err != nil {
		if de, ok := IsDiscoveryError(err); ok {
			v := &Verification{CallReference: ref, Fallback: true, Via: via}
			switch de.Result.Result {
			case ResultUnknown:
				v.Reason = ReasonCallerIDUnknown
			case ResultUnallocated:
				v.Reason = ReasonUnallocated
			case ResultNotParticipating:
				v.Reason = ReasonNotParticipating
			default:
				v.Reason = ReasonDiscoveryError
			}
			return v, nil
		}
		return &Verification{CallReference: ref, Fallback: true, Reason: ReasonDiscoveryError, Via: via}, err
	}
	if res.Status == http.StatusNotFound {
		v := &Verification{CallReference: ref, Reason: ReasonCallNotFound, Fallback: true, Via: via}
		return v, nil
	}
	if res.Status < 200 || res.Status > 299 {
		return &Verification{CallReference: ref, Fallback: true, Via: via}, errorFromResponse(res, CodeInternalError)
	}
	var v Verification
	if err := decodeJSON(res, &v); err != nil {
		return &Verification{CallReference: ref, Fallback: true, Via: via}, err
	}
	v.Via = via
	if v.Verified {
		v.Reason = ReasonVerified
	} else {
		v.Reason, v.Fallback = ReasonNotVerified, true
	}
	return &v, nil
}

// CreateToken creates a Token Pool token for an outbound call (§5.2.1). The
// token is created at the CP that holds the caller ID (normally the calling
// CP's own server), found with Discover().
func (a *AuthModule) CreateToken(ctx context.Context, req TokenRequest) (*Token, error) {
	ref := req.CallReference
	if ref == "" {
		ref = newUUID()
	}
	ttl := req.TTL
	if ttl <= 0 {
		ttl = 30
	}
	fields := map[string]any{
		"originatingCP": a.c.cfg.CPID,
		"callerID":      E164(req.CallerID),
		"calledID":      E164(req.CalledID),
		"callReference": ref,
		"ttl":           ttl,
	}
	if req.Branding != nil {
		fields["branding"] = req.Branding
	}
	res, via, err := a.c.callHolder(ctx, req.CallerID, http.MethodPost, "/auth/tokens", a.c.envelope(fields))
	if err != nil {
		return nil, err
	}
	if res.Status < 200 || res.Status > 299 {
		return nil, errorFromResponse(res, CodeInternalError)
	}
	var t Token
	if err := decodeJSON(res, &t); err != nil {
		return nil, err
	}
	if !TokenPattern.MatchString(t.TokenID) {
		return nil, &Error{Code: CodeInvalidToken, Message: "malformed token id " + t.TokenID, HTTPStatus: res.Status, URL: res.URL}
	}
	t.Via = via
	return &t, nil
}

// VerifyToken verifies a Token Pool token presented with an inbound call
// (§5.2.2): discover the caller ID's holder and GET /auth/tokens/{tokenId}
// there. A missing token is an *Error with Code invalid_token (404); an
// expired one has Code expired_token (410).
func (a *AuthModule) VerifyToken(ctx context.Context, callerID, tokenID string) (*TokenVerification, error) {
	if !TokenPattern.MatchString(tokenID) {
		return nil, &Error{Code: CodeInvalidToken, Message: "token id does not match ^TK-[A-Za-z0-9]{16}$"}
	}
	res, via, err := a.c.callHolder(ctx, callerID, http.MethodGet, "/auth/tokens/"+url.PathEscape(tokenID), nil)
	if err != nil {
		return nil, err
	}
	switch {
	case res.Status == http.StatusNotFound:
		return nil, errorFromResponse(res, CodeInvalidToken)
	case res.Status == http.StatusGone:
		return nil, errorFromResponse(res, CodeExpiredToken)
	case res.Status < 200 || res.Status > 299:
		return nil, errorFromResponse(res, CodeInternalError)
	}
	var tv TokenVerification
	if err := decodeJSON(res, &tv); err != nil {
		return nil, err
	}
	if tv.CallerID != "" && E164(tv.CallerID) != E164(callerID) {
		return nil, &Error{Code: CodeInvalidToken, Message: "token was issued for " + tv.CallerID, URL: res.URL}
	}
	tv.Via = via
	return &tv, nil
}
