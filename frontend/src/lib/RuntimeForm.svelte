<script>
  /**
   * RuntimeForm.svelte — Runtime configuration form.
   * Mutates `system.topology.runtime` and `system.paths` via onChanged callback.
   */
  let { system, onChanged } = $props();

  const rt = $derived(system?.topology?.runtime ?? {});
  const paths = $derived(system?.paths ?? {});

  // Normalize migration fields when system changes
  $effect(() => {
    if (!system?.topology?.runtime) return;
    const r = system.topology.runtime;
    if (r.cors_allow_credentials === undefined) r.cors_allow_credentials = false;
    if (r.telemetry_enabled !== undefined) {
      r.telemetry = r.telemetry || {};
      if (r.telemetry.enabled === undefined) r.telemetry.enabled = !!r.telemetry_enabled;
      delete r.telemetry_enabled;
    }
    if (!r.telemetry || typeof r.telemetry !== 'object') r.telemetry = { enabled: false };
    if (r.telemetry.enabled === undefined) r.telemetry.enabled = false;
  });

  function set(obj, key, val) { obj[key] = val; onChanged(); }
  function setRt(key, val) { system.topology.runtime[key] = val; onChanged(); }
  function setInflux(key, val) {
    const r = system.topology.runtime;
    r.telemetry = r.telemetry || {};
    r.telemetry.influxdb = r.telemetry.influxdb || {};
    r.telemetry.influxdb[key] = val;
    onChanged();
  }
  function setCorsOrigins(raw) {
    system.topology.runtime.cors_origins = raw.split('\n').map(s => s.trim()).filter(Boolean);
    onChanged();
  }
</script>

<section class="form-section">
  <h3>Runtime</h3>

  <div class="form-group">
    <label>Runtime name</label>
    <input type="text" spellcheck="false" value={rt.name ?? ''}
      oninput={(e) => setRt('name', e.target.value)} />
  </div>

  <div class="form-group">
    <label>HTTP port</label>
    <input type="number" min="1" max="65535" value={rt.http_port ?? ''}
      onchange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setRt('http_port', n); }} />
  </div>

  <div class="form-group">
    <label>HTTP bind address</label>
    <input type="text" spellcheck="false" style="font-family:monospace" value={rt.http_bind ?? ''}
      oninput={(e) => setRt('http_bind', e.target.value)} />
  </div>

  <div class="form-group">
    <label>CORS origins (one per line)</label>
    <textarea rows="3" placeholder="http://localhost:3000"
      value={(rt.cors_origins ?? []).join('\n')}
      oninput={(e) => setCorsOrigins(e.target.value)}></textarea>
  </div>

  <div class="form-group form-group-inline">
    <label>
      <input type="checkbox" checked={rt.cors_allow_credentials ?? false}
        onchange={(e) => setRt('cors_allow_credentials', e.target.checked)} />
      {' '}CORS allow credentials
    </label>
  </div>

  <div class="form-group">
    <label>Shutdown timeout (ms)</label>
    <input type="number" min="500" max="30000" value={rt.shutdown_timeout_ms ?? ''}
      onchange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setRt('shutdown_timeout_ms', n); }} />
  </div>

  <div class="form-group">
    <label>Startup timeout (ms)</label>
    <input type="number" min="5000" max="300000" value={rt.startup_timeout_ms ?? ''}
      onchange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setRt('startup_timeout_ms', n); }} />
  </div>

  <div class="form-group">
    <label>Polling interval (ms)</label>
    <input type="number" min="100" max="10000" value={rt.polling_interval_ms ?? ''}
      onchange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setRt('polling_interval_ms', n); }} />
  </div>

  <div class="form-group">
    <label>Log level</label>
    <select value={rt.log_level ?? 'info'}
      onchange={(e) => setRt('log_level', e.target.value)}>
      <option value="debug">debug</option>
      <option value="info">info</option>
      <option value="warn">warn</option>
      <option value="error">error</option>
    </select>
  </div>

  <div class="form-group form-group-inline">
    <label>
      <input type="checkbox" checked={rt.telemetry?.enabled ?? false}
        onchange={(e) => { system.topology.runtime.telemetry = system.topology.runtime.telemetry || {}; system.topology.runtime.telemetry.enabled = e.target.checked; onChanged(); }} />
      {' '}Telemetry enabled
    </label>
  </div>

  {#if rt.telemetry?.enabled}
    <div class="form-group">
      <label>InfluxDB URL</label>
      <input type="text" spellcheck="false" style="font-family:monospace"
        placeholder="http://localhost:8086" value={rt.telemetry?.influxdb?.url ?? ''}
        oninput={(e) => setInflux('url', e.target.value.trim())} />
    </div>
    <div class="form-group">
      <label>InfluxDB org</label>
      <input type="text" spellcheck="false" value={rt.telemetry?.influxdb?.org ?? ''}
        oninput={(e) => setInflux('org', e.target.value.trim())} />
    </div>
    <div class="form-group">
      <label>InfluxDB bucket</label>
      <input type="text" spellcheck="false" value={rt.telemetry?.influxdb?.bucket ?? ''}
        oninput={(e) => setInflux('bucket', e.target.value.trim())} />
    </div>
    <div class="form-group">
      <label>InfluxDB token</label>
      <input type="text" spellcheck="false" style="font-family:monospace"
        value={rt.telemetry?.influxdb?.token ?? ''}
        oninput={(e) => setInflux('token', e.target.value)} />
      <span class="field-note">Stored in system.json for the checked-in dev telemetry profile.</span>
    </div>
    <div class="form-group">
      <label>Influx batch size</label>
      <input type="number" min="1" max="100000" value={rt.telemetry?.influxdb?.batch_size ?? ''}
        onchange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setInflux('batch_size', n); }} />
    </div>
    <div class="form-group">
      <label>Influx flush interval (ms)</label>
      <input type="number" min="1" max="600000" value={rt.telemetry?.influxdb?.flush_interval_ms ?? ''}
        onchange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) setInflux('flush_interval_ms', n); }} />
    </div>
  {/if}

  <div class="form-group form-group-inline">
    <label>
      <input type="checkbox" checked={rt.automation_enabled ?? false}
        onchange={(e) => setRt('automation_enabled', e.target.checked)} />
      {' '}Automation enabled
    </label>
  </div>

  <div class="form-group">
    <label>Behavior tree path</label>
    <input type="text" spellcheck="false" style="font-family:monospace"
      placeholder="behaviors/main.xml" value={rt.behavior_tree_path ?? ''}
      oninput={(e) => setRt('behavior_tree_path', e.target.value.trim() || null)} />
    <span class="field-note">Optional. Relative paths resolve from the project directory.</span>
  </div>

  <div class="form-group">
    <label>Runtime executable path</label>
    <input type="text" spellcheck="false" style="font-family:monospace"
      value={paths.runtime_executable ?? ''}
      oninput={(e) => { system.paths.runtime_executable = e.target.value; onChanged(); }} />
    <span class="field-note">Default assumes CMake dev-release preset. Change if your build output is elsewhere.</span>
  </div>
</section>
