<script>
  // TODO Phase 14: implement SSE event stream, device list, mode control, provider health,
  //   device state/capabilities/functions, parameters grid, automation status/tree,
  //   event trace, and telemetry iframe.

  let { projectName, system, runtimeStatus } = $props();

  const running = $derived(Boolean(runtimeStatus?.running));
  const runningProject = $derived(
    typeof runtimeStatus?.active_project === 'string' ? runtimeStatus.active_project : null,
  );
  const available = $derived(running && runningProject === projectName);
</script>

<section id="workspace-operate" class="workspace visible">
  <div class="workspace-header">
    <h2>Operate</h2>
  </div>

  {#if !available}
    <div class="workspace-advisory">
      {#if running && runningProject}
        Runtime is running for "{runningProject}", not this project.
      {:else}
        Runtime is not running for this project.
      {/if}
    </div>
  {/if}

  <!-- TODO Phase 14: Mode control, device list, provider health, parameters, events, telemetry -->
  <p class="placeholder">Operate workspace — implementation in progress.</p>
</section>
