<script>
  import { onMount } from 'svelte';
  import Home from './routes/Home.svelte';
  import Compose from './routes/Compose.svelte';
  import Commission from './routes/Commission.svelte';
  import Operate from './routes/Operate.svelte';
  import { fetchJson } from './lib/api.js';
  import { evaluateNavigationPrompts, describeCrossProjectRunningBanner } from './lib/guards.js';

  // ── State ────────────────────────────────────────────────────────────────
  let catalog = $state(null);
  let templates = $state([]);
  let projects = $state([]);
  let runtimeStatus = $state({});
  let projectName = $state(null);
  let system = $state(null);
  let workspace = $state(null);
  let dirty = $state(false);
  let currentPath = $state('/');
  let commissionRunningForCurrent = $state(false);
  let lastNavigationId = 0;

  // ── Derived ──────────────────────────────────────────────────────────────
  const running = $derived(Boolean(runtimeStatus?.running));
  const runningProject = $derived(
    typeof runtimeStatus?.active_project === 'string' ? runtimeStatus.active_project : null,
  );
  const crossProjectBanner = $derived(
    describeCrossProjectRunningBanner({
      activeProject: projectName,
      runtimeRunning: running,
      runningProject,
    }),
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  function parseRoute(path) {
    if (path === '/') return { path: '/', project: null, workspace: null };
    const match = path.match(/^\/projects\/([^/]+)(?:\/(compose|commission|operate))?\/?$/);
    if (!match) return null;
    const project = decodeURIComponent(match[1]);
    const ws = match[2] || 'compose';
    return { path: `/projects/${encodeURIComponent(project)}/${ws}`, project, workspace: ws };
  }

  function confirmNavigation(route) {
    const prompts = evaluateNavigationPrompts({
      dirty,
      currentProject: projectName,
      currentWorkspace: workspace,
      nextProject: route.project,
      nextWorkspace: route.workspace || 'compose',
      runtimeRunning: running,
      runningProject: runningProject ?? '',
    });
    for (const p of prompts) {
      if (!window.confirm(p.message)) return false;
    }
    return true;
  }

  async function navigateTo(
    path,
    { replaceHistory = false, historyAlreadySet = false, bypassGuards = false } = {},
  ) {
    const route = parseRoute(path);
    if (!route) {
      if (!historyAlreadySet) history.replaceState({}, '', '/');
      return navigateTo('/', { replaceHistory: true, historyAlreadySet: true, bypassGuards });
    }

    if (!bypassGuards && !confirmNavigation(route)) return false;

    const navId = ++lastNavigationId;
    if (!historyAlreadySet) {
      if (replaceHistory) history.replaceState({}, '', route.path);
      else history.pushState({}, '', route.path);
    }

    const projectChanged = route.project !== projectName;
    if (projectChanged) dirty = false;

    if (projectChanged && route.project) {
      const loaded = await loadProject(route.project);
      if (!loaded) {
        if (navId !== lastNavigationId) return false;
        history.replaceState({}, '', '/');
        await navigateTo('/', { replaceHistory: true, historyAlreadySet: true, bypassGuards: true });
        return false;
      }
    }

    if (!route.project) {
      projectName = null;
      system = null;
      workspace = null;
      currentPath = '/';
      return true;
    }

    if (projectChanged) {
      projectName = route.project;
      commissionRunningForCurrent = false;
    }

    workspace = route.workspace || 'compose';
    currentPath = route.path;
    return true;
  }

  async function loadProject(name) {
    try {
      system = await fetchJson(`/api/projects/${encodeURIComponent(name)}`);
      projectName = name;
      return true;
    } catch {
      return false;
    }
  }

  async function refreshStatus() {
    try {
      const status = await fetchJson('/api/status');
      runtimeStatus = status;
      const operatorUiBase = status?.composer?.operator_ui_base;
      if (typeof operatorUiBase === 'string' && operatorUiBase.trim()) {
        window.__ANOLIS_COMPOSER__ = {
          ...(window.__ANOLIS_COMPOSER__ ?? {}),
          operatorUiBase: operatorUiBase.trim(),
        };
      }
      const nowRunningForCurrent =
        Boolean(status?.running) && status?.active_project === projectName;
      if (workspace === 'commission' && nowRunningForCurrent !== commissionRunningForCurrent) {
        commissionRunningForCurrent = nowRunningForCurrent;
      }
    } catch {
      // non-fatal; keep prior status
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(async () => {
    await Promise.all([
      fetchJson('/api/catalog').then((c) => { catalog = c; }).catch(() => {}),
      fetchJson('/api/templates').then((t) => { templates = t; }).catch(() => {}),
      fetchJson('/api/projects').then((p) => { projects = p; }).catch(() => {}),
      refreshStatus(),
    ]);

    await navigateTo(window.location.pathname, { replaceHistory: true, bypassGuards: true });

    const statusInterval = setInterval(() => void refreshStatus(), 2000);

    function handlePopState() {
      void navigateTo(window.location.pathname, {
        replaceHistory: true,
        historyAlreadySet: true,
      }).then((ok) => {
        if (!ok) history.pushState({}, '', currentPath);
      });
    }

    function handleBeforeUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(statusInterval);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  // ── UI event handlers ─────────────────────────────────────────────────────
  function onProjectSelect(event) {
    const selected = event.target.value;
    if (!selected) {
      void navigateTo('/');
      return;
    }
    const ws = workspace || 'compose';
    void navigateTo(`/projects/${encodeURIComponent(selected)}/${ws}`);
  }

  function onTabClick(ws) {
    if (!projectName) return;
    void navigateTo(`/projects/${encodeURIComponent(projectName)}/${ws}`);
  }

  async function onProjectsRefreshed() {
    projects = await fetchJson('/api/projects').catch(() => projects);
  }
</script>

<header id="shell-topbar">
  <div class="brand-wrap">
    <button id="btn-home" class="ghost-btn" type="button" onclick={() => void navigateTo('/')}>
      Anolis Workbench
    </button>
  </div>

  <div class="project-wrap">
    <label for="project-selector" class="topbar-label">Project</label>
    <select id="project-selector" value={projectName ?? ''} onchange={onProjectSelect}>
      <option value="">No project selected</option>
      {#each projects as project (project.name)}
        <option value={project.name}>{project.name}</option>
      {/each}
    </select>
    {#if dirty}
      <span id="unsaved-indicator" title="Unsaved changes">●</span>
    {/if}
  </div>

  <nav id="workspace-tabs" aria-label="Workspace tabs">
    {#each ['compose', 'commission', 'operate'] as ws}
      <button
        type="button"
        class="tab-btn"
        class:active={workspace === ws && Boolean(projectName)}
        disabled={!projectName}
        onclick={() => onTabClick(ws)}
      >{ws.charAt(0).toUpperCase() + ws.slice(1)}</button>
    {/each}
  </nav>

  <div
    id="runtime-indicator"
    class="runtime-indicator"
    class:running={running && Boolean(runningProject)}
    class:stopped={!(running && Boolean(runningProject))}
  >
    {running && runningProject ? `Running: ${runningProject}` : 'Stopped'}
  </div>
</header>

{#if crossProjectBanner}
  <div id="global-banner" class="global-banner">{crossProjectBanner}</div>
{/if}

<main id="shell-main">
  {#if !projectName}
    <Home
      {projects}
      {templates}
      onNavigate={(path) => void navigateTo(path, { bypassGuards: true })}
      {onProjectsRefreshed}
    />
  {:else if workspace === 'compose'}
    <Compose
      {projectName}
      {system}
      {catalog}
      {runtimeStatus}
      onDirty={() => { dirty = true; }}
      onSaved={() => { dirty = false; }}
      onSystemChanged={(s) => { system = s; }}
    />
  {:else if workspace === 'commission'}
    <Commission
      {projectName}
      {system}
      {runtimeStatus}
      {commissionRunningForCurrent}
    />
  {:else if workspace === 'operate'}
    <Operate
      {projectName}
      {system}
      {runtimeStatus}
    />
  {/if}
</main>
