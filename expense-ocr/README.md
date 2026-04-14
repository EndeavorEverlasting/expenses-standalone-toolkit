# Expense OCR (Legacy Support Module)

This module is kept for OCR-related preprocessing experiments that can support the standalone mileage reconciliation flow.

## Purpose

- Extract text hints from expense and travel screenshots.
- Support iterative evidence gathering before final workbook reconciliation.
- Remain separate from the canonical toolkit engine in `product/tax_mileage_toolkit`.

## Install

```bash
python -m pip install -r expense-ocr/requirements.txt
```

## Notes

- This is legacy support tooling; treat outputs as review inputs, not final truth.
- Do not store private screenshot evidence in version control.
