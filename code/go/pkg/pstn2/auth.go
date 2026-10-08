package pstn2

import (
	"context"
	"net/http"
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

// AuthModule implements caller ID authentication. Direct Query is the only
// authentication method.
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
