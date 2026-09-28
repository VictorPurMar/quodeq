import { LATEST_RUN_ID } from '../constants.js';

/** The Overview's run selection after *runId* is deleted. */
export function nextSelectedRunAfterDelete(selectedRun, runId) {
  return selectedRun === runId ? LATEST_RUN_ID : selectedRun;
}
