/**
 * Keep History data fresh while a run is in progress: poll on a cadence so
 * the running row flips to "done" without a manual reload. When all runs are
 * terminal, the interval clears.
 *
 * There is no mount-time refresh. Opening History is not a signal that the
 * data changed: a finished run invalidates the scores cache itself
 * (useJobCompletionEffect), and everything else ages out through staleTime.
 * Invalidating on mount made every tab switch refetch the run list and the
 * latest dashboard.
 *
 * The refresh is scoped to what History actually renders: the trend and
 * run list (latest scores payload), the latest dashboard, and the dashboard
 * payloads of runs that are still running. Done historical runs are
 * immutable and their caches deliberately frozen (see useDashboard) — a
 * subtree-wide invalidation here would mark every cached run detail stale
 * and reintroduce the background-refetch dim on every pass through History.
 *
 * Mounted from the History page only — we deliberately don't poll on
 * Overview / Standards / etc. The History list is the one place where the
 * user is actively watching for the running row to terminate.
 */
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '../api/queryKeys.js';
import { pollIntervalForRuns } from '../utils/runPolling.js';
import { RUN_STATE } from '../vocab/runState.js';
import { PROJECT_SOURCE } from '../vocab/projectSource.js';
import { isSseEnabled } from '../constants.js';
import { useVisibleInterval } from './useVisibleInterval.js';

// Dashboard invalidations use the view-less prefix so both the overview
// entry (the root hook off run pages) and the full one (run views) go stale.
function invalidateHistoryScope(queryClient, selectedProject, availableRuns, selectedSource) {
  queryClient.invalidateQueries({ queryKey: projectKeys.scores(selectedProject, null, selectedSource) });
  queryClient.invalidateQueries({ queryKey: projectKeys.dashboardAnyView(selectedProject, null, selectedSource) });
  for (const r of availableRuns || []) {
    if (r?.status === RUN_STATE.RUNNING && r.runId) {
      queryClient.invalidateQueries({ queryKey: projectKeys.dashboardAnyView(selectedProject, r.runId, selectedSource) });
    }
  }
}

/**
 * @param {{ selectedProject: string, selectedSource?: 'local'|'shared', availableRuns: Array }} opts
 *
 * selectedSource (default 'local') is folded into every key this hook
 * invalidates so a refresh scoped to one source never marks the other
 * source's cache stale (only local projects ever have running runs, but
 * History can be viewing either source's data when this fires).
 */
export function useRunningRunsRefresh({ selectedProject, selectedSource = PROJECT_SOURCE.LOCAL, availableRuns }) {
  const queryClient = useQueryClient();
  const interval = pollIntervalForRuns(availableRuns);

  // Poll only while running runs exist AND SSE is off.
  // With SSE on, terminal-status events drive the running -> terminal flip
  // (see useRunEventStream); polling here would just double the request rate.
  const polling = selectedProject && interval && !isSseEnabled();
  useVisibleInterval(() => {
    invalidateHistoryScope(queryClient, selectedProject, availableRuns, selectedSource);
  }, polling ? interval : 0);
}
