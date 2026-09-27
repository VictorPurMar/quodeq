import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complianceRatio } from './textFormatting.js';

test('complianceRatio reads violations : compliance to one decimal', () => {
  assert.equal(complianceRatio(2177, 1922), '1:0.9');
  assert.equal(complianceRatio(3, 4), '1:1.3');
});

test('complianceRatio trims a whole-number ratio', () => {
  assert.equal(complianceRatio(100, 500), '1:5');
  assert.equal(complianceRatio(4, 4), '1:1');
});

test('complianceRatio without violations keeps the placeholder', () => {
  assert.equal(complianceRatio(0, 5), '—');
});
