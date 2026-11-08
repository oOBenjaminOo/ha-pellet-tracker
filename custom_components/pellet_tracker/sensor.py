"""Small state entities; full history stays outside entity attributes."""
from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN

FIELDS = {
    "stock": ("sacs", "mdi:package-variant-closed", False),
    "used": ("sacs", "mdi:fire", True),
    "purchased": ("sacs", "mdi:truck-delivery", True),
    "cleanings": (None, "mdi:broom", True),
    "spend": ("money", "mdi:cash", True),
    "cost": ("money", "mdi:cash-check", True),
    "average_price": ("money", "mdi:tag", True),
    "stock_value": ("money", "mdi:warehouse", False),
    "last_clean": (None, "mdi:broom", False),
    "days_since_clean": ("d", "mdi:calendar", False),
    "bags_since_clean": ("sacs", "mdi:fire", False),
}


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities(PelletSensor(hass.data[DOMAIN][entry.entry_id], key) for key in FIELDS)


class PelletSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, ledger, key):
        super().__init__(ledger)
        self.key = key
        self._attr_unique_id = f"{ledger.entry.entry_id}_{key}"
        self._attr_translation_key = key
        unit, icon, _ = FIELDS[key]
        self._attr_icon = icon
        self._attr_native_unit_of_measurement = ledger.entry.data.get("currency", "EUR") if unit == "money" else unit
        if unit == "money":
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_suggested_display_precision = 2
        if key == "last_clean":
            self._attr_device_class = SensorDeviceClass.DATE
        self._attr_device_info = {"identifiers": {(DOMAIN, ledger.entry.entry_id)},
                                  "name": ledger.entry.title, "manufacturer": "Pellet Tracker"}

    @property
    def native_value(self):
        data = self.coordinator.data
        if FIELDS[self.key][2]:
            data = data["seasons"][data["season"]]
        value = data.get(self.key)
        if self.key == "last_clean" and value:
            from datetime import date
            return date.fromisoformat(value)
        return value
