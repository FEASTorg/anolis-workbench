# Anolis Workbench API Contract — v1 Draft

Status: Phase 12 working document. Transient — used to produce
`contracts/workbench-api.openapi.v1.yaml`. Delete after YAML is generated and
validated.

Date: 2026-04-17

---

## Purpose

This document is the audit-first design pass for the unified Workbench API
contract. It:

1. Records every route currently implemented in both servers with exact
   request/response shapes derived from reading the live code.
2. Makes explicit design decisions about the target unified surface.
3. Identifies routes retired or consolidated.
4. Provides precise schema definitions ready for YAML transcription.

The target contract covers the Compose and Commission tracks. The Operate track
(`/v0/*`) is a proxy pass-through declared but not described by this contract
— it is already covered by `contracts/runtime-http.openapi.v0.yaml`.

---

## Part 1 — Route Audit

### 1a. System Composer server (port 3002)

All routes verified from `system-composer/backend/server.py`.

| Method | Path | Handler | Status codes |
|--------|------|---------|-------------|
| GET | `/api/projects` | `_list_projects` | 200 |
| GET | `/api/projects/{name}` | `_get_project` | 200, 400, 404 |
| GET | `/api/projects/{name}/logs` | `_log_stream` | SSE stream, 400, 404 |
| GET | `/api/status` | `_status` | 200 |
| GET | `/api/catalog` | `_serve_catalog` | 200, 404 |
| GET | `/api/templates` | `_serve_templates` | 200 |
| POST | `/api/projects` | `_create_project` | 201, 400, 404, 409, 500 |
| POST | `/api/projects/{name}/rename` | `_rename_project` | 200, 400, 404, 409 |
| POST | `/api/projects/{name}/duplicate` | `_duplicate_project` | 201, 400, 404, 409, 500 |
| POST | `/api/projects/{name}/preflight` | `_preflight` | 200, 400, 404 |
| POST | `/api/projects/{name}/launch` | `_launch_project` | 200, 400, 404, 409, 500 |
| POST | `/api/projects/{name}/stop` | `_stop_project` | 200, 400, 404 |
| POST | `/api/projects/{name}/restart` | `_restart_project` | 200, 400, 404, 409, 500 |
| PUT | `/api/projects/{name}` | `_save_project` | 200, 400, 500 |
| DELETE | `/api/projects/{name}` | `_delete_project` | 200, 400, 404, 409 |

Static file fallback: all unmatched GET paths → serve from `FRONTEND_DIR`.

### 1b. Workbench server (port 3010)

All routes verified from `workbench/backend/server.py`.

The workbench server is a **strict superset** of the composer server.
Identical handlers are copy-paste duplicates with one exception: `_status()`
adds a `workbench` sub-object to the response.

Routes present in workbench that are **not** in composer:

| Method | Path | Handler | Status codes |
|--------|------|---------|-------------|
| POST | `/api/projects/{name}/export` | `_export_project` | 200 (binary), 400, 404, 500 |
| GET | `/v0/*` | `_proxy_runtime` | proxy, 503, 502, 500 |
| POST | `/v0/*` | `_proxy_runtime` | proxy, 503, 502, 500 |
| PUT | `/v0/*` | `_proxy_runtime` | proxy, 503, 502, 500 |
| DELETE | `/v0/*` | `_proxy_runtime` | proxy, 503, 502, 500 |

Static file fallback: unmatched paths → SPA index.html for workspace routes
(`/projects/{name}[/compose|commission|operate]`), static files otherwise.

### 1c. Status response difference

Composer `_status()`:
```json
{
  "version": 1,
  "active_project": "my-project",
  "running": true,
  "pid": 12345,
  "composer": {
    "host": "127.0.0.1",
    "port": 3002,
    "operator_ui_base": "http://localhost:3000"
  }
}
```

Workbench `_status()` — identical plus:
```json
{
  "workbench": {
    "version": 1
  }
}
```

### 1d. Implementation quirks to preserve

1. **`stop` ignores project name in the launcher call.** `POST
   /api/projects/{name}/stop` verifies the project exists and is not 404, but
   calls `launcher_module.stop()` with no arguments. There is only one active
   runtime process at a time. The project name is a guard, not a selector.

