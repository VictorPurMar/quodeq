import { useEffect, useMemo } from 'react';
import { ReportContent } from '../../side-pane/index.js';
import { buildOverviewReport } from '../../../utils/reportBuilder.js';
import { useHydratedFindings } from '../../explorer/hooks/useHydratedCompliance.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';
import { SEVERITY } from '../../../vocab/severity.js';

// The report prints critical and major violations with their reason and
// snippet (utils/reportBuilder/dimensionSummary.js); /scores defers those
// fields, so only those rows are hydrated.
const PRINTED_SEVERITIES = new Set([SEVERITY.CRITICAL, SEVERITY.MAJOR]);

const identity = (v) => [v.file, v.line, v.endLine, v.principle, v.title].join('\u0000');

function printedViolations(dimensions) {
  return (dimensions || []).flatMap((dim) => (dim.violations || []).filter((v) => PRINTED_SEVERITIES.has(v.severity)));
}

/**
 * The dimensions with each printed violation replaced by its hydrated
 * counterpart (matched by finding identity); other rows and every other
 * field are left as they are.
 * @param {Array} dimensions
 * @param {Array} hydrated
 * @returns {Array}
 */
export function hydrateReportDimensions(dimensions, hydrated) {
  const byIdentity = new Map(hydrated.map((v) => [identity(v), v]));
  return (dimensions || []).map((dim) => ({
    ...dim,
    violations: (dim.violations || []).map((v) => byIdentity.get(identity(v)) ?? v),
  }));
}

/**
 * The Overview report's body: hydrates the printed violations, builds the
 * Markdown, keeps it in *markdownRef* for the pane's copy and download
 * actions, and renders it.
 */
export function OverviewReportContent({ accumulated, dimensions, projectName, extras, markdownRef }) {
  const printed = useMemo(() => printedViolations(dimensions), [dimensions]);
  const hydrated = useHydratedFindings(printed, FINDING_TYPE.VIOLATION);
  const markdown = useMemo(
    () => buildOverviewReport(accumulated, hydrateReportDimensions(dimensions, hydrated), projectName, extras),
    [accumulated, dimensions, hydrated, projectName, extras],
  );
  useEffect(() => {
    if (markdownRef) markdownRef.current = markdown;
  }, [markdown, markdownRef]);
  return <ReportContent markdown={markdown} />;
}
