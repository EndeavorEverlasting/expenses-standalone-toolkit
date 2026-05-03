# Standalone Tax Mileage Toolkit

A Python FastAPI web application for reconciling destination coordinates, known work sites, and mileage evidence from workbook-based tax workflows.

## Architecture

- **Backend**: FastAPI + Uvicorn (Python)
- **Frontend**: Vanilla HTML/CSS/JS served by FastAPI as static files
- **Port**: 5000 (host: 0.0.0.0)
- **Entry point**: `product/tax_mileage_toolkit/cli.py` → `serve-gui` command

## Project Structure

```
product/tax_mileage_toolkit/    # Core package
  cli.py                        # CLI entry point (reconcile, audit, suggest-clusters, serve-gui)
  gui_backend.py                # FastAPI app + API routes
  gui/                          # Static frontend (index.html, app.js, styles.css)
  audit.py                      # Workbook audit logic
  reconcile.py                  # Reconciliation + cluster suggestion logic
  reporting.py                  # HTML report rendering
scripts/tax_mileage_python_toolkit/  # Compatibility wrappers + docs
expense-ocr/                    # Legacy OCR support module
docs/                           # Repo docs and integration contracts
tests/                          # Test files
```

## Key Features

- **GUI Workbench**: Web UI for running iterations, reviewing audit results, managing cluster suggestions, and promoting suggestions back to the workbook
- **CLI**: `reconcile`, `audit`, `suggest-clusters`, `render-html`, `serve-gui`
- **Promotion guardrails**: Dry-run mode, backup files, row-level selection

## Dependencies

- `fastapi`, `uvicorn` — web server
- `openpyxl` — Excel workbook read/write
- `pandas` — data processing
- `opencv-python`, `pytesseract` — OCR (legacy expense module)

## Running Locally

```bash
python -m product.tax_mileage_toolkit.cli serve-gui --host 0.0.0.0 --port 5000
```

## Workflow

- **Start application**: Runs `python -m product.tax_mileage_toolkit.cli serve-gui --host 0.0.0.0 --port 5000`

## Deployment

- Target: autoscale
- Run: `python -m product.tax_mileage_toolkit.cli serve-gui --host 0.0.0.0 --port 5000`
