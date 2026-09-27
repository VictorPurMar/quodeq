/**
 * "See findings" on the since-baseline panel: fetch the run diff and open
 * the file page on the findings that are new in the scoped files.
 */
import { useCallback, useState } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { createViolation } from '../../../models/violation.js';
import { buildProjectRootFile } from '../../../utils/explorerUtils.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { SEVERITY_FILTER_ALL } from '../../../vocab/severity.js';
import { SCOPE_CHANGED } from '../headlineStats.js';
import { t } from '../../../strings/index.js';

const LIST_CAP = 200; // the diff route caps each list at 200 entries

function newDimensions(diff) {
  return Object.entries(diff?.dimensions || {}).map(([dimension, entry]) => {
    const fresh = entry?.sinceBaseline?.new || [];
    return {
      dimension,
      violations: fresh.map((v) => createViolation({ ...v, dimension })),
      capped: fresh.length >= LIST_CAP,
    };
  });
}

function labelFor(since, dims) {
  const count = dims.reduce((acc, d) => acc + d.violations.length, 0);
  const capped = dims.some((d) => d.capped);
  const changed = since.scope === SCOPE_CHANGED;
  const key = changed
    ? (capped ? 'sinceBaseline.newFileChangedCapped' : 'sinceBaseline.newFileChanged')
    : (capped ? 'sinceBaseline.newFileAllCapped' : 'sinceBaseline.newFileAll');
  return t(key, { count });
}

/**
 * @param {{project: string|null, runId: string|null, dateLabel?: string, since: Object|null, onNavigate?: Function}} args
 * @returns {{seeFindings: (() => Promise<void>)|undefined, busy: boolean}}
 */
export function useSeeFindings({ project, runId, dateLabel, since, onNavigate }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(project && runId && onNavigate && since);
  const seeFindings = useCallback(async () => {
    setBusy(true);
    try {
      const diff = await api.getRunDiff(project, runId);
      const dims = newDimensions(diff);
      onNavigate(NAV_TAB.FILE, {
        file: buildProjectRootFile(dims, labelFor(since, dims)),
        severityFilter: SEVERITY_FILTER_ALL, runId, dateLabel, sourceTab: NAV_TAB.OVERVIEW,
      });
    } catch (err) {
      console.error('Failed to load the since-baseline findings:', err);
    } finally {
      setBusy(false);
    }
  }, [api, project, runId, dateLabel, since, onNavigate]);
  return { seeFindings: enabled ? seeFindings : undefined, busy };
}
