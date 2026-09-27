import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { STAGE_STATUS } from '../../../vocab/stageStatus.js';

export const STAGE_DEBOUNCE_MS = 250;

/**
 * The scoring stages of one dimension's principles: `stored` with the saved
 * formula parameters (one GET, cached for the session) and `live` with the
 * editor's draft (one POST, 250 ms after the last draft change). A draft the
 * server rejects, or a request that fails, leaves `live` at the last good
 * payload so the numbers beside the sliders never blank out.
 * @param {object} args
 * @param {string|null} args.project
 * @param {string|null} args.runId
 * @param {string|null} args.dimension
 * @param {object|null} args.draft - the draft formula parameters (camelCase).
 * @param {boolean} args.enabled - false: nothing is requested.
 * @returns {{stored: object|null, live: object|null, principles: Array, status: string}}
 */
export function useStageExplain({ project, runId, dimension, draft, enabled }) {
  const api = useApi();
  const active = Boolean(enabled && project && runId && dimension);
  const query = useQuery({
    queryKey: projectKeys.gradeExplain(project, runId, dimension),
    queryFn: () => api.getGradeExplain(project, runId, dimension),
    enabled: active,
    staleTime: Infinity,
    retry: false,
  });
  const stored = query.data || null;

  const [live, setLive] = useState(null);
  const timerRef = useRef(null);
  const requestRef = useRef(0);
  useEffect(() => {
    if (!active || !stored || !draft) return undefined;
    clearTimeout(timerRef.current);
    const ticket = ++requestRef.current;
    timerRef.current = setTimeout(() => {
      api.previewGradeExplain(project, runId, dimension, draft)
        .then((payload) => { if (ticket === requestRef.current) setLive(payload); })
        .catch(() => {});
    }, STAGE_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [active, stored, draft, project, runId, dimension, api]);

  const current = live || stored;
  return {
    stored,
    live,
    principles: current?.principles || [],
    status: stageStatus(active, query),
  };
}

function stageStatus(active, query) {
  if (!active || query.isError) return STAGE_STATUS.UNAVAILABLE;
  if (query.isPending) return STAGE_STATUS.LOADING;
  return query.data ? STAGE_STATUS.READY : STAGE_STATUS.IDLE;
}
