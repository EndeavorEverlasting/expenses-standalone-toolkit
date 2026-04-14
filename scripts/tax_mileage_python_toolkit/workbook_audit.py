#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from product.tax_mileage_toolkit.audit import run_audit


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python workbook_audit.py /path/to/workbook.xlsx [output_dir]")
        raise SystemExit(1)

    workbook_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) >= 3 else None
    report = run_audit(workbook_path, output_dir)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
