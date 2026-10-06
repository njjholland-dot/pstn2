"""Unit tests: canonical JSON (§9.6) and Ed25519 signatures, including answers signed by
the Node build of the dummy test CP (tools/testcp/build.mjs)."""

from __future__ import annotations

import json

import pytest

from pstn2 import canonical_json, generate_key_pair, public_key_of, sign_body, verify_body
from pstn2.crypto import fingerprint, load_private_key

from .conftest import requires_node


def test_canonical_json_rules() -> None:
    obj = {"b": 1, "a": {"z": [3, {"y": True, "x": None}], "c": "https://x.example/a/b"}, "é": "café"}
    s = canonical_json(obj)
    assert s == '{"a":{"c":"https://x.example/a/b","z":[3,{"x":null,"y":true}]},"b":1,"é":"café"}'
    assert "\\/" not in s and " " not in s and "\\u" not in s


def test_sign_and_verify_roundtrip() -> None:
    kp = generate_key_pair()
    body = {"version": "1.1", "result": "held", "number": "+447700900001",
            "holder": {"cpId": "CP1-UK-9001", "cpName": "Test CP A", "url": "https://x/a"}, "cache": {"ttl": 86400}}
    signed = sign_body(body, kp.private_key, kid="a-1")
    assert signed["kid"] == "a-1" and "signature" in signed
    assert verify_body(signed, kp.public_key)
    # key order on the wire does not matter
    assert verify_body(json.loads(json.dumps(dict(reversed(list(signed.items()))))), kp.public_key)
    tampered = {**signed, "holder": {**signed["holder"], "url": "https://evil.example"}}
    assert not verify_body(tampered, kp.public_key)
    assert not verify_body({**signed, "kid": "a-2"}, kp.public_key)
    assert not verify_body(signed, generate_key_pair().public_key)
    assert not verify_body(body, kp.public_key)  # unsigned
    assert fingerprint(kp.public_key).startswith("sha256:")
    assert public_key_of(load_private_key(kp.private_key)) == kp.public_key


@requires_node
def test_verifies_node_signed_testcp_answers(testcp_site) -> None:
    site = testcp_site["dir"]
    checked = 0
    for cp in ("a", "b"):
        keys = json.loads((site / cp / "pstn2" / "v1" / "keys").read_text())
        pub = {k["kid"]: k["publicKey"] for k in keys["keys"]}
        for f in sorted((site / cp / "pstn2" / "v1" / "numbers").iterdir()):
            if f.name.startswith("."):
                continue
            body = json.loads(f.read_text())
            assert verify_body(body, pub[body["kid"]]), f
            # and fails for the other CP's key
            other = "b" if cp == "a" else "a"
            okeys = json.loads((site / other / "pstn2" / "v1" / "keys").read_text())
            assert not verify_body(body, okeys["keys"][0]["publicKey"])
            checked += 1
    assert checked >= 6
