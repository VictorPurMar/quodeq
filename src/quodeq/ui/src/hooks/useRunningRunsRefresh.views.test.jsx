import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRunningRunsRefresh } from './useRunningRunsRefresh.js';
import { projectKeys } from '../api/queryKeys.js';
import { DASHBOARD_VIEW } from '../vocab/dashboardView.js';

// The refresh must reach whichever dashboard shape is mounted: the root
// hook holds the OVERVIEW key off run pages, the run views hold FULL keys.
// Asserted on real query state, not on the keys passed to invalidateQueries:
// an exact full key is not a prefix of the overview key, and a key-equality
// test would pass either way.

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

describe('useRunningRunsRefresh across dashboard views', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_USE_SSE_EVENTS', 'false');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks both the overview and the full dashboard entries stale, and leaves a done run alone', () => {
    const client = makeClient();
    const overviewLatest = projectKeys.dashboard('p1', null, 'local', DASHBOARD_VIEW.OVERVIEW);
    const fullLatest = projectKeys.dashboard('p1', null, 'local', DASHBOARD_VIEW.FULL);
    const liveOverview = projectKeys.dashboard('p1', 'r_live', 'local', DASHBOARD_VIEW.OVERVIEW);
    const doneFull = projectKeys.dashboard('p1', 'r_done', 'local', DASHBOARD_VIEW.FULL);
    for (const k of [overviewLatest, fullLatest, liveOverview, doneFull]) client.setQueryData(k, { trend: [] });
    renderHook(
      () => useRunningRunsRefresh({
        selectedProject: 'p1',
        availableRuns: [{ runId: 'r_live', status: 'running' }, { runId: 'r_done', status: 'done' }],
      }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    expect(client.getQueryState(overviewLatest).isInvalidated).toBe(true);
    expect(client.getQueryState(fullLatest).isInvalidated).toBe(true);
    expect(client.getQueryState(liveOverview).isInvalidated).toBe(true);
    expect(client.getQueryState(doneFull).isInvalidated).toBe(false);
  });
});
