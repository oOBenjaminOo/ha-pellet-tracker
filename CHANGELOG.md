# Changelog

## 0.6.2b1

- Click the pellet bag or ash vacuum directly on the stove image to record usage or cleaning.
- Preserve today confirmations and disable long/double-tap writes.
- Remove duplicate Mushroom action buttons below the image; retain native entities.
- Bundle transparent object assets, with French/English action titles.

## 0.6.1b1

- Four dynamic stove images combining heating and maintenance-due states.
- Dirty glass follows the existing configurable cleaning reminder sensor.
- Empty firebox burn pot when off, with pellets retained in the upper hopper.
- Preserve unknown-state handling and dashboard metrics without extra status labels.

## 0.6.0b1

- French/English language choice per journal at setup and in settings.
- Full panel translation, including dialogs, charts, CSV headings and messages.
- Localised notification text/actions and generated Mushroom/native cards.
- Locale-aware numbers and month names; preserve user data and entity identifiers.
- French default for existing journals; existing dashboard cards retain their language.
- Neutral Pellet Tracker sidebar name for multilingual installations.

## 0.5.0b2

- Carte Mushroom : état du poêle indiqué uniquement par l’image, sans libellé ni badge redondant.
- Création du suivi : menu déroulant des mois de saison avec noms traduits.

## 0.5.0b1

- Explicit confirmations for a bag consumed today and cleaning performed today.
- Optional connected-stove source, attribute and explicit on/off state mappings.
- Event-driven heating-state sensor with distinct unconfigured and unknown handling.
- Matching flame/no-flame images in the Mushroom card, without inferring consumption.
- Existing copied cards require replacement with the new generated card configuration.

## 0.4.2b1

- One overview action button with operation selection in the modal.
- Guided installation of the complete Mushroom card into a chosen dashboard/view/section.
- Preserve existing configuration, recheck it before saving and reject duplicate cards.
- Keep YAML copying as an advanced option.

## 0.4.1b1

- Replace the entry page with accessible modal forms for consumption, purchases, cleaning and edits.
- Preserve the underlying page, keep form errors in the modal and close only after successful saving.
- Add direct editable stock/cleaning thresholds from the overview, with live settings and alert updates.

## 0.4.0b1

- Atomic undo of the latest compound entry, protected by journal revision.
- Heating end dates and inclusive period reports, distinct from accounting seasons.
- Optional per-season budgets and budget/date sensors.
- Weighted supplier/brand comparisons with unknown-price coverage.
- Delivery charges and discounts included in actual purchase and FIFO costs.
- Scoped, expiring Companion notification actions and persisted 24-hour snooze.
- Configurable bag/day cleaning thresholds with independent disable options.
- Ready-to-copy Mushroom card with bundled stove image and live alert states.

## 0.3.0b1

- Separate overview, entry, statistics, seasons, history, dashboards and settings views.
- Explain automatic season rollover, stock carry-over and first ignition dates.
- Contextual entry fields, preserved form drafts and filtered, paginated history.
- Separate monthly, season-comparison and stock analyses.
- Discover actual entity IDs from the registry, including user renames.
- Generate a ready-to-copy native dashboard card with confirmed action buttons.
- Regression checks for view isolation, pagination, season dates and dashboard YAML.

## 0.2.0b1

- Classify the integration as a service so journals are selectable in native action pickers.

- Rolling autonomy and exhaustion date with minimum observation rules and stale-data suppression.
- Monthly quantity, FIFO cost, spending and weighted price charts, with CSV exports.
- Same-calendar-date season comparisons, including leap-year handling.
- Built-in grouped notifications, persisted deduplication, reminders and optional recovery messages.
- Optional notify service/entity or script destination, plus a notification test action.
- Editable options in the panel and Home Assistant options flow.
- Native record/edit/cancel/restore/export/notification actions and quick-action buttons.
- Atomic combined usage/cleaning entries and optional idempotency keys for automation records.
- Restoring cancelled operations, compact audit display and minimal private-data-free diagnostics.
- Additional regression coverage for estimation, monthly costs, notification delivery and concurrency.
- Local brand assets for custom-repository distribution.

## 0.1.0b1

- Initial original integration with UI configuration and multiple journals.
- Durable, revision-controlled operations with correction and cancellation audit.
- FIFO valuation, missing-price tracking and seasonal summaries.
- Admin panel with journal, stock graph, JSON import/export and seasonal comparison.
- Sensors and configurable stock/cleaning threshold entities.
- French Excel-history conversion utility; no private data included.
- Calculation and persistence regression tests; automated validation workflow.
