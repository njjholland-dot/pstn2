"""In-memory fixture network built from RangeHolderResponders (test helper).

Mirrors ``Network`` in harness-engine.js, including ``port()``, so discovery can be run
offline and compared with the reference engine."""

from __future__ import annotations

import copy
from typing import Any

from pstn2 import NumberingList, RangeHolderResponder, TransportResponse, e164
from pstn2.discovery import find_block
from pstn2.types import NumberingBlock


class MemoryNetwork:
    def __init__(self, fixture: dict[str, Any], *, signing: dict[str, tuple[Any, str]] | None = None) -> None:
        self.fixture = copy.deepcopy(fixture)
        self.numbering_list = self.fixture["numberingList"]
        self.cps: dict[str, dict[str, Any]] = {}
        for cp in self.fixture["cps"]:
            for k in ("portedIn", "portedOut", "inService", "previouslyHeld"):
                cp.setdefault(k, [])
            self.cps[cp["cpId"]] = cp
        self.signing = signing or {}
        self.ttl = self.fixture.get("defaults", {}).get("ttl", 86400)
        self.queries: list[tuple[str, str]] = []

    def ref(self, cp_id: str) -> dict[str, str] | None:
        cp = self.cps.get(cp_id)
        return {"cpId": cp["cpId"], "cpName": cp["cpName"], "url": cp["url"]} if cp else None

    def responder(self, cp_id: str) -> RangeHolderResponder:
        key, kid = self.signing.get(cp_id, (None, None))
        return RangeHolderResponder(self.cps[cp_id], self.ref, numbering_list=NumberingList(self.numbering_list),
                                    ttl=self.ttl, signing_key=key, kid=kid)

    def cp_by_url(self, url: str) -> dict[str, Any] | None:
        u = url.rstrip("/")
        return next((cp for cp in self.cps.values() if cp["url"] == u), None)

    async def transport(self, url: str, number: str) -> TransportResponse:
        cp = self.cp_by_url(url)
        if cp is None:
            raise ConnectionError(f"no CP at {url}")
        self.queries.append((cp["cpId"], number))
        ans = self.responder(cp["cpId"]).respond(number)
        return TransportResponse(ans.status, ans.body)

    def range_holder_of(self, number: str) -> dict[str, Any] | None:
        blocks = [NumberingBlock.model_validate(b) for b in self.numbering_list["blocks"]]
        b = find_block(blocks, number)
        return self.cps.get(b.cp_id) if b else None

    def port(self, number: str, from_cp_id: str, to_cp_id: str) -> None:
        n = e164(number)
        frm, to, rh = self.cps[from_cp_id], self.cps[to_cp_id], self.range_holder_of(n)
        assert rh is not None
        frm["inService"] = [x for x in frm["inService"] if x != n]
        frm["portedIn"] = [p for p in frm["portedIn"] if p["number"] != n]
        if frm is not rh and n not in frm["previouslyHeld"]:
            frm["previouslyHeld"].append(n)
        if to is rh:
            rh["portedOut"] = [p for p in rh["portedOut"] if p["number"] != n]
            if n not in rh["inService"]:
                rh["inService"].append(n)
        else:
            to["portedIn"].append({"number": n, "fromCpId": from_cp_id})
            to["previouslyHeld"] = [x for x in to["previouslyHeld"] if x != n]
            rec = next((p for p in rh["portedOut"] if p["number"] == n), None)
            if rec:
                rec["toCpId"] = to_cp_id
            else:
                rh["portedOut"].append({"number": n, "toCpId": to_cp_id})
            rh["inService"] = [x for x in rh["inService"] if x != n]
