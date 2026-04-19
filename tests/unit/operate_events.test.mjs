import test from "node:test";
import assert from "node:assert/strict";

import {
  appendEventTrace,
  buildTraceEvent,
  createOperateEventStreamManager,
  describeEvent,
} from "../../frontend/src/lib/operate-events.js";

class FakeEventSource {
  static OPEN = 1;
  static CLOSED = 2;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.onopen = null;
    this.onerror = null;
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  emit(type, payload) {
    const handlers = this.listeners.get(type) || [];
    const event = {
      data: typeof payload === "string" ? payload : JSON.stringify(payload),
    };
    for (const handler of handlers) {
      handler(event);
    }
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    if (typeof this.onopen === "function") {
      this.onopen();
    }
  }

  fail() {
    this.readyState = FakeEventSource.CLOSED;
    if (typeof this.onerror === "function") {
      this.onerror(new Error("stream failure"));
    }
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
    this.closed = true;
  }
}

function createScheduler() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();

  return {
    setTimeout(callback, delayMs) {
      const id = nextId++;
      timeouts.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback, delayMs) {
      const id = nextId++;
      intervals.set(id, { callback, delayMs });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    runIntervals() {
      for (const { callback } of intervals.values()) {
        callback();
      }
    },
    runNextTimeout() {
      const next = timeouts.entries().next();
      if (next.done) return false;
      const [id, timer] = next.value;
      timeouts.delete(id);
      timer.callback();
      return true;
    },
    timeoutCount() {
      return timeouts.size;
    },
  };
}

test("appendEventTrace keeps ring buffer bounded", () => {
  const buffer = [];
  appendEventTrace(buffer, { type: "a" }, 3);
  appendEventTrace(buffer, { type: "b" }, 3);
  appendEventTrace(buffer, { type: "c" }, 3);
  appendEventTrace(buffer, { type: "d" }, 3);
  assert.deepEqual(buffer.map((entry) => entry.type), ["b", "c", "d"]);
});

test("describeEvent and buildTraceEvent produce readable summaries", () => {
  assert.equal(describeEvent("mode_change", { previous_mode: "MANUAL", new_mode: "AUTO" }), "MANUAL -> AUTO");
  assert.equal(
    describeEvent("provider_health_change", { provider_id: "sim0", state: "UNAVAILABLE" }),
    "sim0: UNAVAILABLE",
  );

  const traced = buildTraceEvent("state_update", { provider_id: "sim0", device_id: "dev0", signal_id: "temp" }, 99);
  assert.equal(traced.details, "sim0/dev0 temp");
  assert.equal(traced.timestamp_ms, 99);
});

test("event stream manager handles connect, stale, reconnect, and disconnect", () => {
  FakeEventSource.instances = [];
  const scheduler = createScheduler();
  const statuses = [];
  const events = [];
  let nowMs = 0;

  const previousEventSource = globalThis.EventSource;
  const previousNow = Date.now;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const previousSetInterval = globalThis.setInterval;
  const previousClearInterval = globalThis.clearInterval;

  globalThis.EventSource = FakeEventSource;
  Date.now = () => nowMs;
  globalThis.setTimeout = scheduler.setTimeout;
  globalThis.clearTimeout = scheduler.clearTimeout;
  globalThis.setInterval = scheduler.setInterval;
  globalThis.clearInterval = scheduler.clearInterval;

  try {
    const manager = createOperateEventStreamManager({
      onConnectionStatus: (status) => statuses.push(status),
      onEvent: (eventType, payload) => events.push({ eventType, payload }),
      staleAfterMs: 1000,
      staleCheckIntervalMs: 100,
      reconnectDelayMs: 250,
      maxReconnectDelayMs: 1000,
    });

    manager.connect();
    assert.equal(FakeEventSource.instances.length, 1);
    const stream1 = FakeEventSource.instances[0];
    stream1.open();
    assert.equal(statuses.at(-1).state, "connected");

    stream1.emit("state_update", {
      provider_id: "sim0",
      device_id: "dev0",
      signal_id: "temp",
      timestamp_ms: 10,
    });
    assert.equal(events.length, 1);

    nowMs = 1500;
    scheduler.runIntervals();
    assert.equal(statuses.at(-1).state, "stale");

    stream1.fail();
    assert.equal(statuses.at(-1).state, "reconnecting");
    assert.equal(scheduler.timeoutCount(), 1);

    assert.equal(scheduler.runNextTimeout(), true);
    assert.equal(FakeEventSource.instances.length, 2);
    const stream2 = FakeEventSource.instances[1];
    stream2.open();
    assert.equal(statuses.at(-1).state, "connected");

    manager.disconnect();
    assert.equal(stream2.closed, true);
    assert.equal(statuses.at(-1).state, "disconnected");
  } finally {
    globalThis.EventSource = previousEventSource;
    Date.now = previousNow;
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
    globalThis.setInterval = previousSetInterval;
    globalThis.clearInterval = previousClearInterval;
  }
});

