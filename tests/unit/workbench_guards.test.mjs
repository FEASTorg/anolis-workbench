import test from "node:test";
import assert from "node:assert/strict";

import {
  describeCrossProjectRunningBanner,
  evaluateNavigationPrompts,
} from "../../frontend/src/lib/guards.js";
import {
  deriveOperateAvailability,
  normalizeProviderHealthQuality,
} from "../../frontend/src/lib/operate-contracts.js";

test("navigation prompts include unsaved-change confirmation on workspace switch", () => {
  const prompts = evaluateNavigationPrompts({
    dirty: true,
    currentProject: "alpha",
    currentWorkspace: "compose",
    nextProject: "alpha",
    nextWorkspace: "commission",
    runtimeRunning: false,
    runningProject: "",
  });

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].id, "unsaved_changes");
});

test("navigation prompts include running-runtime project switch warning", () => {
  const prompts = evaluateNavigationPrompts({
    dirty: false,
    currentProject: "alpha",
    currentWorkspace: "compose",
    nextProject: "beta",
    nextWorkspace: "compose",
    runtimeRunning: true,
    runningProject: "alpha",
  });

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].id, "switch_while_running");
  assert.ok(prompts[0].message.includes("will not stop it"));
});

test("cross-project running banner appears only when active project differs", () => {
  const message = describeCrossProjectRunningBanner({
    activeProject: "beta",
    runtimeRunning: true,
    runningProject: "alpha",
  });

  assert.ok(message.includes("Launch for \"beta\" is blocked"));

  const none = describeCrossProjectRunningBanner({
    activeProject: "alpha",
    runtimeRunning: true,
    runningProject: "alpha",
  });

  assert.equal(none, "");
});

test("operate availability reports stopped runtime", () => {
  const availability = deriveOperateAvailability(
    {
      running: false,
      active_project: null,
    },
    "alpha",
  );

  assert.equal(availability.available, false);
  assert.equal(availability.reason, "stopped");
});

test("operate availability reports mismatched running project", () => {
  const availability = deriveOperateAvailability(
    {
      running: true,
      active_project: "alpha",
    },
    "beta",
  );

  assert.equal(availability.available, false);
  assert.equal(availability.reason, "different_project");
  assert.ok(availability.message.includes("Stop it before operating"));
});

test("provider health quality normalization maps runtime quality states", () => {
  assert.equal(normalizeProviderHealthQuality("AVAILABLE"), "OK");
  assert.equal(normalizeProviderHealthQuality("FAULT"), "FAULT");
  assert.equal(normalizeProviderHealthQuality("STALE"), "UNAVAILABLE");
  assert.equal(normalizeProviderHealthQuality("weird"), "UNKNOWN");
});
