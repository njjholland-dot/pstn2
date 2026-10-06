"""HTTP transport shared by every module.

* Every request sends ``User-Agent: pstn2-python-sdk/1.1.0`` and ``X-PSTN2-Version: 1.1``
  (plus ``X-PSTN2-CP-ID`` when the acting CP is known) — §4.2. pstn2.org's WAF rejects
  generic library user agents.
* ``GET`` requests carry no body and no ``Content-Type``.
* Responses are parsed as JSON whatever their ``Content-Type`` (a static host may send
  ``application/octet-stream``); an unparseable body (e.g. a host's HTML 404 page)
  becomes ``body=None``.
* Retries follow §10.3: only for 503, 504 and network errors/timeouts, with 100/200/400 ms
  backoff and at most 3 retries. Everything else is returned to the caller unchanged.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Mapping

import httpx

from ._version import PROTOCOL_VERSION, USER_AGENT
from .errors import NetworkError, PSTN2TimeoutError

logger = logging.getLogger("pstn2.transport")

RETRY_STATUSES = frozenset({503, 504})
DEFAULT_BACKOFF = (0.1, 0.2, 0.4)


@dataclass
class HttpResponse:
    status: int
    body: Any
    headers: dict[str, str] = field(default_factory=dict)
    text: str = ""
    url: str = ""


class HttpTransport:
    """Thin async wrapper around :class:`httpx.AsyncClient` with PSTN2 headers and retries."""

    def __init__(
        self,
        *,
        cp_id: str | None = None,
        timeout: float = 2.0,
        retries: int = 3,
        backoff: tuple[float, ...] = DEFAULT_BACKOFF,
        client: httpx.AsyncClient | None = None,
        user_agent: str = USER_AGENT,
        extra_headers: Mapping[str, str] | None = None,
    ) -> None:
        self.cp_id = cp_id
        self.timeout = timeout
        self.retries = max(0, retries)
        self.backoff = backoff or DEFAULT_BACKOFF
        self.user_agent = user_agent
        self.extra_headers = dict(extra_headers or {})
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(timeout), follow_redirects=False)

    @property
    def client(self) -> httpx.AsyncClient:
        return self._client

    def base_headers(self) -> dict[str, str]:
        h = {
            "User-Agent": self.user_agent,
            "X-PSTN2-Version": PROTOCOL_VERSION,
            "Accept": "application/json",
        }
        if self.cp_id:
            h["X-PSTN2-CP-ID"] = self.cp_id
        h.update(self.extra_headers)
        return h

    async def request(
        self,
        method: str,
        url: str,
        *,
        json_body: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> HttpResponse:
        """Send a request with §10.3 retries. Raises :class:`PSTN2TimeoutError` /
        :class:`NetworkError` only when every attempt failed at the transport level."""
        h = self.base_headers()
        content: bytes | None = None
        if json_body is not None:
            content = json.dumps(json_body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            h["Content-Type"] = "application/json; charset=utf-8"
        if headers:
            h.update(headers)

        attempt = 0
        while True:
            try:
                resp = await self._client.request(method, url, content=content, headers=h, timeout=self.timeout)
            except httpx.TimeoutException as exc:
                if attempt < self.retries:
                    await self._sleep(attempt, f"timeout: {method} {url}")
                    attempt += 1
                    continue
                raise PSTN2TimeoutError(f"{method} {url} timed out after {attempt + 1} attempt(s)") from exc
            except httpx.TransportError as exc:
                if attempt < self.retries:
                    await self._sleep(attempt, f"{type(exc).__name__}: {method} {url}")
                    attempt += 1
                    continue
                raise NetworkError(f"{method} {url} failed after {attempt + 1} attempt(s): {exc}") from exc

            if resp.status_code in RETRY_STATUSES and attempt < self.retries:
                await self._sleep(attempt, f"HTTP {resp.status_code}: {method} {url}")
                attempt += 1
                continue
            return self._wrap(resp)

    async def get(self, url: str, *, headers: Mapping[str, str] | None = None) -> HttpResponse:
        return await self.request("GET", url, headers=headers)

    async def post(self, url: str, body: Any, *, headers: Mapping[str, str] | None = None) -> HttpResponse:
        return await self.request("POST", url, json_body=body, headers=headers)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _sleep(self, attempt: int, why: str) -> None:
        delay = self.backoff[min(attempt, len(self.backoff) - 1)]
        logger.debug("retry %d in %.0f ms (%s)", attempt + 1, delay * 1000, why)
        await asyncio.sleep(delay)

    @staticmethod
    def _wrap(resp: httpx.Response) -> HttpResponse:
        body: Any = None
        raw = resp.content
        if raw:
            try:
                body = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                body = None
        try:
            text = resp.text
        except Exception:  # pragma: no cover - undecodable body
            text = ""
        return HttpResponse(
            status=resp.status_code,
            body=body,
            headers={k.lower(): v for k, v in resp.headers.items()},
            text=text,
            url=str(resp.request.url),
        )
