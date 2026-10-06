"""Ed25519 keys, canonical JSON and signatures (SPECIFICATION.md §3.3, §9.6).

Canonical JSON: object keys sorted at every level, no insignificant whitespace, ``/``
not escaped, non-ASCII left unescaped — i.e.
``json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)``.
A body is signed over the UTF-8 bytes of the canonical JSON of the body *without*
its ``signature`` field (``kid`` is included).
"""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


def canonical_json(obj: Any) -> str:
    """Canonical JSON per §9.6."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True)
class KeyPair:
    """An Ed25519 key pair; both halves raw 32 bytes, base64-encoded."""

    private_key: str
    public_key: str

    @property
    def fingerprint(self) -> str:
        return fingerprint(self.public_key)


def generate_key_pair() -> KeyPair:
    key = Ed25519PrivateKey.generate()
    return KeyPair(private_key=_b64(_raw_private(key)), public_key=public_key_of(key))


def load_private_key(key: str | bytes | Ed25519PrivateKey) -> Ed25519PrivateKey:
    """Load an Ed25519 private key from PEM (PKCS#8), raw 32 bytes, or base64 of either."""
    if isinstance(key, Ed25519PrivateKey):
        return key
    data = key.encode() if isinstance(key, str) else key
    if b"-----BEGIN" in data:
        loaded = serialization.load_pem_private_key(data, password=None)
        if not isinstance(loaded, Ed25519PrivateKey):
            raise ValueError("PEM key is not an Ed25519 private key")
        return loaded
    if isinstance(key, bytes) and len(key) == 32:
        return Ed25519PrivateKey.from_private_bytes(key)
    raw = base64.b64decode(data)
    if len(raw) == 32:
        return Ed25519PrivateKey.from_private_bytes(raw)
    loaded = serialization.load_der_private_key(raw, password=None)
    if not isinstance(loaded, Ed25519PrivateKey):
        raise ValueError("DER key is not an Ed25519 private key")
    return loaded


def load_public_key(key: str | bytes | Ed25519PublicKey) -> Ed25519PublicKey:
    """Load an Ed25519 public key from raw 32 bytes or its base64 (the ``/keys`` format)."""
    if isinstance(key, Ed25519PublicKey):
        return key
    raw = key if isinstance(key, bytes) and len(key) == 32 else base64.b64decode(key)
    if len(raw) != 32:
        raise ValueError("Ed25519 public key must be 32 bytes")
    return Ed25519PublicKey.from_public_bytes(raw)


def public_key_of(private_key: str | bytes | Ed25519PrivateKey) -> str:
    """Base64 raw public key for a private key."""
    pub = load_private_key(private_key).public_key()
    return _b64(pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw))


def fingerprint(public_key: str) -> str:
    """``sha256:<hex>`` fingerprint of a base64 public key (§7.1)."""
    return "sha256:" + hashlib.sha256(base64.b64decode(public_key)).hexdigest()


def sign_bytes(data: bytes, private_key: str | bytes | Ed25519PrivateKey) -> str:
    return _b64(load_private_key(private_key).sign(data))


def verify_bytes(data: bytes, signature: str, public_key: str | bytes | Ed25519PublicKey) -> bool:
    try:
        load_public_key(public_key).verify(base64.b64decode(signature), data)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def sign_body(body: Mapping[str, Any], private_key: str | bytes | Ed25519PrivateKey, kid: str | None = None) -> dict[str, Any]:
    """Return a copy of ``body`` with ``kid`` (if given) and ``signature`` added (§9.6)."""
    unsigned = {k: v for k, v in body.items() if k != "signature"}
    if kid is not None:
        unsigned["kid"] = kid
    sig = sign_bytes(canonical_json(unsigned).encode("utf-8"), private_key)
    return {**unsigned, "signature": sig}


def verify_body(body: Mapping[str, Any], public_key: str | bytes | Ed25519PublicKey) -> bool:
    """Verify ``body["signature"]`` over the canonical JSON of the rest of ``body``."""
    sig = body.get("signature")
    if not isinstance(sig, str) or not sig:
        return False
    unsigned = {k: v for k, v in body.items() if k != "signature"}
    return verify_bytes(canonical_json(unsigned).encode("utf-8"), sig, public_key)


def _raw_private(key: Ed25519PrivateKey) -> bytes:
    return key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


__all__ = [
    "KeyPair",
    "canonical_json",
    "fingerprint",
    "generate_key_pair",
    "load_private_key",
    "load_public_key",
    "public_key_of",
    "sign_body",
    "sign_bytes",
    "verify_body",
    "verify_bytes",
]
