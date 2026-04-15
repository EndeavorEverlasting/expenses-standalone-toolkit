# Tax Mileage Toolkit Package

Canonical package for workbook reconciliation.

## CLI

```bash
python -m product.tax_mileage_toolkit.cli reconcile <workbook.xlsx> [output_dir]
python -m product.tax_mileage_toolkit.cli audit <workbook.xlsx> [output_dir]
python -m product.tax_mileage_toolkit.cli suggest-clusters <workbook.xlsx> [output_dir] [--write] [--engage-deferred]
python -m product.tax_mileage_toolkit.cli render-html <run_dir>
python -m product.tax_mileage_toolkit.cli serve-gui --host 127.0.0.1 --port 8787
```

## Commands

- `reconcile` writes:
  - `cluster_match_report.csv`
  - `cluster_overlap_report.csv`
  - `known_site_rollup_report.csv`
- `audit` writes:
  - `audit_report.json`
- `suggest-clusters` writes:
  - `cluster_suggestion_report.csv`
  - Optional helper-column workbook updates when using `--write` (backup created first)
- `render-html` writes:
  - `audit.html`
  - `cluster_suggestions.html`
  - `cluster_matches.html`
  - `cluster_overlaps.html`
  - `index.html`
- `serve-gui` starts local web app for running and promoting suggestions

## Command Examples

```bash
python -m product.tax_mileage_toolkit.cli reconcile .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts\runs\manual
python -m product.tax_mileage_toolkit.cli audit .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts\runs\manual
python -m product.tax_mileage_toolkit.cli suggest-clusters .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts\runs\manual
python -m product.tax_mileage_toolkit.cli suggest-clusters .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts\runs\manual --write
python -m product.tax_mileage_toolkit.cli render-html .\scripts\runs\manual
python -m product.tax_mileage_toolkit.cli serve-gui --host 127.0.0.1 --port 8787
```

## Safety Notes

- Use `suggest-clusters` without `--write` first to review dry-run outputs.
- `--write` creates workbook backups before helper updates.
- In GUI, use **Promote Dry-Run Selected** before **Promote Selected**.
