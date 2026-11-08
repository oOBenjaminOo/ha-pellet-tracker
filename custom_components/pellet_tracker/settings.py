"""Settings shared by the panel, options flow and notifications."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

DEFAULTS = {
    "season_budgets": {},
    "notify_actions": True,
    "low_stock": 10,
    "cleaning_bags": 5,
    "cleaning_days": 7,
    "estimate_window": 30,
    "low_autonomy_days": 7,
    "notify_enabled": True,
    "notification_action": "",
    "repeat_days": 3,
    "notify_hour": 8,
    "notify_recovery": False,
}
RANGES = {
    "low_stock": (0, 10000),
    "cleaning_bags": (0, 10000),
    "cleaning_days": (0, 365),
    "estimate_window": (7, 180),
    "low_autonomy_days": (0, 365),
    "repeat_days": (0, 365),
    "notify_hour": (0, 23),
}


def merged_settings(entry) -> dict:
    return {
        **DEFAULTS,
        **entry.data,
        **getattr(entry, "options", {}),
        "name": entry.title,
    }


def validate_settings(raw: dict, current: dict, choices: dict) -> dict:
    """Currency and season boundaries are deliberately immutable after setup."""
    allowed = {"name", *DEFAULTS}
    if set(raw) - allowed:
        raise ValueError("Unknown setting")
    settings = {k: raw.get(k, current[k]) for k in allowed}
    name = str(settings["name"]).strip()
    if not name or len(name) > 80:
        raise ValueError("Le nom doit contenir entre 1 et 80 caractères.")
    settings["name"] = name
    for key, (minimum, maximum) in RANGES.items():
        value = settings[key]
        if (
            isinstance(value, bool)
            or str(value) != str(int(value))
            or not minimum <= int(value) <= maximum
        ):
            raise ValueError(f"Invalid setting: {key}")
        settings[key] = int(value)
    for key in ("notify_enabled", "notify_recovery", "notify_actions"):
        if not isinstance(settings[key], bool):
            raise TypeError(f"Invalid setting: {key}")
    budgets = settings["season_budgets"]
    if not isinstance(budgets, dict) or len(budgets) > 200:
        raise ValueError("Invalid season budgets")
    if any(
        not re.fullmatch(r"\d{4}/\d{4}", str(k)) or int(k[5:]) != int(k[:4]) + 1
        for k in budgets
    ):
        raise ValueError("Invalid budget season")
    normalized = {}
    for key, value in budgets.items():
        try:
            amount = Decimal(str(value))
        except InvalidOperation as err:
            raise ValueError("Invalid budget amount") from err
        if (
            not amount.is_finite()
            or not 0 <= amount <= 1000000
            or amount.as_tuple().exponent < -4
        ):
            raise ValueError("Invalid budget amount")
        normalized[key] = str(amount)
    settings["season_budgets"] = normalized
    action = settings["notification_action"]
    if not isinstance(action, str) or action not in choices:
        raise ValueError("Choisis une destination de notification disponible.")
    return settings


def notification_choices(hass) -> dict:
    """Enumerate existing destinations without guessing a recipient."""
    choices = {"": "Home Assistant uniquement"}
    for name in sorted(hass.services.async_services().get("notify", {})):
        if name not in {"notify", "send_message", "persistent_notification", "reload"}:
            choices[f"notify.{name}"] = f"Notification · {name}"
    for state in sorted(hass.states.async_all(), key=lambda s: s.entity_id):
        if state.entity_id.startswith("notify."):
            choices[f"entity:{state.entity_id}"] = f"Notification · {state.name}"
        elif state.entity_id.startswith("script."):
            choices[state.entity_id] = f"Script · {state.name}"
    return choices
