/**
 * The convergence strip under the primary tiles: criticals, majors (with the
 * delta since the baseline), open types, density, and one since-baseline
 * line. Every number carries a "?" that says what it is. Nothing here ever
 * renders as a dash: a number that cannot be computed is a sentence.
 */
import HelpHint from '../../../components/HelpHint.jsx';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { formatDensity } from '../headlineStats.js';
import { sinceLineParts } from '../sinceLine.js';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { HELP_SECTION } from '../../../vocab/helpSection.js';

function StripItem({ label, value, tone, trailing, hint, help, onLearnMore }) {
  const learnMore = onLearnMore ? { label: t('helpHint.learnMore'), onClick: () => onLearnMore(HELP_SECTION.OVERVIEW) } : undefined;
  return (
    <span className="term-strip__item">
      <span className="term-strip__label">{label}</span>
      <span className={`term-strip__value${tone ? ` term-strip__value--${tone}` : ''}`}>{value}</span>
      {trailing}
      {hint && <span className="term-strip__hint">{hint}</span>}
      <HelpHint label={t('overview.hintAbout', { name: label })} learnMore={learnMore}>{help}</HelpHint>
    </span>
  );
}

function SinceLine({ since, selectedRun, availableRuns, onSeeFindings }) {
  const parts = sinceLineParts(since, selectedRun, availableRuns);
  if (!parts) return null;
  if (parts.unchanged) return <span className="term-strip__since">{t('sinceBaseline.unchanged', { date: parts.date })}</span>;
  return (
    <span className="term-strip__since">
      {t('sinceBaseline.line', { date: parts.date, scope: parts.scope })}
      {' · '}
      {t('sinceBaseline.newCount', { label: parts.newLabel, count: parts.newCount })}
      {' · '}
      {t('sinceBaseline.resolved', { count: parts.resolvedCount })}
      {onSeeFindings && (
        <button type="button" className="term-strip__link" onClick={onSeeFindings}>{t('sinceBaseline.seeFindings')}</button>
      )}
    </span>
  );
}

function DensityValue({ headline }) {
  if (headline.density === null || headline.density === undefined) return t('overview.densityMissing');
  return `${formatDensity(headline.density)} ${t('overview.densityPer100')}`;
}

/**
 * @param {{headline: Object, since: Object|null, selectedRun?: Object, availableRuns?: Array,
 *   onSeeFindings?: Function, onLearnMore?: Function, showSince?: boolean}} props
 */
export default function ConvergenceStrip({ headline, since, selectedRun, availableRuns, onSeeFindings, onLearnMore, showSince = true }) {
  const closed = since ? since.typesClosed.length : 0;
  const majorsOnly = headline.majors - headline.critical;
  return (
    <div className="term-strip" aria-label={t('overview.stripAria')}>
      <StripItem label={t('overview.statCritical')} value={headline.critical} tone={headline.critical > 0 ? 'critical' : undefined} help={t('overview.hintCritical')} onLearnMore={onLearnMore} />
      <StripItem
        label={t('overview.statMajors')} value={majorsOnly}
        trailing={since ? <TrendBadge delta={String(since.majorsDelta)} invert /> : null}
        help={t('overview.hintMajors')} onLearnMore={onLearnMore}
      />
      <StripItem
        label={t('overview.statOpenTypes')} value={headline.openTypes}
        hint={closed > 0 ? t(pluralKey(closed, 'overview.openTypesClosedOne', 'overview.openTypesClosed'), { count: closed }) : null}
        help={t('overview.hintOpenTypes')} onLearnMore={onLearnMore}
      />
      <StripItem label={t('overview.statDensity')} value={<DensityValue headline={headline} />} help={t('overview.hintDensity')} onLearnMore={onLearnMore} />
      {showSince && <SinceLine since={since} selectedRun={selectedRun} availableRuns={availableRuns} onSeeFindings={onSeeFindings} />}
    </div>
  );
}
