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
