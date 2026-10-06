package pstn2

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestTransportRetries(t *testing.T) {
	var calls int32
	statuses := []int{503, 504, 200}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i := atomic.AddInt32(&calls, 1) - 1
		if r.Header.Get("User-Agent") != UserAgent || r.Header.Get("X-PSTN2-Version") != "1.1" || r.Header.Get("X-PSTN2-CP-ID") != "CP1-UK-0101" {
			t.Errorf("headers %v", r.Header)
		}
		if r.Method == http.MethodPost && r.Header.Get("Content-Type") != "application/json; charset=utf-8" {
			t.Errorf("content type %q", r.Header.Get("Content-Type"))
		}
		if int(i) < len(statuses) {
			w.WriteHeader(statuses[i])
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	tr := newTransport(HTTPOptions{CPID: "CP1-UK-0101"})
	var sleeps []time.Duration
	tr.sleep = func(_ context.Context, d time.Duration) error { sleeps = append(sleeps, d); return nil }
	res, err := tr.do(context.Background(), http.MethodPost, srv.URL, map[string]any{"a": 1}, nil)
	if err != nil || res.Status != 200 || calls != 3 {
		t.Fatalf("res %+v err %v calls %d", res, err, calls)
	}
	if len(sleeps) != 2 || sleeps[0] != 100*time.Millisecond || sleeps[1] != 200*time.Millisecond {
		t.Fatalf("backoff %v", sleeps)
	}

	// Max 3 retries, then the last 503 is returned.
	atomic.StoreInt32(&calls, 0)
	statuses = []int{503, 503, 503, 503, 503}
	sleeps = nil
	res, err = tr.do(context.Background(), http.MethodGet, srv.URL, nil, nil)
	if err != nil || res.Status != 503 || calls != 4 || len(sleeps) != 3 || sleeps[2] != 400*time.Millisecond {
		t.Fatalf("res %+v err %v calls %d sleeps %v", res, err, calls, sleeps)
	}

	// 400 / 404 are not retried.
	for _, s := range []int{400, 401, 404} {
		atomic.StoreInt32(&calls, 0)
		statuses = []int{s, 200}
		res, _ = tr.do(context.Background(), http.MethodGet, srv.URL, nil, nil)
		if res.Status != s || calls != 1 {
			t.Fatalf("status %d retried: calls %d", s, calls)
		}
	}
}

func TestTransportTimeoutAndNetworkError(t *testing.T) {
	block := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-block:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	defer close(block)
	tr := newTransport(HTTPOptions{Timeout: 50 * time.Millisecond, Retries: 1})
	tr.sleep = func(context.Context, time.Duration) error { return nil }
	_, err := tr.do(context.Background(), http.MethodGet, srv.URL, nil, nil)
	if !IsTimeout(err) || ErrorCode(err) != CodeTimeout {
		t.Fatalf("err %v", err)
	}
	// Connection refused → network_error.
	_, err = tr.do(context.Background(), http.MethodGet, "http://127.0.0.1:1/", nil, nil)
	if !IsNetworkError(err) {
		t.Fatalf("err %v", err)
	}
}

func TestErrorFromResponse(t *testing.T) {
	e := errorFromResponse(&httpResponse{Status: 400, Body: []byte(`{"error":{"code":"unsupported_codec","message":"No common codec","timestamp":"x"}}`)}, CodeInternalError)
	if e.Code != CodeUnsupportedCodec || e.Message != "No common codec" || e.HTTPStatus != 400 {
		t.Fatalf("%+v", e)
	}
	e = errorFromResponse(&httpResponse{Status: 404, Body: []byte(`{"verified":false,"error":"call_not_found"}`)}, CodeInternalError)
	if e.Code != CodeCallNotFound {
		t.Fatalf("%+v", e)
	}
	e = errorFromResponse(&httpResponse{Status: 500, Body: []byte(`<html>`)}, "")
	if e.Code != CodeInternalError {
		t.Fatalf("%+v", e)
	}
}
