package pstn2

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ---- fixtures -----------------------------------------------------------------

type fixtureCP struct {
	NumberDatabase
	Key string `json:"key"`
}

type networkFixture struct {
	BaseURL       string            `json:"baseUrl"`
	NumberingList NumberingListData `json:"numberingList"`
	Cps           []fixtureCP       `json:"cps"`
	TestNumbers   []struct {
		Number string `json:"number"`
		Expect string `json:"expect"`
	} `json:"testNumbers"`
}

type scenario struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	CallerCp string `json:"callerCp"`
	Number   string `json:"number"`
	Before   *struct {
		Port *struct {
			Number   string `json:"number"`
			FromCPID string `json:"fromCpId"`
			ToCPID   string `json:"toCpId"`
		} `json:"port"`
	} `json:"before"`
	Expect struct {
		Result      string   `json:"result"`
		HolderCpID  string   `json:"holderCpId"`
		Ported      bool     `json:"ported"`
		FromCache   bool     `json:"fromCache"`
		Invalidated bool     `json:"invalidated"`
		Hops        []string `json:"hops"`
	} `json:"expect"`
}

// repoRoot finds the PSTN2 repository root (the directory holding
// test-environment/). Tests that need it skip when the module is used
// outside the repository.
func repoRoot(t testing.TB) string {
	t.Helper()
	dir, _ := os.Getwd()
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "test-environment", "mock-network", "server.mjs")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Skip("PSTN2 repository (test-environment/) not found; skipping fixture-based test")
	return ""
}

func readJSONFile(t testing.TB, path string, out any) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if err := json.Unmarshal(data, out); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
}

func loadHarness(t testing.TB) networkFixture {
	var f networkFixture
	readJSONFile(t, filepath.Join(repoRoot(t), "test-environment", "fixtures", "harness-network.json"), &f)
	return f
}

func loadTestCP(t testing.TB) networkFixture {
	var f networkFixture
	readJSONFile(t, filepath.Join(repoRoot(t), "test-environment", "fixtures", "testcp-network.json"), &f)
	return f
}

func loadScenarios(t testing.TB) []scenario {
	var s struct {
		Scenarios []scenario `json:"scenarios"`
	}
	readJSONFile(t, filepath.Join(repoRoot(t), "test-environment", "fixtures", "scenarios.json"), &s)
	if len(s.Scenarios) == 0 {
		t.Fatal("no scenarios")
	}
	return s.Scenarios
}

// checkScenario asserts a discovery result against a scenario expectation.
func checkScenario(t *testing.T, sc scenario, got *DiscoveryResult) {
	t.Helper()
	e := sc.Expect
	if got.Result != e.Result {
		t.Errorf("%s %s: result = %q (%s %s), want %q", sc.ID, sc.Title, got.Result, got.Error, got.Detail, e.Result)
	}
	if strings.Join(got.Hops, ",") != strings.Join(e.Hops, ",") {
		t.Errorf("%s: hops = %v, want %v", sc.ID, got.Hops, e.Hops)
	}
	if e.HolderCpID != "" && (got.Holder == nil || got.Holder.CPID != e.HolderCpID) {
		t.Errorf("%s: holder = %+v, want %s", sc.ID, got.Holder, e.HolderCpID)
	}
	if got.Ported != e.Ported {
		t.Errorf("%s: ported = %v, want %v", sc.ID, got.Ported, e.Ported)
	}
	if got.FromCache != e.FromCache {
		t.Errorf("%s: fromCache = %v, want %v", sc.ID, got.FromCache, e.FromCache)
	}
	if got.Invalidated != e.Invalidated {
		t.Errorf("%s: invalidated = %v, want %v", sc.ID, got.Invalidated, e.Invalidated)
	}
}

// ---- node processes -----------------------------------------------------------

func requireNode(t testing.TB) string {
	t.Helper()
	p, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node not on PATH; skipping integration test")
	}
	return p
}

func freePort(t testing.TB) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// startNode runs a node script and waits until url answers (any status).
func startNode(t testing.TB, readyURL string, args ...string) {
	t.Helper()
	node := requireNode(t)
	cmd := exec.Command(node, args...)
	stderr, _ := cmd.StderrPipe()
	cmd.Stdout = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start node %v: %v", args, err)
	}
	var errText strings.Builder
	go func() {
		s := bufio.NewScanner(stderr)
		for s.Scan() {
			errText.WriteString(s.Text() + "\n")
		}
	}()
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		req, _ := http.NewRequest(http.MethodGet, readyURL, nil)
		req.Header.Set("User-Agent", UserAgent)
		if res, err := http.DefaultClient.Do(req); err == nil {
			res.Body.Close()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("node %v did not start: %s", args, errText.String())
}

// startMock starts test-environment/mock-network/server.mjs on a free port and
// returns its base URL (e.g. http://127.0.0.1:53123).
func startMock(t testing.TB) string {
	t.Helper()
	root := repoRoot(t)
	port := freePort(t)
	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	startNode(t, base+"/health", filepath.Join(root, "test-environment", "mock-network", "server.mjs"), "--port", fmt.Sprint(port))
	return base
}

// staticCP is a built and served copy of the dummy test CP.
type staticCP struct {
	Base    string // http://127.0.0.1:<port>/testcp
	Dir     string
	KeyFile string
}

