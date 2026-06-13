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


EXPECTED_COMMANDS = (
    "spectastic.principles.md",
    "spectastic.spec.md",
    "spectastic.plan.md",
    "spectastic.tasks.md",
    "spectastic.implement.md",
    "spectastic.propose.md",
    "spectastic.apply.md",
    "spectastic.triage.md",
)

EXPECTED_TEMPLATES = (
    "principles.html",
    "spec.html",
    "plan.html",
    "tasks.html",
    "proposal.html",
    "inbox.html",
)


def test_cli_is_executable(project_dir):
    result = run_cli([], cwd=project_dir)
    assert result.returncode == 0


def test_init_empty_dir_creates_eight_commands(project_dir):
    result = run_cli(["init"], cwd=project_dir)
    assert result.returncode == 0, result.stderr
    cmds = project_dir / ".claude" / "commands"
    for name in EXPECTED_COMMANDS:
        assert (cmds / name).is_file(), f"missing {name}"


def test_init_empty_dir_copies_assets(project_dir):
    result = run_cli(["init"], cwd=project_dir)
    assert result.returncode == 0, result.stderr
    css = project_dir / "assets" / "spec.css"
    js = project_dir / "assets" / "spec.js"
    assert css.is_file() and css.read_text() != ""
    assert js.is_file() and js.read_text() != ""


def test_init_empty_dir_copies_templates(project_dir):
    result = run_cli(["init"], cwd=project_dir)
    assert result.returncode == 0, result.stderr
    templates = project_dir / "templates"
    for name in EXPECTED_TEMPLATES:
        assert (templates / name).is_file(), f"missing template {name}"


def test_init_exit_code_zero_on_success(project_dir):
    result = run_cli(["init"], cwd=project_dir)
    assert result.returncode == 0
    assert "/spectastic.principles" in result.stdout
