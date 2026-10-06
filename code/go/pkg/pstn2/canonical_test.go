package pstn2

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"os/exec"
	"strings"
	"testing"
)

func TestCanonicalJSON(t *testing.T) {
	in := map[string]any{
		"z":      1,
		"a":      map[string]any{"y": []any{3, "x", nil, true}, "b": false},
		"url":    "https://pstn2.org/testcp/a",
		"name":   "Zoë Café → ☎",
		"html":   "<a&b>",
		"ctrl":   "tab\there\nnl \"q\" \\ \x01",
		"sep":    "  ",
		"float":  1.5,
		"big":    1e21,
		"small":  0.000001,
		"tiny":   1e-7,
		"int":    86400,
		"negz":   -0.0,
		"astral": "😀",
	}
	got, err := CanonicalJSON(in)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"a":{"b":false,"y":[3,"x",null,true]},"astral":"😀","big":1e+21,"ctrl":"tab\there\nnl \"q\" \\ \u0001","float":1.5,"html":"<a&b>","int":86400,"name":"Zoë Café → ☎","negz":0,"sep":"` + "  " + `","small":0.000001,"tiny":1e-7,"url":"https://pstn2.org/testcp/a","z":1}`
	if string(got) != want {
		t.Fatalf("CanonicalJSON:\n got %s\nwant %s", got, want)
	}

	// Structs and raw JSON canonicalise identically.
	type S struct {
		B string `json:"b"`
		A int    `json:"a"`
	}
	s1, _ := CanonicalJSON(S{B: "x/y", A: 2})
	s2, _ := CanonicalJSON(json.RawMessage(`{ "b" : "x\/y", "a" : 2.0 }`))
	if string(s1) != `{"a":2,"b":"x/y"}` || string(s1) != string(s2) {
		t.Fatalf("struct %s raw %s", s1, s2)
	}
}

// TestCanonicalJSONMatchesNode compares with the JavaScript reference
// (canonicalJson in tools/testcp/build.mjs: JSON.stringify with sorted keys).
func TestCanonicalJSONMatchesNode(t *testing.T) {
	node := requireNode(t)
	obj := `{"z":1,"a":{"y":[3,"x",null,true,1.25e-9,123456789012],"b":false},"u":"https://x.example/a?b=c&d=<e>","n":"Zoë ☎ 😀  ","c":"\u0007\t\"\\","é":1,"Z":2,"_":3,"ä":{"k":[]}}`
	script := `const canonicalJson=(v)=>{if(Array.isArray(v))return'['+v.map(canonicalJson).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map((k)=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';return JSON.stringify(v)};process.stdout.write(canonicalJson(JSON.parse(process.argv[1])))`
	out, err := exec.Command(node, "-e", script, obj).Output()
	if err != nil {
		t.Fatal(err)
	}
	got, err := CanonicalJSON(json.RawMessage(obj))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(out) {
		t.Fatalf("Go  %s\nJS  %s", got, out)
	}
}

func TestSignAndVerify(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	body := map[string]any{"version": "1.1", "result": "held", "number": "+441614960123",
		"holder": map[string]any{"cpId": "CP1-UK-0102", "cpName": "Bravo Networks", "url": "https://pstn2.bravo-networks.example"},
		"ported": false, "cache": map[string]any{"ttl": 86400}, "issued": "2026-10-06T09:00:00Z"}
	signed, err := SignBody(body, "bravo-2026-10", priv)
	if err != nil {
		t.Fatal(err)
	}
	if signed["kid"] != "bravo-2026-10" || signed["signature"] == "" {
		t.Fatalf("signed = %v", signed)
	}
	if _, ok := body["kid"]; ok {
		t.Fatal("SignBody modified its input")
	}
	if err := VerifySignature(signed, pub); err != nil {
		t.Fatalf("verify: %v", err)
	}
	// Round trip through the wire (indented JSON, different key order).
	wire, _ := json.MarshalIndent(signed, "", "  ")
	if err := VerifySignature(json.RawMessage(wire), pub); err != nil {
		t.Fatalf("verify wire: %v", err)
	}
	// Tampering is detected.
	tampered := strings.Replace(string(wire), "CP1-UK-0102", "CP1-UK-0666", 1)
	if err := VerifySignature(json.RawMessage(tampered), pub); err != ErrInvalidSignature {
		t.Fatalf("tampered: %v", err)
	}
	// Wrong key.
	other, _, _ := ed25519.GenerateKey(rand.Reader)
	if err := VerifySignature(signed, other); err != ErrInvalidSignature {
		t.Fatalf("wrong key: %v", err)
	}
	// Unsigned.
	if err := VerifySignature(body, pub); err != ErrUnsigned {
		t.Fatalf("unsigned: %v", err)
	}
	// Key encoding helpers.
	back, err := ParsePublicKey(PublicKeyBase64(pub))
	if err != nil || !back.Equal(pub) {
		t.Fatal("public key round trip")
	}
}

func TestParsePrivateKeyPEM(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	der, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	pemText := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	k, err := ParsePrivateKeyPEM(pemText)
	if err != nil {
		t.Fatal(err)
	}
	if !k.Equal(priv) {
		t.Fatal("PEM round trip")
	}
	if _, err := ParsePrivateKeyPEM("nope"); err == nil {
		t.Fatal("expected error")
	}
}
