// operate-events.js — SSE stream manager and event utilities for Operate workspace

export const DEFAULT_SSE_EVENT_TYPES = [
  'state_update',
  'quality_change',
  'mode_change',
  'parameter_change',
  'bt_error',
  'provider_health_change',
];

export function appendEventTrace(buffer, event, maxEntries = 100) {
  buffer.push(event);
  if (buffer.length > maxEntries) buffer.splice(0, buffer.length - maxEntries);
  return buffer;
}

export function describeEvent(eventType, payload) {
  if (!payload || typeof payload !== 'object') return eventType;
  if (eventType === 'mode_change') return `${payload.previous_mode ?? '?'} -> ${payload.new_mode ?? '?'}`;
  if (eventType === 'parameter_change') {
    const name = payload.parameter_name ?? payload.name ?? 'parameter';
    return `${name}: ${payload.old_value ?? '?'} -> ${payload.new_value ?? '?'}`;
  }
  if (eventType === 'bt_error') {
    const node = typeof payload.node === 'string' && payload.node !== '' ? `${payload.node}: ` : '';
    return `${node}${payload.error ?? 'Unknown behavior-tree error'}`;
  }
  if (eventType === 'provider_health_change') return `${payload.provider_id ?? 'provider'}: ${payload.state ?? payload.new_state ?? 'UNKNOWN'}`;
  if (eventType === 'state_update') return `${payload.provider_id ?? 'provider'}/${payload.device_id ?? 'device'} ${payload.signal_id ?? 'signal'}`;
  if (eventType === 'quality_change') return `${payload.provider_id ?? 'provider'}/${payload.device_id ?? 'device'} ${payload.signal_id ?? 'signal'} -> ${payload.new_quality ?? 'UNKNOWN'}`;
  return JSON.stringify(payload);
}

export function buildTraceEvent(eventType, payload, nowMs = Date.now()) {
  const tsRaw = Number(payload?.timestamp_ms);
  const timestampMs = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : nowMs;
  return { type: eventType, timestamp_ms: timestampMs, details: describeEvent(eventType, payload), payload };
}

/**
 * @typedef {Object} OperateConnectionStatus
 * @property {'connected' | 'disconnected' | 'reconnecting' | 'stale'} state
 * @property {number} attempts
 * @property {number} [delay_ms]
 * @property {number} [idle_ms]
 */

/**
 * @typedef {Object} OperateEventStreamOptions
 * @property {string} [url]
 * @property {(eventType: string, payload: any) => void} [onEvent]
 * @property {(status: OperateConnectionStatus) => void} [onConnectionStatus]
 * @property {(error: unknown, context: string) => void} [onParseError]
 * @property {string[]} [eventTypes]
 * @property {number} [reconnectDelayMs]
 * @property {number} [maxReconnectDelayMs]
 * @property {number} [staleAfterMs]
 * @property {number} [staleCheckIntervalMs]
 */

/**
 * @typedef {Object} OperateEventStreamManager
 * @property {() => void} connect
 * @property {() => void} disconnect
 * @property {() => string} getState
 */

/**
 * @param {OperateEventStreamOptions} [options]
 * @returns {OperateEventStreamManager}
 */
export function createOperateEventStreamManager({
  url = '/v0/events',
  onEvent = () => {},
  onConnectionStatus = () => {},
  onParseError = () => {},
  eventTypes = DEFAULT_SSE_EVENT_TYPES,
  reconnectDelayMs = 3000,
  maxReconnectDelayMs = 10000,
  staleAfterMs = 30000,
  staleCheckIntervalMs = 5000,
} = {}) {
  let active = false;
  let source = null;
  let reconnectTimer = null;
  let staleTimer = null;
  let reconnectAttempts = 0;
  let lastEventAt = 0;
  let currentState = 'disconnected';

  function emit(status) {
    currentState = status.state;
    onConnectionStatus(status);
  }

  function clearReconnect() {
    if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function clearStale() {
    if (staleTimer !== null) { clearInterval(staleTimer); staleTimer = null; }
  }

  function closeSource() {
    if (!source) return;
    source.onopen = null;
    source.onerror = null;
    try { source.close(); } catch { /* best-effort */ }
    source = null;
  }

  function touchEvent() {
    lastEventAt = Date.now();
    if (currentState === 'stale') emit({ state: 'connected', attempts: reconnectAttempts });
  }

  function startStaleTimer() {
    clearStale();
    staleTimer = setInterval(() => {
      if (!active || !source || currentState === 'disconnected' || currentState === 'reconnecting') return;
      const idleMs = Date.now() - lastEventAt;
      if (idleMs > staleAfterMs) emit({ state: 'stale', attempts: reconnectAttempts, idle_ms: idleMs });
    }, staleCheckIntervalMs);
  }

  function scheduleReconnect() {
    if (!active) return;
    reconnectAttempts += 1;
    const delayMs = Math.min(reconnectDelayMs * reconnectAttempts, maxReconnectDelayMs);
    emit({ state: 'disconnected', attempts: reconnectAttempts });
    emit({ state: 'reconnecting', attempts: reconnectAttempts, delay_ms: delayMs });
    clearReconnect();
    reconnectTimer = setTimeout(() => { reconnectTimer = null; openSource(); }, delayMs);
  }

  function openSource() {
    if (!active) return;
    clearReconnect(); clearStale(); closeSource();
    try {
      source = new EventSource(url);
    } catch (err) {
      onParseError(err, 'event_source_init');
      scheduleReconnect();
      return;
    }
    source.onopen = () => {
      reconnectAttempts = 0;
      touchEvent();
      emit({ state: 'connected', attempts: 0 });
      startStaleTimer();
    };
    source.onerror = () => { clearStale(); closeSource(); scheduleReconnect(); };
    for (const et of eventTypes) {
      source.addEventListener(et, (event) => {
        try {
          touchEvent();
          const payload = JSON.parse(event.data);
          onEvent(et, payload);
        } catch (err) {
          onParseError(err, et);
        }
      });
    }
  }

  return {
    connect() {
      if (active) return;
      active = true;
      reconnectAttempts = 0;
      openSource();
    },
    disconnect() {
      active = false;
      reconnectAttempts = 0;
      clearReconnect();
      clearStale();
      closeSource();
      emit({ state: 'disconnected', attempts: 0 });
    },
    getState() { return currentState; },
  };
}
