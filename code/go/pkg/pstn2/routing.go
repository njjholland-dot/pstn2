package pstn2

import (
	"context"
	"encoding/json"
	"net/http"
)

// RoutingRequest asks the destination's holder for a direct route (§6.1).
type RoutingRequest struct {
	CallerID          string
	DestinationNumber string
	CallReference     string // generated when empty
	MediaCapabilities MediaCapabilities
	PublicKey         string    // base64 Ed25519 identity key (§6.3), optional
	Branding          *Branding // optional
}

// RoutingResponse is the holder's answer. Accepted false (e.g. a 503
// capacity_exceeded rejection) means: route over traditional PSTN.
type RoutingResponse struct {
	Accepted              bool               `json:"accepted"`
	CallReference         string             `json:"callReference,omitempty"`
	ConnectionDetails     *ConnectionDetails `json:"connectionDetails,omitempty"`
	AgreedCapabilities    *MediaCapabilities `json:"agreedCapabilities,omitempty"`
	Reason                string             `json:"reason,omitempty"`
	FallbackToTraditional bool               `json:"fallbackToTraditional,omitempty"`
	RetryAfter            int                `json:"retryAfter,omitempty"`
	Timestamp             string             `json:"timestamp,omitempty"`
	Signature             string             `json:"signature,omitempty"`
	Via                   *HolderCall        `json:"-"`
}

// DefaultMediaCapabilities offers the §6.2/§6.3 required codecs and ciphers.
func DefaultMediaCapabilities() MediaCapabilities {
	return MediaCapabilities{
		Codecs:       []string{"opus", "g722", "pcmu", "pcma"},
		Encryption:   []string{"srtp-aes256", "srtp-aes128"},
		MaxBandwidth: 128000,
	}
}

// RoutingModule implements direct routing (§6).
type RoutingModule struct{ c *Client }

// RequestRouting discovers the destination number's holder and asks it for a
// direct route (POST /routing/request). A not_held answer is handled by
// purging, rediscovering and retrying once. Errors (including a
// *DiscoveryError when the number has no PSTN2 holder) mean: use the PSTN.
func (r *RoutingModule) RequestRouting(ctx context.Context, req RoutingRequest) (*RoutingResponse, error) {
	ref := req.CallReference
	if ref == "" {
		ref = newUUID()
	}
	caps := req.MediaCapabilities
	if len(caps.Codecs) == 0 {
		caps = DefaultMediaCapabilities()
	}
	if caps.Encryption == nil {
		caps.Encryption = []string{}
	}
	fields := map[string]any{
		"requestingCP":      r.c.cfg.CPID,
		"callerID":          E164(req.CallerID),
		"destinationNumber": E164(req.DestinationNumber),
		"callReference":     ref,
		"mediaCapabilities": caps,
	}
	if req.PublicKey != "" {
		fields["publicKey"] = req.PublicKey
	}
	if req.Branding != nil {
		fields["branding"] = req.Branding
	}
	res, via, err := r.c.callHolder(ctx, req.DestinationNumber, http.MethodPost, "/routing/request", r.c.envelope(fields))
	if err != nil {
		return nil, err
	}
	if res.Status < 200 || res.Status > 299 {
		// A §6.1 rejection body ({accepted:false, reason}) is an answer, not an error.
		var rej RoutingResponse
		var probe map[string]json.RawMessage
		if json.Unmarshal(res.Body, &probe) == nil && probe["accepted"] != nil && json.Unmarshal(res.Body, &rej) == nil && !rej.Accepted {
			if rej.Reason == "" {
				rej.Reason = statusCode(res.Status)
			}
			rej.FallbackToTraditional = true
			rej.Via = via
			return &rej, nil
		}
		return nil, errorFromResponse(res, CodeInternalError)
	}
	var out RoutingResponse
	if err := decodeJSON(res, &out); err != nil {
		return nil, err
	}
	if out.Accepted && out.ConnectionDetails == nil {
		return nil, &Error{Code: CodeInvalidResponse, Message: "accepted without connectionDetails", HTTPStatus: res.Status, URL: res.URL}
	}
	if !out.Accepted {
		out.FallbackToTraditional = true
	}
	out.Via = via
	return &out, nil
}
