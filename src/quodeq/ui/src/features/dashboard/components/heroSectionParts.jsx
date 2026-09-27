/**
 * The pieces the two Overview hero strips share.
 *
 * The accumulated (project) hero and the run hero show the same four tiles
 * and footer in the same panel, and differ only in the score hint and the
 * header above them. What is common lives here.
 */
import { StatStrip } from '../../../components/terminal/index.js';
import { HERO_CARD_KIND } from '../dashboardVocab.js';

/**
 * The hero panel: the section, its header row and the stat strip inside it.
 */
export function HeroPanel({ header, footer = null, children }) {
  return (
    <section className="acc-eval-panel acc-eval-panel--terminal">
      <div className="acc-eval-panel__top">{header}</div>
      <StatStrip cards>{children}</StatStrip>
      {footer}
    </section>
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
