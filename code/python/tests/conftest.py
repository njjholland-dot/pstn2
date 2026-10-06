"""Shared fixtures: repo paths, fixtures, and the local servers (mock network, static
emulator of the dummy test CP) started on free ports and killed afterwards."""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path
from typing import Any, Iterator

import httpx
import pytest

PY_ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "test-environment" / "fixtures"
MOCK_SERVER = REPO / "test-environment" / "mock-network" / "server.mjs"
STATIC_SERVER = REPO / "test-environment" / "mock-network" / "static-server.mjs"
TESTCP_BUILD = REPO / "tools" / "testcp" / "build.mjs"
REFERENCE_ENGINE = Path(__file__).resolve().parent / "reference_engine.mjs"

NODE = shutil.which("node")
requires_node = pytest.mark.skipif(NODE is None, reason="node is required for the mock network")


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text())


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_port(port: int, proc: subprocess.Popen, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            out = proc.stdout.read().decode() if proc.stdout else ""
            raise RuntimeError(f"server exited early ({proc.returncode}): {out}")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError(f"server on port {port} did not start")


def _stop(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    if proc.stdout is not None:
        proc.stdout.close()


@pytest.fixture(scope="session")
def harness_fixture() -> dict[str, Any]:
    return load_fixture("harness-network.json")


@pytest.fixture(scope="session")
def scenarios() -> list[dict[str, Any]]:
    return load_fixture("scenarios.json")["scenarios"]


@pytest.fixture(scope="session")
def testcp_fixture() -> dict[str, Any]:
    return load_fixture("testcp-network.json")


@pytest.fixture(scope="session")
def mock_network() -> Iterator[str]:
    """Base URL (http://127.0.0.1:<port>) of a running mock network."""
    if NODE is None:
        pytest.skip("node is required for the mock network")
    port = free_port()
    proc = subprocess.Popen([NODE, str(MOCK_SERVER), "--port", str(port)], stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, cwd=str(REPO))
    try:
        _wait_for_port(port, proc)
        yield f"http://127.0.0.1:{port}"
    finally:
        _stop(proc)


@pytest.fixture()
def mock(mock_network: str) -> str:
    """The mock network, reset to its fixture state for this test."""
    r = httpx.post(f"{mock_network}/admin/reset", headers={"User-Agent": "pstn2-python-sdk-tests"})
    assert r.status_code == 200
    return mock_network


@pytest.fixture(scope="session")
def testcp_site(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    """Static emulator of the live dummy test CP, built into a temp dir and served."""
    if NODE is None:
        pytest.skip("node is required for the static emulator")
    tmp = tmp_path_factory.mktemp("testcp")
    port = free_port()
    base = f"http://127.0.0.1:{port}/testcp"
    site = tmp / "site"
    env = {**os.environ, "PSTN2_TESTCP_KEYS": str(tmp / "keys.json")}  # never touch tools/testcp/.keys.json
    subprocess.run([NODE, str(TESTCP_BUILD), "--base", base, "--out", str(site)], check=True, env=env,
                   cwd=str(REPO), capture_output=True)
    proc = subprocess.Popen([NODE, str(STATIC_SERVER), "--dir", str(site), "--port", str(port)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=str(REPO))
    try:
        _wait_for_port(port, proc)
        yield {"base": base, "dir": site, "list_url": f"{base}/numbering-list.json", "port": port}
    finally:
        _stop(proc)


def run_reference(*args: str) -> Any:
    out = subprocess.run([NODE, str(REFERENCE_ENGINE), str(REPO), *args], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)
