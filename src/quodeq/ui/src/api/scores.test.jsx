import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboard } from './scores.js';
import { request } from './request.js';
import { DASHBOARD_VIEW } from '../vocab/dashboardView.js';

vi.mock('./request.js', () => ({ request: vi.fn() }));

describe('getDashboard', () => {
  beforeEach(() => { request.mockReset(); request.mockResolvedValue({ dimensions: [], trend: [] }); });

  it('asks for the overview view in the query', async () => {
    await getDashboard('p1', 'latest', DASHBOARD_VIEW.OVERVIEW);
    expect(request).toHaveBeenCalledWith('/projects/p1/dashboard?run=latest&view=overview');
  });

  it('omits view for the full shape and run when falsy', async () => {
    await getDashboard('p1', null);
    expect(request).toHaveBeenCalledWith('/projects/p1/dashboard');
  });

  it('defaults to the latest run and the full view', async () => {
    await getDashboard('p1');
    expect(request).toHaveBeenCalledWith('/projects/p1/dashboard?run=latest');
  });
});
