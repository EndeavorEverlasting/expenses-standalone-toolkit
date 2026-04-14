import json
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


def _count_blank(values: Any) -> int:
    return sum(1 for v in values if v in (None, ""))


def run_audit(workbook_path: Path, output_dir: Path | None = None) -> dict[str, int]:
    workbook_path = workbook_path.expanduser().resolve()
    out_dir = output_dir.expanduser().resolve() if output_dir else workbook_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    wb = load_workbook(workbook_path, data_only=True)

    coord = wb["Coord Reconcile Console"]
    site_roll = wb["Known Site Rollup"]
    matrix = wb["Sites & Distance Matrix"]
    site_day = wb["Site-Day Draft"]
    drafted = wb["Mileage Detail - Drafted"]

    clusters_missing_final = _count_blank(coord.cell(r, 13).value for r in range(6, coord.max_row + 1))
    sites_unconfirmed = _count_blank(site_roll.cell(r, 13).value for r in range(6, site_roll.max_row + 1))

    matrix_missing_miles = 0
    for r in range(6, matrix.max_row + 1):
        if matrix.cell(r, 4).value == "Yes" and matrix.cell(r, 10).value not in (None, "") and matrix.cell(
            r, 11
        ).value in (None, ""):
            matrix_missing_miles += 1

    site_day_missing_final = _count_blank(site_day.cell(r, 19).value for r in range(5, site_day.max_row + 1))

    weekend_pending = 0
    for r in range(5, site_day.max_row + 1):
        if site_day.cell(r, 16).value == "Weekend" and site_day.cell(r, 20).value in (None, ""):
            weekend_pending += 1

    drafted_missing_classification = 0
    drafted_toll_missing = 0
    for r in range(5, drafted.max_row + 1):
        if drafted.cell(r, 2).value not in (None, "") and drafted.cell(r, 15).value in (None, ""):
            drafted_missing_classification += 1
        if drafted.cell(r, 22).value == "Yes" and drafted.cell(r, 23).value in (None, ""):
            drafted_toll_missing += 1

    report = {
        "clusters_missing_final_site_decision": clusters_missing_final,
        "known_sites_not_user_confirmed": sites_unconfirmed,
        "distance_matrix_active_rows_missing_standard_miles": matrix_missing_miles,
        "site_day_rows_missing_final_site_decision": site_day_missing_final,
        "weekend_site_day_rows_pending_review": weekend_pending,
        "drafted_legs_missing_classification": drafted_missing_classification,
        "toll_candidate_legs_missing_toll_decision": drafted_toll_missing,
    }

    out_path = out_dir / "audit_report.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
