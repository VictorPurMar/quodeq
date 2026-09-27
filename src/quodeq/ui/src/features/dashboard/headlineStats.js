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

/**
 * Fold the dashboard's per-dimension since-baseline map into one summary.
 * Types and the majors delta come from the whole run (`all`), the new and
 * resolved counts from the scoped block, so a headline never mixes scopes
 * inside one number.
 * @returns {null|Object}
 */
export function sumSinceBaseline(sinceBaseline) {
  const entries = Object.values(sinceBaseline || {}).filter((e) => e && e.sinceBaseline);
  if (entries.length === 0) return null;
  const scope = foldScope(entries);
  const changed = entries.map((e) => e.sinceBaseline.changedFiles);
  return {
    majorsDelta: entries.reduce((acc, e) => acc + (e.all?.majorsDelta || 0), 0),
    typesClosed: unique(entries.flatMap((e) => e.all?.types?.closed || [])),
    typesOpened: unique(entries.flatMap((e) => e.all?.types?.opened || [])),
    newCount: entries.reduce((acc, e) => acc + (e.sinceBaseline.counts?.new || 0), 0),
    resolvedCount: entries.reduce((acc, e) => acc + (e.sinceBaseline.counts?.resolved || 0), 0),
    scope,
    changedFiles: scope === SCOPE_CHANGED ? Math.max(...changed.map((c) => c || 0)) : null,
    againstRunIds: unique(entries.map((e) => e.againstRunId).filter(Boolean)),
    againstCommitShas: unique(entries.map((e) => e.againstCommitSha).filter(Boolean)),
  };
}
