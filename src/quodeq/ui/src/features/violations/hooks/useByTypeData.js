/**
 * Data for the By type view: the run diff of every run the visible
 * dimensions come from (baseline counts per requirement) and the standard
 * of every dimension (requirement text and principle).
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys, standardsKeys } from '../../../api/queryKeys.js';

function distinct(dimensions, pick) {
  return [...new Set((dimensions || []).map(pick).filter(Boolean))];
}

function byKey(results, keys) {
  const out = {};
  results.forEach((r, i) => { if (r.data) out[keys[i]] = r.data; });
  return out;
}

/**
 * @param {{project: string, dimensions: Array, enabled?: boolean}} args
 * @returns {{diffsByRun: Object, standardsByDim: Object, loading: boolean}}
 */
export function useByTypeData({ project, dimensions, enabled = true }) {
  const api = useApi();
  const runs = useMemo(() => distinct(dimensions, (d) => d.fromRunId), [dimensions]);
  const dims = useMemo(() => distinct(dimensions, (d) => d.dimension), [dimensions]);
  const diffs = useQueries({
    queries: runs.map((runId) => ({
      queryKey: projectKeys.runDiff(project, runId),
      queryFn: () => api.getRunDiff(project, runId),
      enabled: enabled && Boolean(project),
      retry: false,
    })),
  });
  const standards = useQueries({
    queries: dims.map((dimension) => ({
      queryKey: standardsKeys.detail(dimension),
      queryFn: () => api.getStandard(dimension),
      enabled,
      staleTime: Infinity,
      retry: false,
    })),
  });
  return {
    diffsByRun: byKey(diffs, runs),
    standardsByDim: byKey(standards, dims),
    loading: diffs.some((q) => q.isPending) || standards.some((q) => q.isPending),
  };
}
