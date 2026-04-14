# Screenshot Ingestion Blueprint

## Goal

Prepare an overnight pipeline for Android screenshot intake without coupling extraction logic to workbook reconciliation logic.

## Proposed Folder Contract

- `incoming/screenshots/YYYY-MM/` - raw screenshots synced from Android.
- `incoming/processed/YYYY-MM/` - normalized copies and OCR intermediates.
- `outputs/YYYY-MM/` - extraction summaries and candidate coordinates.

## Planned Processing Stages

1. Collect image files and timestamp metadata.
2. OCR pass to extract visible location/address text.
3. Parse coordinate/address candidates into structured records.
4. Feed candidates into known-site matching workflow.
5. Emit review queue for unresolved weekend or ambiguous matches.

## Interface with Toolkit

- Stage outputs should be CSV/JSON files, not workbook writes.
- Toolkit consumes verified inputs and produces reconciliation reports.
- Human review remains the gate before final mileage posting.