// startStatic builds the dummy test CP into a temp dir (with temporary
// signing keys, never the repo's) and serves it with the static host emulator.
func startStatic(t testing.TB) staticCP {
	t.Helper()
	root := repoRoot(t)
	node := requireNode(t)
	port := freePort(t)
	tmp := t.TempDir()
	s := staticCP{Base: fmt.Sprintf("http://127.0.0.1:%d/testcp", port), Dir: filepath.Join(tmp, "site"), KeyFile: filepath.Join(tmp, "keys.json")}
	cmd := exec.Command(node, filepath.Join(root, "tools", "testcp", "build.mjs"), "--base", s.Base, "--out", s.Dir)
	cmd.Env = append(os.Environ(), "PSTN2_TESTCP_KEYS="+s.KeyFile)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build.mjs: %v\n%s", err, out)
	}
	startNode(t, s.Base+"/numbering-list.json", filepath.Join(root, "test-environment", "mock-network", "static-server.mjs"),
		"--dir", s.Dir, "--port", fmt.Sprint(port))
	return s
}

func adminPost(t testing.TB, base, path string, body any) {
	t.Helper()
	tr := newTransport(HTTPOptions{Retries: -1})
	res, err := tr.do(context.Background(), http.MethodPost, base+path, body, nil)
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	if res.Status != 200 {
		t.Fatalf("POST %s: HTTP %d %s", path, res.Status, res.Body)
	}
}

func adminPort(t testing.TB, base, number, from, to string) {
	adminPost(t, base, "/admin/port", map[string]string{"number": number, "fromCpId": from, "toCpId": to})
}

type logEntry struct {
	CPID      string `json:"cpId"`
	Number    string `json:"number"`
	Op        string `json:"op"`
	Result    string `json:"result"`
	UserAgent string `json:"userAgent"`
}

func adminLog(t testing.TB, base string) []logEntry {
	t.Helper()
	tr := newTransport(HTTPOptions{Retries: -1})
	res, err := tr.do(context.Background(), http.MethodGet, base+"/admin/log", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var l []logEntry
	if err := json.Unmarshal(res.Body, &l); err != nil {
		t.Fatal(err)
	}
	return l
}

// ---- in-memory network over RangeHolderResponders ----------------------------

// memNetwork mirrors the reference engine's Network: one RangeHolderResponder
// per CP, with port() touching only the losing CP, the gaining CP and the
// Range Holder.
type memNetwork struct {
	list    *NumberingList
	cps     map[string]*RangeHolderResponder // cpId → responder
	byURL   map[string]string                // url → cpId
	issued  string
	queries []string
}

func newMemNetwork(f networkFixture) *memNetwork {
	m := &memNetwork{list: NewNumberingList(f.NumberingList), cps: map[string]*RangeHolderResponder{}, byURL: map[string]string{}, issued: "2026-10-06T09:00:00.000Z"}
	refs := map[string]CpRef{}
	for _, cp := range f.Cps {
		refs[cp.CPID] = cp.Ref()
	}
	resolve := func(id string) (CpRef, bool) { r, ok := refs[id]; return r, ok }
	for _, cp := range f.Cps {
		m.cps[cp.CPID] = NewRangeHolderResponder(ResponderConfig{DB: cp.NumberDatabase, Resolve: resolve, IsAllocated: m.rangeHolderKnown})
		m.byURL[trimSlash(cp.URL)] = cp.CPID
	}
	return m
}

// rangeHolderKnown is the reference engine's `this.rangeHolderOf(n)` truthiness.
func (m *memNetwork) rangeHolderKnown(n string) bool {
	b := m.list.FindBlock(n)
	return b != nil && m.cps[b.CPID] != nil
}

func (m *memNetwork) query(_ context.Context, target CpRef, number string) (int, []byte, error) {
	id, ok := m.byURL[trimSlash(target.URL)]
	if !ok {
		return 0, nil, fmt.Errorf("no CP at %s", target.URL)
	}
	m.queries = append(m.queries, id)
	status, body := m.cps[id].RespondAt(number, m.issued)
	data, _ := json.Marshal(body)
	return status, data, nil
}

func removeStr(list []string, s string) []string {
	out := list[:0:0]
	for _, x := range list {
		if x != s {
			out = append(out, x)
		}
	}
	return out
}

func (m *memNetwork) port(number, fromID, toID string) {
	n := E164(number)
	b := m.list.FindBlock(n)
	rhID := b.CPID
	m.cps[fromID].Update(func(db *NumberDatabase) {
		db.InService = removeStr(db.InService, n)
		var keep []PortedIn
		for _, p := range db.PortedIn {
			if p.Number != n {
				keep = append(keep, p)
			}
		}
		db.PortedIn = keep
		if fromID != rhID && !contains(db.PreviouslyHeld, n) {
			db.PreviouslyHeld = append(db.PreviouslyHeld, n)
		}
	})
	if toID == rhID {
		m.cps[rhID].Update(func(db *NumberDatabase) {
			var keep []PortedOut
			for _, p := range db.PortedOut {
				if p.Number != n {
					keep = append(keep, p)
				}
			}
			db.PortedOut = keep
			if !contains(db.InService, n) {
				db.InService = append(db.InService, n)
			}
		})
		return
	}
	m.cps[toID].Update(func(db *NumberDatabase) {
		db.PortedIn = append(db.PortedIn, PortedIn{Number: n, FromCPID: fromID})
		db.PreviouslyHeld = removeStr(db.PreviouslyHeld, n)
	})
	m.cps[rhID].Update(func(db *NumberDatabase) {
		found := false
		for i := range db.PortedOut {
			if db.PortedOut[i].Number == n {
				db.PortedOut[i].ToCPID, found = toID, true
			}
		}
		if !found {
			db.PortedOut = append(db.PortedOut, PortedOut{Number: n, ToCPID: toID})
		}
		db.InService = removeStr(db.InService, n)
	})
}
