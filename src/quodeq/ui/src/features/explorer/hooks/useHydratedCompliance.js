import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectKeys } from '../../../api/queryKeys.js';
import { groupDeferredFindings, mergeFindingDetail } from '../../../api/complianceDetail.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';

/**
 * Items of one kind with the detail /scores deferred filled back in.
 *
 * Returns *items* unchanged while the detail loads, or when none of them is
 * deferred (items from /eval or a shared project already carry it).
 * @param {Array} items
 * @param {string} kind FINDING_TYPE.VIOLATION or FINDING_TYPE.COMPLIANCE
 * @returns {Array}
 */
export function useHydratedFindings(items, kind) {
  const { getFindingDetail } = useApi();
  const groups = useMemo(() => groupDeferredFindings(items), [items]);
  const combine = useCallback((results) => results.flatMap((r, i) => (
    r.data ? [{ ref: groups[i].ref, items: r.data }] : []
  )), [groups]);
  const loaded = useQueries({
    queries: groups.map(({ ref, scope }) => ({
      queryKey: projectKeys.findingDetail(ref.project, ref.asOf, kind, ref.dimension, ref.generation, scope),
      queryFn: () => getFindingDetail(ref.project, { kind, dimension: ref.dimension, asOf: ref.asOf, ...scope }),
      // Keyed on the /scores response generation, so an entry can never go stale.
      staleTime: Infinity,
    })),
    combine,
  });
  return useMemo(() => mergeFindingDetail(items || [], loaded), [items, loaded]);
}

/**
 * Compliance items with the detail /scores deferred filled back in.
 * @param {Array} items
 * @returns {Array}
 */
export function useHydratedCompliance(items) {
  return useHydratedFindings(items, FINDING_TYPE.COMPLIANCE);
}
