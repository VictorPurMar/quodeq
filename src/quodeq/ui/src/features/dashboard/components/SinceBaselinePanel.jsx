/**
 * The since-baseline panel under the Overview hero: which two runs are
 * compared, what changed between them, and the counts in that scope. Every
 * count names its scope (changed files or all files); a clean tree gets a
 * sentence, not zeros.
 */
import { SCOPE_CHANGED, SCOPE_MIXED } from '../headlineStats.js';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { formatRunId } from '../../../utils/formatters.js';

const SHORT_SHA = 7; // git's conventional abbreviation

function shortSha(sha) {
  return sha ? sha.slice(0, SHORT_SHA) : null;
}

function runLabel(runId, availableRuns) {
  return availableRuns?.find((r) => r.runId === runId)?.dateLabel || formatRunId(runId);
}

function withSha(label, sha) {
  const short = shortSha(sha);
  return short ? `${label} (${short})` : label;
}

function isUnchanged(since) {
  return since.scope === SCOPE_CHANGED && since.changedFiles === 0 && since.majorsDelta === 0
    && since.typesClosed.length === 0 && since.typesOpened.length === 0;
}

function headerLine(since, selectedRun, availableRuns) {
  if (since.scope === SCOPE_MIXED) return t('sinceBaseline.runsMixed', { count: since.againstRunIds.length });
  const from = withSha(runLabel(since.againstRunIds[0], availableRuns), since.againstCommitShas[0]);
  const to = withSha(selectedRun?.dateLabel || formatRunId(selectedRun?.runId), selectedRun?.commitSha);
  return t('sinceBaseline.runs', { from, to });
}

function scopeLine(since) {
  if (since.scope === SCOPE_MIXED) return t('sinceBaseline.scopeMixed');
  if (since.scope !== SCOPE_CHANGED) return t('sinceBaseline.scopeAll');
  return t(pluralKey(since.changedFiles, 'sinceBaseline.changedFilesOne', 'sinceBaseline.changedFiles'), { count: since.changedFiles });
}

function listOrNone(codes) {
  return codes.length > 0 ? codes.join(', ') : t('sinceBaseline.none');
}

function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

/** The baseline run's date label for the hero's OPEN TYPES hint; null when
 * there is no single baseline. */
export function baselineDateLabel(since, availableRuns) {
  if (!since || since.scope === SCOPE_MIXED || since.againstRunIds.length === 0) return null;
  return runLabel(since.againstRunIds[0], availableRuns);
}

function ChangeLines({ since, onSeeFindings }) {
  const newKey = since.scope === SCOPE_CHANGED ? 'sinceBaseline.newInChanged' : 'sinceBaseline.newInAll';
  return (
    <>
      <p className="since-baseline__line">
        {t('sinceBaseline.majors', { delta: signed(since.majorsDelta) })}
        {' · '}
        {t('sinceBaseline.typesClosed', { list: listOrNone(since.typesClosed) })}
        {' · '}
        {t('sinceBaseline.typesOpened', { list: listOrNone(since.typesOpened) })}
      </p>
      <p className="since-baseline__line">
        {t(newKey, { count: since.newCount })}
        {' · '}
        {t('sinceBaseline.resolved', { count: since.resolvedCount })}
        {onSeeFindings && (
          <button type="button" className="since-baseline__link" onClick={onSeeFindings}>{t('sinceBaseline.seeFindings')}</button>
        )}
      </p>
    </>
  );
}

/**
 * @param {{since: Object|null, selectedRun: Object|null, availableRuns: Array, onSeeFindings?: Function}} props
 */
export default function SinceBaselinePanel({ since, selectedRun, availableRuns, onSeeFindings }) {
  if (!since) return null;
  return (
    <section className="since-baseline" aria-label={t('sinceBaseline.title')}>
      <div className="since-baseline__head">
        <span className="since-baseline__title">{t('sinceBaseline.title')}</span>
        {' · '}
        <span>{headerLine(since, selectedRun, availableRuns)}</span>
        {' · '}
        <span>{scopeLine(since)}</span>
      </div>
      {isUnchanged(since)
        ? <p className="since-baseline__empty">{t('sinceBaseline.empty', { date: runLabel(since.againstRunIds[0], availableRuns) })}</p>
        : <ChangeLines since={since} onSeeFindings={onSeeFindings} />}
    </section>
  );
}
