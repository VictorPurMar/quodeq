/**
 * useEvaluation's status/findings queries.
 *
 * Split out of useEvaluation.js (see that file's header for the hook's
 * overall data-flow doc). Moved verbatim: the SSE_ENABLED branches here are
 * unchanged from the pre-split version. queryFn/effect/grouping bodies are
 * additionally factored into named functions (still logic-identical) so
 * useEvaluationQueries itself clears the max-lines-per-function gate.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { NO_JOB_ID, evaluationKeys } from "../../../api/queryKeys.js";
import { SSE_ENABLED, findingsRefetchInterval } from "./useEvaluation.helpers.js";
import { createViolation } from "../../../models/violation.js";
import { JOB_STATUS } from "../../../vocab/jobStatus.js";

const JOB_POLL_MS = 1500;

// Under SSE the cache is filled by useRunEventStream; this queryFn is a
// no-op. Under polling, fetch every dimension's rows in one request
// and flatten them. One request instead of one per dimension: the
// per-dimension eval carries the whole report (principles, compliance,
// snippets) and on a 7-dimension run the poll held every browser
// connection and most of the API process for the whole 2 s tick.
async function fetchFindings(api, job) {
  if (SSE_ENABLED) return [];
  if (!job?.outputProject || !job?.outputRunId || !job?.dimensions?.length) {
    return [];
  }
  let body;
  try {
    body = await api.getLiveFindings(job.outputProject, job.outputRunId, job.dimensions);
  } catch (err) {
    // Tolerate a run whose files are not there yet during live polling,
    // but leave a diagnostic so a real fetch failure is visible.
    console.warn("Failed to fetch live findings:", err);
    return [];
  }
  // Iterate the job's own dimension order: the server's JSON keys come
  // back sorted, and the feed's tie order before any activity is this one.
  const byDim = body?.dimensions || {};
  return job.dimensions.flatMap((d) =>
    // Canonical fields merged ONTO the raw row, not substituted for it.
    // The backend calls a finding's principle `practiceId` while every
    // component reads `principle`, so the raw spread left the feed's rule
    // column blank and collapsed the row key to
    // `${dim}-${file}-undefined-${line}`. Merging rather than replacing
    // keeps wire-only fields the model does not model (confidence, and
    // the SSE frame's id/verdict) available to other readers.
    (byDim[d]?.violations || []).map((v) => ({ ...v, ...createViolation(v), dimension: d })),
  );
}

// One final fetch on the running->terminal edge: the last dimension's
// report usually lands between the final running poll and the terminal
// transition, and stopping cold would freeze the feed just short of it.
function useTerminalFindingsRefetch(jobId, isJobTerminal, refetchFindings) {
  const findingsSettledRef = useRef(false);
  useEffect(() => {
    if (!jobId || SSE_ENABLED) return;
    if (isJobTerminal && !findingsSettledRef.current) {
      findingsSettledRef.current = true;
      refetchFindings();
    } else if (!isJobTerminal) {
      findingsSettledRef.current = false;
    }
  }, [jobId, isJobTerminal, refetchFindings]);
}

// Group findings into the legacy { [dim]: [violations] } shape.
function groupFindingsByDimension(findings) {
  const liveViolations = {};
  for (const f of findings) {
    const dim = f.dimension || "_";
    (liveViolations[dim] ??= []).push(f);
  }
  return liveViolations;
}

/**
 * The job status and its findings, grouped by dimension.
 *
 * With SSE enabled the cache is fed by the event stream and these queries only
 * subscribe; otherwise they poll. Either way a terminal job gets one final
 * findings refetch, so the last results are never missed.
 *
 * @returns {{job: object|null, liveViolations: Record<string, object[]>}}
 */
export function useEvaluationQueries(api, jobId) {
  // --- Status (the "job" object) ---------------------------------------
  const statusQuery = useQuery({
    queryKey: evaluationKeys.status(jobId || NO_JOB_ID),
    queryFn: () => api.getEvaluation(jobId),
    enabled: !!jobId,
    staleTime: SSE_ENABLED ? Infinity : 0,
    refetchInterval: SSE_ENABLED ? false : JOB_POLL_MS,
  });

  const job = statusQuery.data || null;

  // --- Findings (a flat list, then grouped into liveViolations) --------
  const findingsQuery = useQuery({
    queryKey: evaluationKeys.findings(jobId || NO_JOB_ID),
    queryFn: () => fetchFindings(api, job),
    enabled: !!jobId && (SSE_ENABLED || !!job?.outputProject),
    staleTime: SSE_ENABLED ? Infinity : 0,
    refetchInterval: findingsRefetchInterval(job),
  });

  const isJobTerminal = !!job?.status && job.status !== JOB_STATUS.RUNNING;
  useTerminalFindingsRefetch(jobId, isJobTerminal, findingsQuery.refetch);

  const liveViolations = groupFindingsByDimension(findingsQuery.data || []);

  return { job, liveViolations };
}