2. **`preflight` re-renders YAML to disk** before running any binary checks.
   This is intentional — the UI can call preflight before launch and rely on
   YAML being fresh.

3. **Export is synchronous + in-memory.** The entire `.anpkg` binary is held
   in memory before being sent. Suitable for project-sized packages; not
   designed for large streaming payloads.

4. **`create_project` returns full `system.json` (201).** `duplicate` also
   returns full `system.json` (201). Other mutation operations return
   `{"ok": true}` (200).

5. **`list_projects` returns summaries only** — `{name, meta}` per project.
   The full system document requires a separate `GET /api/projects/{name}`.

6. **Project name validation:** `^[a-zA-Z0-9_-]{1,64}$` — validated on every
   operation. Returns 400 with `{"error": "<message>"}` if invalid.

---

## Part 2 — Design Decisions for the Unified API

### Decision 1 — `/api/status` response compatibility

**Current:** The workbench response includes launcher status plus metadata keys:
`version`, `active_project`, `running`, `pid`, `composer`, and `workbench`.

**Target for Phase 12:** Preserve current response shape in the v1 contract to
avoid breaking existing frontend and test clients during the contract-lock
phase. Field renames/removals are deferred to a later compatibility-migration
phase.

**Decision:** Keep `composer.operator_ui_base` and `workbench.version` in the
v1 schema. Additive fields can be introduced later, but no key removals/renames
are part of Phase 12.

**Unified status shape (v1):**
```json
{
  "version": 1,
  "active_project": "my-project",
  "running": true,
  "pid": 12345,
  "composer": {
    "host": "127.0.0.1",
    "port": 3010,
    "operator_ui_base": "http://localhost:3000"
  },
  "workbench": {
    "version": 1
  }
}
```

### Decision 2 — `rename` and `duplicate` sub-resource verbs

**Current:** `POST /api/projects/{name}/rename` and `POST /api/projects/{name}/duplicate`.

**REST note:** `rename` is arguably better expressed as `PATCH /api/projects/{name}`
with a `name` field, and `duplicate` as `POST /api/projects` with a `source` field.
However, changing these would require frontend changes and test changes across
both servers. The existing shape is unambiguous and tested.

**Decision:** Keep current sub-resource pattern. Carry both operations into the
unified contract as-is. Revisit in a future cleanup phase if the SPA frontend
wants a more standard REST model.

### Decision 3 — Proxy declaration in the contract

The `/v0/*` proxy is not described operation-by-operation in this contract —
that is the responsibility of `contracts/runtime-http.openapi.v0.yaml`.

This contract declares the proxy as a single path entry with a description
explaining the pass-through semantics, the runtime availability precondition,
and the 503/502/500 error codes.

### Decision 4 — 409 on `stop`

Currently `stop` cannot return 409 (no conflict check in the handler).
The target contract does not include 409 for stop. It returns 200 even if
nothing was running — `launcher_module.stop()` is idempotent.

### Decision 5 — Validation error shape

`ProjectValidationError` produces a structured `errors` array. This shape is
used consistently in `create`, `save`, and `duplicate` operations. It is
included in the schema as a reusable `ValidationErrorResponse` component.

---

## Part 3 — Target Unified API Surface

### 3a. Compose track

```
GET     /api/projects              List projects (summaries)
POST    /api/projects              Create project from template
GET     /api/projects/{name}       Get full project document
PUT     /api/projects/{name}       Save (replace) project document
DELETE  /api/projects/{name}       Delete project
POST    /api/projects/{name}/rename      Rename project
POST    /api/projects/{name}/duplicate   Duplicate project
GET     /api/templates             List available templates
GET     /api/catalog               Get provider catalog
```

### 3b. Commission track

```
GET     /api/status                        Global launcher status
POST    /api/projects/{name}/preflight     Run preflight checks
POST    /api/projects/{name}/launch        Launch runtime
POST    /api/projects/{name}/stop          Stop runtime (global, name is guard)
POST    /api/projects/{name}/restart       Restart runtime
POST    /api/projects/{name}/export        Export .anpkg (returns binary)
GET     /api/projects/{name}/logs          SSE log stream
```

### 3c. Operate track (proxy declaration only)

