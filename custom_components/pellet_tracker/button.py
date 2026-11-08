"""Quick actions usable in native Home Assistant dashboards."""

from homeassistant.components.button import ButtonEntity
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities(
        PelletButton(hass.data[DOMAIN][entry.entry_id], kind)
        for kind in ("add_bag", "clean")
    )


class PelletButton(CoordinatorEntity, ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, ledger, kind):
        super().__init__(ledger)
        self.kind = kind
        self._attr_unique_id = f"{ledger.entry.entry_id}_{kind}"
        self._attr_translation_key = kind
        self._attr_icon = "mdi:fire" if kind == "add_bag" else "mdi:broom"
        self._attr_device_info = {"identifiers": {(DOMAIN, ledger.entry.entry_id)}}

    async def async_press(self):
        try:
            await self.coordinator.transact(
                "add",
                {
                    "kind": "use" if self.kind == "add_bag" else "clean",
                    "quantity": 1 if self.kind == "add_bag" else 0,
                },
                None,
                "button",
            )
        except (ValueError, OSError) as err:
            raise HomeAssistantError(str(err)) from err
