import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeadline, dimensionOpenTypes, formatDensity, sumSinceBaseline, SCOPE_ALL, SCOPE_CHANGED, SCOPE_MIXED } from './headlineStats.js';

const dim = (over = {}) => ({
  dimension: 'maintainability',
  totals: { violationCount: 10, complianceCount: 20, severity: { critical: 1, major: 2, minor: 7 } },
  violations: [{ req: 'M-A-1' }, { req: 'M-A-1' }, { req: 'M-B-2' }, {}],
  filesRead: 40, sourceFileCount: 50,
  ...over,
});

test('dimensionOpenTypes prefers the backend count, else distinct req', () => {
  assert.equal(dimensionOpenTypes(dim({ openTypes: 5 })), 5);
  assert.equal(dimensionOpenTypes(dim()), 2);
  assert.equal(dimensionOpenTypes({}), 0);
});

test('buildHeadline sums majors, open types, density and coverage over dimensions', () => {
  const h = buildHeadline([dim(), dim({ dimension: 'security', filesRead: 10, sourceFileCount: 50, totals: { violationCount: 2, complianceCount: 0, severity: { critical: 0, major: 0, minor: 2 } }, violations: [{ req: 'S-1' }] })]);
  assert.equal(h.majors, 3);
  assert.equal(h.critical, 1);
  assert.equal(h.openTypes, 3);
  assert.equal(h.violations, 12);
  assert.equal(h.filesRead, 50);
  assert.equal(h.sourceFileCount, 100);
  assert.equal(h.density, 24);        // 12 violations over 50 files read, per 100
  assert.equal(h.coveragePct, 50);
});

test('density is null when nothing was read', () => {
  const h = buildHeadline([dim({ filesRead: 0, sourceFileCount: 0 }), dim({ filesRead: undefined, sourceFileCount: undefined })]);
  assert.equal(h.density, null);
  assert.equal(h.coveragePct, null);
  assert.equal(formatDensity(h.density), '-');
  assert.equal(formatDensity(32.34), '32.3');
});

const entry = (over = {}) => ({
  againstRunId: 'r0', againstCommitSha: 'abc',
  sinceBaseline: { scope: SCOPE_CHANGED, changedFiles: 3, majorsDelta: -1, counts: { new: 2, resolved: 5 }, types: { closed: ['M-A-1'], opened: [] } },
  all: { majorsDelta: -2, types: { closed: ['M-A-1', 'M-C-3'], opened: ['M-D-4'] } },
  ...over,
});

test('sumSinceBaseline returns null on an empty payload', () => {
  assert.equal(sumSinceBaseline({}), null);
  assert.equal(sumSinceBaseline(undefined), null);
});

test('sumSinceBaseline sums the scoped counts and takes types and majors from the whole run', () => {
  const s = sumSinceBaseline({ maintainability: entry(), security: entry({ againstRunId: 'r0', all: { majorsDelta: 1, types: { closed: [], opened: ['S-9'] } } }) });
  assert.equal(s.majorsDelta, -1);
  assert.deepEqual(s.typesClosed, ['M-A-1', 'M-C-3']);
  assert.deepEqual(s.typesOpened, ['M-D-4', 'S-9']);
  assert.equal(s.newCount, 4);
  assert.equal(s.resolvedCount, 10);
  assert.equal(s.scope, SCOPE_CHANGED);
  assert.equal(s.changedFiles, 3);
  assert.deepEqual(s.againstRunIds, ['r0']);
});

test('any dimension scoped to all files makes the summary all-files', () => {
  const s = sumSinceBaseline({ a: entry(), b: entry({ sinceBaseline: { ...entry().sinceBaseline, scope: SCOPE_ALL, changedFiles: null } }) });
  assert.equal(s.scope, SCOPE_ALL);
  assert.equal(s.changedFiles, null);
});

test('mixed baselines are reported, not hidden', () => {
  const s = sumSinceBaseline({ a: entry(), b: entry({ againstRunId: 'r1', againstCommitSha: 'def' }) });
  assert.deepEqual(s.againstRunIds, ['r0', 'r1']);
  assert.equal(s.scope, SCOPE_MIXED);
});
