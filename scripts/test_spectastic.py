"""Tests for the spectastic CLI.

Run from the project root with `pytest scripts/test_spectastic.py`.
"""

import subprocess
import sys
from pathlib import Path

import pytest

CLI = Path(__file__).resolve().parent / "spectastic"


def run_cli(args, cwd, input_text=None, timeout=10):
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=str(cwd),
        input=input_text,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


@pytest.fixture
def project_dir(tmp_path):
    return tmp_path


def test_cli_is_executable(project_dir):
    result = run_cli([], cwd=project_dir)
    assert result.returncode == 0
