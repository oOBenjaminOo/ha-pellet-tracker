"""Local pellet inventory and maintenance integration."""

from pathlib import Path

import voluptuous as vol
from homeassistant.components import (
    panel_custom,
    persistent_notification,
    websocket_api,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.event import async_track_time_change

from .const import DOMAIN, PLATFORMS, VERSION
from .ledger import Ledger
from .notifications import Notifications
from .services import async_register_services
from .settings import notification_choices, validate_settings


async def async_setup(hass, config):
    """Register one authenticated API and one frontend for all journals."""
    hass.data.setdefault(DOMAIN, {})
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_journal)
    websocket_api.async_register_command(hass, ws_mutate)
    websocket_api.async_register_command(hass, ws_settings)
    websocket_api.async_register_command(hass, ws_test_notification)
    async_register_services(hass)
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/pellet_tracker_static", str(Path(__file__).parent / "frontend"), False
            )
        ]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="pellet-tracker-panel",
        frontend_url_path="pellet-tracker",
        sidebar_title="Suivi Granulés",
        sidebar_icon="mdi:fire",
        module_url=f"/pellet_tracker_static/panel.js?v={VERSION}",
        require_admin=True,
    )
    return True


async def async_setup_entry(hass, entry):
    ledger = Ledger(hass, entry)
    try:
        await ledger.async_load()
    except (ValueError, KeyError, OSError) as err:
        raise ConfigEntryNotReady(f"Unable to load pellet journal: {err}") from err
    hass.data[DOMAIN][entry.entry_id] = ledger
    ledger.notifier = Notifications(hass, ledger)
    await ledger.notifier.async_load()
    entry.async_on_unload(entry.add_update_listener(async_options_updated))
    entry.async_on_unload(
        async_track_time_change(hass, ledger.async_refresh_date, minute=0, second=1)
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    hass.async_create_task(ledger.notifier.async_check())
    return True


async def async_unload_entry(hass, entry):
    if await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        ledger = hass.data[DOMAIN].get(entry.entry_id)
        if ledger:
            ledger.notifier.closed = True
            persistent_notification.async_dismiss(hass, ledger.notifier.notification_id)
        hass.data[DOMAIN].pop(entry.entry_id, None)
        return True
    return False


@websocket_api.websocket_command({vol.Required("type"): "pellet_tracker/list"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list(hass, connection, msg):
    connection.send_result(
        msg["id"],
        [{"id": k, "name": v.entry.title} for k, v in hass.data[DOMAIN].items()],
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "pellet_tracker/journal", vol.Required("entry_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_journal(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return
    connection.send_result(
        msg["id"],
        {**ledger.export(), "notification_choices": notification_choices(hass)},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "pellet_tracker/mutate",
        vol.Required("entry_id"): str,
        vol.Required("operation"): vol.In(["add", "edit", "void", "restore", "import"]),
        vol.Required("payload"): dict,
        vol.Required("revision"): vol.All(int, vol.Range(min=0)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_mutate(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return
    try:
        await ledger.transact(
            msg["operation"], msg["payload"], msg["revision"], connection.user.id
        )
    except (ValueError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "invalid_operation", str(err))
        return
    connection.send_result(
        msg["id"],
        {**ledger.export(), "notification_choices": notification_choices(hass)},
    )


async def async_options_updated(hass, entry):
    ledger = hass.data[DOMAIN].get(entry.entry_id)
    if ledger:
        title = entry.options.get("name", entry.title)
        if title != entry.title:
            hass.config_entries.async_update_entry(entry, title=title)
        ledger.async_set_updated_data(ledger.snapshot())
        await ledger.notifier.async_check()


@websocket_api.websocket_command(
    {
        vol.Required("type"): "pellet_tracker/settings",
        vol.Required("entry_id"): str,
        vol.Required("settings"): dict,
        vol.Required("revision"): int,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_settings(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return
    try:
        async with ledger.lock:
            if msg["revision"] != ledger.entry.options.get("settings_revision", 0):
                raise ValueError("Journal changed. Refresh before saving.")
            options = validate_settings(
                msg["settings"], ledger.settings, notification_choices(hass)
            )
            options["settings_revision"] = msg["revision"] + 1
            hass.config_entries.async_update_entry(
                ledger.entry, options=options, title=options["name"]
            )
            ledger.async_set_updated_data(ledger.snapshot())
    except (ValueError, TypeError, OverflowError) as err:
        connection.send_error(msg["id"], "invalid_settings", str(err))
        return
    connection.send_result(
        msg["id"],
        {**ledger.export(), "notification_choices": notification_choices(hass)},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "pellet_tracker/test_notification",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_test_notification(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return
    try:
        await ledger.notifier.async_test()
    except Exception as err:
        connection.send_error(msg["id"], "delivery_failed", str(err))
        return
    connection.send_result(msg["id"], {"success": True})
