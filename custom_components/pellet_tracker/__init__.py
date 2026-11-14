"""Local pellet inventory and maintenance integration."""

import base64
import re
from pathlib import Path

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import (
    frontend,
    panel_custom,
    persistent_notification,
    websocket_api,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import callback
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_change,
)
from homeassistant.helpers.storage import Store

from .backup import prepare_backup
from .const import DOMAIN, PLATFORMS, VERSION
from .dashboard import mushroom_card
from .ledger import Ledger
from .notifications import Notifications
from .services import async_register_services
from .settings import merged_settings, notification_choices, validate_settings
from .stove import stove_choices, stove_status

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


def registered_entities(hass, ledger):
    """Include actual entity IDs, including user renames, for dashboard helpers."""
    prefix = f"{ledger.entry.entry_id}_"
    entities = []
    for entity in er.async_entries_for_config_entry(
        er.async_get(hass), ledger.entry.entry_id
    ):
        if entity.platform != DOMAIN or not entity.unique_id.startswith(prefix):
            continue
        state = hass.states.get(entity.entity_id)
        entities.append(
            {
                "key": entity.unique_id[len(prefix) :],
                "entity_id": entity.entity_id,
                "name": state.name if state else entity.name or entity.entity_id,
                "available": state is not None and state.state != "unavailable",
                "enabled": entity.disabled_by is None,
            }
        )
    return entities


def card_payload(hass, ledger, allow_control=True):
    """Only card configuration is streamed, never the full journal or audit."""
    entities = registered_entities(hass, ledger)
    last = ledger.journal["audit"][-1] if ledger.journal["audit"] else None
    undo_revision = (
        ledger.journal["revision"]
        if last
        and last["action"] == "add"
        and last["revision"] == ledger.journal["revision"]
        else None
    )
    settings = ledger.settings
    if not allow_control:
        settings = {**settings, "stove_control_enabled": False}
        undo_revision = None
    return {
        "language": ledger.settings["language"],
        "config": mushroom_card(
            ledger.entry.title,
            entities,
            ledger.settings["language"],
            settings,
            ledger.entry.entry_id,
            undo_revision,
        ),
    }


def ui_export(hass, ledger):
    """The installed card stores only the stable journal ID, never a frozen copy."""
    entities = registered_entities(hass, ledger)
    return {
        **ledger.export(),
        "notification_choices": notification_choices(hass),
        "stove_sources": stove_choices(hass),
        "entities": entities,
        "mushroom_card": {
            "type": "custom:pellet-tracker-card",
            "entry_id": ledger.entry.entry_id,
        },
        "editable_card": mushroom_card(
            ledger.entry.title,
            entities,
            ledger.settings["language"],
            ledger.settings,
            ledger.entry.entry_id,
        ),
        "card_language": ledger.settings["language"],
    }


async def async_setup(hass, config):
    """Register one authenticated API and one frontend for all journals."""
    hass.data.setdefault(DOMAIN, {})
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_journal)
    websocket_api.async_register_command(hass, ws_mutate)
    websocket_api.async_register_command(hass, ws_settings)
    websocket_api.async_register_command(hass, ws_test_notification)
    websocket_api.async_register_command(hass, ws_card_updates)
    websocket_api.async_register_command(hass, ws_report_pdf)
    websocket_api.async_register_command(hass, ws_backup_preview)
    websocket_api.async_register_command(hass, ws_recovery)
    async_register_services(hass)
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/pellet_tracker_static", str(Path(__file__).parent / "frontend"), False
            )
        ]
    )
    frontend.add_extra_js_url(hass, f"/pellet_tracker_static/card.js?v={VERSION}")
    await register_panel(hass)
    return True


async def register_panel(hass, *, replace=False):
    """Keep the page accessible even if its sidebar shortcut is hidden."""
    visible = any(
        merged_settings(entry)["show_sidebar"]
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.disabled_by is None
    )
    visibility_key = f"{DOMAIN}_sidebar_visible"
    if replace and hass.data.get(visibility_key) == visible:
        return
    if replace:
        frontend.async_remove_panel(hass, "pellet-tracker")
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="pellet-tracker-panel",
        frontend_url_path="pellet-tracker",
        sidebar_title="Pellet Tracker" if visible else None,
        sidebar_icon="mdi:fire",
        module_url=f"/pellet_tracker_static/panel.js?v={VERSION}",
        require_admin=True,
    )
    hass.data[visibility_key] = visible


