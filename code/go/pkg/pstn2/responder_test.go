package pstn2

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// subjects returns every number the fixture mentions plus some it doesn't.
func subjects(f networkFixture) []string {
	set := map[string]bool{"+441614960999": true, "+441174960555": true, "+441154960555": true, "+442079460999": true, "+447700900099": true}
	for _, cp := range f.Cps {
		for _, n := range cp.InService {
			set[n] = true
		}
		for _, p := range cp.PortedIn {
			set[p.Number] = true
		}
		for _, p := range cp.PortedOut {
			set[p.Number] = true
		}
		for _, n := range cp.PreviouslyHeld {
			set[n] = true
		}
	}
	out := make([]string, 0, len(set))
	for n := range set {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

func TestRangeHolderResponderAnswers(t *testing.T) {
	m := newMemNetwork(loadHarness(t))
	const issued = "2026-10-06T09:00:00.000Z"
	cases := []struct {
		cp, number string
		status     int
		result     string
		check      func(map[string]any) bool
	}{
		{"CP1-UK-0102", "+441614960123", 200, "held", func(b map[string]any) bool {
			h := b["holder"].(map[string]any)
			return h["cpId"] == "CP1-UK-0102" && b["ported"] == false
		}},
		{"CP1-UK-0103", "+441134960456", 200, "redirect", func(b map[string]any) bool {
			return b["portedTo"].(map[string]any)["cpId"] == "CP1-UK-0102" && b["portedTo"].(map[string]any)["url"] == "https://pstn2.bravo-networks.example"
		}},
		{"CP1-UK-0102", "+441134960456", 200, "held", func(b map[string]any) bool { return b["ported"] == true }},
		{"CP1-UK-0101", "+441134960456", 200, "not_held", func(b map[string]any) bool {
			c := b["cache"].(map[string]any)
			return c["invalidate"] == true && c["scope"] == "number"
		}},
		{"CP1-UK-0102", "+441614960999", 404, "unknown", nil},
		{"CP1-UK-0101", "+441154960555", 404, "unknown", nil}, // unallocated: not anyone's
		{"CP1-UK-0101", "+441174960555", 404, "unknown", nil}, // non-participating Range Holder
	}
	for _, c := range cases {
		status, body := m.cps[c.cp].RespondAt(c.number, issued)
		if status != c.status || body["result"] != c.result || body["number"] != c.number {
			t.Errorf("%s %s: %d %v", c.cp, c.number, status, body)
			continue
		}
		if status == 200 && (body["version"] != "1.1" || body["issued"] != issued) {
			t.Errorf("%s %s: envelope %v", c.cp, c.number, body)
		}
		if c.check != nil && !c.check(body) {
			t.Errorf("%s %s: body %v", c.cp, c.number, body)
		}
	}

	// The default IsAllocated (numbering list lookup) gives the same answers
	// as the reference engine's rangeHolderOf() for the fixture.
	f := loadHarness(t)
	list := NewNumberingList(f.NumberingList)
	for _, cp := range f.Cps {
		r := NewRangeHolderResponder(ResponderConfig{DB: cp.NumberDatabase, NumberingList: list, Resolve: ResolverFromList(list)})
		for _, n := range subjects(f) {
			s1, b1 := r.RespondAt(n, issued)
			s2, b2 := m.cps[cp.CPID].RespondAt(n, issued)
			if s1 != s2 || b1["result"] != b2["result"] {
				t.Errorf("%s %s: default %d %v vs %d %v", cp.CPID, n, s1, b1, s2, b2)
			}
		}
	}
}

// TestRangeHolderResponderParity compares every answer with the reference
// engine's Network.respond() (harness-engine.js) run under node.
func TestRangeHolderResponderParity(t *testing.T) {
	node := requireNode(t)
	root := repoRoot(t)
	f := loadHarness(t)
	m := newMemNetwork(f)
	const issued = "2026-10-06T09:00:00Z"
	numbers := subjects(f)
	nums, _ := json.Marshal(numbers)
	engine := "file://" + filepath.ToSlash(filepath.Join(root, "animations", "src", "test-harness", "harness-engine.js"))
	fixture := filepath.Join(root, "test-environment", "fixtures", "harness-network.json")
	script := `const {Network}=await import(process.argv[1]);const fs=await import('node:fs');
const net=new Network(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));const nums=JSON.parse(process.argv[3]);const out={};
for(const cp of net.cps.values())for(const n of nums)out[cp.cpId+' '+n]=net.respond(cp.cpId,n,process.argv[4]);
process.stdout.write(JSON.stringify(out));`
	cmd := exec.Command(node, "--input-type=module", "-e", script, engine, fixture, string(nums), issued)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("node: %v", err)
	}
	var ref map[string]struct {
		Status int             `json:"status"`
		Body   json.RawMessage `json:"body"`
	}
	if err := json.Unmarshal(out, &ref); err != nil {
		t.Fatal(err)
	}
	if len(ref) != len(f.Cps)*len(numbers) {
		t.Fatalf("reference answers: %d", len(ref))
	}
	for key, want := range ref {
		parts := strings.SplitN(key, " ", 2)
		status, body := m.cps[parts[0]].RespondAt(parts[1], issued)
		got, _ := CanonicalJSON(body)
		exp, _ := CanonicalJSON(want.Body)
		if status != want.Status || string(got) != string(exp) {
			t.Errorf("%s:\n Go  %d %s\n ref %d %s", key, status, got, want.Status, exp)
		}
	}
}

func TestRangeHolderResponderHTTP(t *testing.T) {
	f := loadHarness(t)
	list := NewNumberingList(f.NumberingList)
	_, priv, _ := ed25519GenerateKey()
	bravo := f.Cps[1]
	r := NewRangeHolderResponder(ResponderConfig{DB: bravo.NumberDatabase, NumberingList: list, Resolve: ResolverFromList(list), KeyID: "bravo-test", PrivateKey: priv})
	srv := httptest.NewServer(r)
	defer srv.Close()

	res, err := http.Get(srv.URL + "/pstn2/v1/keys")
	if err != nil {
		t.Fatal(err)
	}
	var ks KeySet
	_ = json.NewDecoder(res.Body).Decode(&ks)
	res.Body.Close()
	if ks.CPID != bravo.CPID || len(ks.Keys) != 1 || ks.Keys[0].Kid != "bravo-test" {
		t.Fatalf("keys = %+v", ks)
	}
	pub, _ := ParsePublicKey(ks.Keys[0].PublicKey)

	res, err = http.Get(srv.URL + "/pstn2/v1/numbers/441614960123")
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	_ = json.NewDecoder(res.Body).Decode(&body)
	res.Body.Close()
	if res.StatusCode != 200 || body["result"] != "held" || body["kid"] != "bravo-test" {
		t.Fatalf("answer %d %v", res.StatusCode, body)
	}
	if err := VerifySignature(body, pub); err != nil {
		t.Fatalf("signature: %v", err)
	}
	res, _ = http.Get(srv.URL + "/pstn2/v1/numbers/441614960999")
	res.Body.Close()
	if res.StatusCode != 404 {
		t.Fatalf("not in service: %d", res.StatusCode)
	}
	db := r.Database()
	if !reflect.DeepEqual(db.Ranges, bravo.Ranges) {
		t.Fatal("Database copy")
	}
}
