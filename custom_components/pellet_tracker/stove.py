"""Resolve observed heating state without guessing from the stove's operating mode."""


def stove_status(hass, settings):
    entity_id = settings.get("stove_entity", "")
    if not entity_id:
        return "unconfigured"
    state = hass.states.get(entity_id)
    if state is None or state.state in {"unknown", "unavailable"}:
        return "unknown"
    attribute = settings.get("stove_attribute", "")
    value = state.attributes.get(attribute) if attribute else state.state
    if value is None:
        return "unknown"
    value = str(value).lower() if isinstance(value, bool) else str(value).strip()
    if value in {"unknown", "unavailable"}:
        return "unknown"
    if value in {
        v.strip() for v in settings.get("stove_on_states", "on,heating").split(",")
    }:
        return "on"
    if value in {
        v.strip() for v in settings.get("stove_off_states", "off,idle").split(",")
    }:
        return "off"
    return "unknown"


def stove_choices(hass):
    """Only expose entity names/IDs; do not export unrelated states or attributes."""
    from homeassistant.helpers import entity_registry as er

    registry = er.async_get(hass)
    choices = {}
    for state in hass.states.async_all():
        if state.domain not in {
            "sensor",
            "binary_sensor",
            "switch",
            "climate",
            "input_boolean",
            "input_select",
            "select",
        }:
            continue
        entry = registry.async_get(state.entity_id)
        if entry and entry.platform == "pellet_tracker":
            continue
        choices[state.entity_id] = f"{state.name} · {state.entity_id}"
    return dict(sorted(choices.items(), key=lambda item: item[1].casefold()))


async def async_control_stove(hass, ledger, entity_id, command, context):
    """Execute an explicit switch command only while current settings permit it."""
    async with ledger.lock:
        settings = ledger.settings
        if not settings.get("stove_control_enabled", False):
            raise ValueError("Stove control is disabled")
        if entity_id != settings.get(
            "stove_control_entity"
        ) or not entity_id.startswith("switch."):
            raise ValueError("Stove control configuration changed; refresh the card")
        if command not in {"turn_on", "turn_off"}:
            raise ValueError("Invalid stove command")
        state = hass.states.get(entity_id)
        if state is None or state.state not in {"on", "off"}:
            raise ValueError("Stove control switch unavailable")
        desired = "on" if command == "turn_on" else "off"
        if state.state == desired:
            return  # Replayed confirmations must never toggle the stove back.
        await hass.services.async_call(
            "switch", command, {"entity_id": entity_id}, blocking=True, context=context
        )
