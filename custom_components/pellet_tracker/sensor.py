"""Small state entities; full history stays outside entity attributes."""

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

FIELDS = {
    "stove_status": (None, "mdi:fire", False),
    "budget": ("money", "mdi:wallet", True),
    "budget_remaining": ("money", "mdi:wallet-outline", True),
    "budget_percent": ("%", "mdi:percent", True),
    "last_end": (None, "mdi:fire-off", True),
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
    "autonomy_days": ("d", "mdi:calendar-clock", False),
    "exhaustion_date": (None, "mdi:calendar-end", False),
    "daily_rate": ("sacs/d", "mdi:chart-line", False),
    "usage_change_percent": ("%", "mdi:compare", False),
}


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities(
        PelletSensor(hass.data[DOMAIN][entry.entry_id], key) for key in FIELDS
    )


class PelletSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, ledger, key):
        super().__init__(ledger)
        self.key = key
        self._attr_unique_id = f"{ledger.entry.entry_id}_{key}"
        self._attr_translation_key = key
        unit, icon, _ = FIELDS[key]
        self._attr_icon = icon
        self._attr_native_unit_of_measurement = (
            ledger.entry.data.get("currency", "EUR") if unit == "money" else unit
        )
        if key == "stove_status":
            self._attr_device_class = SensorDeviceClass.ENUM
            self._attr_options = ["on", "off", "unconfigured"]
        if unit == "money":
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_suggested_display_precision = 2
        if key in {"last_clean", "exhaustion_date", "last_end"}:
            self._attr_device_class = SensorDeviceClass.DATE
        self._attr_device_info = {
            "identifiers": {(DOMAIN, ledger.entry.entry_id)},
            "name": ledger.entry.title,
            "manufacturer": "Pellet Tracker",
        }

    @property
    def native_unit_of_measurement(self):
        unit = self._attr_native_unit_of_measurement
        if unit == "d":
            singular = self.native_value == 1
            if self.coordinator.settings.get("language", "fr") == "fr":
                return "jour" if singular else "jours"
            return "day" if singular else "days"
        return unit

    @property
    def native_value(self):
        data = self.coordinator.data
        if FIELDS[self.key][2]:
            data = data["seasons"][data["season"]]
        value = data.get(self.key)
        if self.key == "stove_status" and value == "unknown":
            return None
        if self.key in {"last_clean", "exhaustion_date", "last_end"} and value:
            from datetime import date

            return date.fromisoformat(value)
        return value
