import test from "node:test";
import assert from "node:assert/strict";

import {
  coerceParameterValue,
  deriveOperateAvailability,
  extractAutomationStatus,
  extractAutomationTree,
  extractCapabilities,
  extractDeviceStateValues,
  extractDevices,
  extractMode,
  extractParameters,
  extractProvidersHealth,
  extractRuntimeStatus,
  normalizeProviderHealthQuality,
} from "../../frontend/src/lib/operate-contracts.js";

test("extractDevices and extractProvidersHealth return normalized arrays", () => {
  const devices = extractDevices({ devices: [{ id: "dev0" }] });
  const providers = extractProvidersHealth({ providers: [{ provider_id: "sim0" }] });

  assert.deepEqual(devices, [{ id: "dev0" }]);
  assert.deepEqual(providers, [{ provider_id: "sim0" }]);
});

test("extractCapabilities normalizes function names and args", () => {
  const payload = {
    capabilities: {
      signals: [{ signal_id: "temp" }],
      functions: [{ function_id: 2, function_name: "set_mode", args: { mode: { type: "string" } } }],
    },
  };
  const caps = extractCapabilities(payload);

  assert.ok(Array.isArray(caps.signals));
  assert.equal(caps.functions.length, 1);
  assert.equal(caps.functions[0].display_name, "set_mode");
  assert.deepEqual(caps.functions[0].args[0], {
    name: "mode",
    type: "string",
    required: true,
    min: undefined,
    max: undefined,
    allowed_values: undefined,
  });
});

test("extractDeviceStateValues maps timestamp_epoch_ms into timestamp_ms", () => {
  const values = extractDeviceStateValues({
    values: [{ signal_id: "temp", value: 21.1, timestamp_epoch_ms: 1234 }],
  });
  assert.equal(values[0].timestamp_ms, 1234);
});

test("runtime and automation status extractors preserve key fields", () => {
  const runtime = extractRuntimeStatus({
    status: { code: "OK" },
    mode: "MANUAL",
    uptime_seconds: 5,
    polling_interval_ms: 250,
    device_count: 2,
    providers: [{ provider_id: "sim0" }],
  });
  const automation = extractAutomationStatus({
    enabled: true,
    active: false,
    bt_status: "IDLE",
    last_tick_ms: 10,
    total_ticks: 12,
  });

  assert.equal(runtime.status.code, "OK");
  assert.equal(runtime.mode, "MANUAL");
  assert.equal(runtime.device_count, 2);
  assert.equal(automation.enabled, true);
  assert.equal(automation.bt_status, "IDLE");
  assert.equal(automation.total_ticks, 12);
});

test("mode, parameters, and automation tree extractors return normalized values", () => {
  assert.equal(extractMode({ mode: "AUTO" }), "AUTO");
  assert.equal(extractAutomationTree({ tree: "<BehaviorTree/>" }), "<BehaviorTree/>");
  assert.deepEqual(extractParameters({ parameters: [{ name: "target_temp", type: "double" }] }), [
    { name: "target_temp", type: "double" },
  ]);
});

test("coerceParameterValue validates and converts supported parameter types", () => {
  assert.equal(coerceParameterValue({ type: "double", rawValue: "2.5", min: "2", max: "3" }), 2.5);
  assert.equal(coerceParameterValue({ type: "int64", rawValue: "17", min: "10", max: "20" }), 17);
  assert.equal(coerceParameterValue({ type: "bool", rawValue: "true" }), true);
  assert.equal(
    coerceParameterValue({ type: "string", rawValue: "AUTO", allowedValues: ["MANUAL", "AUTO"] }),
    "AUTO",
  );
});

test("coerceParameterValue rejects invalid parameter values", () => {
  assert.throws(() => coerceParameterValue({ type: "double", rawValue: "not-a-number" }), /invalid number/i);
  assert.throws(() => coerceParameterValue({ type: "double", rawValue: "1.0", min: "2.0" }), /below minimum/i);
  assert.throws(() => coerceParameterValue({ type: "int64", rawValue: "999", max: "10" }), /above maximum/i);
  assert.throws(
    () =>
      coerceParameterValue({
        type: "string",
        rawValue: "UNKNOWN",
        allowedValues: ["MANUAL", "AUTO"],
      }),
    /must be one of/i,
  );
});

test("operate availability and provider quality helpers return stable values", () => {
  assert.deepEqual(
    deriveOperateAvailability({ running: false, active_project: null }, "alpha"),
    {
      available: false,
      reason: "stopped",
      message: "Runtime is stopped. Start runtime from Commission to operate this project.",
      runningProject: "",
    },
  );
  assert.deepEqual(
    deriveOperateAvailability({ running: true, active_project: "beta" }, "alpha"),
    {
      available: false,
      reason: "different_project",
      message: 'Runtime is running for project "beta". Stop it before operating "alpha".',
      runningProject: "beta",
    },
  );
  assert.equal(normalizeProviderHealthQuality("AVAILABLE"), "OK");
  assert.equal(normalizeProviderHealthQuality("STALE"), "UNAVAILABLE");
});

