"""Documented native actions for automations and physical buttons."""

import voluptuous as vol
from homeassistant.core import SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.service import async_register_admin_service

from .const import DOMAIN
from .i18n import text
from .model import KINDS
from .stove import async_control_stove


def async_register_services(hass):
    async def handler(call):
        ledger = hass.data[DOMAIN].get(call.data["entry_id"])
        if ledger is None:
            raise HomeAssistantError("Pellet journal not loaded")
        try:
            if call.service == "undo_last":
                await ledger.transact(
                    "undo",
                    {},
                    call.data["revision"],
                    call.context.user_id or "automation",
                )
            elif call.service == "control_stove":
                await async_control_stove(
                    hass,
                    ledger,
                    call.data["entity_id"],
                    call.data["command"],
                    call.context,
                )
            elif call.service in {"record", "edit"}:
                payload = dict(call.data)
                payload.pop("entry_id")
                if call.service == "edit":
                    payload["id"] = payload.pop("operation_id")
                await ledger.transact(
                    "add" if call.service == "record" else "patch",
                    payload,
                    None,
                    call.context.user_id or "automation",
                )
            elif call.service in {"cancel", "restore"}:
                await ledger.transact(
                    "void" if call.service == "cancel" else "restore",
                    {"id": call.data["operation_id"]},
                    None,
                    call.context.user_id or "automation",
                )
            elif call.service == "test_notification":
                await ledger.notifier.async_test()
            elif call.service == "check_notifications":
                await ledger.notifier.async_check(reminders=True)
            elif call.service == "export":
                return ledger.export()
        except (ValueError, TypeError, KeyError, OSError) as err:
            raise HomeAssistantError(
                text(ledger.settings.get("language", "fr"), str(err))
            ) from err

    common = {vol.Required("entry_id"): str}
    schemas = {
        "undo_last": {
            **common,
            vol.Required("revision"): vol.All(int, vol.Range(min=0)),
        },
        "control_stove": {
            **common,
            vol.Required("entity_id"): str,
            vol.Required("command"): vol.In(["turn_on", "turn_off"]),
        },
        "record": {
            **common,
            vol.Required("kind"): vol.In(sorted(KINDS)),
            vol.Optional("quantity", default=0): vol.Coerce(str),
            vol.Optional("date"): str,
            vol.Optional("unit_price"): vol.Coerce(str),
            vol.Optional("shipping"): vol.Coerce(str),
            vol.Optional("discount"): vol.Coerce(str),
            vol.Optional("comment", default=""): str,
            vol.Optional("supplier", default=""): str,
            vol.Optional("brand", default=""): str,
            vol.Optional("cleaned", default=False): bool,
            vol.Optional("request_id"): str,
        },
        "cancel": {**common, vol.Required("operation_id"): str},
        "restore": {**common, vol.Required("operation_id"): str},
        "test_notification": common,
        "check_notifications": common,
    }
    schemas["edit"] = {
        **common,
        vol.Required("operation_id"): str,
        vol.Optional("kind"): vol.In(sorted(KINDS)),
        vol.Optional("date"): str,
        vol.Optional("quantity"): vol.Coerce(str),
        vol.Optional("unit_price"): vol.Coerce(str),
        vol.Optional("shipping"): vol.Coerce(str),
        vol.Optional("discount"): vol.Coerce(str),
        vol.Optional("comment"): str,
        vol.Optional("supplier"): str,
        vol.Optional("brand"): str,
    }
    for name, schema in schemas.items():
        async_register_admin_service(
            hass, DOMAIN, name, handler, schema=vol.Schema(schema)
        )
    # Export contains the user's full journal and is admin-only too.
    async_register_admin_service(
        hass,
        DOMAIN,
        "export",
        handler,
        schema=vol.Schema(common),
        supports_response=SupportsResponse.ONLY,
    )
