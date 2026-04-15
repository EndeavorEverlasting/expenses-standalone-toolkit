import csv
import tempfile
import unittest
from pathlib import Path

from product.tax_mileage_toolkit.reconcile import _export_cluster_matches, _export_known_site_rollup
from product.tax_mileage_toolkit.reporting import _actionable_feedback_html, _table


class ReconcileReportingSecurityTests(unittest.TestCase):
    def test_export_cluster_matches_handles_empty_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            rows = _export_cluster_matches(out_dir, clusters=[], known_sites=[], strong=0.5, near=1.5)
            self.assertEqual(rows, [])
            out_path = out_dir / "cluster_match_report.csv"
            self.assertTrue(out_path.exists())
            with out_path.open("r", encoding="utf-8", newline="") as f:
                header = f.readline().strip()
            self.assertIn("cluster_id", header)
            self.assertIn("nearest_site", header)

    def test_export_cluster_matches_handles_missing_known_sites(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            clusters = [
                {
                    "cluster_id": "C1",
                    "review_status": "",
                    "user_site_label": "",
                    "candidate_work_site": "",
                    "distinct_days": 1,
                    "first_seen": "",
                    "last_seen": "",
                    "lat": 0.0,
                    "lng": 0.0,
                }
            ]
            rows = _export_cluster_matches(out_dir, clusters=clusters, known_sites=[], strong=0.5, near=1.5)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["nearest_site"], "")
            self.assertEqual(rows[0]["auto_match_grade"], "")

    def test_export_known_site_rollup_handles_empty_known_sites(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            rows = _export_known_site_rollup(out_dir, known_sites=[], cluster_rows=[])
            self.assertEqual(rows, [])
            out_path = out_dir / "known_site_rollup_report.csv"
            self.assertTrue(out_path.exists())
            with out_path.open("r", encoding="utf-8", newline="") as f:
                header = f.readline().strip()
            self.assertIn("site_id", header)
            self.assertIn("strong_cluster_count", header)

    def test_reporting_table_escapes_values(self) -> None:
        html = _table([{"<script>": "<img src=x onerror=alert(1)>"}])
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("&lt;img src=x onerror=alert(1)&gt;", html)

    def test_actionable_feedback_html_escapes_values(self) -> None:
        feedback = [
            {
                "metric_key": "<b>metric</b>",
                "count": "<1>",
                "workbook_location": {
                    "sheet": "<sheet>",
                    "columns": ["<col1>", "<col2>"],
                    "row_start": "<5>",
                    "row_end": "<10>",
                },
                "practical_action": "<action>",
                "alignment_goal": "<goal>",
                "sample_rows": ["<r1>"],
            }
        ]
        html = _actionable_feedback_html(feedback)
        self.assertIn("&lt;b&gt;metric&lt;/b&gt;", html)
        self.assertIn("&lt;sheet&gt;", html)
        self.assertIn("&lt;action&gt;", html)
        self.assertIn("&lt;goal&gt;", html)
        self.assertIn("&lt;r1&gt;", html)


if __name__ == "__main__":
    unittest.main()
