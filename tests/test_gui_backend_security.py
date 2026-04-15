import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from product.tax_mileage_toolkit.gui_backend import create_app


class GuiBackendSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.workspace = Path(self._tmp.name)
        self.runs_root = self.workspace / "scripts" / "runs"
        self.runs_root.mkdir(parents=True, exist_ok=True)
        self.app = create_app(self.workspace)
        self.client = TestClient(self.app)

        self.workbook = self.workspace / "sample.xlsx"
        self.workbook.write_text("placeholder", encoding="utf-8")

        self.run_id = "20260415_120000"
        run_dir = self.runs_root / self.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "audit_report.json").write_text(json.dumps({}), encoding="utf-8")
        (run_dir / "cluster_suggestion_report.csv").write_text(
            "row_idx,cluster_id,nearest_site,status\n1,c1,Site A,suggested\n",
            encoding="utf-8",
        )
        (run_dir / "cluster_match_report.csv").write_text("cluster_id,nearest_site\nc1,Site A\n", encoding="utf-8")
        (run_dir / "cluster_overlap_report.csv").write_text(
            "cluster_id_1,cluster_id_2,distance_mi\nc1,c2,0.2\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_summary_rejects_invalid_run_id(self) -> None:
        res = self.client.get("/api/runs/bad..id/summary")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid run id", res.text)

    def test_table_rejects_invalid_run_id(self) -> None:
        res = self.client.get("/api/runs/bad..id/table/suggestions")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid run id", res.text)

    def test_promote_rejects_invalid_run_id(self) -> None:
        payload = {
            "workbook_path": str(self.workbook),
            "run_id": "../bad",
            "row_indices": [1],
            "dry_run": True,
        }
        res = self.client.post("/api/promote", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid run id", res.text)

    def test_run_rejects_workbook_outside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as outside:
            outside_workbook = Path(outside) / "outside.xlsx"
            outside_workbook.write_text("placeholder", encoding="utf-8")
            payload = {
                "workbook_path": str(outside_workbook),
                "engage_deferred": False,
                "write_suggestions": False,
            }
            res = self.client.post("/api/run", json=payload)
            self.assertEqual(res.status_code, 400)
            self.assertIn("Path outside workspace is not allowed", res.text)

    def test_summary_accepts_valid_run_id(self) -> None:
        res = self.client.get(f"/api/runs/{self.run_id}/summary")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["run_id"], self.run_id)
        self.assertIn("actionable_feedback", body)


if __name__ == "__main__":
    unittest.main()
