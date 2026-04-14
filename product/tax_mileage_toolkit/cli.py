import argparse
import json
import sys
from pathlib import Path

from .audit import run_audit
from .reconcile import run_reconcile


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tax-mileage-toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    reconcile_parser = subparsers.add_parser("reconcile", help="Generate site reconciliation CSV reports.")
    reconcile_parser.add_argument("workbook", type=Path, help="Path to reconciliation workbook (.xlsx)")
    reconcile_parser.add_argument("output_dir", nargs="?", type=Path, help="Optional output directory")

    audit_parser = subparsers.add_parser("audit", help="Generate workbook audit JSON report.")
    audit_parser.add_argument("workbook", type=Path, help="Path to reconciliation workbook (.xlsx)")
    audit_parser.add_argument("output_dir", nargs="?", type=Path, help="Optional output directory")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "reconcile":
        results = run_reconcile(args.workbook, args.output_dir)
        print(json.dumps(results, indent=2))
        return 0

    if args.command == "audit":
        results = run_audit(args.workbook, args.output_dir)
        print(json.dumps(results, indent=2))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
