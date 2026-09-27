/**
 * The since-baseline line's words: which run is the baseline, what scope the
 * counts have, and the labels for the new findings. Counts only, never the
 * requirement codes; those live on the Violations by-type tab.
 */
import { SCOPE_CHANGED, SCOPE_MIXED } from './headlineStats.js';
import { t } from '../../strings/index.js';
import { pluralKey } from '../../utils/plural.js';
import { formatRunId } from '../../utils/formatters.js';

function runLabel(runId, availableRuns) {
  return availableRuns?.find((r) => r.runId === runId)?.dateLabel || formatRunId(runId);
}

/** The baseline run's date label; null when there is no single baseline. */
export function baselineDateLabel(since, availableRuns) {
  if (!since || since.scope === SCOPE_MIXED || since.againstRunIds.length === 0) return null;
  return runLabel(since.againstRunIds[0], availableRuns);
}

function isUnchanged(since) {
  return since.scope === SCOPE_CHANGED && since.changedFiles === 0 && since.majorsDelta === 0
    && since.typesClosed.length === 0 && since.typesOpened.length === 0;
}

function scopeText(since) {
  if (since.scope === SCOPE_MIXED) return t('sinceBaseline.scopeMixed');
  if (since.scope !== SCOPE_CHANGED) return t('sinceBaseline.scopeAll');
  return t(pluralKey(since.changedFiles, 'sinceBaseline.changedFilesOne', 'sinceBaseline.changedFiles'), { count: since.changedFiles });
}

/**
 * @returns {null|{date: string, scope: string, newLabel: string, newCount: number, resolvedCount: number, unchanged: boolean}}
 */
export function sinceLineParts(since, selectedRun, availableRuns) {
  if (!since) return null;
  const date = since.scope === SCOPE_MIXED
    ? t('sinceBaseline.runsMixed', { count: since.againstRunIds.length })
    : baselineDateLabel(since, availableRuns);
  return {
    date,
    scope: scopeText(since),
    newLabel: t(since.scope === SCOPE_CHANGED ? 'sinceBaseline.newInChangedLabel' : 'sinceBaseline.newInAllLabel'),
    newCount: since.newCount,
    resolvedCount: since.resolvedCount,
    unchanged: isUnchanged(since),
  };
}
