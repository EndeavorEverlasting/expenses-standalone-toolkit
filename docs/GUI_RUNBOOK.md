# Mileage GUI Runbook

## Start

```bash
python -m product.tax_mileage_toolkit.cli serve-gui --host 127.0.0.1 --port 8787
```

Open `http://127.0.0.1:8787`.

## Typical workflow

1. Enter workbook path.
2. Choose mode (`Engage deferred`, `Write helper suggestions`).
3. Run iteration from GUI.
4. Review suggestions/matches/overlaps.
5. Select suggestion rows and run **Promote Dry-Run Selected**.
6. Run **Promote Selected** only after dry-run output looks correct.

## Guardrails

- Promotion writes only selected suggestion rows.
- Promotion write creates backup in run folder `promotion_backups/`.
- Promotion emits `promotion_report_<timestamp>.json`.

## Rollback

- Use backup workbook generated in the run folder to restore pre-promotion state.
