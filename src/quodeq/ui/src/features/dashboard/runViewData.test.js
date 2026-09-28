import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunViewData } from './runViewData.js';

test('buildRunViewData: an unloaded dashboard yields empty view data', () => {
  const view = buildRunViewData(undefined);
  assert.deepEqual(view.runTopFiles, []);
  assert.equal(view.runSummary.totalViolations, 0);
  assert.equal(view.since, null);
  assert.equal(typeof view.headline, 'object');
});

test('buildRunViewData: worst files carry the joined dimension names', () => {
  const dashboard = {
    dimensions: [
      { dimension: 'security', violations: [{ file: 'a.py', severity: 'major' }] },
      { dimension: 'maintainability', violations: [{ file: 'a.py', severity: 'minor' }] },
    ],
  };
  const view = buildRunViewData(dashboard);
  assert.equal(view.runTopFiles.length, 1);
  assert.equal(view.runTopFiles[0].file, 'a.py');
  assert.equal(view.runTopFiles[0].dimensionsStr, 'maintainability, security');
  assert.equal(view.runSummary.dimensionCount, 2);
});
