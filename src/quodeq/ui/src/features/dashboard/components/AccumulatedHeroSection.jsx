import TrendBadge from '../../../components/TrendBadge.jsx';
import { gradeLetter, complianceRatio, extDisplayName } from '../../../utils/formatters.js';
import { formatScoreDisplay } from '../../../utils/gradeFormatting.js';
import { TermHeader } from '../../../components/terminal/index.js';
import { HeroPanel, heroCardHandlers } from './heroSectionParts.jsx';
import HeadlineStatStrip, { HeadlineFooter } from './HeadlineStatStrip.jsx';
import { buildHeadline, sumSinceBaseline } from '../headlineStats.js';
import LastFetchedLine from '../../../components/LastFetchedLine.jsx';
import SharedReadOnlyBadge from '../../../components/SharedReadOnlyBadge.jsx';
import { t } from '../../../strings/index.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

const MAX_LANGS_IN_SUB = 5;

function buildLanguageSub(projectInfo) {
  const stats = projectInfo?.languageStats;
  if (!stats) return null;
  const sorted = Object.entries(stats).sort(([, a], [, b]) => b - a).slice(0, MAX_LANGS_IN_SUB);
  if (sorted.length === 0) return null;
  return sorted
    .map(([lang, count]) => `${count} ${extDisplayName(lang).toLowerCase()}`)
    .join('  ');
}

/** The footer's raw totals, read off the accumulated summary. */
function accumulatedFooter(summary, handlers) {
  const violations = summary?.totalViolations || 0;
  const compliance = summary?.totalCompliance || 0;
  return {
    violations, compliance, ratio: complianceRatio(violations, compliance), severity: summary?.severity, suppressed: 0,
    ...handlers, violationsAriaKey: 'overview.showAllViolationsAria', complianceAriaKey: 'overview.showComplianceAria',
  };
}

/** The SCORE tile's parts: the number, its delta badge and the grade hint. */
function accumulatedScore(summary, scoreDelta, customFormula) {
  const grade = summary?.overallGrade;
  return {
    display: formatScoreDisplay(summary?.numericAverage),
    trailing: scoreDelta !== null ? <TrendBadge delta={scoreDelta} showLabel={false} /> : null,
    // A tuned formula shifts every score at once with no other trace, so
    // say so where the grade is read rather than only on the settings
    // page that changed it.
    hint: grade ? t(customFormula ? 'overview.gradeHintCustomFormula' : 'overview.gradeHint', { letter: gradeLetter(grade) }) : null,
  };
}

/** Sub-line under the term header: the language mix, else the last run date. */
function heroSubLine(projectInfo, lastDate) {
  return buildLanguageSub(projectInfo)
    || (lastDate ? t('overview.lastEvaluated', { date: lastDate }) : null);
}

export function AccumulatedHeroSection({ accumulated, sinceBaseline, baselineDate = null, scoreDelta, lastDate, projectInfo, onCardNavigate, selectedSource, customFormula = false }) {
  const summary = accumulated?.summary;
  const handlers = heroCardHandlers(onCardNavigate, { violations: summary?.totalViolations || 0, compliance: summary?.totalCompliance || 0 });
  const footer = accumulatedFooter(summary, handlers);

  return (
    <HeroPanel
      header={<>
        <TermHeader
          name={t('overview.termName')}
          sub={heroSubLine(projectInfo, lastDate)}
          badge={selectedSource === PROJECT_SOURCE.SHARED ? <SharedReadOnlyBadge publishedBy={projectInfo?.publishedBy} /> : null}
        />
        <LastFetchedLine lastFetchedAt={projectInfo?.lastFetchedAt} />
      </>}
      footer={<HeadlineFooter footer={footer} />}
    >
      <HeadlineStatStrip
        headline={buildHeadline(accumulated?.dimensions)}
        since={sumSinceBaseline(sinceBaseline)}
        baselineDate={baselineDate}
        score={accumulatedScore(summary, scoreDelta, customFormula)}
      />
    </HeroPanel>
  );
}
