"""Unit tests for deterministic handoff package export core."""

from __future__ import annotations

import io
import json
import pathlib
import zipfile

import pytest
import yaml

from anolis_workbench.core import exporter


def test_build_package_is_deterministic_and_rewrites_runtime_paths(tmp_path: pathlib.Path) -> None:
    project_dir = _make_project(tmp_path, name="export-deterministic")
    out_a = tmp_path / "a.anpkg"
    out_b = tmp_path / "b.anpkg"

    exporter.build_package(project_dir=project_dir, out_path=out_a)
    exporter.build_package(project_dir=project_dir, out_path=out_b)

    data_a = out_a.read_bytes()
    data_b = out_b.read_bytes()
    assert data_a == data_b

    with zipfile.ZipFile(io.BytesIO(data_a), mode="r") as archive:
        members = sorted(archive.namelist())
        assert members == sorted(
            [
                "machine-profile.yaml",
                "meta/checksums.sha256",
                "meta/provenance.json",
                "providers/sim0.yaml",
                "runtime/anolis-runtime.yaml",
                "runtime/behaviors/local.xml",
            ]
        )

        runtime_payload = yaml.safe_load(archive.read("runtime/anolis-runtime.yaml"))
        assert runtime_payload["providers"][0]["args"] == ["--config", "providers/sim0.yaml"]
        assert runtime_payload["automation"]["behavior_tree"] == "runtime/behaviors/local.xml"
        assert "token" not in runtime_payload.get("telemetry", {}).get("influxdb", {})
        assert "influx_token" not in runtime_payload.get("telemetry", {})

        machine_profile = yaml.safe_load(archive.read("machine-profile.yaml"))
        assert machine_profile["runtime_profiles"]["manual"] == "runtime/anolis-runtime.yaml"
        assert machine_profile["providers"]["sim0"]["config"] == "providers/sim0.yaml"
        assert machine_profile["behaviors"] == ["runtime/behaviors/local.xml"]

        provenance = json.loads(archive.read("meta/provenance.json").decode("utf-8"))
        assert provenance["exported_at"] == "2026-04-16T19:01:02Z"
        assert provenance["package_format_version"] == 1
        assert provenance["source_project"] == "export-deterministic"


def _make_project(tmp_path: pathlib.Path, *, name: str) -> pathlib.Path:
    system = {
        "schema_version": 1,
        "meta": {
            "name": name,
            "created": "2026-04-16T19:01:02.999999+00:00",
            "template": "sim-quickstart-fixture",
        },
        "topology": {
            "runtime": {
                "name": "anolis-main",
                "http_port": 8080,
                "http_bind": "127.0.0.1",
                "cors_origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
                "cors_allow_credentials": False,
                "shutdown_timeout_ms": 2000,
                "startup_timeout_ms": 30000,
                "polling_interval_ms": 500,
                "log_level": "info",
                "telemetry": {
                    "enabled": True,
                    "influxdb": {
                        "url": "http://localhost:8086",
                        "org": "anolis",
                        "bucket": "anolis",
                        "token": "super-secret",
                    },
                },
                "automation_enabled": True,
                "behavior_tree_path": "behaviors/local.xml",
                "providers": [
                    {
                        "id": "sim0",
                        "kind": "sim",
                        "timeout_ms": 5000,
                        "hello_timeout_ms": 2000,
                        "ready_timeout_ms": 10000,
                        "restart_policy": {"enabled": False},
                    }
                ],
            },
            "providers": {
                "sim0": {
                    "kind": "sim",
                    "provider_name": "sim0",
                    "startup_policy": "degraded",
                    "simulation_mode": "non_interacting",
                    "tick_rate_hz": 10.0,
                    "devices": [
                        {"id": "tempctl0", "type": "tempctl", "initial_temp": 25.0},
                        {"id": "motorctl0", "type": "motorctl", "max_speed": 3000.0},
                    ],
                }
            },
        },
        "paths": {
            "runtime_executable": "build/dev-release/core/anolis-runtime",
            "providers": {
                "sim0": {
                    "executable": "../anolis-provider-sim/build/dev-release/anolis-provider-sim",
                }
            },
        },
    }

    project_dir = tmp_path / name
    project_dir.mkdir(parents=True, exist_ok=True)

    behavior_dir = project_dir / "behaviors"
    behavior_dir.mkdir(parents=True, exist_ok=True)
    (behavior_dir / "local.xml").write_text("<root />\n", encoding="utf-8")

    (project_dir / "system.json").write_text(json.dumps(system, indent=2), encoding="utf-8")
    return project_dir


