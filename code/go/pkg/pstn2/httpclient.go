package pstn2

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// HTTPOptions configures the SDK's HTTP behaviour. The zero value is usable.
type HTTPOptions struct {
	// Client is the underlying HTTP client (default: a dedicated client with
	// connection pooling). Its own Timeout, if any, also applies.
	Client *http.Client
	// Timeout per attempt (default 2s, SPECIFICATION.md §12.3).
	Timeout time.Duration
	// Retries for 503, 504 and network errors with 100/200/400ms backoff
	// (§10.3). 0 means the default (3); a negative value disables retries.
	Retries int
	// CPID is sent as X-PSTN2-CP-ID when set.
	CPID string
}

// httpResponse is a fully read HTTP response.
type httpResponse struct {
	Status int
	Header http.Header
	Body   []byte
	URL    string
}

type transport struct {
	client  *http.Client
	timeout time.Duration
	retries int
	cpID    string
	sleep   func(ctx context.Context, d time.Duration) error
}

var defaultHTTPClient = &http.Client{
	Transport: &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 5 * time.Second,
		ForceAttemptHTTP2:   true,
	},
	// PSTN2 never uses HTTP redirects (a ported number is a 200 "redirect"
	// result), so 3xx responses are returned as they are.
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

func newTransport(o HTTPOptions) *transport {
	t := &transport{client: o.Client, timeout: o.Timeout, retries: o.Retries, cpID: o.CPID, sleep: sleepCtx}
	if t.client == nil {
		t.client = defaultHTTPClient
	}
	if t.timeout <= 0 {
		t.timeout = DefaultTimeout
	}
	if t.retries == 0 {
		t.retries = DefaultRetries
	} else if t.retries < 0 {
		t.retries = 0
	}
	return t
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// do sends one PSTN2 request with retries. body == nil means no body and no
// Content-Type (discovery GETs). extra headers may be nil.
func (t *transport) do(ctx context.Context, method, url string, body any, extra http.Header) (*httpResponse, error) {
	var payload []byte
	if body != nil {
		var err error
		if payload, err = json.Marshal(body); err != nil {
			return nil, &Error{Code: CodeInvalidRequest, Message: "cannot encode request", URL: url, Err: err}
		}
	}
	var lastErr error
	for attempt := 0; ; attempt++ {
		res, err := t.once(ctx, method, url, payload, extra)
		retryable := false
		if err != nil {
			if ctx.Err() != nil { // the caller gave up: do not retry
				return nil, &Error{Code: CodeTimeout, Message: ctx.Err().Error(), URL: url, Err: err}
			}
			lastErr = err
			retryable = true
		} else if res.Status == http.StatusServiceUnavailable || res.Status == http.StatusGatewayTimeout {
			retryable = true
		}
		if !retryable || attempt >= t.retries {
			if err != nil {
				code := CodeNetworkError
				if isTimeoutErr(lastErr) {
					code = CodeTimeout
				}
				return nil, &Error{Code: code, URL: url, Err: lastErr}
			}
			return res, nil
		}
		if serr := t.sleep(ctx, time.Duration(100<<uint(attempt))*time.Millisecond); serr != nil {
			return nil, &Error{Code: CodeTimeout, Message: serr.Error(), URL: url, Err: serr}
		}
	}
}

func isTimeoutErr(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	type timeout interface{ Timeout() bool }
	var te timeout
	return errors.As(err, &te) && te.Timeout()
}

func (t *transport) once(ctx context.Context, method, url string, payload []byte, extra http.Header) (*httpResponse, error) {
	actx, cancel := context.WithTimeout(ctx, t.timeout)
	defer cancel()
	var rd io.Reader
	if payload != nil {
		rd = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(actx, method, url, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-PSTN2-Version", ProtocolVersion)
	if t.cpID != "" {
		req.Header.Set("X-PSTN2-CP-ID", t.cpID)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	for k, vs := range extra {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	resp, err := t.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	return &httpResponse{Status: resp.StatusCode, Header: resp.Header, Body: data, URL: url}, nil
}

// decodeJSON decodes a response body as JSON whatever its Content-Type
// (static hosts may serve application/octet-stream).
func decodeJSON(res *httpResponse, out any) error {
	if err := json.Unmarshal(res.Body, out); err != nil {
		return &Error{Code: CodeInvalidResponse, Message: "response is not JSON", HTTPStatus: res.Status, URL: res.URL, Err: err}
	}
	return nil
}

// errorFromResponse converts a non-2xx response into an *Error, using the
// §10.1 ErrorResponse body when present.
func errorFromResponse(res *httpResponse, fallbackCode string) *Error {
	var body struct {
		Error json.RawMessage `json:"error"`
	}
	e := &Error{Code: fallbackCode, HTTPStatus: res.Status, URL: res.URL}
	if json.Unmarshal(res.Body, &body) == nil && len(body.Error) > 0 {
		var obj ErrorDetail
		var s string
		if json.Unmarshal(body.Error, &obj) == nil && obj.Code != "" {
			e.Code, e.Message = obj.Code, obj.Message
		} else if json.Unmarshal(body.Error, &s) == nil && s != "" {
			e.Code = s
		}
	}
	if e.Code == "" {
		e.Code = statusCode(res.Status)
	}
	if e.Message == "" {
		e.Message = fmt.Sprintf("%s %s", http.StatusText(res.Status), res.URL)
	}
	return e
}

func statusCode(status int) string {
	switch {
	case status == http.StatusTooManyRequests:
		return CodeRateLimitExceeded
	case status == http.StatusUnauthorized:
		return CodeInvalidSignature
	case status == http.StatusRequestTimeout || status == http.StatusGatewayTimeout:
		return CodeTimeout
	case status >= 500:
		return CodeInternalError
	default:
		return CodeInvalidRequest
	}
}
