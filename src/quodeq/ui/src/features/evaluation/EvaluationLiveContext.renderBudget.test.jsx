import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// These tests exercise the polling path, which SSE_ENABLED (read once at
// import) now turns off by default. Pin the flag before the hook is imported.
vi.hoisted(() => { import.meta.env.VITE_USE_SSE_EVENTS = 'false'; });

import { Profiler } from 'react';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/index.js', () => ({
  getEvaluationProgress: vi.fn(),
}));
import { getEvaluationProgress } from '../../api/index.js';

import { ApiProvider } from '../../api/ApiContext.jsx';
import { EvaluationLiveProvider, useLiveJob, useLiveFindings, useEvaluationActions } from './EvaluationLiveContext.jsx';
import { createLiveEvaluationStore } from './liveEvaluationStore.js';

// A poll tick must not reach the page the user is on. The live values are
// published to a store, so only the components that read them re-render; a
// page that reads none of them commits zero times for the whole run.

const POLL_TICK_MS = 2000;
const TICKS = 10;
const RUNNING_JOB = {
  jobId: 'job-1', status: 'running',
  outputProject: 'project-a', outputRunId: 'run-1', dimensions: ['security'],
};
const PROGRESS = {
  currentDimension: 'security',
  dimensions: [{ id: 'security', state: 'running', files: { taken: 3, total: 10 } }],
  totalElapsedS: 12,
};

function makeFakeApi() {
  let served = 0;
  return {
    listEvaluations: vi.fn(async () => [RUNNING_JOB]),
    getEvaluation: vi.fn(async () => RUNNING_JOB),
    // One more finding per tick, the way a live run reports them.
    getLiveFindings: vi.fn(async () => {
      served += 1;
      const violations = Array.from({ length: served }, (unused, i) => ({
        practiceId: 'Authenticity', file: `a${i}.py`, line: i + 1, severity: 'major',
      }));
      return { dimensions: { security: { violations } } };
    }),
  };
}

function makeEvaluationDeps() {
  return {
    navigation: { navTab: vi.fn(), navReset: vi.fn() },
    projects: { loadProjects: vi.fn(async () => []), setProjects: vi.fn(), selectProjectAndRun: vi.fn() },
    selectedProject: 'project-a',
  };
}

// Stands for any page the user can be on: it can start or cancel a run, but
// reads none of the live values.
function PageWithoutLiveState() {
  const actions = useEvaluationActions();
  return <button type="button" data-testid="page" onClick={actions.cancelEvaluation}>x</button>;
}

// Stands for the job strip: it reads the job and its findings.
function LiveStrip() {
  const job = useLiveJob();
  const findings = useLiveFindings('security');
  return <div data-testid="strip">{`${job?.status || 'idle'}:${findings.length}`}</div>;
}

function renderShell(store, commits) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const count = (id) => () => { commits[id] += 1; };
  return render(
    <QueryClientProvider client={client}>
      <ApiProvider value={makeFakeApi()}>
        <EvaluationLiveProvider store={store} {...makeEvaluationDeps()}>
          <Profiler id="page" onRender={count('page')}><PageWithoutLiveState /></Profiler>
          <Profiler id="strip" onRender={count('strip')}><LiveStrip /></Profiler>
        </EvaluationLiveProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

describe('live evaluation render budget', () => {
  beforeEach(() => {
    getEvaluationProgress.mockReset();
    getEvaluationProgress.mockResolvedValue(PROGRESS);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a poll tick re-renders the live strip and never the page', async () => {
    const store = createLiveEvaluationStore();
    const commits = { page: 0, strip: 0 };
    // Fake timers before the render: React Query's poll timers are armed on
    // mount, and a real timer armed first would never be advanced here.
    vi.useFakeTimers();
    const view = renderShell(store, commits);

    // The run is adopted on mount, the way a CLI-started job is; the first
    // findings land a tick later, once the job's project is known.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- ticks are sequential by design
      await act(async () => { await vi.advanceTimersByTimeAsync(POLL_TICK_MS); });
    }
    expect(store.getState().job?.status).toBe('running');
    expect(view.getByTestId('strip').textContent).toMatch(/^running:[1-9]/);

    commits.page = 0;
    commits.strip = 0;
    for (let i = 0; i < TICKS; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- ticks are sequential by design
      await act(async () => { await vi.advanceTimersByTimeAsync(POLL_TICK_MS); });
    }

    expect(commits.page).toBe(0);
    // One commit per tick, and only in the component that reads the values.
    expect(commits.strip).toBe(TICKS);
  });
});
