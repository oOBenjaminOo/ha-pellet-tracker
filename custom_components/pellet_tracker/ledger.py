"""Durable journal with serialized writes and optimistic concurrency."""

import asyncio
from copy import deepcopy
from uuid import uuid4

from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .model import calculate, validate


class Ledger(DataUpdateCoordinator):
    """Persist before publishing state; never mutate a failed transaction."""

    def __init__(self, hass, entry):
        import logging

        super().__init__(hass, logging.getLogger(__name__), name=entry.title)
        self.entry = entry
        self.store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.journal = {"revision": 0, "events": [], "audit": []}
        self.lock = asyncio.Lock()

    @property
    def today(self):
        return dt_util.now().date().isoformat()

    def snapshot(self, journal=None):
        journal = self.journal if journal is None else journal
        return calculate(
            journal["events"], self.today, self.entry.data.get("season_month", 7)
        )

    async def async_load(self):
        saved = await self.store.async_load()
        if saved is not None:
            self.journal = saved
        self.async_set_updated_data(self.snapshot())

    async def async_refresh_date(self, _now):
        self.async_set_updated_data(self.snapshot())

    async def transact(self, operation, payload, revision, actor):
        async with self.lock:
            if revision != self.journal["revision"]:
                raise ValueError("Journal changed. Refresh before saving.")
            candidate = deepcopy(self.journal)
            events = candidate["events"]
            if operation in {"add", "edit"}:
                normalized = validate(payload, self.today)
                if operation == "edit":
                    event = next(
                        (
                            e
                            for e in events
                            if e["id"] == payload.get("id") and not e.get("voided")
                        ),
                        None,
                    )
                    if event is None:
                        raise ValueError("Operation not found")
                    event.update(normalized)
                else:
                    events.append(
                        {**normalized, "id": str(uuid4()), "order": len(events)}
                    )
            elif operation == "void":
                event = next(
                    (
                        e
                        for e in events
                        if e["id"] == payload.get("id") and not e.get("voided")
                    ),
                    None,
                )
                if event is None:
                    raise ValueError("Operation not found")
                event["voided"] = True
            elif operation == "import":
                incoming = payload.get("events")
                if not isinstance(incoming, list) or len(incoming) > 10000:
                    raise ValueError("Import expects at most 10000 operations")
                known = {e["id"] for e in events}
                for raw in incoming:
                    if not isinstance(raw, dict):
                        raise TypeError("Each imported operation must be an object")
                    identifier = str(raw.get("id", ""))
                    if not identifier or len(identifier) > 200:
                        raise ValueError("Import requires stable operation IDs")
                    if identifier in known:
                        continue
                    events.append(
                        {
                            **validate(raw, self.today),
                            "id": identifier,
                            "order": len(events),
                            **({"voided": True} if raw.get("voided") is True else {}),
                        }
                    )
                    known.add(identifier)
            else:
                raise ValueError("Unknown journal action")
            calculated = self.snapshot(candidate)
            candidate["revision"] += 1
            previous = {e["id"]: e for e in self.journal["events"]}
            changed = [e for e in events if e != previous.get(e["id"])]
            candidate["audit"].append(
                {
                    "revision": candidate["revision"],
                    "action": operation,
                    "at": dt_util.utcnow().isoformat(),
                    "actor": actor,
                    "before": [
                        deepcopy(previous[e["id"]])
                        for e in changed
                        if e["id"] in previous
                    ],
                    "after": deepcopy(changed),
                }
            )
            await self.store.async_save(candidate)
            self.journal = candidate
            self.async_set_updated_data(calculated)

    def export(self):
        return {
            "schema_version": 1,
            **deepcopy(self.journal),
            "summary": self.data,
            "name": self.entry.title,
            "season_month": self.entry.data.get("season_month", 7),
            "currency": self.entry.data.get("currency", "EUR"),
        }
