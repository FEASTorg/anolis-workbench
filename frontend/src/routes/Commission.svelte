<script>
  // TODO Phase 14: implement launch/stop/restart, log pane, health panel, and .anpkg export.

  let { projectName, system, runtimeStatus, commissionRunningForCurrent } = $props();

  const running = $derived(Boolean(runtimeStatus?.running));
  const runningProject = $derived(
    typeof runtimeStatus?.active_project === 'string' ? runtimeStatus.active_project : null,
  );
  const runningForOther = $derived(
    running && Boolean(runningProject) && runningProject !== projectName,
  );
</script>

<section id="workspace-commission" class="workspace visible">
  <div class="workspace-header">
    <h2>Commission</h2>
    <p>Preflight, launch, monitor logs, and supervise runtime bring-up.</p>
  </div>

  {#if runningForOther}
    <div class="workspace-advisory">
      Runtime is currently running for "{runningProject}". Launch for this project is
      hard-blocked until stop.
    </div>
  {/if}

  <!-- TODO Phase 14: Launch panel, log pane, health panel, export section -->
  <p class="placeholder">Commission workspace — implementation in progress.</p>
</section>
