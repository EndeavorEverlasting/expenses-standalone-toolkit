import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run_mileage_app


class RunMileageAppTests(unittest.TestCase):
    def test_venv_python_path_windows(self) -> None:
        with patch("run_mileage_app.sys.platform", "win32"):
            path = run_mileage_app.venv_python_path(Path("C:/repo/.venv"))
            self.assertEqual(path, Path("C:/repo/.venv/Scripts/python.exe"))

    def test_venv_python_path_posix(self) -> None:
        with patch("run_mileage_app.sys.platform", "linux"):
            path = run_mileage_app.venv_python_path(Path("/repo/.venv"))
            self.assertEqual(path, Path("/repo/.venv/bin/python"))

    def test_bootstrap_creates_venv_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake_python = root / ".venv" / "bin" / "python"
            calls = []
            with (
                patch("run_mileage_app.ensure_python_version"),
                patch("run_mileage_app.venv_python_path", return_value=fake_python),
                patch("run_mileage_app.run_cmd", side_effect=lambda cmd, cwd: calls.append((cmd, cwd))),
            ):
                result = run_mileage_app.bootstrap_environment(root)

            self.assertEqual(result, fake_python)
            self.assertEqual(len(calls), 3)
            self.assertEqual(calls[0][0][1:3], ["-m", "venv"])
            self.assertEqual(calls[1][0][-3:], ["install", "--upgrade", "pip"])
            self.assertEqual(calls[2][0][-2:], ["-r", "requirements.txt"])

    def test_bootstrap_skips_venv_create_when_existing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake_python = root / ".venv" / "bin" / "python"
            fake_python.parent.mkdir(parents=True, exist_ok=True)
            fake_python.write_text("", encoding="utf-8")
            calls = []
            with (
                patch("run_mileage_app.ensure_python_version"),
                patch("run_mileage_app.venv_python_path", return_value=fake_python),
                patch("run_mileage_app.run_cmd", side_effect=lambda cmd, cwd: calls.append((cmd, cwd))),
            ):
                run_mileage_app.bootstrap_environment(root)

            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0][0][-3:], ["install", "--upgrade", "pip"])
            self.assertEqual(calls[1][0][-2:], ["-r", "requirements.txt"])

    def test_main_returns_nonzero_on_bootstrap_failure(self) -> None:
        with patch("run_mileage_app.bootstrap_environment", side_effect=RuntimeError("boom")):
            code = run_mileage_app.main()
            self.assertEqual(code, 1)

    def test_main_returns_gui_exit_code(self) -> None:
        with (
            patch("run_mileage_app.bootstrap_environment", return_value=Path("/tmp/.venv/bin/python")),
            patch("run_mileage_app.start_gui", return_value=0),
        ):
            code = run_mileage_app.main()
            self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
