/**
 * The four headline tiles both Overview heroes show, and the footer line
 * that keeps the raw totals. MAJORS and OPEN TYPES carry the since-baseline
 * hints; DENSITY carries coverage. The footer is where "violations" lives.
 */
import { Stat } from '../../../components/terminal/index.js';
import TrendBadge from '../../../components/TrendBadge.jsx';
import SeverityBadgeRow from './SeverityBadgeRow.jsx';
import { formatDensity } from '../headlineStats.js';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';

function MajorsStat({ headline, since }) {
  const delta = since ? since.majorsDelta : null;
  return (
    <Stat
      label={t('overview.statMajors')}
      value={headline.majors}
      trailing={delta === null ? null : <TrendBadge delta={String(delta)} invert />}
      hint={t(pluralKey(headline.critical, 'overview.majorsHintCriticalOne', 'overview.majorsHintCritical'), { count: headline.critical })}
      tone={headline.critical > 0 ? 'critical' : 'default'}
    />
  );
}

function OpenTypesStat({ headline, since, baselineDate }) {
  const closed = since ? since.typesClosed.length : 0;
  let hint = null;
  if (closed > 0) hint = t(pluralKey(closed, 'overview.openTypesClosedOne', 'overview.openTypesClosed'), { count: closed });
  else if (since && baselineDate) hint = t('overview.openTypesSince', { date: baselineDate });
  return <Stat label={t('overview.statOpenTypes')} value={headline.openTypes} hint={hint} />;
}

function DensityStat({ headline }) {
  const hint = headline.coveragePct === null
    ? t('overview.densityHintNoCoverage')
    : t('overview.densityHint', { coverage: headline.coveragePct });
  return (
    <Stat
      label={t('overview.statDensity')}
      value={formatDensity(headline.density)}
      trailing={headline.density === null ? null : <span className="term-stat__unit">{t('overview.densityUnit')}</span>}
      hint={hint}
    />
  );
}

function FooterButton({ label, value, onClick, ariaKey }) {
  return (
    <button type="button" className="headline-footer__item headline-footer__item--button" onClick={onClick} disabled={!onClick} aria-label={t(ariaKey)}>
      <span className="headline-footer__label">{label}</span> {value}
    </button>
  );
}

/** The raw totals under the tiles: compliance, ratio, violations with the
 * severity badges, and the suppressed note when triage hid findings. */
export function HeadlineFooter({ footer }) {
  const { violations, compliance, ratio, severity, suppressed } = footer;
  return (
    <div className="headline-footer">
      <FooterButton label={t('overview.statCompliance')} value={compliance} onClick={footer.handleCompliance} ariaKey={footer.complianceAriaKey} />
      <span className="headline-footer__item"><span className="headline-footer__label">{t('overview.statRatio')}</span> {ratio}</span>
      <FooterButton label={t('overview.statViolations')} value={violations} onClick={footer.handleViolations} ariaKey={footer.violationsAriaKey} />
      <SeverityBadgeRow severity={severity} onSeverityClick={footer.handleSeverity} />
      {suppressed > 0 && <span className="term-stat__suppressed-note">{t('overview.runSuppressed', { count: suppressed })}</span>}
    </div>
  );
}

/**
 * The four tiles. The footer is a sibling (`HeadlineFooter`), rendered by
 * the panel under the strip, so the tile grid stays four wide.
 * @param {{headline: Object, since: Object|null, baselineDate?: string|null,
 *   score: {display: string, hint?: string|null, trailing?: import('react').ReactNode}}} props
 */
export default function HeadlineStatStrip({ headline, since, baselineDate = null, score }) {
  return (
    <>
      <MajorsStat headline={headline} since={since} />
      <OpenTypesStat headline={headline} since={since} baselineDate={baselineDate} />
      <Stat label={t('overview.statScore')} value={score.display} hint={score.hint ?? null} trailing={score.trailing ?? null} />
      <DensityStat headline={headline} />
    </>
  );
}
