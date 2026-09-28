import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../../../api/index.js';
import { projectKeys } from '../../../api/queryKeys.js';
import { hasBodies } from '../../../models/dimension.js';
import { DASHBOARD_VIEW } from '../../../vocab/dashboardView.js';

/**
 * The run's dimensions with bodies. The root dashboard is the overview
 * shape off run pages, so the TYPES tab (which counts `violations[].req`)
 * fetches the full dashboard for its run through the same key the run
 * views use; a visited run page has already warmed it.
 *
 * @returns {Array} the given dimensions when full, else the fetched full
 *   dimensions, else [] while loading
 */
export function useFullRunDimensions({ project, runId, source, dimensions }) {
  const slim = !hasBodies(dimensions);
  const query = useQuery({
    queryKey: projectKeys.dashboard(project, runId, source, DASHBOARD_VIEW.FULL),
    queryFn: () => getDashboard(project, runId, DASHBOARD_VIEW.FULL),
    enabled: slim && !!project && !!runId,
  });
  if (!slim) return dimensions;
  return query.data?.dimensions || [];
}
