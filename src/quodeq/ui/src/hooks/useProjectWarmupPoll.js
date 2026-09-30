import { useVisibleInterval } from './useVisibleInterval.js';

/**
 * useProjectState.js's warm-up poll: while the backend is still computing
 * summaries, refresh the list every few seconds so grades fill in as they
 * land. Stops on settle and on failure (the failure state has its own
 * retry/reconnect lanes).
 */
export function useProjectWarmupPoll({ projects, projectsLoaded, projectsLoadFailed, loadProjects, summaryPollMs }) {
  const anySummaryPending = projects.some((p) => p.summaryPending);
  const active = anySummaryPending && projectsLoaded && !projectsLoadFailed;
  useVisibleInterval(() => { loadProjects(); }, active ? summaryPollMs : 0);
}