```
GET|POST|PUT|DELETE  /v0/*    Pass-through to anolis-runtime HTTP API
```

---

## Part 4 — Per-Route Request/Response Schemas

### Shared components

#### ProjectName path parameter

```
name: string
pattern: ^[a-zA-Z0-9_-]{1,64}$
in: path
required: true
```

#### OkResponse (200 mutation success)

```json
{ "ok": true }
```

#### ErrorResponse (4xx/5xx)

```json
{ "error": "Human-readable message" }
```

Optional additional fields:
```json
{
  "error": "Project validation failed",
  "code": "validation_failed",
  "errors": [
    {
      "source": "schema",
      "code": "schema.validation",
      "path": "$.topology.runtime",
      "message": "Additional properties are not allowed"
    }
  ]
}
```

`source` values: `"schema"` | `"semantic"`
`code` values: `"schema.type"` | `"schema.validation"` | `"semantic.validation"` |
`"validation_failed"` | `"template_validation_failed"` | `"duplicate_validation_failed"`

#### PreflightCheckItem

```json
{
  "name": "Runtime binary exists",
  "ok": true,
  "error": null,
  "hint": null
}
```

- `ok: true` — check passed
- `ok: false` — check failed; `error` is a non-null string; `hint` may be non-null
- `ok: null` — check skipped (binary missing or feature not available); `note` is a non-null string

When `ok` is `null`, the check item shape is:
```json
{
  "name": "Runtime --check-config",
  "ok": null,
  "note": "Binary missing — skipped"
}
```

#### SystemDocument

The full `system.json` document. Top-level structure (from schema):
```json
{
  "meta": {
    "name": "my-project",
    "created": "2026-01-01T00:00:00+00:00",
    "template": "bioreactor-manual"
  },
  "topology": {
    "runtime": {
      "http_bind": "127.0.0.1",
      "http_port": 8080,
      "behavior_tree_path": "behaviors/main.xml"
    },
    "providers": {
      "sim0": { "kind": "sim" }
    }
  },
  "paths": {
    "runtime_executable": "/path/to/anolis-runtime",
    "providers": {
      "sim0": { "executable": "/path/to/anolis-provider-sim" }
    }
  }
}
```

Schema is validated server-side against `system-composer/schema/system.schema.json`
(moves to `anolis_workbench/` in Phase 13).

#### ProjectSummary

```json
{ "name": "my-project", "meta": { "name": "my-project", "created": "...", "template": "..." } }
```

#### TemplateSummary

```json
{ "id": "bioreactor-manual", "meta": { "name": "Bioreactor Manual", ... } }
```

#### StatusResponse (v1-compatible — see Decision 1)

```json
{
  "version": 1,
  "active_project": "my-project",
  "running": true,
  "pid": 12345,
  "composer": {
    "host": "127.0.0.1",
    "port": 3010,
    "operator_ui_base": "http://localhost:3000"
  },
  "workbench": {
    "version": 1
  }
}
```

`active_project` is `null` when nothing is running.
`pid` is `null` when nothing is running.

---

### Route schemas

---

#### GET /api/projects

List all projects (summaries only, sorted by name).

Request: no body, no query params.

Response 200:
```json
[
  { "name": "my-project", "meta": { ... } },
  { "name": "other-project", "meta": { ... } }
]
```

Empty array when no projects exist.

---

#### POST /api/projects

Create a new project from a template.

Request body (required):
```json
{ "name": "my-project", "template": "bioreactor-manual" }
```

- `name`: required, must match `^[a-zA-Z0-9_-]{1,64}$`
- `template`: required, must be an existing template ID

Response 201: full `SystemDocument` (created system with `meta.name`,
`meta.created`, `meta.template` populated).

Response 400: `ErrorResponse` — name invalid or template missing.
Response 404: `ErrorResponse` — template not found.
Response 409: `ErrorResponse` — project name already exists.
Response 500: `ErrorResponse` with `errors[]` — template produced invalid system.

---

#### GET /api/projects/{name}

Get full project document.

Request: no body.

Response 200: full `SystemDocument`.
Response 400: name invalid.
Response 404: project not found.

---

#### PUT /api/projects/{name}

Save (replace) project document. Validates schema + semantics. Re-renders
derived YAML files to disk on success.

