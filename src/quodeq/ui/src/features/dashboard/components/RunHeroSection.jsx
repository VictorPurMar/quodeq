import { TermHeader } from '../../../components/terminal/index.js';
import { HeroPanel, heroCardHandlers } from './heroSectionParts.jsx';
import HeadlineStatStrip, { HeadlineFooter } from './HeadlineStatStrip.jsx';
import { formatRunId, gradeLetter, complianceRatio } from '../../../utils/formatters.js';
import { formatScoreDisplay } from '../../../utils/gradeFormatting.js';
import { buildHeadline, sumSinceBaseline } from '../headlineStats.js';
import { t } from '../../../strings/index.js';

/** The run hero: the selected run's headline and its raw totals. */
export function RunHeroSection({ dashboard, selectedRunId, runSummary, onCardNavigate, baselineDate = null }) {
  const dateLabel = dashboard?.selectedRun?.dateLabel || formatRunId(selectedRunId);
  const violations = runSummary.totalViolations || 0;
  const compliance = runSummary.totalCompliance || 0;
  const handlers = heroCardHandlers(onCardNavigate, { violations, compliance });
  const footer = {
    violations, compliance, ratio: complianceRatio(violations, compliance),
    severity: runSummary.severity, suppressed: runSummary.suppressed || 0,
    ...handlers,
    violationsAriaKey: 'overview.showRunViolationsAria', complianceAriaKey: 'overview.showRunComplianceAria',
  };
  const grade = runSummary.overallGrade;
  return (
    <HeroPanel header={<TermHeader name={t('overview.termNameRun')} sub={dateLabel} />} footer={<HeadlineFooter footer={footer} />}>
      <HeadlineStatStrip
        headline={buildHeadline(dashboard?.dimensions)}
        since={sumSinceBaseline(dashboard?.sinceBaseline)}
        baselineDate={baselineDate}
        score={{ display: formatScoreDisplay(runSummary.numericAverage), hint: grade ? t('overview.gradeHint', { letter: gradeLetter(grade) }) : null }}
      />
    </HeroPanel>
  );
}
