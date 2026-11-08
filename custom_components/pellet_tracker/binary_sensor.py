"""Threshold entities usable by notification automations."""

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .alert_model import active_alerts
from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities(
        PelletAlert(hass.data[DOMAIN][entry.entry_id], key)
        for key in ("low_stock", "cleaning_due", "low_autonomy")
    )


class PelletAlert(CoordinatorEntity, BinarySensorEntity):
    _attr_has_entity_name = True

    def __init__(self, ledger, key):
        super().__init__(ledger)
        self.key = key
        self._attr_unique_id = f"{ledger.entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_icon = "mdi:package-variant" if key == "low_stock" else "mdi:broom"
        self._attr_device_info = {"identifiers": {(DOMAIN, ledger.entry.entry_id)}}

    @property
    def is_on(self):
        return self.key in active_alerts(
            self.coordinator.data, self.coordinator.settings
        )
