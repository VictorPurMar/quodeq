import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { projectKeys } from './queryKeys.js';
import { DASHBOARD_VIEW } from '../vocab/dashboardView.js';
import { LATEST_RUN_ID } from '../constants.js';
import { installDashboardCacheCap, MAX_CACHED_FULL_RUNS } from './dashboardCacheCap.js';

// A full historical run is 10-34 MB and frozen, so without a cap a session
// that walks through History holds every run it visited for the whole run of
// the process.

const PROJECT = 'p1';

function makeClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const unsubscribe = installDashboardCacheCap(queryClient);
  return { queryClient, unsubscribe };
}

function fullKey(runId) {
  return projectKeys.dashboard(PROJECT, runId, 'local', DASHBOARD_VIEW.FULL);
}

function overviewKey(runId) {
  return projectKeys.dashboard(PROJECT, runId, 'local', DASHBOARD_VIEW.OVERVIEW);
}

async function openRun(queryClient, key) {
  await queryClient.fetchQuery({ queryKey: key, queryFn: async () => ({ runId: key.at(-2) }) });
}

function cachedRuns(queryClient, view) {
  return queryClient.getQueryCache().getAll()
    .filter((q) => q.queryKey[3] === 'dashboard' && q.queryKey.at(-1) === view)
    .map((q) => q.queryKey.at(-2));
}

describe('dashboard cache cap', () => {
  it('keeps only the newest full historical runs', async () => {
    const { queryClient, unsubscribe } = makeClient();

    for (let i = 1; i <= 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- run pages open one at a time
      await openRun(queryClient, fullKey(`r${i}`));
    }

    expect(cachedRuns(queryClient, DASHBOARD_VIEW.FULL)).toEqual(['r8', 'r9', 'r10']);
    expect(MAX_CACHED_FULL_RUNS).toBe(3);
    unsubscribe();
  });

  it('never evicts a run that is still on screen', async () => {
    const { queryClient, unsubscribe } = makeClient();
    await openRun(queryClient, fullKey('r1'));
    // An observer is what "on screen" means to the cache.
    const observed = queryClient.getQueryCache().find({ queryKey: fullKey('r1') });
    const removeObserver = observed.addObserver({ options: {}, onQueryUpdate: () => {} });

    for (let i = 2; i <= 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- run pages open one at a time
      await openRun(queryClient, fullKey(`r${i}`));
    }

    expect(cachedRuns(queryClient, DASHBOARD_VIEW.FULL)).toContain('r1');
    observed.removeObserver(removeObserver);
    unsubscribe();
  });

  it('leaves the overview shape and the latest run alone', async () => {
    const { queryClient, unsubscribe } = makeClient();

    for (let i = 1; i <= 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- one row at a time
      await openRun(queryClient, overviewKey(`r${i}`));
    }
    await openRun(queryClient, fullKey(LATEST_RUN_ID));

    expect(cachedRuns(queryClient, DASHBOARD_VIEW.OVERVIEW)).toHaveLength(10);
    expect(cachedRuns(queryClient, DASHBOARD_VIEW.FULL)).toEqual([LATEST_RUN_ID]);
    unsubscribe();
  });

  it('stops capping once unsubscribed', async () => {
    const { queryClient, unsubscribe } = makeClient();
    unsubscribe();

    for (let i = 1; i <= 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- one row at a time
      await openRun(queryClient, fullKey(`r${i}`));
    }

    expect(cachedRuns(queryClient, DASHBOARD_VIEW.FULL)).toHaveLength(6);
  });

  it('ignores queries that are not dashboard payloads', async () => {
    const { queryClient, unsubscribe } = makeClient();
    const queryFn = vi.fn(async () => ({ trend: [] }));

    for (let i = 1; i <= 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- one row at a time
      await queryClient.fetchQuery({ queryKey: projectKeys.scores(PROJECT, `r${i}`), queryFn });
    }

    expect(queryClient.getQueryCache().getAll()).toHaveLength(10);
    unsubscribe();
  });
});
