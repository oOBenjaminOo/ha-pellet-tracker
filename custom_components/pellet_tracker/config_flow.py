"""UI configuration for independent pellet journals."""

import voluptuous as vol
from homeassistant import config_entries

from .const import DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create a journal without credentials or cloud dependencies."""

    VERSION = 1

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
                        vol.Coerce(int), vol.Range(min=1, max=10000)
                    ),
                }
            ),
        )
