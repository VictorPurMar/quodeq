import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainRows } from './gradeExplainRows.js';

const stages = { types: { critical: 0, major: 1, minor: 3 }, complianceTypes: 4, weightedViolations: 2.25, base: 7.87, lift: 0.36, raw: 8.64, ceiling: 9.16, floor: 5, final: 8.6, grade: 'Good' };
const params = { severityWeight: { critical: 4, major: 1.5, minor: 0.25 }, baseK: 0.12, liftCompress: 1.8, ceilScale: 0.5, floorMinor: 8, floorMajor: 5, gradeThresholds: [[9, 'Exemplary'], [7, 'Good']] };

test('explainRows lists the stages in scoring order with the parameter that moves each', () => {
  const rows = explainRows(stages, params);
  assert.deepEqual(rows.map((r) => r.key), ['types', 'base', 'lift', 'raw', 'ceiling', 'floor', 'final']);
  assert.equal(rows[0].paramValue, '4 / 1.5 / 0.25');
  assert.equal(rows[1].paramValue, '0.12');
  assert.equal(rows[1].value, '7.9');
  assert.equal(rows[3].param, null);
  assert.equal(rows[5].paramValue, '8 / 5');
  assert.equal(rows[6].paramValue, '9 / 7');
  assert.equal(rows[6].value, '8.6 Good');
});
