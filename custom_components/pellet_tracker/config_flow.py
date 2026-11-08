"""UI configuration for independent pellet journals."""

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN
from .settings import RANGES, merged_settings, notification_choices, validate_settings


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create a journal without credentials or cloud dependencies."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return OptionsFlow()

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required("name", default="Poêle"): str,
                    vol.Required("currency", default="EUR"): vol.In(
                        ["EUR", "CHF", "GBP", "USD", "CAD"]
                    ),
                    vol.Required("season_month", default=7): vol.All(
                        vol.Coerce(int), vol.Range(min=1, max=12)
                    ),
                    vol.Required("low_stock", default=10): vol.All(
                        vol.Coerce(int), vol.Range(min=0, max=10000)
                    ),
                    vol.Required("cleaning_bags", default=5): vol.All(
                        vol.Coerce(int), vol.Range(min=0, max=10000)
                    ),
                }
            ),
        )


class OptionsFlow(config_entries.OptionsFlow):
    """Edit thresholds, estimation and notifications without a restart."""

    async def async_step_init(self, user_input=None):
        current = merged_settings(self.config_entry)
        choices = notification_choices(self.hass)
        errors = {}
        if user_input is not None:
            try:
                settings = validate_settings(user_input, current, choices)
                settings["settings_revision"] = (
                    self.config_entry.options.get("settings_revision", 0) + 1
                )
                return self.async_create_entry(title="", data=settings)
            except (ValueError, TypeError, OverflowError):
                errors["base"] = "invalid_settings"
        fields = {vol.Required("name", default=current["name"]): str}
        for key, (minimum, maximum) in RANGES.items():
            fields[vol.Required(key, default=current[key])] = vol.All(
                vol.Coerce(int), vol.Range(min=minimum, max=maximum)
            )
        for key in ("notify_enabled", "notify_recovery", "notify_actions"):
            fields[vol.Required(key, default=current[key])] = bool
        fields[
            vol.Required("notification_action", default=current["notification_action"])
        ] = vol.In(choices)
        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(fields), errors=errors
        )
