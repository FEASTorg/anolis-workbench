# Frontend Unit Test Audit

Date: 2026-04-18

## Scope

Audit of frontend unit-test coverage for:

1. `frontend/src/lib/api.js`
2. `frontend/src/lib/guards.js`
3. `frontend/src/lib/operate-contracts.js`
4. `frontend/src/lib/operate-events.js`

## Current Baseline (Before Vitest Setup)

1. Runner: Node built-in test runner (`node --test`) via `tests/unit/*.test.mjs`.
2. Existing tests focus on selected happy-path behaviors.
3. No coverage reporting and no coverage threshold gate in CI.
4. Browser smoke tests (Playwright) exist, but they do not replace deterministic unit checks for parser/normalizer edge cases.

## Gaps Identified

1. `api.js`:
   - `downloadBlob` behavior not validated.
   - `fetchJson` error branches not fully covered:
     - non-JSON success payload
     - non-JSON error payload
     - empty error payload fallback
2. `guards.js`:
   - negative/no-prompt paths under-tested.
   - project-switch warning suppression cases under-tested.
3. `operate-contracts.js`:
   - many exported normalizers/parsers not fully exercised across invalid/partial payloads.
   - branch-heavy validation (`coerceParameterValue`) missing important bounds and unsupported-type checks.
   - `renderBtOutline` not covered.
4. `operate-events.js`:
   - reconnect/parse-error/init-failure branches only partially covered.
   - status transitions and timer-driven stale detection need explicit assertions.

## Test Strategy

1. Move JS unit tests onto Vitest to support a TypeScript-first migration path.
2. Keep tests deterministic:
   - mock only external boundaries (`fetch`, `EventSource`, timers, DOM shims).
   - avoid asserting implementation trivia when behavior-level assertions are possible.
3. Cover success + failure branches for each exported function in `frontend/src/lib/*`.
4. Add a coverage gate focused on `frontend/src/lib/**/*` so migration decisions are based on measured confidence.

## Coverage Gate

Initial enforced thresholds for `frontend/src/lib/**/*`:

1. statements: 85%
2. branches: 75%
3. functions: 85%
4. lines: 85%

These thresholds are intentionally non-trivial and intended to rise after TypeScript migration stabilizes.

## Out of Scope for This Pass

1. Full component-level unit tests for Svelte routes/components.
2. Contract-level backend API integration (already covered by Python contract tests).
3. End-to-end browser workflow coverage expansion (already partly covered by Playwright smoke lane).

## Implementation Status

Completed in this pass:

1. Vitest runner configured (`frontend/vitest.config.ts`) with V8 coverage + thresholds.
2. Frontend test scripts added in `frontend/package.json`:
   - `test:unit`
   - `test:unit:watch`
   - `test:unit:coverage`
3. Unit tests migrated to TypeScript under `frontend/tests/unit/`:
   - `api.test.ts`
   - `guards.test.ts`
   - `operate-contracts.test.ts`
   - `operate-events.test.ts`
4. Legacy Node-runner `.mjs` frontend unit tests removed from `tests/unit/`.
5. CI test lane switched to Vitest coverage execution.
6. Added explicit JSDoc contracts for callback and input argument typing in:
   - `frontend/src/lib/operate-events.js`
   - `frontend/src/lib/operate-contracts.js`
   This keeps strict `svelte-check` type validation honest without weakening tests.

Verification snapshot from this pass:

1. Vitest: `38 passed`.
2. Coverage (`frontend/src/lib/**/*` aggregate):
   - statements: `99.02%`
   - branches: `82.71%`
   - functions: `95.55%`
   - lines: `99.02%`
3. `npm run check`: `0 errors`, `29 warnings` (existing Svelte a11y label association warnings).