Request body: full `SystemDocument` (required).

Response 200: `OkResponse`.
Response 400: `ErrorResponse` with optional `code` + `errors[]` — validation
failed.
Response 500: `ErrorResponse` — unexpected server error.

---

#### DELETE /api/projects/{name}

Delete project and all its files.

Request: no body.

Response 200: `OkResponse`.
Response 400: name invalid.
Response 404: project not found.
Response 409: `ErrorResponse` — project is currently running; stop first.

---

#### POST /api/projects/{name}/rename

Rename project directory. Blocked if project is running.

Request body (required):
```json
{ "new_name": "my-new-name" }
```

- `new_name`: required, must match name pattern

Response 200: `OkResponse`.
Response 400: old name or new_name invalid.
Response 404: project not found.
Response 409: project is running, or new name already exists.

---

#### POST /api/projects/{name}/duplicate

Duplicate project to a new name. Does not copy `running.json` or `logs/`.
Re-renders derived YAML. Updates `meta.name` and `meta.created` in the copy.

Request body (required):
```json
{ "new_name": "my-copy" }
```

Response 201: full `SystemDocument` of the new (duplicate) project.
Response 400: either name invalid.
Response 404: source project not found.
Response 409: new name already exists.
Response 500: `ErrorResponse` with `errors[]` — duplicated project failed
validation (should not happen with valid source, but guarded).

---

#### GET /api/templates

List available templates.

Request: no body, no query params.

Response 200:
```json
[
  { "id": "bioreactor-manual", "meta": { ... } },
  { "id": "sim-quickstart", "meta": { ... } }
]
```

Empty array if no templates directory exists.

---

#### GET /api/catalog

Get the provider catalog (static JSON).

Request: no body.

Response 200: catalog document (structure defined in
`system-composer/catalog/providers.json`). Passes through verbatim.
Response 404: catalog file not found on server.

---

#### GET /api/status

Global launcher status.

Request: no body.

Response 200: `StatusResponse` (see shared component above).

Note: always 200 — "not running" is a valid state, not an error.

---

#### POST /api/projects/{name}/preflight

Run preflight checks for a project. Re-renders YAML to disk before running
binary checks. Returns results for all checks including skipped ones.

Request body: required JSON object; send `{}` when no request options are needed.

Response 200:
```json
{
  "ok": true,
  "checks": [
    { "name": "Render YAML to disk", "ok": true, "error": null, "hint": null },
    { "name": "Runtime binary exists", "ok": true, "error": null, "hint": null },
    { "name": "Provider sim0 binary exists", "ok": false, "error": "File not found: /path/to/binary", "hint": "Clone 'anolis-provider-sim' as a sibling..." },
    { "name": "Output paths writable", "ok": true, "error": null, "hint": null },
    { "name": "Runtime port 8080 available", "ok": true, "error": null, "hint": null },
    { "name": "System-level validation", "ok": true, "error": null, "hint": null },
    { "name": "Runtime --check-config", "ok": null, "note": "Binary missing — skipped" }
  ]
}
```

`ok` at top level is `true` only when all checks have `ok != false`.
A check with `ok: null` (skipped) does **not** make the top-level `ok` false.

Response 400: name invalid.
Response 404: project not found.

---

#### POST /api/projects/{name}/launch

Launch the anolis-runtime subprocess for a project.

Request body: required JSON object; send `{}` when no request options are needed.

Response 200: `OkResponse` — launch command accepted (process started).
Response 400: name invalid.
Response 404: project not found.
Response 409: `ErrorResponse` — runtime is already running.
Response 500: `ErrorResponse` — unexpected launch failure.

---

#### POST /api/projects/{name}/stop

Stop the running runtime. The project name is a guard (must exist), not a
selector — there is only one active runtime process at a time. Idempotent:
returns 200 even if nothing was running.

Request body: required JSON object; send `{}` when no request options are needed.

Response 200: `OkResponse`.
Response 400: name invalid.
Response 404: project not found (guard check fails).

---

#### POST /api/projects/{name}/restart

Stop then relaunch the runtime for the project. Fails if the project is not
currently running.

Request body: required JSON object; send `{}` when no request options are needed.

