"""Tests for the spectastic CLI.

Run from the project root with `pytest scripts/test_spectastic.py`.
"""

import os
import pty
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


def run_cli_tty(args, cwd, input_text="", timeout=10):
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        [sys.executable, str(CLI), *args],
        cwd=str(cwd),
        stdin=slave,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        close_fds=True,
    )
    os.close(slave)
    if input_text:
        os.write(master, input_text.encode())
    os.close(master)
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise
    return subprocess.CompletedProcess(args, proc.returncode, stdout, stderr)


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


def _seed_conflict(project_dir, rel=".claude/commands/spectastic.principles.md", body="STALE\n"):
    target = project_dir / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body)
    return target


def test_init_prompts_on_conflict(project_dir):
    target = _seed_conflict(project_dir)
    result = run_cli_tty(["init"], cwd=project_dir, input_text="s\n")
    assert result.returncode == 0
    assert "Overwrite?" in result.stdout
    assert str(target.relative_to(project_dir)) in result.stdout


def test_init_default_input_is_no(project_dir):
    target = _seed_conflict(project_dir)
    result = run_cli_tty(["init"], cwd=project_dir, input_text="\n")
    assert result.returncode == 0
    assert target.read_text() == "STALE\n"


def test_init_y_overwrites_single_file(project_dir):
    target = _seed_conflict(project_dir)
    answer = "y\n" + "N\n" * 16
    result = run_cli_tty(["init"], cwd=project_dir, input_text=answer)
    assert result.returncode == 0
    assert target.read_text() != "STALE\n"


def test_init_a_overwrites_all_remaining(project_dir):
    t1 = _seed_conflict(project_dir, ".claude/commands/spectastic.principles.md", "A\n")
    t2 = _seed_conflict(project_dir, ".claude/commands/spectastic.spec.md", "B\n")
    result = run_cli_tty(["init"], cwd=project_dir, input_text="a\n")
    assert result.returncode == 0
    assert t1.read_text() != "A\n"
    assert t2.read_text() != "B\n"


def test_init_s_skips_all_remaining(project_dir):
    t1 = _seed_conflict(project_dir, ".claude/commands/spectastic.principles.md", "A\n")
    t2 = _seed_conflict(project_dir, ".claude/commands/spectastic.spec.md", "B\n")
    result = run_cli_tty(["init"], cwd=project_dir, input_text="s\n")
    assert result.returncode == 0
    assert t1.read_text() == "A\n"
    assert t2.read_text() == "B\n"


def test_init_atomic_no_partial_state(project_dir):
    result = run_cli(["init"], cwd=project_dir)
    assert result.returncode == 0
    tmps = list(project_dir.rglob("*.tmp"))
    assert tmps == [], f"tmp files leaked: {tmps}"
