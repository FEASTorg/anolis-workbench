// operate-contracts.js — data extraction / normalization for the Operate workspace

function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function asArray(v) { return Array.isArray(v) ? v : []; }
function toFinite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

const PARAMETER_TYPES = new Set(['double', 'int64', 'bool', 'string']);
const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;
const JS_SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER);
const JS_SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);

export function extractDevices(payload) { return asArray(asObject(payload).devices); }
export function extractProvidersHealth(payload) { return asArray(asObject(payload).providers); }

export function extractCapabilities(payload) {
  const root = asObject(payload);
  const caps = asObject(root.capabilities);
  return { ...caps, signals: asArray(caps.signals), functions: normalizeFunctionSpecs(caps.functions) };
}

export function normalizeFunctionSpecs(functions) {
  if (!Array.isArray(functions)) return [];
  return functions.map((func, i) => {
    const functionId = toFinite(func?.function_id) ?? i + 1;
    const name = (typeof func?.name === 'string' && func.name.trim()) ||
                 (typeof func?.function_name === 'string' && func.function_name.trim()) ||
                 `Function ${functionId}`;
    const description = (typeof func?.label === 'string' && func.label.trim()) ||
                        (typeof func?.description === 'string' && func.description.trim()) || '';
    return { ...func, function_id: functionId, name, function_name: name, display_name: name, label: description, description, args: normalizeFunctionArgs(func?.args) };
  }).sort((a, b) => a.function_id !== b.function_id ? a.function_id - b.function_id : String(a.display_name).localeCompare(String(b.display_name)));
}

export function normalizeFunctionArgs(args) {
  if (Array.isArray(args)) return args.map((a, i) => normalizeArgSpec(a, `arg_${i + 1}`)).filter(a => a.name !== '');
  if (args && typeof args === 'object') return Object.entries(args).map(([n, s]) => normalizeArgSpec(s, n)).filter(a => a.name !== '').sort((a, b) => a.name.localeCompare(b.name));
  return [];
}

export function normalizeArgSpec(arg, fallback = '') {
  const name = (typeof arg?.name === 'string' && arg.name.trim()) || fallback;
  if (!name.trim()) return { name: '', type: 'string', required: true };
  return { name: name.trim(), type: (typeof arg?.type === 'string' && arg.type.trim()) || 'string', required: arg?.required !== false, min: arg?.min, max: arg?.max, allowed_values: arg?.allowed_values };
}

export function extractDeviceStateValues(payload) {
  return asArray(asObject(payload).values).map(s => {
    const src = asObject(s);
    return { ...src, timestamp_ms: toFinite(src.timestamp_ms) ?? toFinite(src.timestamp_epoch_ms) ?? 0 };
  });
}

export function extractMode(payload) {
  const r = asObject(payload); return typeof r.mode === 'string' ? r.mode : null;
}

export function extractRuntimeStatus(payload) {
  const r = asObject(payload);
  return {
    status: asObject(r.status),
    mode: typeof r.mode === 'string' ? r.mode : 'UNKNOWN',
    uptime_seconds: toFinite(r.uptime_seconds) ?? 0,
    polling_interval_ms: toFinite(r.polling_interval_ms) ?? 0,
    device_count: toFinite(r.device_count) ?? 0,
    providers: asArray(r.providers),
  };
}

export function extractAutomationStatus(payload) {
  const r = asObject(payload);
  return {
    enabled: Boolean(r.enabled),
    active: Boolean(r.active),
    bt_status: typeof r.bt_status === 'string' ? r.bt_status : 'UNKNOWN',
    last_tick_ms: toFinite(r.last_tick_ms) ?? 0,
    ticks_since_progress: toFinite(r.ticks_since_progress) ?? 0,
    total_ticks: toFinite(r.total_ticks) ?? 0,
    last_error: typeof r.last_error === 'string' && r.last_error.trim() ? r.last_error : null,
    error_count: toFinite(r.error_count) ?? 0,
    current_tree: typeof r.current_tree === 'string' ? r.current_tree : '',
  };
}

