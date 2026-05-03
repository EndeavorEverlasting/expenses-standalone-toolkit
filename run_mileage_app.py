#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

MIN_PYTHON = (3, 10)


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def venv_python_path(venv_dir: Path) -> Path:
    if sys.platform.startswith("win"):
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def ensure_python_version() -> None:
    if sys.version_info < MIN_PYTHON:
        min_text = ".".join(str(n) for n in MIN_PYTHON)
        current = ".".join(str(n) for n in sys.version_info[:3])
        raise RuntimeError(f"Python {min_text}+ is required. Current version is {current}.")


def run_cmd(cmd: list[str], cwd: Path) -> None:
    subprocess.run(cmd, cwd=str(cwd), check=True)


def bootstrap_environment(project_root: Path) -> Path:
    ensure_python_version()
    venv_dir = project_root / ".venv"
    venv_python = venv_python_path(venv_dir)

    if not venv_python.exists():
        print("Creating virtual environment...")
        run_cmd([sys.executable, "-m", "venv", str(venv_dir)], cwd=project_root)

    print("Installing dependencies...")
    run_cmd([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"], cwd=project_root)
    run_cmd([str(venv_python), "-m", "pip", "install", "-r", "requirements.txt"], cwd=project_root)
    return venv_python


def _open_browser_when_ready(url: str, timeout: int = 30) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1):
                pass
            webbrowser.open(url)
            return
        except Exception:
            time.sleep(0.5)
    print(f"Could not confirm server readiness; opening browser anyway: {url}")
    webbrowser.open(url)


def start_gui(venv_python: Path, host: str = "127.0.0.1", port: int = 8787) -> int:
    url = f"http://{host}:{port}"
    cmd = [
        str(venv_python),
        "-m",
        "product.tax_mileage_toolkit.cli",
        "serve-gui",
        "--host",
        host,
        "--port",
        str(port),
    ]
    t = threading.Thread(target=_open_browser_when_ready, args=(url,), daemon=True)
    t.start()
    return subprocess.call(cmd, cwd=str(repo_root()))


def main() -> int:
    root = repo_root()
    try:
        venv_python = bootstrap_environment(root)
    except Exception as exc:
        print(f"Bootstrap failed: {exc}")
        print("Run from repository root and verify Python is installed and available in PATH.")
        return 1

    print("Starting Mileage GUI Workbench at http://127.0.0.1:8787 ...")
    return start_gui(venv_python)


if __name__ == "__main__":
    raise SystemExit(main())
