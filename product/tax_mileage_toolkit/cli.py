import argparse
import json
import sys
from pathlib import Path

from .audit import run_audit
from .gui_backend import serve_gui
from .reconcile import run_reconcile, run_suggest_clusters
from .reporting import render_html_reports


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tax-mileage-toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    reconcile_parser = subparsers.add_parser("reconcile", help="Generate site reconciliation CSV reports.")
    reconcile_parser.add_argument("workbook", type=Path, help="Path to reconciliation workbook (.xlsx)")
    reconcile_parser.add_argument("output_dir", nargs="?", type=Path, help="Optional output directory")

    audit_parser = subparsers.add_parser("audit", help="Generate workbook audit JSON report.")
    audit_parser.add_argument("workbook", type=Path, help="Path to reconciliation workbook (.xlsx)")
    audit_parser.add_argument("output_dir", nargs="?", type=Path, help="Optional output directory")

    suggest_parser = subparsers.add_parser(
        "suggest-clusters", help="Conservatively suggest unresolved clusters to helper columns."
    )
    suggest_parser.add_argument("workbook", type=Path, help="Path to reconciliation workbook (.xlsx)")
    suggest_parser.add_argument("output_dir", nargs="?", type=Path, help="Optional output directory")
    suggest_parser.add_argument(
        "--write",
        action="store_true",
        help="Write helper suggestions to workbook (creates backup first).",
    )
    suggest_parser.add_argument(
        "--ambiguity-margin",
        type=float,
        default=0.1,
        help="Maximum distance delta for competing near sites to be considered ambiguous.",
    )
    suggest_parser.add_argument(
        "--engage-deferred",
        action="store_true",
        help="Include unresolved near-radius unambiguous clusters as Medium-confidence helper suggestions.",
    )

    render_parser = subparsers.add_parser("render-html", help="Render polished HTML pages from run artifacts.")
    render_parser.add_argument("run_dir", type=Path, help="Directory containing CSV/JSON run outputs.")

    gui_parser = subparsers.add_parser("serve-gui", help="Start local GUI workbench backend + frontend.")
    gui_parser.add_argument("--host", default="127.0.0.1", help="Host bind address.")
    gui_parser.add_argument("--port", type=int, default=8787, help="Port for GUI server.")
    gui_parser.add_argument("--workspace", type=Path, default=None, help="Optional workspace root override.")

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

    if args.command == "suggest-clusters":
        results = run_suggest_clusters(
            args.workbook,
            args.output_dir,
            dry_run=not args.write,
            ambiguity_margin=args.ambiguity_margin,
            engage_deferred=args.engage_deferred,
        )
        print(json.dumps(results, indent=2))
        return 0

    if args.command == "render-html":
        results = render_html_reports(args.run_dir)
        print(json.dumps(results, indent=2))
        return 0

    if args.command == "serve-gui":
        serve_gui(host=args.host, port=args.port, workspace=args.workspace)
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
