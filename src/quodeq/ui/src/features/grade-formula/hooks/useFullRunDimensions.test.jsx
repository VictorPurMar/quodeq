import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFullRunDimensions } from './useFullRunDimensions.js';
import { getDashboard } from '../../../api/index.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';

vi.mock('../../../api/index.js', () => ({ getDashboard: vi.fn() }));

describe('useFullRunDimensions', () => {
  beforeEach(() => { getDashboard.mockReset(); });

  it('returns the given dimensions when they carry bodies', () => {
    const dims = [{ dimension: 'security', violations: [] }];
    const { result } = renderHook(
      () => useFullRunDimensions({ project: 'p1', runId: 'r1', source: 'local', dimensions: dims }),
      { wrapper: withQueryClient() },
    );
    expect(result.current).toBe(dims);
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('fetches the full dashboard when the given dimensions are slim', async () => {
    getDashboard.mockResolvedValue({ dimensions: [{ dimension: 'security', violations: [{ req: 'S-1', severity: 'major' }] }], trend: [] });
    const { result } = renderHook(
      () => useFullRunDimensions({ project: 'p1', runId: 'r1', source: 'local', dimensions: [{ dimension: 'security' }] }),
      { wrapper: withQueryClient() },
    );
    await waitFor(() => expect(result.current[0]?.violations).toHaveLength(1));
    expect(getDashboard).toHaveBeenCalledWith('p1', 'r1', 'full');
  });

  it('returns an empty list while the full dashboard loads', () => {
    getDashboard.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useFullRunDimensions({ project: 'p1', runId: 'r1', source: 'local', dimensions: [{ dimension: 'security' }] }),
      { wrapper: withQueryClient() },
    );
    expect(result.current).toEqual([]);
  });
});
