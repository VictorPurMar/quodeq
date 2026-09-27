import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import { STAGE_STATUS } from '../../../vocab/stageStatus.js';
import { useStageExplain, STAGE_DEBOUNCE_MS } from './useStageExplain.js';

const stages = { types: { critical: 0, major: 1, minor: 3 }, complianceTypes: 4, weightedViolations: 2.25, base: 7.87, lift: 0.36, raw: 8.64, ceiling: 9.16, floor: 5, final: 8.6, grade: 'Good' };
const params = { baseK: 0.12 };
const stored = { runId: 'r1', dimension: 'maintainability', params, principles: [{ principleId: 'P1', insufficient: false, stages }] };
const live = { ...stored, params: { baseK: 0.5 }, principles: [{ principleId: 'P1', insufficient: false, stages: { ...stages, final: 7.1, grade: 'Good' } }] };

function mount(api, initial) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => createElement(QueryClientProvider, { client },
    createElement(ApiProvider, { value: api }, children));
  return renderHook((props) => useStageExplain(props), { wrapper, initialProps: initial });
}

const base = { project: 'p', runId: 'r1', dimension: 'maintainability', draft: params, enabled: true };

describe('useStageExplain', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('loads the stored stages and becomes ready', async () => {
    const api = { getGradeExplain: vi.fn(async () => stored), previewGradeExplain: vi.fn(async () => live) };
    const { result } = mount(api, base);
    await waitFor(() => expect(result.current.status).toBe(STAGE_STATUS.READY));
    expect(result.current.stored).toEqual(stored);
    expect(result.current.principles[0].principleId).toBe('P1');
  });

  it('recomputes once after the debounce when the draft changes', async () => {
    const api = { getGradeExplain: vi.fn(async () => stored), previewGradeExplain: vi.fn(async () => live) };
    const { result, rerender } = mount(api, base);
    await waitFor(() => expect(result.current.status).toBe(STAGE_STATUS.READY));
    rerender({ ...base, draft: { baseK: 0.4 } });
    rerender({ ...base, draft: { baseK: 0.5 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(STAGE_DEBOUNCE_MS + 10); });
    await waitFor(() => expect(result.current.live).toEqual(live));
    expect(api.previewGradeExplain).toHaveBeenCalledTimes(1);
    expect(api.previewGradeExplain).toHaveBeenCalledWith('p', 'r1', 'maintainability', { baseK: 0.5 });
  });

  it('a rejected draft keeps the last good stages', async () => {
    const preview = vi.fn().mockResolvedValueOnce(live).mockRejectedValueOnce(new Error('bad'));
    const api = { getGradeExplain: vi.fn(async () => stored), previewGradeExplain: preview };
    const { result, rerender } = mount(api, base);
    await waitFor(() => expect(result.current.status).toBe(STAGE_STATUS.READY));
    rerender({ ...base, draft: { baseK: 0.5 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(STAGE_DEBOUNCE_MS + 10); });
    await waitFor(() => expect(result.current.live).toEqual(live));
    rerender({ ...base, draft: { baseK: 9 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(STAGE_DEBOUNCE_MS + 10); });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(result.current.live).toEqual(live);
    expect(result.current.status).toBe(STAGE_STATUS.READY);
  });

  it('is unavailable and silent when disabled', async () => {
    const api = { getGradeExplain: vi.fn(async () => stored), previewGradeExplain: vi.fn(async () => live) };
    const { result, rerender } = mount(api, { ...base, enabled: false });
    expect(result.current.status).toBe(STAGE_STATUS.UNAVAILABLE);
    rerender({ ...base, enabled: false, draft: { baseK: 0.5 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(STAGE_DEBOUNCE_MS + 10); });
    expect(api.getGradeExplain).not.toHaveBeenCalled();
    expect(api.previewGradeExplain).not.toHaveBeenCalled();
    expect(result.current.principles).toEqual([]);
  });

  it('is unavailable when the stored stages cannot be read', async () => {
    const api = { getGradeExplain: vi.fn(async () => { throw new Error('boom'); }), previewGradeExplain: vi.fn() };
    const { result } = mount(api, base);
    await waitFor(() => expect(result.current.status).toBe(STAGE_STATUS.UNAVAILABLE));
    expect(result.current.stored).toBeNull();
  });
});
