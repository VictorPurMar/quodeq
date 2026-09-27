import { complianceRatio } from '../../../utils/formatters.js';
import { formatScoreDisplay } from '../../../utils/gradeFormatting.js';
import StatGrid2x2 from './StatGrid2x2.jsx';
import DimensionScoreHistoryPanel from './DimensionScoreHistoryPanel.jsx';
import HeadlineStatStrip, { HeadlineFooter } from '../../dashboard/components/HeadlineStatStrip.jsx';
import { buildHeadline, sumSinceBaseline } from '../../dashboard/headlineStats.js';
import { t } from '../../../strings/index.js';
import { HERO_CARD_KIND } from '../../dashboard/dashboardVocab.js';

/** One dimension as the headline math expects it: counts from the page's
 * own violation list, files from the eval report. */
function asHeadlineDimension(allViolations, sev, evalData) {
  return {
    totals: { violationCount: allViolations.length, severity: sev },
    violations: allViolations,
    filesRead: evalData?.filesRead,
    sourceFileCount: evalData?.sourceFileCount,
  };
}

function footerFor({ allViolations, totalCompliant, sev, onNavigate, onCardNavigate, onSeverityBadge }) {
  const violations = allViolations.length;
  return {
    violations, compliance: totalCompliant, ratio: complianceRatio(violations, totalCompliant), severity: sev, suppressed: 0,
    handleViolations: onNavigate && violations > 0 ? () => onCardNavigate(HERO_CARD_KIND.VIOLATIONS) : undefined,
    handleCompliance: onNavigate && totalCompliant > 0 ? () => onCardNavigate(HERO_CARD_KIND.COMPLIANCE) : undefined,
    handleSeverity: onNavigate ? (level) => onSeverityBadge(level)() : undefined,
    violationsAriaKey: 'overview.showAllViolationsAria', complianceAriaKey: 'overview.showComplianceAria',
  };
}

/** The majors/open types/score/density grid, the totals footer and the
 * run-history bar chart: the left column of the dimension page's top grid. */
export default function ExplorerStatsPanel({
  overallScoreNum, overallGrade, allViolations, totalCompliant, sev, evalData, sinceBaseline, onSeverityBadge,
  onNavigate, onCardNavigate, trend, dimension, activeRunId, granularity, onGranularityChange, onBarClick,
}) {
  const headline = buildHeadline([asHeadlineDimension(allViolations, sev, evalData)]);
  const since = sinceBaseline ? sumSinceBaseline({ [dimension]: sinceBaseline }) : null;
  return (
    <div className="qd-top-left">
      <StatGrid2x2>
        <HeadlineStatStrip
          headline={headline}
          since={since}
          score={{ display: formatScoreDisplay(overallScoreNum), hint: overallGrade?.grade ? t('overview.gradeHint', { letter: overallGrade.grade }) : null }}
        />
      </StatGrid2x2>
      <HeadlineFooter footer={footerFor({ allViolations, totalCompliant, sev, onNavigate, onCardNavigate, onSeverityBadge })} />
      <DimensionScoreHistoryPanel
        trend={trend} dimension={dimension} selectedRunId={activeRunId}
        granularity={granularity} onGranularityChange={onGranularityChange} onBarClick={onBarClick}
      />
    </div>
  );
}
