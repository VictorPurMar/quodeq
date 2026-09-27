import { SevBadge } from '../../../components/terminal/index.js';

// Shared by AccumulatedHeroSection and RunHeroSection -- byte-identical
// markup/behavior in both, deduped into one component. `deltas` (from
// chipDeltas) puts the change since the baseline run on the critical and
// major chips; without it the chips read as plain counts.
export default function SeverityBadgeRow({ severity, onSeverityClick, deltas = null }) {
  const sev = severity || {};
  if (!(sev.critical || sev.major || sev.minor)) return null;
  const onClickFor = (level) => onSeverityClick ? () => onSeverityClick(level) : undefined;
  return (
    <span className="acc-eval-sev-row">
      {sev.critical > 0 && <SevBadge level="critical" count={sev.critical} delta={deltas?.critical} format="count-abbr" onClick={onClickFor('critical')} />}
      {sev.major > 0    && <SevBadge level="major"    count={sev.major}    delta={deltas?.major}    format="count-abbr" onClick={onClickFor('major')} />}
      {sev.minor > 0    && <SevBadge level="minor"    count={sev.minor}    format="count-abbr" onClick={onClickFor('minor')} />}
    </span>
  );
}
