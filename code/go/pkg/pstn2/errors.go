package pstn2

import (
	"context"
	"errors"
	"fmt"
	"net"
)

// Error codes (SPECIFICATION.md §10.2) plus SDK-side codes.
const (
	CodeCallNotFound      = "call_not_found"
	CodeInvalidSignature  = "invalid_signature"
	CodeCapacityExceeded  = "capacity_exceeded"
	CodeUnsupportedCodec  = "unsupported_codec"
	CodeNumberNotFound    = "number_not_found"
	CodeHopLimitExceeded  = "hop_limit_exceeded"
	CodeLoopDetected      = "loop_detected"
	CodeLocationUnavail   = "location_unavailable"
	CodeUnauthorizedPSAP  = "unauthorized_psap"
	CodeTimeout           = "timeout"
	CodeRateLimitExceeded = "rate_limit_exceeded"
	CodeInvalidRequest    = "invalid_request"
	CodeInternalError     = "internal_error"

	// SDK-side codes.
	CodeNetworkError    = "network_error"    // no HTTP response (after retries)
	CodeInvalidResponse = "invalid_response" // response could not be understood
	CodeNotHeld         = "not_held"         // holder still answered not_held after rediscovery
)

// Error is returned for a failed PSTN2 HTTP interaction: an ErrorResponse
// (§10.1) from a CP, a transport failure, or a response the SDK could not use.
// Every Error means "fall back to traditional PSTN handling" for that call.
type Error struct {
	Code       string // §10.2 code, or one of the SDK-side codes
	Message    string
	HTTPStatus int    // 0 when no HTTP response was received
	URL        string // request URL, when known
	Err        error  // underlying error, if any
}

func (e *Error) Error() string {
	msg := "pstn2: " + e.Code
	if e.Message != "" {
		msg += ": " + e.Message
	}
	if e.HTTPStatus != 0 {
		msg += fmt.Sprintf(" (HTTP %d)", e.HTTPStatus)
	}
	if e.Err != nil && e.Message == "" {
		msg += ": " + e.Err.Error()
	}
	return msg
}

func (e *Error) Unwrap() error { return e.Err }

// DiscoveryError is returned by the Auth, Routing and Emergency modules when
// Number Discovery did not find a PSTN2 holder for the number (result
// unknown, unallocated, not_participating or error). The caller must use
// traditional PSTN handling.
type DiscoveryError struct {
	Result *DiscoveryResult
}

func (e *DiscoveryError) Error() string {
	if e.Result == nil {
		return "pstn2: discovery failed"
	}
	if e.Result.Error != "" {
		return fmt.Sprintf("pstn2: discovery for %s: %s (%s)", e.Result.Number, e.Result.Result, e.Result.Error)
	}
	return fmt.Sprintf("pstn2: discovery for %s: %s", e.Result.Number, e.Result.Result)
}

// ErrorCode returns the PSTN2 code carried by err ("" if none). For a
// DiscoveryError it returns the discovery result (or its error code).
func ErrorCode(err error) string {
	var pe *Error
	if errors.As(err, &pe) {
		return pe.Code
	}
	var de *DiscoveryError
	if errors.As(err, &de) && de.Result != nil {
		if de.Result.Error != "" {
			return de.Result.Error
		}
		return de.Result.Result
	}
	return ""
}

// IsDiscoveryError reports whether err is a DiscoveryError and returns it.
func IsDiscoveryError(err error) (*DiscoveryError, bool) {
	var de *DiscoveryError
	ok := errors.As(err, &de)
	return de, ok
}

// IsTimeout reports whether err is a timeout (request or discovery).
func IsTimeout(err error) bool {
	if err == nil {
		return false
	}
	if ErrorCode(err) == CodeTimeout || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

// IsNetworkError reports whether err means no HTTP response was received.
func IsNetworkError(err error) bool {
	c := ErrorCode(err)
	return c == CodeNetworkError || c == CodeTimeout
}