def test_missing_system_json_raises_export_error(tmp_path: pathlib.Path) -> None:
    project_dir = tmp_path / "no-system"
    project_dir.mkdir()
    with pytest.raises(exporter.ExportError, match="Project file not found"):
        exporter.build_package(project_dir=project_dir, out_path=tmp_path / "out.anpkg")


def test_malformed_system_json_raises_export_error(tmp_path: pathlib.Path) -> None:
    project_dir = tmp_path / "bad-json"
    project_dir.mkdir()
    (project_dir / "system.json").write_text("{not valid json", encoding="utf-8")
    with pytest.raises(exporter.ExportError, match="Failed reading"):
        exporter.build_package(project_dir=project_dir, out_path=tmp_path / "out.anpkg")


def test_absolute_behavior_tree_path_raises_export_error(tmp_path: pathlib.Path) -> None:
    project_dir = _make_project(tmp_path, name="abs-bt-test")
    system_path = project_dir / "system.json"
    system = json.loads(system_path.read_text(encoding="utf-8"))
    # Use an absolute path (drive + path is absolute on all platforms)
    abs_bt = str((tmp_path / "behaviors" / "local.xml").resolve())
    system["topology"]["runtime"]["behavior_tree_path"] = abs_bt
    system_path.write_text(json.dumps(system, indent=2), encoding="utf-8")
    with pytest.raises(exporter.ExportError, match="must be a relative path"):
        exporter.build_package(project_dir=project_dir, out_path=tmp_path / "out.anpkg")


def test_missing_behavior_tree_file_raises_export_error(tmp_path: pathlib.Path) -> None:
    project_dir = _make_project(tmp_path, name="missing-bt-test")
    system_path = project_dir / "system.json"
    system = json.loads(system_path.read_text(encoding="utf-8"))
    system["topology"]["runtime"]["behavior_tree_path"] = "behaviors/ghost.xml"
    system_path.write_text(json.dumps(system, indent=2), encoding="utf-8")
    with pytest.raises(exporter.ExportError, match="Behavior tree file not found"):
        exporter.build_package(project_dir=project_dir, out_path=tmp_path / "out.anpkg")


def test_secret_leak_raises_export_error() -> None:
    with pytest.raises(exporter.ExportError, match="Secret-like token value leaked"):
        exporter._assert_no_secret_leak(
            {
                "providers/test.yaml": b"connection:\n  token: 'leaked-secret'\n",
            }
        )


# ---------------------------------------------------------------------------
# Compatibility matrix loader
# ---------------------------------------------------------------------------


def test_load_compat_matrix_returns_data_from_explicit_path(tmp_path: pathlib.Path) -> None:
    matrix_file = tmp_path / "compat.yaml"
    matrix_file.write_text(
        yaml.dump({
            "workbench_version": "0.3.1",
            "runtime": {"repo": "anolishq/anolis", "version": "0.1.7"},
            "providers": {
                "anolis-provider-sim": {"repo": "anolishq/anolis-provider-sim", "version": "0.2.1"},
            },
        }),
        encoding="utf-8",
    )
    result = exporter._load_compat_matrix(matrix_path=matrix_file)
    assert result["workbench_version"] == "0.3.1"
    assert result["providers"]["anolis-provider-sim"]["version"] == "0.2.1"


def test_load_compat_matrix_fallback_on_empty_file(tmp_path: pathlib.Path) -> None:
    matrix_file = tmp_path / "compat.yaml"
    matrix_file.write_text("{}", encoding="utf-8")
    result = exporter._load_compat_matrix(matrix_path=matrix_file)
    assert result.get("providers", {}) == {}


