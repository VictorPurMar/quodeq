/**
 * Keep at most a handful of full-shape dashboard payloads in the query cache.
 *
 * A full historical run is 10 to 34 MB on a large project and is frozen
 * (staleTime: Infinity), so nothing ever evicts it while the app runs: a
 * session that walks through History accumulates one per run visited and the
 * process grows without bound. gcTime alone does not help while an entry is
 * still observed, and it does not bound how many pile up between collections.
 *
 * The cap is least-recently-used: entries in view (with observers) are never
 * evicted, and the newest MAX_CACHED_FULL_RUNS of the rest are kept. Only the
 * full shape is capped; the overview shape is ~0.1 MB and is what every other
 * page reads.
 */
import { dashboardKeyParts } from './queryKeys.js';
import { DASHBOARD_VIEW } from '../vocab/dashboardView.js';
import { LATEST_RUN_ID } from '../constants.js';

export const MAX_CACHED_FULL_RUNS = 3;

// Query-cache event types this cap reacts to.
const OBSERVER_ADDED = 'observerAdded';
const UPDATED = 'updated';
const ADDED = 'added';

// The latest run is the one the Overview and a live evaluation keep reading;
// capping it would evict the entry the user is most likely to come back to.
function isCappedDashboard(query) {
  const parts = dashboardKeyParts(query?.queryKey);
  if (!parts) return false;
  return parts.view === DASHBOARD_VIEW.FULL && parts.runId !== LATEST_RUN_ID;
}

function evictExcess(cache, lastUsed, max) {
  const capped = cache.getAll().filter(isCappedDashboard);
  if (capped.length <= max) return;
  const ranked = [...capped].sort(
    (a, b) => (lastUsed.get(b.queryHash) || 0) - (lastUsed.get(a.queryHash) || 0),
  );
  let kept = 0;
  for (const query of ranked) {
    if (query.getObserversCount() > 0 || kept < max) {
      kept += 1;
      continue;
    }
    lastUsed.delete(query.queryHash);
    cache.remove(query);
  }
}

/**
 * Start capping full historical dashboard entries on `queryClient`.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {number} [max] How many to keep; defaults to MAX_CACHED_FULL_RUNS.
 * @returns {() => void} Unsubscribe.
 */
export function installDashboardCacheCap(queryClient, max = MAX_CACHED_FULL_RUNS) {
  const cache = queryClient.getQueryCache();
  const lastUsed = new Map();
  let clock = 0;
  let evicting = false;

  return cache.subscribe((event) => {
    const query = event?.query;
    if (!query || !isCappedDashboard(query)) return;
    if (event.type === OBSERVER_ADDED || event.type === UPDATED || event.type === ADDED) {
      clock += 1;
      lastUsed.set(query.queryHash, clock);
    }
    // cache.remove re-enters this subscriber; one pass settles the cache.
    if (evicting) return;
    evicting = true;
    try {
      evictExcess(cache, lastUsed, max);
    } finally {
      evicting = false;
    }
  });
}
