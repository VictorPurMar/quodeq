/**
 * The headline numbers of a run or of the accumulated view: majors, open
 * requirement types, density and coverage, summed over dimensions; and the
 * since-baseline summary folded across dimensions.
 *
 * Density is violations per 100 files read, summed over dimensions (sum of
 * violations over sum of files read), which the hint says in words.
 */

export const SCOPE_CHANGED = 'changed-files';
export const SCOPE_ALL = 'all';
export const SCOPE_MIXED = 'mixed';

const PER_FILES = 100; // density is violations per 100 files read
const PCT = 100;       // coverage is a percentage

/** Distinct requirement codes with an active finding in one dimension. */
export function dimensionOpenTypes(d) {
  if (typeof d?.openTypes === 'number') return d.openTypes;
  return new Set((d?.violations || []).map((v) => v.req).filter(Boolean)).size;
}

function severityOf(d) {
  return d?.totals?.severity || {};
}

function sumField(dimensions, pick) {
  return dimensions.reduce((acc, d) => acc + (Number(pick(d)) || 0), 0);
}

/**
 * @param {Array} dimensions
 * @returns {{majors: number, critical: number, openTypes: number, violations: number,
 *   filesRead: number, sourceFileCount: number, density: number|null, coveragePct: number|null}}
 */
export function buildHeadline(dimensions) {
  const dims = dimensions || [];
  const critical = sumField(dims, (d) => severityOf(d).critical);
  const majors = critical + sumField(dims, (d) => severityOf(d).major);
  const violations = sumField(dims, (d) => d?.totals?.violationCount);
  const filesRead = sumField(dims, (d) => d?.filesRead);
  const sourceFileCount = sumField(dims, (d) => d?.sourceFileCount);
  return {
    majors,
    critical,
    openTypes: sumField(dims, dimensionOpenTypes),
    violations,
    filesRead,
    sourceFileCount,
    density: filesRead > 0 ? (violations / filesRead) * PER_FILES : null,
    coveragePct: sourceFileCount > 0 ? Math.round((filesRead / sourceFileCount) * PCT) : null,
  };
}

/** One decimal, or "-" when there is no density. */
export function formatDensity(density) {
  return density === null || density === undefined ? '-' : density.toFixed(1);
}

function unique(values) {
  return [...new Set(values)];
}

function foldScope(entries) {
  const scopes = unique(entries.map((e) => e.sinceBaseline?.scope));
  if (unique(entries.map((e) => e.againstRunId)).length > 1) return SCOPE_MIXED;
  return scopes.includes(SCOPE_ALL) || scopes.length !== 1 ? SCOPE_ALL : scopes[0];
}

/** The block one dimension contributes under the folded scope: the scoped
 * block when every dimension is scoped to the same changed files, else the
 * whole-run block (whose counts fall back to the scoped ones when absent). */
function blockFor(entry, scope) {
  if (scope === SCOPE_CHANGED) return entry.sinceBaseline;
  return { ...entry.all, counts: entry.all?.counts || entry.sinceBaseline.counts };
}

/**
 * Fold the dashboard's per-dimension since-baseline map into one summary.
 * Dimensions with no baseline run (a first run, a dimension new to the
 * project) are not a baseline and are left out; with none left there is no
 * summary. Every number comes from one block per dimension, chosen by the
 * folded scope, so a headline never mixes scopes inside one number.
 * @returns {null|Object}
 */
export function sumSinceBaseline(sinceBaseline) {
  const entries = Object.values(sinceBaseline || {}).filter((e) => e && e.sinceBaseline && e.againstRunId);
  if (entries.length === 0) return null;
  const scope = foldScope(entries);
  const blocks = entries.map((e) => blockFor(e, scope));
  const changed = entries.map((e) => e.sinceBaseline.changedFiles);
  return {
    majorsDelta: blocks.reduce((acc, b) => acc + (b.majorsDelta || 0), 0),
    typesClosed: unique(blocks.flatMap((b) => b.types?.closed || [])),
    typesOpened: unique(blocks.flatMap((b) => b.types?.opened || [])),
    newCount: blocks.reduce((acc, b) => acc + (b.counts?.new || 0), 0),
    resolvedCount: blocks.reduce((acc, b) => acc + (b.counts?.resolved || 0), 0),
    scope,
    changedFiles: scope === SCOPE_CHANGED ? Math.max(...changed.map((c) => c || 0)) : null,
    againstRunIds: unique(entries.map((e) => e.againstRunId)),
    againstCommitShas: unique(entries.map((e) => e.againstCommitSha).filter(Boolean)),
  };
}

/** True when a folded since-baseline summary says the tree did not move:
 * changed-files scope, no files changed, nothing closed, opened, or shifted. */
export function isUnchangedSince(since) {
  return since.scope === SCOPE_CHANGED && since.changedFiles === 0 && since.majorsDelta === 0
    && since.typesClosed.length === 0 && since.typesOpened.length === 0;
}

/** The map restricted to the named dimensions (case-insensitive), so a
 * headline over visible dimensions never counts a hidden one. */
export function filterSinceBaseline(sinceBaseline, dimensionNames) {
  const wanted = new Set((dimensionNames || []).map((n) => String(n).toLowerCase()));
  return Object.fromEntries(Object.entries(sinceBaseline || {}).filter(([k]) => wanted.has(k.toLowerCase())));
}

/**
 * One dimension's entry, only when the page shows the run the summary
 * describes; any other run (an older one, another project's) gets none.
 * @param {Object|undefined} sinceBaseline the dashboard map
 * @param {string} dimension
 * @param {{runId: string|undefined, baselineRunId: string|undefined}} ids
 */
export function sinceBaselineFor(sinceBaseline, dimension, { runId, baselineRunId }) {
  if (!sinceBaseline || !runId || runId !== baselineRunId) return undefined;
  const key = Object.keys(sinceBaseline).find((k) => k.toLowerCase() === String(dimension).toLowerCase());
  return key ? sinceBaseline[key] : undefined;
}

/**
 * One dimension as `buildHeadline` expects it, from what the dimension page
 * holds: its own violation list, severity counts and the eval report's file
 * counts.
 */
export function dimensionHeadlineInput(allViolations, severity, evalData) {
  return {
    totals: { violationCount: (allViolations || []).length, severity: severity || {} },
    violations: allViolations || [],
    filesRead: evalData?.filesRead,
    sourceFileCount: evalData?.sourceFileCount,
  };
}

function isNumber(v) {
  return typeof v === 'number';
}

function sumDetail(details, field) {
  const values = details.map((d) => d?.[field]).filter(isNumber);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
}

function countOf(entry, details, field) {
  return sumDetail(details, field) ?? (isNumber(entry?.[field]) ? entry[field] : null);
}

/**
 * A trend row's criticals, majors and open types over the dimensions it
 * carries: the per-dimension details (which the visible-standards filter
 * keeps in step), else the row's own totals, else null.
 * @returns {{critical: number|null, majors: number|null, openTypes: number|null}}
 */
export function runCounts(entry) {
  const details = entry?.dimensionDetails || [];
  return {
    critical: countOf(entry, details, 'critical'),
    majors: countOf(entry, details, 'majors'),
    openTypes: countOf(entry, details, 'openTypes'),
  };
}