def test_load_compat_matrix_explicit_path_bypasses_cache(tmp_path: pathlib.Path) -> None:
    a = tmp_path / "a.yaml"
    b = tmp_path / "b.yaml"
    a.write_text(yaml.dump({"providers": {"p1": {"version": "1.0.0"}}}), encoding="utf-8")
    b.write_text(yaml.dump({"providers": {"p1": {"version": "2.0.0"}}}), encoding="utf-8")
    assert exporter._load_compat_matrix(matrix_path=a)["providers"]["p1"]["version"] == "1.0.0"
    assert exporter._load_compat_matrix(matrix_path=b)["providers"]["p1"]["version"] == "2.0.0"


# ---------------------------------------------------------------------------
# _build_machine_profile — matrix integration
# ---------------------------------------------------------------------------


def test_build_machine_profile_uses_pinned_ref_when_provider_in_matrix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        exporter,
        "_load_compat_matrix",
        lambda matrix_path=None: {
            "providers": {
                "sim0": {"repo": "anolishq/anolis-provider-sim", "version": "0.2.1"},
            }
        },
    )
    profile = exporter._build_machine_profile(
        system={"meta": {"name": "Test Machine"}},
        project_name="test-machine",
        provider_ids=["sim0"],
        behavior_rel_paths={},
    )
    compat = profile["compatibility"]["providers"]["sim0"]
    assert compat["strategy"] == "pinned-ref"
    assert compat["version"] == "0.2.1"


def test_build_machine_profile_falls_back_for_unknown_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        exporter,
        "_load_compat_matrix",
        lambda matrix_path=None: {"providers": {}},
    )
    profile = exporter._build_machine_profile(
        system={},
        project_name="test-machine",
        provider_ids=["custom-provider"],
        behavior_rel_paths={},
    )
    compat = profile["compatibility"]["providers"]["custom-provider"]
    assert compat["strategy"] == "local-build"
    assert compat["version"] == "unspecified"


def test_build_machine_profile_mixes_known_and_unknown_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        exporter,
        "_load_compat_matrix",
        lambda matrix_path=None: {
            "providers": {
                "sim0": {"repo": "anolishq/anolis-provider-sim", "version": "0.2.1"},
            }
        },
    )
    profile = exporter._build_machine_profile(
        system={},
        project_name="test-machine",
        provider_ids=["sim0", "custom-provider"],
        behavior_rel_paths={},
    )
    assert profile["compatibility"]["providers"]["sim0"]["strategy"] == "pinned-ref"
    assert profile["compatibility"]["providers"]["custom-provider"]["strategy"] == "local-build"


# ---------------------------------------------------------------------------
# Bundled matrix integrity
# ---------------------------------------------------------------------------


def test_bundled_compat_matrix_workbench_version_matches_pyproject() -> None:
    import tomllib

    repo_root = pathlib.Path(__file__).parent.parent.parent
    matrix_path = repo_root / "anolis_workbench" / "schemas" / "compatibility-matrix.yaml"
    pyproject_path = repo_root / "pyproject.toml"

    matrix = yaml.safe_load(matrix_path.read_text(encoding="utf-8"))
    pyproject = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))

    assert matrix["workbench_version"] == pyproject["project"]["version"], (
        f"compatibility-matrix.yaml workbench_version ({matrix['workbench_version']!r}) "
        f"does not match pyproject.toml version ({pyproject['project']['version']!r})"
    )


def test_bundled_compat_matrix_is_structurally_valid() -> None:
    repo_root = pathlib.Path(__file__).parent.parent.parent
    matrix_path = repo_root / "anolis_workbench" / "schemas" / "compatibility-matrix.yaml"
    matrix = yaml.safe_load(matrix_path.read_text(encoding="utf-8"))

    assert isinstance(matrix, dict), "matrix root must be a mapping"
    assert "workbench_version" in matrix, "matrix must have workbench_version"
    assert "runtime" in matrix, "matrix must have runtime section"
    assert "version" in matrix["runtime"], "runtime must have version"
    assert "repo" in matrix["runtime"], "runtime must have repo"
    assert "providers" in matrix, "matrix must have providers section"
    for provider_id, entry in matrix["providers"].items():
        assert "version" in entry, f"provider {provider_id!r} must have version"
        assert "repo" in entry, f"provider {provider_id!r} must have repo"

