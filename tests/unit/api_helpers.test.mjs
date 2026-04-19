import test from "node:test";
import assert from "node:assert/strict";

import { fetchJson, filenameFromContentDisposition } from "../../frontend/src/lib/api.js";

test("filenameFromContentDisposition extracts UTF-8 encoded names", () => {
  const header = "attachment; filename*=UTF-8''project%20export.anpkg";
  assert.equal(filenameFromContentDisposition(header, "fallback.anpkg"), "project export.anpkg");
});

test("filenameFromContentDisposition falls back when header is missing", () => {
  assert.equal(filenameFromContentDisposition(null, "fallback.anpkg"), "fallback.anpkg");
});

test("fetchJson returns parsed JSON for successful responses", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ ok: true, message: "ready" });
    },
  });

  try {
    const payload = await fetchJson("/api/status");
    assert.deepEqual(payload, { ok: true, message: "ready" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("fetchJson surfaces API error message for non-2xx responses", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async text() {
      return JSON.stringify({ error: "validation_failed" });
    },
  });

  try {
    await assert.rejects(fetchJson("/api/projects/x"), /validation_failed/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