@callback
def bind_stove(hass, ledger):
    if getattr(ledger, "stove_unsub", None):
        ledger.stove_unsub()
    ledger.stove_unsub = None
    source = ledger.settings.get("stove_entity")
    if not source:
        return

    @callback
    def changed(_event):
        status = stove_status(hass, ledger.settings)
        if status != ledger.data.get("stove_status"):
            ledger.async_set_updated_data({**ledger.data, "stove_status": status})

    ledger.stove_unsub = async_track_state_change_event(hass, source, changed)


async def async_setup_entry(hass, entry):
    ledger = Ledger(hass, entry)
    try:
        await ledger.async_load()
    except (ValueError, KeyError, OSError) as err:
        raise ConfigEntryNotReady(f"Unable to load pellet journal: {err}") from err
    hass.data[DOMAIN][entry.entry_id] = ledger
    bind_stove(hass, ledger)
    entry.async_on_unload(lambda: ledger.stove_unsub() if ledger.stove_unsub else None)
    ledger.notifier = Notifications(hass, ledger)
    entry.async_on_unload(
        hass.bus.async_listen(
            "mobile_app_notification_action", ledger.notifier.async_action
        )
    )
    await ledger.notifier.async_load()
    entry.async_on_unload(entry.add_update_listener(async_options_updated))
    entry.async_on_unload(
        async_track_time_change(hass, ledger.async_refresh_date, minute=0, second=1)
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await register_panel(hass, replace=True)
    hass.async_create_task(ledger.notifier.async_check())
    return True


async def async_unload_entry(hass, entry):
    if await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        ledger = hass.data[DOMAIN].get(entry.entry_id)
        if ledger:
            ledger.notifier.closed = True
            if ledger.notifier.cancel_snooze:
                ledger.notifier.cancel_snooze()
            persistent_notification.async_dismiss(hass, ledger.notifier.notification_id)
        hass.data[DOMAIN].pop(entry.entry_id, None)
        await register_panel(hass, replace=True)
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
        ui_export(hass, ledger),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "pellet_tracker/mutate",
        vol.Required("entry_id"): str,
        vol.Required("operation"): vol.In(
            ["add", "edit", "void", "restore", "import", "undo", "restore_backup"]
        ),
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
        ui_export(hass, ledger),
    )


async def async_options_updated(hass, entry):
    await register_panel(hass, replace=True)
    ledger = hass.data[DOMAIN].get(entry.entry_id)
    if ledger:
        title = entry.options.get("name", entry.title)
        if title != entry.title:
            hass.config_entries.async_update_entry(entry, title=title)
        bind_stove(hass, ledger)
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
            source = options["stove_entity"]
            if (
                source
                and source != ledger.settings["stove_entity"]
                and source not in stove_choices(hass)
            ):
                raise ValueError("Choisissez une entité de poêle disponible.")
            control = options["stove_control_entity"]
            if (
                options["stove_control_enabled"]
                and control != ledger.settings.get("stove_control_entity")
                and control not in stove_choices(hass)
            ):
                raise ValueError("Choose an available stove control switch")
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
        ui_export(hass, ledger),
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


@websocket_api.websocket_command(
    {vol.Required("type"): "pellet_tracker/card_updates", vol.Required("entry_id"): str}
)
@websocket_api.async_response
async def ws_card_updates(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return

    def can_read():
        required = [e["entity_id"] for e in registered_entities(hass, ledger)]
        required += [
            ledger.settings.get(key)
            for key in ("stove_entity", "stove_control_entity")
            if ledger.settings.get(key)
        ]
        return connection.user.is_admin or all(
            connection.user.permissions.check_entity(entity_id, POLICY_READ)
            for entity_id in required
        )

    if not can_read():
        connection.send_error(msg["id"], "unauthorized", "Access denied")
        return

    @callback
    def publish(*_args):
        if not can_read():
            connection.send_event(msg["id"], {"error": "Access denied"})
            return
        connection.send_event(
            msg["id"], card_payload(hass, ledger, connection.user.is_admin)
        )

    remove_coordinator = ledger.async_add_listener(publish)
    remove_registry = hass.bus.async_listen("entity_registry_updated", publish)

    @callback
    def unsubscribe():
        remove_coordinator()
        remove_registry()

    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])
    publish()


