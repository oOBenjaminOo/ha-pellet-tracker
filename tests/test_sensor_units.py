"""Localised day labels keep the numeric sensor value suitable for calculations."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parents[1] / "custom_components/pellet_tracker"


class DayUnitTests(unittest.TestCase):
    def test_language_changes_only_day_unit_not_numeric_value(self):
        modules = {
            name: types.ModuleType(name)
            for name in (
                "homeassistant",
                "homeassistant.components",
                "homeassistant.components.sensor",
                "homeassistant.helpers",
                "homeassistant.helpers.update_coordinator",
                "units_test",
            )
        }
        modules["units_test"].__path__ = [str(ROOT)]
        modules["homeassistant.components.sensor"].SensorEntity = type(
            "SensorEntity", (), {}
        )
        modules[
            "homeassistant.components.sensor"
        ].SensorDeviceClass = types.SimpleNamespace()
        modules["homeassistant.helpers.update_coordinator"].CoordinatorEntity = type(
            "CoordinatorEntity", (), {}
        )
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location(
                "units_test.sensor", ROOT / "sensor.py"
            )
            sensor_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(sensor_module)
        sensor = object.__new__(sensor_module.PelletSensor)
        sensor.key = "autonomy_days"
        sensor._attr_native_unit_of_measurement = "d"
        sensor.coordinator = types.SimpleNamespace(
            settings={}, data={"autonomy_days": 12.5}
        )
        for language, unit in (("fr", "jours"), ("en", "days")):
            sensor.coordinator.settings["language"] = language
            self.assertEqual(sensor.native_unit_of_measurement, unit)
            self.assertEqual(sensor.native_value, 12.5)

        sensor.coordinator.data["autonomy_days"] = 1
        for language, unit in (("fr", "jour"), ("en", "day")):
            sensor.coordinator.settings["language"] = language
            self.assertEqual(sensor.native_unit_of_measurement, unit)
            self.assertEqual(sensor.native_value, 1)
