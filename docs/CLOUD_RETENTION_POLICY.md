# Cloud Retention Policy

Use this policy to keep cloud docs and source reproducible while excluding private and regenerable runtime artifacts.

## Keep in cloud (commit)

- Source code:
  - `product/tax_mileage_toolkit/`
  - `scripts/tax_mileage_python_toolkit/`
- Docs and runbooks:
  - `docs/`
  - `README.md`
  - `releases/2026-04-14/RELEASE_NOTES.md`
- Config templates and manifests:
  - `scripts/tax_mileage_python_toolkit/config_example.json`
  - `requirements.txt`

## Do not commit (regenerate locally)

- Runtime reports and dashboards:
  - `scripts/*.csv`
  - `scripts/*.json`
  - `scripts/*.html`
  - `scripts/runs/`
- Backup and temp workbook artifacts:
  - `scripts/backups/`
  - `scripts/*backup*.xlsx`
  - `scripts/*test*.xlsx`
- Personal evidence/raw exports:
  - bank statements, timeline exports, takeout archives, and other private source files

## Iteration workflow across boxes

1. Commit only source/docs/templates.
2. Pull on next machine.
3. Re-run toolkit/GUI to regenerate runtime outputs.
4. Keep generated outputs local unless deliberately exported outside git.

## Pre-commit checklist

- `git status` shows only code/docs/template changes.
- No `.xlsx` backups or generated run artifacts are staged.
- No private evidence files are staged.
