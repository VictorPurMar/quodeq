/**
 * Live data for an in-progress History row.
 *
 * Mounts a per-row SSE subscription via useRunEventStream and reactively
 * subscribes to the cache slots that subscription writes. Returns
 *
 *   { liveDims, plannedDimensions, hasScoredDimension }
 *
 * where liveDims is a `{ [dim]: <evaluation/<dim>.json payload> }` map
 * and plannedDimensions is the dim list the run was started against
 * (sourced from the most recent status event).
 *
 * The render switch (placeholder vs partial summary) lives in the
 * caller; this hook is just the data adapter.
 *
 * Gating: useRunEventStream itself is gated on VITE_USE_SSE_EVENTS. With
 * the stream on, hasScoredDimension comes from liveDims: the server replays
 * every already-completed dimension when a client connects, so the value is
 * right from the first tick and no per-row poll is needed. With the stream
 * off, liveDims stays empty and the row falls back to polling the on-disk
 * progress endpoint the running Evaluation page uses (getEvaluationProgress)
 * so "ready to view" still reflects real completion.
 */
import { useQuery } from '@tanstack/react-query';
import { useRunEventStream } from '../../evaluation/hooks/useRunEventStream.js';
import { getEvaluationProgress } from '../../../api/index.js';
import { NO_JOB_ID, evaluationKeys } from '../../../api/queryKeys.js';
import { DIM_STATE } from '../../../vocab/dimState.js';
import { isSseEnabled } from '../../../constants.js';

const PROGRESS_POLL_MS = 3000;

// queryFn never runs (enabled: false); the cache is populated only by
// the SSE writer in useRunEventStream. useQuery is here for its
// subscription -- when setQueryData fires, this component rerenders.
const NEVER_QUERIED = () => {
  throw new Error('cache slot is SSE-fed; queryFn must not run');
};

/**
 * Live state for a run open in History: the dimensions scored so far, the ones
 * still planned, and whether at least one has finished.
 *
 * The dimension and status slots are fed by the SSE stream rather than
 * fetched; the progress read is polled unconditionally so the page still
 * advances with SSE off.
 *
 * @returns {{liveDims: object, plannedDimensions: string[], hasScoredDimension: boolean}}
 */
export function useHistoryRunLive(runId) {
  useRunEventStream(runId);

  const { data: liveDims = {} } = useQuery({
    queryKey: evaluationKeys.dimensions(runId || NO_JOB_ID),
    queryFn: NEVER_QUERIED,
    enabled: false,
    staleTime: Infinity,
  });

  const { data: status } = useQuery({
    queryKey: evaluationKeys.status(runId || NO_JOB_ID),
    queryFn: NEVER_QUERIED,
    enabled: false,
    staleTime: Infinity,
  });

  // Polling fallback only: a pure on-disk read of per-dim state, same
  // source the running Evaluation page's progress bar uses.
  const polling = !!runId && !isSseEnabled();
  const { data: progress } = useQuery({
    queryKey: [...evaluationKeys.evaluation(runId || NO_JOB_ID), 'historyProgress'],
    queryFn: () => getEvaluationProgress(runId),
    enabled: polling,
    staleTime: 0,
    refetchInterval: polling ? PROGRESS_POLL_MS : false,
    retry: false,
  });

  const plannedDimensions = Array.isArray(status?.dimensions)
    ? status.dimensions
    : [];

  const hasScoredDimension = Object.keys(liveDims).length > 0
    || (Array.isArray(progress?.dimensions)
      && progress.dimensions.some((d) => d?.state === DIM_STATE.DONE));

  return { liveDims, plannedDimensions, hasScoredDimension };
}
