import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _html_page(title: str, subtitle: str, chips: list[str], body: str) -> str:
    chip_html = "".join(f"<span class='chip'>{c}</span>" for c in chips)
    generated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title}</title>
  <style>
    body {{ font-family: 'Segoe UI', Arial, sans-serif; background:#0d1117; color:#e6edf3; margin:0; padding:24px; }}
    h1 {{ margin:0 0 6px 0; color:#7cc7ff; }}
    .meta {{ color:#9aa4b2; margin-bottom:10px; }}
    .bar {{ margin: 10px 0 16px 0; }}
    .chip {{ display:inline-block; margin:0 8px 8px 0; padding:4px 10px; border:1px solid #2d3748; border-radius:999px; background:#161b22; font-size:12px; }}
    table {{ width:100%; border-collapse:collapse; }}
    th, td {{ border:1px solid #2d3748; padding:7px 9px; text-align:left; font-size:13px; }}
    th {{ background:#161b22; position:sticky; top:0; }}
    tr:nth-child(even) {{ background:#11161e; }}
    a {{ color:#7cc7ff; }}
    .card {{ background:#11161e; border:1px solid #2d3748; border-radius:8px; padding:12px; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <div class="meta">{subtitle} | Generated {generated}</div>
  <div class="bar">{chip_html}</div>
  {body}
</body>
</html>"""


def _table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "<div class='card'>No rows available.</div>"
    headers = list(rows[0].keys())
    head = "".join(f"<th>{h}</th>" for h in headers)
    body_rows = []
    for row in rows:
        body_rows.append("<tr>" + "".join(f"<td>{row.get(h, '')}</td>" for h in headers) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>"


def _actionable_feedback_html(feedback: list[dict[str, Any]]) -> str:
    if not feedback:
        return "<div class='card'>No actionable feedback in this run.</div>"
    blocks = []
    for item in feedback:
        location = item.get("workbook_location", {}) or {}
        sheet = location.get("sheet", "Unknown sheet")
        columns = ", ".join(location.get("columns", [])) if isinstance(location.get("columns"), list) else ""
        row_start = location.get("row_start", "?")
        row_end = location.get("row_end", "?")
        sample_rows = item.get("sample_rows", [])
        sample_text = ", ".join(str(r) for r in sample_rows[:5]) if sample_rows else "none sampled"
        blocks.append(
            "<div class='card'>"
            f"<h3>{item.get('metric_key', 'issue')} ({item.get('count', 0)})</h3>"
            f"<p><strong>Where:</strong> {sheet}, rows {row_start}-{row_end}, columns {columns}</p>"
            f"<p><strong>Do this:</strong> {item.get('practical_action', '')}</p>"
            f"<p><strong>Goal:</strong> {item.get('alignment_goal', '')}</p>"
            f"<p><strong>Sample rows:</strong> {sample_text}</p>"
            "</div>"
        )
    return "".join(blocks)


def render_html_reports(run_dir: Path) -> dict[str, str]:
    run_dir = run_dir.expanduser().resolve()
    audit = _read_json(run_dir / "audit_report.json")
    suggest = _read_csv(run_dir / "cluster_suggestion_report.csv")
    matches = _read_csv(run_dir / "cluster_match_report.csv")
    overlaps = _read_csv(run_dir / "cluster_overlap_report.csv")

    paths: dict[str, str] = {}

    actionable_feedback = audit.get("actionable_feedback", [])
    if not isinstance(actionable_feedback, list):
        actionable_feedback = []
    audit_rows = [{"metric": k, "value": v} for k, v in audit.items() if k != "actionable_feedback"]
    actionable_body = _actionable_feedback_html([item for item in actionable_feedback if item.get("count", 0) > 0])
    audit_html = _html_page(
        "Mileage Audit Summary",
        str(run_dir),
        [f"Metrics: {len(audit_rows)}"],
        _table(audit_rows)
        + "<div class='card'><h2>Actionable Workbook Feedback</h2></div>"
        + actionable_body,
    )
    audit_path = run_dir / "audit.html"
    audit_path.write_text(audit_html, encoding="utf-8")
    paths["audit_html"] = str(audit_path)

    suggest_counts = {
        "suggested": sum(1 for r in suggest if r.get("status") == "suggested"),
        "deferred": sum(1 for r in suggest if r.get("status") == "deferred"),
        "skipped": sum(1 for r in suggest if r.get("status") == "skipped"),
    }
    suggest_html = _html_page(
        "Cluster Suggestions",
        str(run_dir),
        [f"Total: {len(suggest)}", f"Suggested: {suggest_counts['suggested']}", f"Deferred: {suggest_counts['deferred']}"],
        _table(suggest),
    )
    suggest_path = run_dir / "cluster_suggestions.html"
    suggest_path.write_text(suggest_html, encoding="utf-8")
    paths["cluster_suggestions_html"] = str(suggest_path)

    match_html = _html_page(
        "Cluster Matches",
        str(run_dir),
        [f"Rows: {len(matches)}"],
        _table(matches),
    )
    match_path = run_dir / "cluster_matches.html"
    match_path.write_text(match_html, encoding="utf-8")
    paths["cluster_matches_html"] = str(match_path)

    overlap_html = _html_page(
        "Cluster Overlaps",
        str(run_dir),
        [f"Rows: {len(overlaps)}"],
        _table(overlaps),
    )
    overlap_path = run_dir / "cluster_overlaps.html"
    overlap_path.write_text(overlap_html, encoding="utf-8")
    paths["cluster_overlaps_html"] = str(overlap_path)

    index_body = f"""
    <div class='card'>
      <h3>Run Outputs</h3>
      <ul>
        <li><a href='audit.html'>Audit Summary</a></li>
        <li><a href='cluster_suggestions.html'>Cluster Suggestions</a></li>
        <li><a href='cluster_matches.html'>Cluster Matches</a></li>
        <li><a href='cluster_overlaps.html'>Cluster Overlaps</a></li>
      </ul>
    </div>
    """
    index_html = _html_page(
        "Mileage Run Index",
        str(run_dir),
        [f"Audit metrics: {len(audit_rows)}", f"Suggestions: {len(suggest)}", f"Matches: {len(matches)}"],
        index_body,
    )
    index_path = run_dir / "index.html"
    index_path.write_text(index_html, encoding="utf-8")
    paths["index_html"] = str(index_path)

    return paths
