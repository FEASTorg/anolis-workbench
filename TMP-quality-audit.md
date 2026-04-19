# Workbench Quality Audit

> Temporary working document — delete once items are tracked in issues/PRs.
> Audit date: 2026-04-19

---

## 1. Formatting & style enforcement

### 1.1 No Prettier

- No `.prettierrc`, no `prettier` or `prettier-plugin-svelte` in devDependencies.
- The codebase already has inconsistent style: single quotes in some `.svelte` files, double in others; inconsistent trailing commas; mixed blank-line habits.
- `prettier-plugin-svelte` is the de-facto standard for Svelte 5 projects and handles template formatting that TypeScript-only tools cannot.
- **Fix:** add `prettier` + `prettier-plugin-svelte` as devDeps; add `.prettierrc`; add a `format:check` script; enforce it in CI.

### 1.2 No `.editorconfig`

- `.gitattributes` handles LF line endings at the git layer, but indent size, charset, and trailing-whitespace trimming are not enforced across editors.
- Without `.editorconfig`, VS Code, Neovim, and JetBrains users will silently produce different whitespace.
- **Fix:** add a root-level `.editorconfig` with `indent_size = 2`, `charset = utf-8`, `trim_trailing_whitespace = true`.

---

## 2. Linting

### 2.1 `svelte-check` not in CI

- `npm run check` (which invokes `svelte-check`) is not called anywhere in `ci.yml`.
- TypeScript errors inside `<script lang="ts">` blocks of `.svelte` files are completely invisible to CI — a broken prop type, wrong import, or missing return would sail through.
- **Fix:** add a `svelte-check` step to the `frontend` CI job (or a dedicated `typecheck` job).

### 2.2 No ESLint

