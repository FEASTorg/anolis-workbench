# Workbench Quality — Execution Plan

> Temporary working document — delete once items are closed.
> References: TMP-quality-audit.md

Guiding principle: stabilise CI and developer experience first, then improve the code, then fill in testing. Each phase should be a PR that CI can fully verify before merging.

---

## Phase 1 — CI & tooling baseline (Day 1, ~3-4 hrs)

These are all independent, low-risk, high-leverage. Do them in one PR.

| #   | Item                                                                                | Audit ref |
| --- | ----------------------------------------------------------------------------------- | --------- |
| 1.1 | Add `.github/dependabot.yml` for `npm` + `github-actions`, weekly schedule          | §4.1      |
| 1.2 | Add `"engines": { "node": ">=20" }` to `frontend/package.json`                      | §8.4      |
| 1.3 | Add `npm audit --audit-level=high` to `frontend` CI job after `npm ci`              | §4.2      |
| 1.4 | Replace `uv pip install -e .[dev]` → `uv sync --locked` in all three Python CI jobs | §5.2      |
| 1.5 | Pin release workflow to `ubuntu-24.04` (currently `ubuntu-latest`)                  | §5.3      |
| 1.6 | Remove frontend build step from the `test` CI job                                   | §5.1      |
| 1.7 | Set `retries: process.env.CI ? 1 : 0` in `playwright.config.ts`                     | §5.5      |

**Definition of done:** CI green, Dependabot config file present and readable by GitHub.

---

## Phase 2 — Prettier + `.editorconfig` (Day 1, ~2 hrs)

One PR, closely related. Do this before any larger code changes so all subsequent diffs are already formatted.

