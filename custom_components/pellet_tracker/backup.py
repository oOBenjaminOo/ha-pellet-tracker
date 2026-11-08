"""Validate portable journal backups without trusting summaries or audit records."""

import hashlib
import json

from .model import calculate, validate


def prepare_backup(backup, today, season_month, currency, existing=()):
    """Return normalized events and an immutable, validated restore preview."""
    if not isinstance(backup, dict) or backup.get("schema_version") != 1:
        raise ValueError("Invalid backup format")
    if backup.get("currency", currency) != currency:
        raise ValueError("Backup currency differs from this tracker")
    if backup.get("season_month", season_month) != season_month:
        raise ValueError("Backup season month differs from this tracker")
    raw_events = backup.get("events")
    if not isinstance(raw_events, list) or not 1 <= len(raw_events) <= 10000:
        raise ValueError("Backup requires 1 to 10000 operations")
    if len(json.dumps(backup).encode()) > 10000000:
        raise ValueError("Backup exceeds 10 MB")
    events, known = [], set()
    for order, raw in enumerate(raw_events):
        if not isinstance(raw, dict):
            raise TypeError("Invalid backup operation")
        identifier = raw.get("id")
        if not isinstance(identifier, str) or not 1 <= len(identifier) <= 200:
            raise ValueError("Invalid backup operation ID")
        if identifier in known:
            raise ValueError("Duplicate operation IDs in backup")
        known.add(identifier)
        events.append(
            {
                **validate(raw, today),
                "id": identifier,
                "order": order,
                **({"voided": True} if raw.get("voided") is True else {}),
            }
        )
    summary = calculate(events, today, season_month)
    current = {event["id"] for event in existing}
    digest = hashlib.sha256(json.dumps(events, sort_keys=True).encode()).hexdigest()
    return events, {
        "digest": digest,
        "operations": len(events),
        "seasons": sorted(summary["seasons"]),
        "stock": summary["stock"],
        "existing_ids": len(known & current),
        "new_ids": len(known - current),
        "removed_ids": len(current - known),
        "voided": sum(bool(event.get("voided")) for event in events),
    }
