/**
 * SevBadge — severity label rendered as a thin-outlined box using the theme's
 * `--color-sev-*` tokens.
 *
 * Formats:
 *   short  (default): CRIT, MAJ, MIN. Pair with `count` to get `CRIT 1`.
 *   long            : critical, major, minor (lowercase).
 *   count-abbr      : `1 crit`, `66 maj`, `161 min` — compact, count-first.
 *                     This is the layout used inside the VIOLATIONS stat
 *                     card on the overview.
 *
 * A `delta` (the change since a baseline run) renders after the label as
 * "▾83" or "▴1": down is good for a finding count, up is bad; zero and
 * null render nothing.
 *
 * @param {object} props
 * @param {'critical'|'major'|'minor'} props.level
 * @param {'short'|'long'|'count-abbr'} [props.format]
 * @param {number} [props.count]
 * @param {number|null} [props.delta]
 */
const SHORT = { critical: 'CRIT', major: 'MAJ', minor: 'MIN' };
const LONG = { critical: 'critical', major: 'major', minor: 'minor' };
const ABBR = { critical: 'crit', major: 'maj', minor: 'min' };
// `format` values (see the JSDoc above).
const FORMAT_SHORT = 'short';
const FORMAT_COUNT_ABBR = 'count-abbr';

const ARROW_DOWN = '\u25BE';
const ARROW_UP = '\u25B4';

function renderDelta(delta) {
  if (!delta) return null;
  const good = delta < 0;
  return (
    <span className={`term-sev-badge__delta term-sev-badge__delta--${good ? 'good' : 'bad'}`}>
      {good ? ARROW_DOWN : ARROW_UP}{Math.abs(delta)}
    </span>
  );
}

function renderSevBadgeElement({ className, content, onClick, ariaLabel, level }) {
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        aria-label={ariaLabel || `${level} severity`}
      >
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}

function renderCountAbbrBadge({ baseClass, level, count, delta, onClick, ariaLabel }) {
  const className = `${baseClass} term-sev-badge--count-abbr${onClick ? ' term-sev-badge--clickable' : ''}`;
  const content = (
    <>
      {count != null ? count : ''}
      {count != null ? ' ' : ''}
      {ABBR[level]}
      {renderDelta(delta)}
    </>
  );
  return renderSevBadgeElement({ className, content, onClick, ariaLabel, level });
}

function renderTextBadge({ baseClass, level, format, count, delta, onClick, ariaLabel }) {
  const text = format === FORMAT_SHORT ? SHORT[level] : LONG[level];
  const className = `${baseClass}${onClick ? ' term-sev-badge--clickable' : ''}`;
  const content = (
    <>
      {text}
      {count != null && <span className="term-sev-badge__count"> {count}</span>}
      {renderDelta(delta)}
    </>
  );
  return renderSevBadgeElement({ className, content, onClick, ariaLabel, level });
}

export default function SevBadge({ level, format = FORMAT_SHORT, count, delta = null, onClick, ariaLabel }) {
  if (!level || !(level in SHORT)) return null;

  const baseClass = `term-sev-badge term-sev-badge--${level}`;

  if (format === FORMAT_COUNT_ABBR) {
    return renderCountAbbrBadge({ baseClass, level, count, delta, onClick, ariaLabel });
  }

  return renderTextBadge({ baseClass, level, format, count, delta, onClick, ariaLabel });
}
