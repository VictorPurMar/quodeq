import { describe, it, expect } from 'vitest';
import { nextSelectedRunAfterDelete } from './runDeletion.js';
import { LATEST_RUN_ID } from '../constants.js';

describe('nextSelectedRunAfterDelete', () => {
  it('resets to latest when the deleted run was selected', () => {
    expect(nextSelectedRunAfterDelete('run-B', 'run-B')).toBe(LATEST_RUN_ID);
  });
  it('keeps the selection otherwise', () => {
    expect(nextSelectedRunAfterDelete('run-A', 'run-B')).toBe('run-A');
    expect(nextSelectedRunAfterDelete(LATEST_RUN_ID, 'run-B')).toBe(LATEST_RUN_ID);
  });
});