| #   | Item                                                                                                                                                    | Audit ref |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Add `.editorconfig` to repo root                                                                                                                        | §1.2      |
| 2.2 | Add `prettier` + `prettier-plugin-svelte` to `frontend` devDependencies                                                                                 | §1.1      |
| 2.3 | Add `.prettierrc` (configure `pluginSearchDirs`, `plugins: ["prettier-plugin-svelte"]`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`) | §1.1      |
| 2.4 | Run `npx prettier --write "src/**"` and commit the formatted output                                                                                     | §1.1      |
| 2.5 | Add `"format": "prettier --write \"src/**\""` and `"format:check": "prettier --check \"src/**\""` scripts to `package.json`                             | §1.1      |
| 2.6 | Add `format:check` step to the `frontend` CI job                                                                                                        | §1.1      |

**Definition of done:** CI enforces Prettier; running `npm run format:check` locally passes clean; the diff shows only whitespace/quote normalisation.

---

## Phase 3 — Linting: `svelte-check` + ESLint in CI (Day 2, ~3 hrs)

| #   | Item                                                                                                                     | Audit ref |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.1 | Add `svelte-check` step to CI `frontend` job: `npm run check`                                                            | §2.1      |
| 3.2 | Add `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-svelte` to devDependencies | §2.2      |
| 3.3 | Add `eslint.config.js` (flat config) with TypeScript + Svelte rules                                                      | §2.2      |
| 3.4 | Add `"lint": "eslint src"` script; wire into CI `frontend` job                                                           | §2.2      |
| 3.5 | Fix any lint errors surfaced by step 3.4 (expect unused-var, no-explicit-any, svelte-specific warnings)                  | §2.2      |

**Note:** do not enable `@typescript-eslint/no-explicit-any` as an error yet — wait for Phase 4. Start with `warn` so CI doesn't immediately red on the existing `any` usage.

**Definition of done:** CI runs `svelte-check` and `eslint`; no new errors; existing `any` usage shows as warnings, not errors.

---

## Phase 4 — TypeScript hardening (Day 2–3, ~4 hrs)

Depends on Phase 3 (ESLint baseline must be in place first).

| #   | Item                                                                                                                                                   | Audit ref |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1 | Remove `"noImplicitAny": false` from `tsconfig.json`                                                                                                   | §3.1      |
| 4.2 | Fix DOM event handler types: `(e: any)` → proper `Event` casts                                                                                         | §7.4      |
| 4.3 | Add `Window.__ANOLIS_COMPOSER__` declaration to `svelte-shim.d.ts`                                                                                     | §3.3      |
| 4.4 | Define core TypeScript interfaces: `RuntimeStatus`, `SystemConfig`, `Device`, `ProviderHealth`, `PreflightResult` — sourced from the OpenAPI contracts | §3.2      |
| 4.5 | Replace `Record<string, any>` prop types in `Compose`, `Commission`, `Operate`, `Home`, `RuntimeForm`, `ProviderList` with the new interfaces          | §3.2      |
| 4.6 | Escalate ESLint `@typescript-eslint/no-explicit-any` from `warn` to `error` once the above is clean                                                    | §2.2      |

**Definition of done:** `npm run check` and `npm run lint` both pass with zero errors; no remaining `Record<string, any>` at component prop boundaries.

---

## Phase 5 — Code quality fixes (Day 3, ~2 hrs)

Small targeted fixes, each a self-contained commit or small PR.

| #   | Item                                                                                                                    | Audit ref |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Replace raw `fetch()` in `Compose.svelte handleSave()` with `fetchJson`                                                 | §7.1      |
| 5.2 | Move `TELEMETRY_URL` and operator UI default out of `Operate.svelte` — read from `/api/config` or `__ANOLIS_COMPOSER__` | §7.3      |
| 5.3 | Implement `<ConfirmModal>` component and convert `window.confirm()` guard calls to it                                   | §7.2      |

**Note:** 5.3 is the largest item here — a small modal component + async `confirmNavigation`. Can be deferred to its own PR.

**Definition of done:** no `window.confirm()` calls; no raw `fetch()` outside `api.ts`; no hardcoded localhost URLs in component source.

---

## Phase 6 — Component testing (Day 3–4, ~5 hrs)

Depends on Phase 4 (types must be stable before component tests are worth writing).

| #   | Item                                                                                                    | Audit ref |
| --- | ------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Add `@testing-library/svelte`, `@testing-library/jest-dom`, `happy-dom` to devDependencies              | §6.1      |
| 6.2 | Add `vitest.components.config.ts` with `environment: "happy-dom"` and include `src/**/*.svelte`         | §6.1      |
| 6.3 | Write component tests for `Home.svelte`: render, create project form validation, template pre-selection | §6.1      |
| 6.4 | Write component tests for `Compose.svelte`: save button state, save error display, advisory banner      | §6.1      |
| 6.5 | Write component tests for `Commission.svelte`: launch/stop button state, preflight display              | §6.1      |
| 6.6 | Wire component test run into CI (`test` job); extend coverage include to `src/**/*.svelte`              | §6.3      |
| 6.7 | Add Firefox to `playwright.config.ts` projects                                                          | §6.2      |

**Definition of done:** component test suite exists and runs in CI; coverage report includes `.svelte` files; Firefox smoke test runs.

---

## Phase 7 — Repo hygiene (Day 4, ~2 hrs)

Lowest urgency; purely organisational.

| #   | Item                                                                                                              | Audit ref |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Add `CONTRIBUTING.md`: dev setup (uv, Node 20, npm), backend + frontend dev server, test commands, PR conventions | §8.1      |
| 7.2 | Add `CHANGELOG.md` in Keep-a-Changelog format; backfill 0.1.x entries                                             | §8.2      |
| 7.3 | Delete `requirements.txt` and `requirements-lock.txt`; update README to reference only `uv sync`                  | §8.3      |
| 7.4 | Add `contract drift check` failure mode note to CONTRIBUTING (so contributors know to update bundled schemas)     | §5.4      |

---

## Phase 8 — Contract drift fix (Day 4–5, coordinate with anolis repo)

This requires a cross-repo decision.

| #   | Item                                                                                                                                     | Audit ref |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Decide ownership: should anolis own the drift check, or should workbench pin an anolis release tag?                                      | §5.4      |
| 8.2 | Implement chosen solution — either pin `ref:` in the sparse-checkout or move the check to an anolis workflow that runs on schema changes | §5.4      |

---

## Phase 9 — Desktop release audit (Day 5, as time allows)

| #   | Item                                                             | Audit ref |
| --- | ---------------------------------------------------------------- | --------- |
| 9.1 | Review `desktop-release.yml` against the same checklist as CI    | §9        |
| 9.2 | Apply any matching fixes (ubuntu-latest → pinned, uv sync, etc.) | §9        |

---

## Summary timeline

| Day   | Phases                                                              | Rough effort |
| ----- | ------------------------------------------------------------------- | ------------ |
| Day 1 | Phase 1 (CI baseline) + Phase 2 (Prettier)                          | ~5–6 hrs     |
| Day 2 | Phase 3 (ESLint/svelte-check in CI) + Phase 4 start (TypeScript)    | ~5–6 hrs     |
| Day 3 | Phase 4 finish + Phase 5 (code quality)                             | ~4–5 hrs     |
| Day 4 | Phase 6 (component tests) + Phase 7 (hygiene)                       | ~6 hrs       |
| Day 5 | Phase 6 finish + Phase 8 (contract drift) + Phase 9 (desktop audit) | ~4 hrs       |

---

## What to skip for now

- Full `strict` TypeScript on Python side (already strict enough with mypy config).
- `eslint-plugin-a11y` — defer until component tests and structure are stable.
- WebKit Playwright browser — Firefox first, WebKit later.
- Re-architecting `window.confirm` (Phase 5.3) — can be a standalone issue if bandwidth is short.
