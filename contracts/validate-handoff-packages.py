#!/usr/bin/env python3
"""Validate an Anolis handoff package (.anpkg or extracted directory)."""

from __future__ import annotations

import pathlib
import sys

# Allow running this script directly from contracts/ without requiring installation.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from anolis_workbench.cli.validate_cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
