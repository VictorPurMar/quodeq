import { t } from '../../../strings/index.js';

function isCount(v) {
  return typeof v === 'number';
}

function countsKey(entry, runLabel) {
  const hasCritical = isCount(entry.critical);
  if (runLabel) return hasCritical ? 'history.tooltipCountsRun' : 'history.tooltipCountsRunNoCritical';
  return hasCritical ? 'history.tooltipCounts' : 'history.tooltipCountsNoCritical';
}

/**
 * The tooltip line naming a point's criticals, majors and open types, when
 * it has them (rows served before criticals were counted name the other
 * two). With `runLabel` the line names the run the counts belong to, for
 * charts whose score is a project grade rather than that run's.
 */
export function countsLine(entry, { runLabel } = {}) {
  const { critical, majors, openTypes } = entry;
  if (!isCount(majors) || !isCount(openTypes)) return null;
  const text = t(countsKey(entry, runLabel), { date: runLabel, critical, majors, openTypes });
  return <span className="rht-counts">{text}</span>;
}
