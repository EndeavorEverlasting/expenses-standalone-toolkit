# Tax Mileage Toolkit Package

Canonical package for workbook reconciliation.

## CLI

```bash
python -m product.tax_mileage_toolkit.cli reconcile <workbook.xlsx> [output_dir]
python -m product.tax_mileage_toolkit.cli audit <workbook.xlsx> [output_dir]
```

## Commands

- `reconcile` writes:
  - `cluster_match_report.csv`
  - `cluster_overlap_report.csv`
  - `known_site_rollup_report.csv`
- `audit` writes:
  - `audit_report.json`
