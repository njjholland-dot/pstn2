package pstn2

import (
	"context"
	"net/http"
)

// LocationRequest is a PSAP's location query for an emergency caller (§8.1).
type LocationRequest struct {
	CallerID      string
	CallReference string // generated when empty
	PSAPID        string // requestingPSAP, e.g. UK-999-LONDON-01
}

// LocationResponse is the caller's holder's answer (§8.1).
type LocationResponse struct {
	CallReference  string                  `json:"callReference"`
	Location       Location                `json:"location"`
	Address        *Address                `json:"address,omitempty"`
	AdditionalInfo *AdditionalLocationInfo `json:"additionalInfo,omitempty"`
	Timestamp      string                  `json:"timestamp,omitempty"`
	Signature      string                  `json:"signature,omitempty"`
	Via            *HolderCall             `json:"-"`
}

// EmergencyModule implements emergency location (§8).
type EmergencyModule struct{ c *Client }

// GetLocation discovers the caller ID's holder and asks it for the caller's
// location (POST /emergency/location). A not_held answer is handled by
// purging, rediscovering and retrying once. On error the PSAP must rely on
// traditional location (cell / billing address).
func (e *EmergencyModule) GetLocation(ctx context.Context, req LocationRequest) (*LocationResponse, error) {
	ref := req.CallReference
	if ref == "" {
		ref = newUUID()
	}
	body := e.c.envelope(map[string]any{
		"requestingPSAP": req.PSAPID,
		"callerID":       E164(req.CallerID),
		"callReference":  ref,
	})
	res, via, err := e.c.callHolder(ctx, req.CallerID, http.MethodPost, "/emergency/location", body)
	if err != nil {
		return nil, err
	}
	if res.Status < 200 || res.Status > 299 {
		return nil, errorFromResponse(res, CodeLocationUnavail)
	}
	var out LocationResponse
	if err := decodeJSON(res, &out); err != nil {
		return nil, err
	}
	out.Via = via
	return &out, nil
}
