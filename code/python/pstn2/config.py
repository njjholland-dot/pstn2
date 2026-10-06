"""Configuration from the environment (shared by the examples and :meth:`PSTN2Client.from_env`).

=========================== ==============================================================
``PSTN2_NETWORK``           ``local`` (default) or ``live``
``PSTN2_MOCK_PORT``         local mock network port (default 47901)
``PSTN2_NUMBERING_LIST_URL`` overrides the numbering list URL for either network
``PSTN2_CP_ID``             acting CP id (local default ``CP1-UK-0101`` Alpha Telecom;
                            live default ``CP1-UK-TEST-CLIENT``)
``PSTN2_VERIFY_SIGNATURES`` ``1``/``0`` (default on for live, off for local)
``PSTN2_PRIVATE_KEY``       optional Ed25519 private key (PEM or base64); an ephemeral
                            key is generated if unset
=========================== ==============================================================
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

LIVE_NUMBERING_LIST_URL = "https://pstn2.org/testcp/numbering-list.json"
DEFAULT_MOCK_PORT = 47901
LOCAL_DEFAULT_CP_ID = "CP1-UK-0101"
LIVE_DEFAULT_CP_ID = "CP1-UK-TEST-CLIENT"

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


def parse_flag(value: Optional[str], default: bool) -> bool:
    if value is None or value.strip() == "":
        return default
    v = value.strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    return default


@dataclass(frozen=True)
class NetworkConfig:
    network: str
    numbering_list_url: str
    cp_id: str
    verify_signatures: bool
    private_key: Optional[str] = None
    mock_port: int = DEFAULT_MOCK_PORT

    @property
    def is_live(self) -> bool:
        return self.network == "live"

    @property
    def mock_base_url(self) -> Optional[str]:
        """Base URL of the local mock network (for its ``/admin`` endpoints), if local."""
        if self.is_live:
            return None
        suffix = "/numbering-list.json"
        url = self.numbering_list_url
        return url[: -len(suffix)] if url.endswith(suffix) else None

    @classmethod
    def from_env(
        cls,
        env: Mapping[str, str] | None = None,
        *,
        default_cp_id: Optional[str] = None,
        default_verify_signatures: Optional[bool] = None,
    ) -> "NetworkConfig":
        """Read the ``PSTN2_*`` variables. ``default_cp_id`` replaces the *local* default
        acting CP (examples use it to play e.g. Charlie Comms)."""
        e = os.environ if env is None else env
        network = (e.get("PSTN2_NETWORK") or "local").strip().lower()
        if network not in ("local", "live"):
            raise ValueError(f"PSTN2_NETWORK must be 'local' or 'live', not {network!r}")
        port = int(e.get("PSTN2_MOCK_PORT") or DEFAULT_MOCK_PORT)
        if network == "live":
            url = LIVE_NUMBERING_LIST_URL
            cp_default = LIVE_DEFAULT_CP_ID
            verify_default = True
        else:
            url = f"http://127.0.0.1:{port}/numbering-list.json"
            cp_default = default_cp_id or LOCAL_DEFAULT_CP_ID
            verify_default = False
        if default_verify_signatures is not None:
            verify_default = default_verify_signatures
        url = e.get("PSTN2_NUMBERING_LIST_URL") or url
        return cls(
            network=network,
            numbering_list_url=url,
            cp_id=e.get("PSTN2_CP_ID") or cp_default,
            verify_signatures=parse_flag(e.get("PSTN2_VERIFY_SIGNATURES"), verify_default),
            private_key=e.get("PSTN2_PRIVATE_KEY") or None,
            mock_port=port,
        )


__all__ = ["DEFAULT_MOCK_PORT", "LIVE_DEFAULT_CP_ID", "LIVE_NUMBERING_LIST_URL", "LOCAL_DEFAULT_CP_ID", "NetworkConfig", "parse_flag"]
