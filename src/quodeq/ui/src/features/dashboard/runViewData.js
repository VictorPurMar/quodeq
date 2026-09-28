import { buildTopOffendingFiles } from '../../utils/explorerUtils.js';
import { withDimensionsStr } from '../../utils/dimensionUtils.js';
import buildRunSummary from './buildRunSummary.js';
import { buildHeadline, sumSinceBaseline } from './headlineStats.js';

/**
 * Everything the run overview derives from the dashboard payload alone:
 * the summary, the since-baseline totals, the worst files and the headline.
 * Pure, so the panel memoizes one call on the dashboard identity.
 */
export function buildRunViewData(dashboard) {
  const dimensions = dashboard?.dimensions || [];
  return {
    runSummary: buildRunSummary(dashboard?.dimensions),
    since: sumSinceBaseline(dashboard?.sinceBaseline),
    runTopFiles: withDimensionsStr(buildTopOffendingFiles(dimensions)),
    headline: buildHeadline(dashboard?.dimensions),
  };
}
