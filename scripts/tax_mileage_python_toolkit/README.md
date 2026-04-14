# 2025 Tax Mileage Reconciliation Toolkit

This folder is a legacy-compatible entry point. The canonical standalone product code now lives in `product/tax_mileage_toolkit`.

## What it does

1. **site_reconcile.py**
   - Reads the workbook
   - Matches coordinate clusters to known sites using haversine distance
   - Flags overlaps when clusters are close to one another
   - Exports CSV reports you can sort or filter outside Excel

2. **workbook_audit.py**
   - Reads the workbook
   - Counts blanks and review gaps that still block a clean Bill-facing summary
   - Exports a JSON audit report and prints a concise console summary

## Expected workbook tabs

The scripts expect these sheets to exist:

- `Maps 2025 - Clusters`
- `Known Site Registry`
- `Sites & Distance Matrix`
- `Site-Day Draft`
- `Mileage Detail - Drafted`

## Install (Windows PowerShell)

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r ..\..\requirements.txt
```

## Run (Standalone CLI)

From repository root:

```bash
python -m product.tax_mileage_toolkit.cli reconcile .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts
python -m product.tax_mileage_toolkit.cli audit .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts
python -m product.tax_mileage_toolkit.cli suggest-clusters .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts
python -m product.tax_mileage_toolkit.cli suggest-clusters .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx .\scripts --write
```

### HTML reporting
```bash
python -m product.tax_mileage_toolkit.cli render-html .\scripts
```

### Full polished run (includes SysAdminSuite themed pages)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tax_mileage_python_toolkit\Invoke-MileageHtmlRun.ps1 `
  -WorkbookPath .\latest\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx `
  -EngageDeferred `
  -WriteSuggestions
```

### Launch GUI workbench
```bash
python -m product.tax_mileage_toolkit.cli serve-gui --host 127.0.0.1 --port 8787
```

Open `http://127.0.0.1:8787` and use:
- run controls for `audit/reconcile/suggest`
- suggestions table row selection
- promotion dry-run before promotion write

## Run (Legacy wrappers in this folder)

### Reconciliation reports
```bash
python site_reconcile.py C:\path\to\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx
```

Outputs:
- `cluster_match_report.csv`
- `cluster_overlap_report.csv`
- `known_site_rollup_report.csv`

### Audit report
```bash
python workbook_audit.py C:\path\to\CANDIDATE_2025_Tax_Mileage_Reconciliation_Toolkit_v3.xlsx
```

Outputs:
- `audit_report.json`

## Suggested workflow

1. Confirm your sites in **Known Site Registry**
2. Review **Coord Reconcile Console**
3. Fill exact HQ→site miles in **Sites & Distance Matrix**
4. Sort **Site-Day Draft** by weekday/weekend
5. Push only confirmed rows into **Mileage Detail - Drafted** and then `Mileage Detail`

## Guardrails

- Do not auto-label every near match as true
- Treat weekend rows as review items, not automatic work days
- Keep unresolved labels unresolved until you actually know the answer
- If a site row is a general region marker, use it to investigate, not to file

## Notes

- The scripts only use the standard library plus `openpyxl`
- They do not call any online geocoding service
- They are designed to help you reconcile and audit, not replace human judgment
