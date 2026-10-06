package pstn2

import (
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"sync"
)

// Signature errors.
var (
	ErrUnsigned         = errors.New("pstn2: response is not signed")
	ErrInvalidSignature = errors.New("pstn2: signature does not verify")
	ErrUnknownKey       = errors.New("pstn2: signing key not published by CP")
)

// toObject turns any JSON-marshalable value into a generic JSON object.
func toObject(v any) (map[string]any, error) {
	var raw []byte
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = val
		}
		return out, nil
	case json.RawMessage:
		raw = x
	default:
		var err error
		if raw, err = json.Marshal(v); err != nil {
			return nil, err
		}
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, err
	}
	if obj == nil {
		return nil, errors.New("pstn2: body is not a JSON object")
	}
	return obj, nil
}

// SignBody adds "kid" and an Ed25519 "signature" over CanonicalJSON(body + kid)
// (§9.6) and returns the signed object. body may be a struct, a map or a
// json.RawMessage; it is not modified.
func SignBody(body any, kid string, key ed25519.PrivateKey) (map[string]any, error) {
	obj, err := toObject(body)
	if err != nil {
		return nil, err
	}
	delete(obj, "signature")
	if kid != "" {
		obj["kid"] = kid
	}
	msg, err := CanonicalJSON(obj)
	if err != nil {
		return nil, err
	}
	obj["signature"] = base64.StdEncoding.EncodeToString(ed25519.Sign(key, msg))
	return obj, nil
}

// VerifySignature checks the Ed25519 "signature" of body against pub, over
// CanonicalJSON(body without "signature") (§9.6). It returns ErrUnsigned when
// there is no signature and ErrInvalidSignature when it does not verify.
func VerifySignature(body any, pub ed25519.PublicKey) error {
	obj, err := toObject(body)
	if err != nil {
		return err
	}
	sigText, _ := obj["signature"].(string)
	if sigText == "" {
		return ErrUnsigned
	}
	sig, err := decodeBase64(sigText)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return ErrInvalidSignature
	}
	delete(obj, "signature")
	msg, err := CanonicalJSON(obj)
	if err != nil {
		return err
	}
	if len(pub) != ed25519.PublicKeySize || !ed25519.Verify(pub, msg, sig) {
		return ErrInvalidSignature
	}
	return nil
}

func decodeBase64(s string) ([]byte, error) {
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if b, err := enc.DecodeString(s); err == nil {
			return b, nil
		}
	}
	return nil, errors.New("pstn2: invalid base64")
}

// PublicKeyBase64 encodes a raw Ed25519 public key as published in a KeySet.
func PublicKeyBase64(pub ed25519.PublicKey) string {
	return base64.StdEncoding.EncodeToString(pub)
}

// ParsePublicKey decodes a KeySet publicKey (base64 of the raw 32 bytes).
func ParsePublicKey(b64 string) (ed25519.PublicKey, error) {
	b, err := decodeBase64(b64)
	if err != nil {
		return nil, err
	}
	if len(b) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("pstn2: public key is %d bytes, want %d", len(b), ed25519.PublicKeySize)
	}
	return ed25519.PublicKey(b), nil
}

// ParsePrivateKeyPEM parses a PKCS#8 PEM Ed25519 private key (the format
// written by tools/testcp/build.mjs and `openssl genpkey -algorithm ed25519`).
func ParsePrivateKeyPEM(pemText string) (ed25519.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemText))
	if block == nil {
		return nil, errors.New("pstn2: no PEM block found")
	}
	k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	priv, ok := k.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("pstn2: PEM key is %T, not Ed25519", k)
	}
	return priv, nil
}

// KeyStore fetches and caches CPs' public keys from {url}/pstn2/v1/keys.
// It is safe for concurrent use.
type KeyStore struct {
	http *transport
	mu   sync.Mutex
	sets map[string]map[string]ed25519.PublicKey // CP URL → kid → key
}

// NewKeyStore returns an empty key store using the given HTTP options.
func NewKeyStore(o HTTPOptions) *KeyStore {
	return &KeyStore{http: newTransport(o), sets: map[string]map[string]ed25519.PublicKey{}}
}

// Add registers a key for a CP without fetching (for tests or pinned keys).
func (s *KeyStore) Add(cp CpRef, kid string, pub ed25519.PublicKey) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u := trimSlash(cp.URL)
	if s.sets[u] == nil {
		s.sets[u] = map[string]ed25519.PublicKey{}
	}
	s.sets[u][kid] = pub
}

// Clear drops every cached key.
func (s *KeyStore) Clear() {
	s.mu.Lock()
	s.sets = map[string]map[string]ed25519.PublicKey{}
	s.mu.Unlock()
}

// Key returns cp's public key named kid, fetching the CP's key set when the
// kid is not cached yet (which also picks up key rotation).
func (s *KeyStore) Key(ctx context.Context, cp CpRef, kid string) (ed25519.PublicKey, error) {
	u := trimSlash(cp.URL)
	s.mu.Lock()
	if k, ok := s.sets[u][kid]; ok {
		s.mu.Unlock()
		return k, nil
	}
	s.mu.Unlock()

	res, err := s.http.do(ctx, http.MethodGet, cp.KeysURL(), nil, nil)
	if err != nil {
		return nil, err
	}
	if res.Status != http.StatusOK {
		return nil, &Error{Code: CodeInvalidSignature, Message: "key set unavailable", HTTPStatus: res.Status, URL: res.URL}
	}
	var ks KeySet
	if err := decodeJSON(res, &ks); err != nil {
		return nil, err
	}
	set := map[string]ed25519.PublicKey{}
	for _, k := range ks.Keys {
		if k.Algorithm != "" && k.Algorithm != "ed25519" {
			continue
		}
		pub, err := ParsePublicKey(k.PublicKey)
		if err != nil {
			continue
		}
		set[k.Kid] = pub
	}
	s.mu.Lock()
	s.sets[u] = set
	s.mu.Unlock()
	if k, ok := set[kid]; ok {
		return k, nil
	}
	return nil, ErrUnknownKey
}

// VerifyFrom verifies a response body signed by cp, selecting the key by the
// body's "kid".
func (s *KeyStore) VerifyFrom(ctx context.Context, cp CpRef, body any) error {
	obj, err := toObject(body)
	if err != nil {
		return err
	}
	sig, _ := obj["signature"].(string)
	kid, _ := obj["kid"].(string)
	if sig == "" {
		return ErrUnsigned
	}
	pub, err := s.Key(ctx, cp, kid)
	if err != nil {
		return err
	}
	return VerifySignature(obj, pub)
}
