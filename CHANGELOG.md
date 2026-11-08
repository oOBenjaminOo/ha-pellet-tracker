# Changelog

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
