#!/bin/bash
#
# PSTN2 conformance run — proves the reference engine and all three SDKs agree on
# Number Discovery, then runs every example against a live local mock network.
#
#   test-environment/conformance/run.sh            # everything
#   test-environment/conformance/run.sh --quick    # engine + SDK test suites only
#   test-environment/conformance/run.sh --live     # also run example 05 against https://pstn2.org/testcp
#
# Needs: node 18+, python 3.11+, go 1.21+. No Docker, no database.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
QUICK=0; LIVE=0
for a in "$@"; do case "$a" in --quick) QUICK=1 ;; --live) LIVE=1 ;; *) echo "usage: $0 [--quick] [--live]"; exit 2 ;; esac; done

PASS=(); FAIL=()
step() { # step <name> <command...>
    local name="$1"; shift
    printf '\n\033[1m▶ %s\033[0m\n' "$name"
    if "$@"; then PASS+=("$name"); else FAIL+=("$name"); fi
}

# --- 1. reference engine ------------------------------------------------------
step "Reference engine (node --test)" node --test "$REPO/test-environment/conformance/engine.test.mjs"

# --- 2. SDK test suites (each spawns its own mock network / static emulator) ---
step "TypeScript SDK tests" bash -c "cd '$REPO/code/typescript' && { [ -d node_modules ] || npm ci --silent; } && npm run build --silent && npm test --silent"
step "Python SDK tests" bash -c "cd '$REPO/code/python' && { [ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'; }; } && .venv/bin/python -m pytest -q"
step "Go SDK tests" bash -c "cd '$REPO/code/go' && go vet ./... && go test -count=1 ./..."

# --- 3. every example against a running mock network ----------------------------
if [ "$QUICK" = 0 ]; then
    PORT=$(( 47950 + RANDOM % 40 ))
    node "$REPO/test-environment/mock-network/server.mjs" --port "$PORT" > /dev/null 2>&1 &
    MOCK=$!
    trap 'kill $MOCK 2>/dev/null' EXIT
    for _ in $(seq 1 30); do curl -s -A pstn2-conformance "http://127.0.0.1:$PORT/health" > /dev/null && break; sleep 0.2; done
    export PSTN2_MOCK_PORT="$PORT" PSTN2_NETWORK=local
    for n in 01 02 03 04 05; do
        step "TypeScript example $n" bash -c "cd '$REPO/code/typescript' && npm run --silent example:$n > /dev/null"
        py=$(ls "$REPO/code/python/examples/${n}_"*.py)
        step "Python example $n" bash -c "cd '$REPO/code/python' && .venv/bin/python '$py' > /dev/null"
        go=$(ls -d "$REPO/code/go/examples/${n}-"*)
        step "Go example $n" bash -c "cd '$REPO/code/go' && go run './examples/$(basename "$go")' > /dev/null"
    done
    kill $MOCK 2>/dev/null; trap - EXIT
fi

# --- 4. optional: the live dummy test CP ------------------------------------------
if [ "$LIVE" = 1 ]; then
    export PSTN2_NETWORK=live; unset PSTN2_MOCK_PORT
    step "TypeScript 05 live (pstn2.org/testcp)" bash -c "cd '$REPO/code/typescript' && npm run --silent example:05"
    step "Python 05 live (pstn2.org/testcp)" bash -c "cd '$REPO/code/python' && .venv/bin/python examples/05_number_discovery.py"
    step "Go 05 live (pstn2.org/testcp)" bash -c "cd '$REPO/code/go' && go run ./examples/05-number-discovery"
fi

printf '\n\033[1mConformance: %d passed, %d failed\033[0m\n' "${#PASS[@]}" "${#FAIL[@]}"
for f in "${FAIL[@]:-}"; do [ -n "$f" ] && printf '  \033[31m✗ %s\033[0m\n' "$f"; done
[ "${#FAIL[@]}" = 0 ]
