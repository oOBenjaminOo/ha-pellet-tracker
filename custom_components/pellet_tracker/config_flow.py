"""UI configuration for independent pellet journals."""

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DOMAIN
from .settings import RANGES, merged_settings, notification_choices, validate_settings
from .stove import stove_choices


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create a journal without credentials or cloud dependencies."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return OptionsFlow()

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            user_input = {**user_input, "season_month": int(user_input["season_month"])}
            return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required("name", default="Poêle"): str,
                    vol.Required("language", default="fr"): vol.In(
                        {"fr": "Français", "en": "English"}
                    ),
                    vol.Required("currency", default="EUR"): vol.In(
                        ["EUR", "CHF", "GBP", "USD", "CAD"]
                    ),
                    vol.Required("season_month", default="7"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[str(month) for month in range(1, 13)],
                            mode=selector.SelectSelectorMode.DROPDOWN,
                            translation_key="season_month",
                        )
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
                if (
                    settings["stove_control_enabled"]
                    and settings["stove_control_entity"]
                    != current["stove_control_entity"]
                    and settings["stove_control_entity"] not in stove_choices(self.hass)
                ):
                    raise ValueError("Choose an available stove control switch")
                settings["settings_revision"] = (
                    self.config_entry.options.get("settings_revision", 0) + 1
                )
                return self.async_create_entry(title="", data=settings)
            except (ValueError, TypeError, OverflowError):
                errors["base"] = "invalid_settings"
        sources = {"": "Pas de poêle connecté", **stove_choices(self.hass)}
        if current["stove_entity"] not in sources:
            sources[current["stove_entity"]] = (
                current["stove_entity"] + " · indisponible"
            )
        switches = {
            "": "-",
            **{k: v for k, v in sources.items() if k.startswith("switch.")},
        }
        if current["stove_control_entity"]:
            switches.setdefault(
                current["stove_control_entity"],
                current["stove_control_entity"] + " · indisponible",
            )
        fields = {
            vol.Required("show_sidebar", default=current["show_sidebar"]): bool,
            vol.Required("name", default=current["name"]): str,
            vol.Required("language", default=current["language"]): vol.In(
                {"fr": "Français", "en": "English"}
            ),
            vol.Optional("stove_entity", default=current["stove_entity"]): vol.In(
                sources
            ),
            vol.Optional("stove_attribute", default=current["stove_attribute"]): str,
            vol.Required("stove_on_states", default=current["stove_on_states"]): str,
            vol.Required("stove_off_states", default=current["stove_off_states"]): str,
            vol.Required(
                "stove_control_enabled", default=current["stove_control_enabled"]
            ): bool,
            vol.Optional(
                "stove_control_entity", default=current["stove_control_entity"]
            ): vol.In(switches),
        }
        for key, (minimum, maximum) in RANGES.items():
            fields[vol.Required(key, default=current[key])] = vol.All(
                vol.Coerce(int), vol.Range(min=minimum, max=maximum)
            )
        for key in ("notify_enabled", "notify_recovery", "notify_actions"):
            fields[vol.Required(key, default=current[key])] = bool
        fields[
            vol.Optional("notification_action", default=current["notification_action"])
        ] = vol.In(choices)
        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(fields), errors=errors
        )