export function extractAutomationTree(payload) {
  const r = asObject(payload); return typeof r.tree === 'string' ? r.tree : '';
}

export function normalizeParameterType(type) {
  const t = String(type ?? '').trim();
  return PARAMETER_TYPES.has(t) ? t : null;
}

export function extractParameters(payload) {
  return asArray(asObject(payload).parameters)
    .filter(p => p && typeof p.name === 'string')
    .map(p => ({ ...p, name: String(p.name).trim(), type: normalizeParameterType(p.type) ?? String(p.type ?? '') }))
    .filter(p => p.name !== '')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeProviderHealthQuality(quality) {
  const v = String(quality || 'UNKNOWN').toUpperCase();
  if (v === 'OK' || v === 'READY' || v === 'AVAILABLE') return 'OK';
  if (v === 'FAULT') return 'FAULT';
  if (v === 'UNAVAILABLE' || v === 'STALE') return 'UNAVAILABLE';
  return 'UNKNOWN';
}

export function deriveOperateAvailability(statusPayload, projectName) {
  const running = Boolean(statusPayload?.running);
  const runningProject = typeof statusPayload?.active_project === 'string' ? statusPayload.active_project : '';
  if (!running) return { available: false, reason: 'stopped', message: 'Runtime is stopped. Start runtime from Commission to operate this project.', runningProject };
  if (runningProject !== projectName) return { available: false, reason: 'different_project', message: `Runtime is running for project "${runningProject}". Stop it before operating "${projectName}".`, runningProject };
  return { available: true, reason: 'available', message: '', runningProject };
}

export function coerceParameterValue({ type, rawValue, min, max, allowedValues }) {
  const ntype = normalizeParameterType(type);
  if (!ntype) throw new Error('Unsupported parameter type');
  const src = String(rawValue ?? '').trim();
  let value;
  if (ntype === 'int64') {
    if (!/^-?\d+$/.test(src)) throw new Error('Invalid integer');
    let n; try { n = BigInt(src); } catch { throw new Error('Invalid integer'); }
    if (n < INT64_MIN || n > INT64_MAX) throw new Error('Out-of-range int64');
    if (n < JS_SAFE_MIN || n > JS_SAFE_MAX) throw new Error('int64 exceeds browser-safe range');
    value = Number(n);
  } else if (ntype === 'double') {
    value = Number(src);
    if (Number.isNaN(value)) throw new Error('Invalid number');
  } else if (ntype === 'bool') {
    value = src.toLowerCase() === 'true';
  } else {
    value = src;
  }
  if (ntype === 'int64' || ntype === 'double') {
    const mn = min !== undefined ? Number(min) : null;
    const mx = max !== undefined ? Number(max) : null;
    if (Number.isFinite(mn) && value < mn) throw new Error(`Value below minimum (${mn})`);
    if (Number.isFinite(mx) && value > mx) throw new Error(`Value above maximum (${mx})`);
  }
  if (ntype === 'string' && Array.isArray(allowedValues) && allowedValues.length > 0) {
    const allowed = allowedValues.map(String);
    if (!allowed.includes(String(value))) throw new Error(`Value must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

export function renderBtOutline(xmlDoc, node = null, indent = 0, isLast = true) {
  if (!node) {
    const root = xmlDoc.querySelector('BehaviorTree');
    if (!root) return 'No BehaviorTree found.';
    return renderBtOutline(xmlDoc, root, 0, true);
  }
  const prefix = indent === 0 ? '' : ' '.repeat((indent - 1) * 2) + (isLast ? '\\- ' : '|- ');
  const name = node.getAttribute('name') || '';
  let out = `${prefix}${node.tagName}${name ? ` "${name}"` : ''}\n`;
  const children = Array.from(node.children);
  for (let i = 0; i < children.length; i++) out += renderBtOutline(xmlDoc, children[i], indent + 1, i === children.length - 1);
  return out;
}
