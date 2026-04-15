# Mileage GUI Runbook

## First-Time Setup (New Admin Box)

Preferred one-click startup:

```bash
python run_mileage_app.py
```

This bootstraps `.venv`, installs dependencies, and starts the GUI.

Manual fallback:

```bash
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows (PowerShell):
# .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m product.tax_mileage_toolkit.cli serve-gui --host 127.0.0.1 --port 8787
```

Success checks:

- Browser opens `http://127.0.0.1:8787`
- Run controls are visible
- A run creates `scripts/runs/<run_id>/` with audit/report files

## Start

```bash
python -m product.tax_mileage_toolkit.cli serve-gui --host 127.0.0.1 --port 8787
```

Open `http://127.0.0.1:8787`.

## Typical workflow

1. Enter workbook path.
2. Choose mode (`Engage deferred`, `Write helper suggestions`).
3. Run iteration from GUI.
4. Review **Actionable Workbook Feedback** in the Runs panel.
5. Select suggestion rows and run **Promote Dry-Run Selected**.
6. Run **Promote Selected** only after dry-run output looks correct.

## Actionable feedback workflow

Use each feedback card to line up workbook edits in real life:

1. Read the **Where** line (`sheet`, `row range`, `columns`) and go to that sheet/range in Excel.
2. Use **Sample rows** first to quickly verify the issue pattern before editing all affected rows.
3. Follow **Do this** exactly (for example: fill missing `final_site_decision`, classification, miles, or toll decision).
4. Use **Goal** as a quality check to ensure your row edits match the intended downstream alignment.
5. Save workbook updates, then run another iteration to confirm issue counts are reduced.

The same actionable guidance appears in generated `audit.html` for offline review.

## Guardrails

- Promotion writes only selected suggestion rows.
- Promotion write creates backup in run folder `promotion_backups/`.
- Promotion emits `promotion_report_<timestamp>.json`.

## Rollback

- Use backup workbook generated in the run folder to restore pre-promotion state.
