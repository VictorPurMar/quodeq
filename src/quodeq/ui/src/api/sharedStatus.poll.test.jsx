import { describe, it, expect, vi, afterEach } from 'vitest';
import * as shared from './shared.js';

// PUT answers 202 {started: true}; each GET /shared/status returns the next
// connect state and records the (fake) time it was polled.
function stubConnectJob(states) {
  const pollTimes = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    if (opts?.method !== 'PUT') pollTimes.push(Date.now());
    const body = opts?.method === 'PUT' ? { started: true, url: 'u' } : { connect: states.shift() };
    return { ok: true, json: async () => body };
  }));
  return pollTimes;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('connectShared polling backoff', () => {
  it('waits longer between polls and caps the wait at SHARED_STATUS_POLL_CAP_MS', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1); // jitter at its ceiling: the delay before jitter
    const running = new Array(4).fill({ state: 'running' });
    const pollTimes = stubConnectJob([...running, { state: 'done', url: 'u' }]);
    const start = Date.now();
    const result = shared.connectShared('u');
    await vi.advanceTimersByTimeAsync(5 * shared.SHARED_STATUS_POLL_CAP_MS);
    await expect(result).resolves.toEqual({ configured: true, url: 'u' });
    const gaps = pollTimes.map((t, i) => t - (i === 0 ? start : pollTimes[i - 1]));
    const base = shared.CONNECT_POLL_INTERVAL_MS;
    expect(gaps).toEqual([base, 2 * base, shared.SHARED_STATUS_POLL_CAP_MS, shared.SHARED_STATUS_POLL_CAP_MS, shared.SHARED_STATUS_POLL_CAP_MS]);
  });

  it('rejects on the first poll that reports a failed job', async () => {
    vi.useFakeTimers();
    const pollTimes = stubConnectJob([{ state: 'error', code: 'CLONE_FAILED', error: 'could not clone' }]);
    const result = shared.connectShared('u').catch((e) => e);
    await vi.advanceTimersByTimeAsync(shared.CONNECT_POLL_INTERVAL_MS);
    expect((await result).code).toBe('CLONE_FAILED');
    expect(pollTimes).toHaveLength(1);
  });
});