@websocket_api.websocket_command(
    {
        vol.Required("type"): "pellet_tracker/report_pdf",
        vol.Required("entry_id"): str,
        vol.Required("season"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_report_pdf(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return
    snapshot = ledger.export()
    snapshot["report_date"] = ledger.today
    if msg["season"] not in snapshot["summary"]["seasons"]:
        connection.send_error(msg["id"], "invalid_season", "Season not found")
        return
    content = await hass.async_add_executor_job(
        build_season_pdf, snapshot, msg["season"]
    )
    connection.send_result(
        msg["id"],
        {
            "filename": "pellet-tracker-" + msg["season"].replace("/", "-") + ".pdf",
            "content": base64.b64encode(content).decode("ascii"),
        },
    )


async def async_remove_entry(hass, entry):
    """Archive a deleted stove before removing its active journal."""
    source = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
    journal = await source.async_load()
    if journal is not None:
        await Store(hass, 1, f"{DOMAIN}_recovery.{entry.entry_id}").async_save(
            {
                "schema_version": 1,
                **journal,
                "name": entry.title,
                "currency": entry.data.get("currency", "EUR"),
                "season_month": entry.data.get("season_month", 7),
                "reason": "deleted_tracker",
            }
        )
    await source.async_remove()
    if f"{DOMAIN}_sidebar_visible" in hass.data:
        await register_panel(hass, replace=True)
    await Store(hass, 1, f"{DOMAIN}_notifications.{entry.entry_id}").async_remove()


@websocket_api.websocket_command(
    {
        vol.Required("type"): "pellet_tracker/backup_preview",
        vol.Required("entry_id"): str,
        vol.Required("backup"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_preview(hass, connection, msg):
    ledger = hass.data[DOMAIN].get(msg["entry_id"])
    if ledger is None:
        connection.send_error(msg["id"], "not_found", "Journal not found")
        return
    try:
        _, preview = prepare_backup(
            msg["backup"],
            ledger.today,
            ledger.entry.data.get("season_month", 7),
            ledger.entry.data.get("currency", "EUR"),
            ledger.journal["events"],
        )
        connection.send_result(
            msg["id"], {**preview, "revision": ledger.journal["revision"]}
        )
    except (ValueError, TypeError, KeyError) as err:
        connection.send_error(msg["id"], "invalid_backup", str(err))


@websocket_api.websocket_command(
    {vol.Required("type"): "pellet_tracker/recovery", vol.Optional("archive_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_recovery(hass, connection, msg):
    archive_id = msg.get("archive_id")
    if archive_id is not None:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", archive_id):
            connection.send_error(msg["id"], "invalid_backup", "Invalid archive ID")
            return
        backup = await Store(hass, 1, f"{DOMAIN}_recovery.{archive_id}").async_load()
        if backup is None:
            connection.send_error(msg["id"], "not_found", "Recovery archive not found")
            return
        connection.send_result(msg["id"], backup)
        return
    folder = Path(hass.config.path(".storage"))
    paths = await hass.async_add_executor_job(
        lambda: list(folder.glob(f"{DOMAIN}_recovery.*"))
    )
    archives = []
    for path in paths:
        identifier = path.name.split(".", 1)[1]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", identifier):
            continue
        backup = await Store(hass, 1, path.name).async_load()
        if backup:
            archives.append(
                {
                    "id": identifier,
                    "name": backup.get("name", identifier),
                    "operations": len(backup.get("events", [])),
                    "reason": backup.get("reason", "before_restore"),
                }
            )
    connection.send_result(
        msg["id"], {"archives": sorted(archives, key=lambda x: x["id"])}
    )


def build_season_pdf(snapshot, season):
    """Keep dependency import, font I/O and rendering off the HA event loop."""
    from .pdf_report import season_pdf

    return season_pdf(snapshot, season)
