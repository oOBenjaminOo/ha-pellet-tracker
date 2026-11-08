"""Connected-stove state mapping, without a physical stove or guessed heater states."""

import importlib.util
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"
spec = importlib.util.spec_from_file_location("stove_model", ROOT / "stove.py")
stove = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stove)


class StoveTests(unittest.TestCase):
    def setUp(self):
        self.settings = {
            "stove_entity": "climate.stove",
            "stove_attribute": "hvac_action",
            "stove_on_states": "heating,startup",
            "stove_off_states": "off,idle",
        }
        self.state = types.SimpleNamespace(
            state="heat", attributes={"hvac_action": "heating"}
        )
        self.hass = types.SimpleNamespace(
            states=types.SimpleNamespace(get=lambda _id: self.state)
        )

    def test_no_source_is_not_an_off_or_on_reading(self):
        self.assertEqual(stove.stove_status(None, {}), "unconfigured")

    def test_heating_attribute_matters_more_than_heat_mode(self):
        self.assertEqual(stove.stove_status(self.hass, self.settings), "on")
        self.state.attributes["hvac_action"] = "idle"
        self.assertEqual(stove.stove_status(self.hass, self.settings), "off")
        self.state.attributes["hvac_action"] = "cooling"
        self.assertEqual(stove.stove_status(self.hass, self.settings), "unknown")
        self.state.attributes = {}
        self.assertEqual(stove.stove_status(self.hass, self.settings), "unknown")

    def test_unavailable_entity_never_uses_stale_heating_attributes(self):
        for state in ("unknown", "unavailable"):
            self.state.state = state
            self.assertEqual(stove.stove_status(self.hass, self.settings), "unknown")
        self.state = None
        self.assertEqual(stove.stove_status(self.hass, self.settings), "unknown")

    def test_binary_state_and_boolean_attributes_have_explicit_mappings(self):
        self.settings["stove_attribute"] = ""
        self.settings["stove_on_states"] = "on"
        self.state.state = "on"
        self.assertEqual(stove.stove_status(self.hass, self.settings), "on")
        self.settings.update(
            stove_attribute="burning", stove_on_states="true", stove_off_states="false"
        )
        self.state.attributes["burning"] = False
        self.assertEqual(stove.stove_status(self.hass, self.settings), "off")
        self.state.attributes["burning"] = True
        self.assertEqual(stove.stove_status(self.hass, self.settings), "on")


class StoveControlTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import asyncio
        from unittest.mock import AsyncMock

        self.state = types.SimpleNamespace(state="off")
        self.hass = types.SimpleNamespace(
            states=types.SimpleNamespace(get=lambda _id: self.state),
            services=types.SimpleNamespace(async_call=AsyncMock()),
        )
        self.ledger = types.SimpleNamespace(
            lock=asyncio.Lock(),
            settings={
                "stove_control_enabled": True,
                "stove_control_entity": "switch.stove",
            },
        )
        self.context = object()

    async def command(self, command="turn_on", entity="switch.stove"):
        await stove.async_control_stove(
            self.hass, self.ledger, entity, command, self.context
        )

    async def test_explicit_commands_preserve_context_and_only_target_selected_switch(
        self,
    ):
        await self.command()
        self.hass.services.async_call.assert_awaited_once_with(
            "switch",
            "turn_on",
            {"entity_id": "switch.stove"},
            blocking=True,
            context=self.context,
        )
        self.state.state = "on"
        await self.command("turn_off")
        self.assertEqual(self.hass.services.async_call.call_args.args[1], "turn_off")

    async def test_disabled_old_card_and_changed_switch_never_dispatch(self):
        self.ledger.settings["stove_control_enabled"] = False
        with self.assertRaises(ValueError):
            await self.command()
        self.ledger.settings["stove_control_enabled"] = True
        with self.assertRaises(ValueError):
            await self.command(entity="switch.old_stove")
        with self.assertRaises(ValueError):
            await self.command("toggle")
        self.hass.services.async_call.assert_not_awaited()

    async def test_unavailable_and_replayed_commands_never_toggle(self):
        for state in ("unknown", "unavailable"):
            self.state.state = state
            with self.assertRaises(ValueError):
                await self.command()
        self.state = None
        with self.assertRaises(ValueError):
            await self.command()
        self.state = types.SimpleNamespace(state="on")
        await self.command("turn_on")
        self.hass.services.async_call.assert_not_awaited()
