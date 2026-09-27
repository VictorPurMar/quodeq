import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineDateLabel, sinceLineParts } from './sinceLine.js';

const runs = [{ runId: 'r1', dateLabel: '27 Sep' }, { runId: 'r0', dateLabel: '26 Sep' }];
const selected = { runId: 'r1', dateLabel: '27 Sep' };
const since = (over = {}) => ({ majorsDelta: -3, typesClosed: ['A'], typesOpened: [], newCount: 25, resolvedCount: 53, scope: 'changed-files', changedFiles: 89, againstRunIds: ['r0'], againstCommitShas: ['abc'], ...over });

test('baselineDateLabel names the baseline run, null when mixed or absent', () => {
  assert.equal(baselineDateLabel(since(), runs), '26 Sep');
  assert.equal(baselineDateLabel(since({ scope: 'mixed', againstRunIds: ['r0', 'rX'] }), runs), null);
  assert.equal(baselineDateLabel(null, runs), null);
});

test('sinceLineParts: changed-files scope', () => {
  const p = sinceLineParts(since(), selected, runs);
  assert.deepEqual([p.date, p.scope, p.newLabel, p.newCount, p.resolvedCount, p.unchanged], ['26 Sep', '89 files changed', 'new in changed files', 25, 53, false]);
});

test('sinceLineParts: all-files and mixed scopes name their reason', () => {
  assert.equal(sinceLineParts(since({ scope: 'all', changedFiles: null }), selected, runs).scope, 'in all files (no commit recorded or the tree had uncommitted changes)');
  const mixed = sinceLineParts(since({ scope: 'mixed', changedFiles: null, againstRunIds: ['r0', 'rX'] }), selected, runs);
  assert.equal(mixed.date, 'against 2 baseline runs');
  assert.equal(mixed.scope, 'in all files (baselines differ per dimension)');
  assert.equal(mixed.newLabel, 'new in all files');
});

test('sinceLineParts: unchanged tree and no baseline', () => {
  assert.equal(sinceLineParts(since({ majorsDelta: 0, typesClosed: [], typesOpened: [], newCount: 0, resolvedCount: 0, changedFiles: 0 }), selected, runs).unchanged, true);
  assert.equal(sinceLineParts(null, selected, runs), null);
});
