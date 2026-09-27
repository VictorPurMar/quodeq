/**
 * The pieces the two Overview hero strips share.
 *
 * The accumulated (project) hero and the run hero show the same four stats in
 * the same panel, and differ only in the score hint, the violations note and
 * the header above them. What is common lives here.
 */
import { StatStrip, Stat } from '../../../components/terminal/index.js';
import { scoreColorClass } from '../../../utils/formatters.js';
import { t } from '../../../strings/index.js';
import { HERO_CARD_KIND } from '../dashboardVocab.js';

/**
 * The hero panel: the section, its header row and the stat strip inside it.
 */
export function HeroPanel({ header, children }) {
  return (
    <section className="acc-eval-panel acc-eval-panel--terminal">
      <div className="acc-eval-panel__top">{header}</div>
      <StatStrip cards>{children}</StatStrip>
    </section>
  );
}

/**
 * The two stats every hero strip ends with: the compliance count (clickable
 * when there is something to show) and the violations/compliance ratio.
 */
export function ComplianceAndRatioStats({ compliance, totalChecks, ratio, onCompliance, complianceAriaKey }) {
  return (
    <>
      <Stat
        label={t('overview.statCompliance')}
        value={compliance}
        hint={totalChecks > 0 ? t('overview.passingChecks', { count: totalChecks }) : null}
        onClick={onCompliance}
        ariaLabel={compliance > 0 ? t(complianceAriaKey) : undefined}
      />
      <Stat
        label={t('overview.statRatio')}
        value={ratio}
        hint={t('overview.ratioHint')}
      />
    </>
  );
}

/**
 * The card-navigation handlers a hero strip wires up. A handler is left
 * undefined where there is nothing to navigate to, which is what makes that
 * card unclickable.
 *
 * @param {((target: string) => void)|undefined} onCardNavigate
 * @param {{violations: number, compliance: number}} counts
 * @returns {{handleViolations: Function|undefined, handleCompliance: Function|undefined, handleSeverity: Function|undefined}}
 */
export function heroCardHandlers(onCardNavigate, { violations, compliance }) {
  return {
    handleViolations: onCardNavigate && violations > 0 ? () => onCardNavigate(HERO_CARD_KIND.VIOLATIONS) : undefined,
    handleCompliance: onCardNavigate && compliance > 0 ? () => onCardNavigate(HERO_CARD_KIND.COMPLIANCE) : undefined,
    handleSeverity: onCardNavigate ? (level) => onCardNavigate(level) : undefined,
  };
}

/**
 * The SCORE stat both heroes open with: the number, the grade chip and any
 * extra trailing accessory (the accumulated hero's trend badge).
 */
export function ScoreStat({ scoreDisplay, grade, extraTrailing = null, hint = null }) {
  return (
    <Stat
      label={t('overview.statScore')}
      value={scoreDisplay}
      trailing={<>{<GradeChip grade={grade} score={scoreDisplay} />}{extraTrailing}</>}
      hint={hint}
    />
  );
}

/**
 * The grade as a chip next to the score value (EXEMPLARY, GOOD, ...), coloured
 * like the score, so the grade is read at a glance rather than in a hint.
 * @param {{grade: string|null|undefined, score: number|string|null}} props
 */
export function GradeChip({ grade, score }) {
  if (!grade) return null;
  return <span className={`chip small ${scoreColorClass(parseFloat(score))}`}>{String(grade).toUpperCase()}</span>;
}
