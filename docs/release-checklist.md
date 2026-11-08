# Release checklist

## Candidate 0.9.0b1

- [x] Single `custom_components/pellet_tracker` package; local runtime assets included.
- [x] MIT license, issue tracker, code owner, config flow, versioned manifest.
- [x] Local brand icons; `hacs.json` renders README and declares minimum HA version.
- [x] French/English user documentation, custom repository installation instructions.
- [x] Journal restore validation, explicit replacement confirmation and recovery checkpoint.
- [x] Deleted tracker recovery archive; storage failure regression.
- [x] Partial-cost warning and translation regressions.
- [x] Existing journal unchanged: tests use independent fictional fixtures.
- [ ] Live candidate deployment and recovery journey on disposable tracker.
- [ ] Narrow viewport checks on dashboard and panel (Chromium simulation).
- [ ] HACS custom-repository download on the test instance.
- [ ] CI: tests, formatting, hassfest, HACS validation, with no ignored checks.
- [ ] User acceptance; then decide stable version and publish matching release.
- [ ] Submit catalog inclusion request only after acceptance.

Native Android/iOS keyboard and physical touch are not certified by desktop
Chromium viewport tests. No real stove control is exercised during validation.
All published screenshots must use fictional records, without real IDs, targets,
network addresses or journal content. Never include private JSON/Excel sources.
