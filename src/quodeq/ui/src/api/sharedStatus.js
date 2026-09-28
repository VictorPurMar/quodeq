/**
 * Shared repository config management — connect, disconnect, refresh,
 * and connection status.
 *
 * Timestamp units: the backend (services/shared_repo.py's published_meta and
 * last_synced_at) sends publishedAt/lastSynced as UNIX epoch SECONDS (git log
 * `%ct` is an int; st_mtime is a float) -- but every "N ago" consumer
 * (relativeTime in components/LastFetchedLine.jsx) expects milliseconds, same
 * as Date.now()/`new Date(ms)`. Converting seconds->ms is done once, here, at
 * the API-client boundary, so every consumer downstream always sees ms and
 * never has to know the wire units. Passing raw seconds through would render
 * as a 1970 date ("57 years ago") -- see epochSecondsToMs below.
 */

import { request } from './request.js';
import { MS_PER_SECOND } from '../utils/time.js';

/**
 * Convert a UNIX epoch-seconds timestamp (as sent by the backend) to
 * epoch-milliseconds (as expected by every "N ago" / relativeTime consumer).
 * Null/absent/0 all normalize to null -- there is no meaningful "N ago" for
 * an unset timestamp, and 0 never occurs as a real value here.
 * @param {number|null|undefined} seconds
 * @returns {number|null}
 */
export function epochSecondsToMs(seconds) {
  return typeof seconds === 'number' && seconds ? seconds * MS_PER_SECOND : null;
}

// ── Config Management ───────────────────────────────────────────────────────

/**
 * Get the shared repository connection status.
 * @returns {Promise<{configured: boolean, url: string|null, lastSynced: number|null, publish: Object}>}
 *   lastSynced is epoch-milliseconds (converted from the backend's epoch
 *   seconds; see epochSecondsToMs). `publish.finishedAt`, if present, is
 *   passed through unconverted (raw epoch seconds) -- no UI consumer currently
 *   formats it as a date.
 */
export async function getSharedStatus() {
  const data = await request('/shared/status');
  return {
    ...data,
    lastSynced: epochSecondsToMs(data?.lastSynced),
  };
}

// The connect job states GET /shared/status reports under `connect`
// (services/shared_connect_job.py's ConnectState).
const CONNECT_STATE = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
});

export const CONNECT_POLL_INTERVAL_MS = 1500;
// Matches the backend's git clone timeout, so the UI never gives up on a
// clone the server is still running.
export const CONNECT_DEADLINE_MS = 300000;
const CODE_CLONE_FAILED = 'CLONE_FAILED';
const CODE_CONNECT_FAILED = 'CONNECT_FAILED';
const CODE_CONNECT_TIMEOUT = 'CONNECT_TIMEOUT';
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;
const HTTP_GATEWAY_TIMEOUT = 504;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The Error a failed connect job rejects with, shaped like request()'s
 * (status, code, body) so apiErrorMessage() maps it the same way. A job that
 * left `running` without reaching `done` (e.g. the server restarted) counts
 * as a failure too.
 */
function connectError(connect) {
  const err = new Error(connect.error || 'Connect failed');
  err.status = connect.code === CODE_CLONE_FAILED ? HTTP_BAD_GATEWAY : HTTP_BAD_REQUEST;
  err.code = connect.code ?? CODE_CONNECT_FAILED;
  err.body = { error: connect.error, code: err.code };
  return err;
}

function connectTimeoutError() {
  const err = new Error('Timed out waiting for the shared repository to connect');
  err.status = HTTP_GATEWAY_TIMEOUT;
  err.code = CODE_CONNECT_TIMEOUT;
  err.body = { error: err.message, code: CODE_CONNECT_TIMEOUT };
  return err;
}

async function waitForConnect(url) {
  const deadline = Date.now() + CONNECT_DEADLINE_MS;
  while (Date.now() < deadline) {
    await wait(CONNECT_POLL_INTERVAL_MS);
    const { connect } = await getSharedStatus();
    if (connect?.state === CONNECT_STATE.RUNNING) continue;
    if (connect?.state !== CONNECT_STATE.DONE) throw connectError(connect ?? {});
    return { configured: true, url: connect.url || url };
  }
  throw connectTimeoutError();
}

/**
 * Connect to a shared repository.
 *
 * The server clones in a background job: PUT answers 202 {started: true} and
 * the outcome appears under `connect` in /shared/status. This polls until the
 * job leaves `running`, so the returned promise stays pending for the whole
 * clone and rejects with the job's error code on failure.
 * @param {string} url - Git repository URL
 * @returns {Promise<{configured: boolean, url: string}>}
 */
export async function connectShared(url) {
  const started = await request('/shared/config', {
    method: 'PUT',
    body: JSON.stringify({ url }),
  });
  if (!started?.started) return started;
  return waitForConnect(url);
}

/**
 * Disconnect from the shared repository.
 * @returns {Promise<{configured: boolean}>}
 */
export function disconnectShared() {
  return request('/shared/config', {
    method: 'DELETE',
  });
}

/**
 * Refresh the shared repository (fetch latest changes).
 * @returns {Promise<{stale: boolean, lastSynced: string}>}
 */
export function refreshShared() {
  return request('/shared/refresh', {
    method: 'POST',
  });
}
