import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboard } from './dashboard.js';

test('createDashboard keeps sinceBaseline', () => {
  const since = { maintainability: { againstRunId: 'r0', all: { majorsDelta: -1, types: { closed: [], opened: [] } } } };
  const out = createDashboard({ dimensions: [], trend: [], sinceBaseline: since });
  assert.deepEqual(out.sinceBaseline, since);
});

test('createDashboard defaults sinceBaseline to an empty object', () => {
  assert.deepEqual(createDashboard({ dimensions: [], trend: [] }).sinceBaseline, {});
});