Response 200: `OkResponse`.
Response 400: name invalid.
Response 404: project not found.
Response 409: `ErrorResponse` — runtime is not running (nothing to restart).
Response 500: `ErrorResponse` — unexpected restart failure.

---

#### POST /api/projects/{name}/export

Build and download a commissioning handoff package (`.anpkg`) for the project.
Synchronous — package is built in a temporary directory and returned as a binary
stream.

Request body: required JSON object; send `{}` when no request options are needed.

Response 200:
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="{name}.anpkg"`
- Body: raw `.anpkg` bytes

Response 400: `ErrorResponse` — name invalid or export validation error
(e.g. behavior tree path not found, path escape, secret leakage).
Response 404: project not found.
Response 500: `ErrorResponse` — unexpected export failure.

---

#### GET /api/projects/{name}/logs

Stream project log output via SSE. Connection stays open until the runtime
process exits or the client disconnects. Includes keepalive comment frames.

Request: no body. The stream replays buffered lines on connect; no explicit
resume token contract is defined in v1.

Response 200:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- Body: SSE frames — `data: <log line>\n\n` and keepalive `: keepalive\n\n`

Response 400: name invalid.
Response 404: project not found.

---

#### GET|POST|PUT|DELETE /v0/*

Pass-through proxy to the anolis-runtime HTTP API.

This route is declared in the contract but not described operation-by-operation
here — the authoritative description is `contracts/runtime-http.openapi.v0.yaml`.

Precondition: a runtime process must be running and registered for an active
project. The active project's `topology.runtime.http_bind` and
`topology.runtime.http_port` determine the proxy target.

Response: proxied response from runtime (any status code).

Response 503: `ErrorResponse` — runtime is not running or no active project.
Response 502: `ErrorResponse` — proxy connection to runtime failed.
Response 500: `ErrorResponse` — running project metadata is invalid (for example missing/invalid runtime port).

---

## Part 5 — Routes Retired in Target API

None of the above routes are retired going into Phase 13. All carry forward.

The following items are **not** routes but are existing implementation details
that do not appear in the target contract:

| Item | Status | Reason |
|------|--------|--------|
| `ANOLIS_COMPOSER_*` env vars | Deferred to Phase 13 | Unified server migration work, not Phase 12 contract-lock scope |
| `/api/status` key reshaping (`composer`/`workbench`) | Deferred post-v1 | Preserve compatibility during contract lock |

---

## Part 6 — Open Questions

1. **Status-shape migration timing**: if we later introduce a cleaner
   `api_version/server` shape, do we keep dual fields for one full release cycle
   or gate behind a frontend migration flag?

2. **Body requirement relaxation**: current handlers require JSON bodies for all
   POST routes. Should Phase 13 relax this for bodyless control verbs, or keep
   strict JSON-object semantics for consistency?

3. **Catalog schema**: `GET /api/catalog` returns raw `providers.json` content.
   OpenAPI can keep `type: object` with `additionalProperties: true` for Phase 12;
   a strict catalog schema is out of scope.

---

## Part 7 — YAML Generation Checklist

When transcribing this document to `contracts/workbench-api.openapi.v1.yaml`:

- [ ] `openapi: 3.0.3`
- [ ] `info.title`, `info.version: "1.0.0"`, `info.description`
- [ ] All `components/schemas`: `OkResponse`, `ErrorResponse`,
  `ValidationErrorResponse`, `ProjectSummary`, `SystemDocument`,
  `TemplateSummary`, `StatusResponse`, `PreflightCheckItem`,
  `PreflightCheckSkipped`, `PreflightResponse`
- [ ] All `components/parameters`: `ProjectName`
- [ ] All `components/responses`: `Ok200`, `Error400`, `Error404`, `Error409`,
  `Error500`
- [ ] 14 `paths` entries (13 API + 1 proxy declaration; `/api/status` included in the 13)
- [ ] SSE response for `/api/projects/{name}/logs` — `text/event-stream`
- [ ] Binary response for `/api/projects/{name}/export` — `application/zip`
- [ ] `/v0/*` proxy declaration — single path, all verbs, description only
- [ ] Validator: `contracts/validate-workbench-api-openapi.py` — same pattern
  as `validate-composer-control-openapi.py`, verify required operations coverage