- No `eslint.config.js`, `eslint-plugin-svelte`, or `@typescript-eslint`.
- Ruff covers Python thoroughly, but JS/TS has no linter beyond the tsc compiler.
- ESLint catches unused variables, unreachable code, no-floating-promises, accessibility issues (`eslint-plugin-a11y`), and Svelte-specific antipatterns.
- **Fix:** add `eslint`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-svelte`, and optionally `eslint-plugin-jsx-a11y`; wire a `lint` npm script; add to CI.

---

## 3. Type safety

### 3.1 `noImplicitAny: false` in `tsconfig.json`

- `strict: true` enables `noImplicitAny`, but the tsconfig immediately overrides it back to `false`.
- This is the single most important type-safety setting. Its absence lets implicit `any` silently propagate through the entire codebase.
- **Fix:** remove the `"noImplicitAny": false` override; fix the resulting type errors (mostly in Svelte component scripts where event types are currently `(e: any) =>`).

### 3.2 Pervasive `Record<string, any>` for API payloads

- `system`, `catalog`, `runtimeStatus`, `preflightResults`, `commissionRuntimeStatus`, `devices`, `parameters`, `capabilities` — all typed as `Record<string, any>` or `any[]`.
- The API contracts already exist in `contracts/` (OpenAPI YAML). TypeScript interfaces could be generated from them or written manually once.
- **Fix:** define TypeScript interfaces for the core data shapes (RuntimeStatus, SystemConfig, Device, ProviderHealth, etc.) and replace `Record<string, any>` at component boundaries.

### 3.3 `(window as any).__ANOLIS_COMPOSER__` in Commission.svelte

- Global config injection uses an untyped `any` cast.
- **Fix:** declare the global in `svelte-shim.d.ts` or a new `globals.d.ts`:
  ```ts
  interface Window {
    __ANOLIS_COMPOSER__?: { operatorUiBase?: string };
  }
  ```

---

## 4. Security & dependency hygiene

### 4.1 No Dependabot

- No `.github/dependabot.yml` for `npm` or GitHub Actions.
- Actions are pinned to major versions (`@v4`) not SHAs — a compromised action release could silently affect CI.
- npm transitive deps are not automatically bumped.
- **Fix:** add `.github/dependabot.yml` with schedules for both `npm` (weekly) and `github-actions` (weekly).

### 4.2 No `npm audit` in CI

- Known vulnerabilities in npm dependencies are not checked.
- **Fix:** add `npm audit --audit-level=high` after `npm ci` in the `frontend` CI job.

---

## 5. CI workflow issues

### 5.1 Frontend built twice per CI run

- The `frontend` job builds; the `test` job also rebuilds frontend before running Vitest.
- Vitest unit tests target `src/lib/**/*.ts` and run in `node` environment — they don't need the Vite build.
- The double build wastes ~2 minutes per run.
- **Fix:** remove the frontend build step from the `test` job; upload the built artifact from `frontend` and download it in `test`, or just skip it entirely since the unit tests don't require it.

### 5.2 `uv pip install` ignores the lockfile

- CI uses `uv pip install -e .[dev]` but a `uv.lock` is present.
- `uv pip install` does not consult `uv.lock`, so CI dep resolution can drift from the lockfile.
- **Fix:** replace with `uv sync --locked` in all three Python CI jobs.

### 5.3 Release workflow uses `ubuntu-latest`

- `ci.yml` correctly pins `ubuntu-24.04`; `release.yml` uses `ubuntu-latest` (non-deterministic).
- **Fix:** pin release workflow jobs to `ubuntu-24.04`.

### 5.4 Contract drift check uses unpinned upstream ref

- The drift check sparse-checks out `FEASTorg/anolis` at HEAD of `main` with no `ref:` pin.
- If anolis advances a schema before workbench is updated, every PR on workbench fails immediately.
- **Fix:** either pin to a tag/commit, or make the check informational (non-blocking) and open an issue instead, or invert the direction so anolis owns the check.

### 5.5 Playwright `retries: 0`

- Zero retries in CI means a single flaky browser render fails the build.
- **Fix:** `retries: process.env.CI ? 1 : 0`.

### 5.6 No `svelte-check` CI job (see §2.1)

---

## 6. Testing gaps

### 6.1 No Svelte component tests

- Vitest only covers `src/lib/*.ts` files (pure TypeScript).
- None of the four route components (`Home`, `Compose`, `Commission`, `Operate`) or the two lib components (`RuntimeForm`, `ProviderList`) have any tests.
- `@testing-library/svelte` with `jsdom` or `happy-dom` environment enables rendering, interaction, and assertion on Svelte 5 components.
- **Fix:** add `@testing-library/svelte` + `@testing-library/jest-dom`; configure a separate `vitest.components.config.ts` with `jsdom` env; write component smoke tests for the critical paths (create project, save compose, commission launch flow).

### 6.2 Single-browser Playwright coverage

- Only Chromium is configured in `playwright.config.ts`.
- **Fix:** add Firefox and WebKit projects, at minimum Firefox.

### 6.3 Coverage thresholds exclude `.svelte` files

- `vitest.config.ts` coverage `include` is `src/lib/**/*.{js,ts}` — `.svelte` files are excluded.
- Coverage percentages (85%/75%/85%/85%) are misleadingly high since the bulk of app logic lives in `.svelte` component scripts.
- **Fix:** once component tests exist, extend coverage include to `src/**/*.{js,ts,svelte}` and recalibrate thresholds.

---

## 7. Code quality

### 7.1 Raw `fetch()` in Compose.svelte `handleSave()`

- `handleSave` uses raw `fetch()` + manual `res.json().catch(() => ({}))` instead of the shared `fetchJson` helper.
- The error handling path differs slightly from the helper's logic.
- **Fix:** replace with `fetchJson` (requires minor refactor since the handler needs the error payload shape, which `fetchJson` could be extended to support or the handler can catch and inspect).

### 7.2 `window.confirm()` navigation guards

- `App.svelte` uses `window.confirm()` for unsaved-changes and cross-project navigation warnings.
- Synchronous native dialogs are deprecated in embedded contexts, blocked in iframes, and visually inconsistent.
- **Fix:** implement a small `<ConfirmModal>` Svelte component and convert `confirmNavigation()` to async.

### 7.3 Hardcoded `localhost` URLs in Operate.svelte

- `const TELEMETRY_URL = 'http://localhost:3001'` (Grafana) and the fallback `'http://localhost:3000'` (operator UI) are hardcoded.
- These should be configurable via the runtime config or served from the backend, not baked into the bundle.
- **Fix:** expose these from the backend via `/api/config` or inject them via the global `__ANOLIS_COMPOSER__` object at serve time.

### 7.4 `any` event types in DOM handlers

- Pattern across all `.svelte` files: `oninput={(e: any) => setRt('name', e.target.value)}`.
- With `noImplicitAny` fixed (§3.1), these need to be typed: `oninput={(e: Event) => setRt('name', (e.target as HTMLInputElement).value)}`.

---

## 8. Repo hygiene

### 8.1 No `CONTRIBUTING.md`

- All other FEAST repos have one. Workbench has none.
- Should document: dev setup (uv, Node 20, npm), how to run the backend + frontend dev server, running tests, PR conventions.

### 8.2 No `CHANGELOG.md`

- Already at v0.1.3 with a real release workflow and release notes presumably written ad-hoc.
- **Fix:** add `CHANGELOG.md` with Keep-a-Changelog format; retroactively document 0.1.x releases.

### 8.3 `requirements.txt` + `requirements-lock.txt` redundant with `uv.lock`

- Two parallel dep management systems. The pip-based files have a comment saying to regenerate with `python -m venv`, contradicting the uv workflow.
- Every developer must know which system to use.
- **Fix:** if uv is the canonical tool (it should be), delete `requirements.txt` and `requirements-lock.txt` and update README to only reference `uv sync`.

### 8.4 `engines` field missing in `package.json`

- Node 20 is assumed (CI pins it) but not declared in `package.json`.
- **Fix:** add `"engines": { "node": ">=20" }`.

### 8.5 No `npm run lint` script

- `package.json` has `dev`, `build`, `preview`, `check`, `test:unit`, `bundle:size`, `smoke` — but no `lint`.
- Once ESLint and Prettier are added, a `lint` script making both runnable with one command is expected by contributors.

---

## 9. Desktop release (not fully audited)

- `.github/workflows/desktop-release.yml` was not reviewed in depth.
- Likely shares CI issues from §5 (ubuntu-latest, uv pip, etc.).
- Should be audited separately against the same checklist.
