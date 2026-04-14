# Release Notes - 2026-04-14

## Milestone

Standalone Toolkit Release foundation for mileage reconciliation and audit workflows.

## Included

- Privacy-safe repository defaults via root `.gitignore`.
- Canonical package at `product/tax_mileage_toolkit`.
- Unified CLI:
  - `python -m product.tax_mileage_toolkit.cli reconcile ...`
  - `python -m product.tax_mileage_toolkit.cli audit ...`
- Legacy script compatibility preserved:
  - `scripts/tax_mileage_python_toolkit/site_reconcile.py`
  - `scripts/tax_mileage_python_toolkit/workbook_audit.py`
- Repository index and standalone docs updates.

## Excluded

- Private personal exports and evidence files:
  - timeline exports
  - takeout archives
  - bank statements
- Generated reports (`*.csv`, `*.json`) under scripted output paths.

## Known Gaps

- Screenshot OCR extraction pipeline is not productionized yet.
- ASTAS integration is specified as a contract only in this release.
- Workbook schema validation is still implicit via sheet names.

## Next Milestones

1. Add explicit schema validator with clear error codes.
2. Add screenshot ingestion skeleton under standalone package.
3. Add adapter layer for ASTAS plugin/extension execution path.
4. Add conservative helper-column cluster suggestion automation with backup-first writes.
