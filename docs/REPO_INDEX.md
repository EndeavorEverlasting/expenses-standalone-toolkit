# Expenses Repository Index

This repository is organized to support a standalone mileage reconciliation product with optional future ASTAS integration.

## Top-Level Directories

- `product/tax_mileage_toolkit/` - Canonical Python package for workbook reconciliation and audits.
- `scripts/tax_mileage_python_toolkit/` - Legacy-compatible wrappers and original toolkit assets.
- `latest/` - Latest workbook/toolkit drop zone for manual review runs.
- `releases/` - Dated release notes and packaging metadata.
- `docs/` - Architecture, workflow, and integration contract documentation.
- `expense-ocr/` - Separate OCR experiments and utilities.
- `screenshots/` - Manually curated screenshot evidence inputs.

## Product Flow (Current)

1. Place workbook candidate under `latest/`.
2. Run toolkit reconciliation/audit CLI from `product/tax_mileage_toolkit`.
3. Review generated reports in your chosen output folder.
4. Reconcile in workbook tabs (weekday first, weekend second).

## Privacy and Git Hygiene

Sensitive personal exports and bank statements are intentionally ignored by `.gitignore`.
Only shareable code, docs, templates, and release metadata should be committed.
