/**
 * Evaluate which navigation confirmation prompts to show before a route transition.
 * Ported from the vanilla shell-guards.js module.
 *
 * @param {{
 *   dirty: boolean,
 *   currentProject: string | null,
 *   currentWorkspace: string | null,
 *   nextProject: string | null,
 *   nextWorkspace: string,
 *   runtimeRunning: boolean,
 *   runningProject: string,
 * }} opts
 * @returns {{ id: string, message: string }[]}
 */
export function evaluateNavigationPrompts({
  dirty,
  currentProject,
  currentWorkspace,
  nextProject,
  nextWorkspace,
  runtimeRunning,
  runningProject,
}) {
  const prompts = [];

  const hasCurrentProject = typeof currentProject === 'string' && currentProject !== '';
  const hasNextProject = typeof nextProject === 'string' && nextProject !== '';

  const switchingProject =
    hasCurrentProject && hasNextProject && nextProject !== currentProject;
  const switchingWorkspace =
    hasCurrentProject &&
    hasNextProject &&
    nextProject === currentProject &&
    typeof currentWorkspace === 'string' &&
    currentWorkspace !== '' &&
    nextWorkspace !== currentWorkspace;
  const leavingProjectContext = hasCurrentProject && !hasNextProject;

  if (dirty && (switchingProject || switchingWorkspace || leavingProjectContext)) {
    prompts.push({
      id: 'unsaved_changes',
      message: 'You have unsaved Compose edits. Continue and discard unsaved changes?',
    });
  }

  if (
    hasNextProject &&
    runtimeRunning &&
    typeof runningProject === 'string' &&
    runningProject !== '' &&
    runningProject !== nextProject &&
    nextProject !== currentProject
  ) {
    prompts.push({
      id: 'switch_while_running',
      message:
        `Project "${runningProject}" is currently running. ` +
        `Switching to "${nextProject}" will not stop it. Continue?`,
    });
  }

  return prompts;
}

/**
 * Returns a banner message when the active project differs from the running project,
 * or an empty string when no banner is needed.
 *
 * @param {{
 *   activeProject: string | null,
 *   runtimeRunning: boolean,
 *   runningProject: string | null,
 * }} opts
 * @returns {string}
 */
export function describeCrossProjectRunningBanner({ activeProject, runtimeRunning, runningProject }) {
  if (
    typeof activeProject === 'string' &&
    activeProject !== '' &&
    runtimeRunning &&
    typeof runningProject === 'string' &&
    runningProject !== '' &&
    runningProject !== activeProject
  ) {
    return (
      `Runtime for "${runningProject}" remains active. ` +
      `Launch for "${activeProject}" is blocked until you stop the running runtime.`
    );
  }
  return '';
}
