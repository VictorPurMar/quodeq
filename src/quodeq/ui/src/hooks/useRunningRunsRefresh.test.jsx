import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRunningRunsRefresh } from './useRunningRunsRefresh.js';
import { IN_PROGRESS_POLL_MS } from '../utils/runPolling.js';
import { projectKeys } from '../api/queryKeys.js';

const TICK_SLACK_MS = 50;
const IDLE_TICKS = 3;
const TWO_TICKS = 2;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { Wrapper, invalidateSpy };
}

// Keys invalidated so far, as plain arrays for deep comparison.
function keysCalled(invalidateSpy) {
  return invalidateSpy.mock.calls.map((c) => c[0].queryKey);
}

// One refresh = one invalidation of the latest-scores key. Counting those
// counts refreshes without coupling the tests to how many scoped keys each
// refresh touches.
function refreshCount(invalidateSpy, project = 'p1') {
  const latestKey = JSON.stringify(projectKeys.scores(project, null));
  return keysCalled(invalidateSpy).filter((k) => JSON.stringify(k) === latestKey).length;
}

function mount(runs, extra = {}) {
  const { Wrapper, invalidateSpy } = makeWrapper();
  const rendered = renderHook(
    ({ availableRuns, ...rest }) => useRunningRunsRefresh({ selectedProject: 'p1', availableRuns, ...rest }),
    { wrapper: Wrapper, initialProps: { availableRuns: runs, ...extra } },
  );
  return { ...rendered, invalidateSpy };
}

function oneTick() {
  act(() => {
    vi.advanceTimersByTime(IN_PROGRESS_POLL_MS + TICK_SLACK_MS);
  });
}

describe('useRunningRunsRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_USE_SSE_EVENTS', 'false');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Opening History must not touch the cache. A tab switch with fresh data
  // fires no request; freshness comes from job completion and staleTime.
  it('does not invalidate on mount, whatever the runs look like', () => {
    const { invalidateSpy } = mount([
      { runId: 'r1', status: 'running' },
      { runId: 'r0', status: 'done' },
    ]);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('does nothing at all when every run is terminal', () => {
    const { invalidateSpy } = mount([{ runId: 'r1', status: 'done' }]);
    act(() => {
      vi.advanceTimersByTime(IN_PROGRESS_POLL_MS * IDLE_TICKS);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('scopes each tick to latest keys, never the whole project subtree', () => {
    // Completed historical runs are immutable and their caches deliberately
    // frozen (see useDashboard). A subtree-wide invalidation here would mark
    // every cached run detail stale and reintroduce the background-refetch
    // dim on every pass through History.
    const { invalidateSpy } = mount([
      { runId: 'r_live', status: 'running' },
      { runId: 'r_done', status: 'done' },
    ]);
    oneTick();
    const keys = keysCalled(invalidateSpy);
    expect(keys).toContainEqual(projectKeys.scores('p1', null));
    expect(keys).toContainEqual(projectKeys.dashboardAnyView('p1', null));
    expect(keys).toContainEqual(projectKeys.dashboardAnyView('p1', 'r_live'));
    expect(keys).not.toContainEqual(projectKeys.project('p1'));
    expect(keys).not.toContainEqual(projectKeys.dashboardAnyView('p1', 'r_done'));
    expect(keys).not.toContainEqual(projectKeys.scores('p1', 'r_done'));
  });

  it('refreshes once per tick while a run is in_progress', () => {
    const { invalidateSpy } = mount([{ runId: 'r1', status: 'running' }]);
    act(() => {
      vi.advanceTimersByTime(IN_PROGRESS_POLL_MS * TWO_TICKS + TICK_SLACK_MS);
    });
    expect(refreshCount(invalidateSpy)).toBe(TWO_TICKS);
  });

  it('stops polling once all runs become terminal', () => {
    const { rerender, invalidateSpy } = mount([{ runId: 'r1', status: 'running' }]);
    oneTick();
    expect(refreshCount(invalidateSpy)).toBe(1);
    invalidateSpy.mockClear();
    rerender({ availableRuns: [{ runId: 'r1', status: 'done' }] });
    act(() => {
      vi.advanceTimersByTime(IN_PROGRESS_POLL_MS * IDLE_TICKS);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('does nothing without a selected project', () => {
    const { Wrapper, invalidateSpy } = makeWrapper();
    renderHook(
      () => useRunningRunsRefresh({ selectedProject: '', availableRuns: [{ runId: 'r1', status: 'running' }] }),
      { wrapper: Wrapper },
    );
    act(() => {
      vi.advanceTimersByTime(IN_PROGRESS_POLL_MS * IDLE_TICKS);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('suppresses the poll when VITE_USE_SSE_EVENTS=true', () => {
    vi.stubEnv('VITE_USE_SSE_EVENTS', 'true');
    const { invalidateSpy } = mount([{ runId: 'r1', status: 'running' }]);
    act(() => {
      vi.advanceTimersByTime(IN_PROGRESS_POLL_MS * IDLE_TICKS);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  // Source-aware cache keys. selectedSource must be folded into
  // every key this hook invalidates, so a refresh scoped to one source never
  // marks the other source's cache stale.
  describe('source-aware cache keys', () => {
    it("scopes invalidation to the 'local' keys by default", () => {
      const { invalidateSpy } = mount([{ runId: 'r1', status: 'running' }]);
      oneTick();
      const keys = keysCalled(invalidateSpy);
      expect(keys).toContainEqual(projectKeys.scores('p1', null, 'local'));
      expect(keys).toContainEqual(projectKeys.dashboardAnyView('p1', null, 'local'));
    });

    it("scopes invalidation to the 'shared' keys when selectedSource is 'shared'", () => {
      const { invalidateSpy } = mount([{ runId: 'r1', status: 'running' }], { selectedSource: 'shared' });
      oneTick();
      const keys = keysCalled(invalidateSpy);
      expect(keys).toContainEqual(projectKeys.scores('p1', null, 'shared'));
      expect(keys).toContainEqual(projectKeys.dashboardAnyView('p1', null, 'shared'));
      expect(keys).not.toContainEqual(projectKeys.scores('p1', null, 'local'));
      expect(keys).not.toContainEqual(projectKeys.dashboardAnyView('p1', null, 'local'));
    });
  });
});
