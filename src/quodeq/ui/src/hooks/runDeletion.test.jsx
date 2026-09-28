import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { nextSelectedRunAfterDelete, useHandleRunDeleted } from './runDeletion.js';
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

describe('useHandleRunDeleted', () => {
  function deps(historySelectedRun) {
    return {
      dropRunFromCache: vi.fn(), setSelectedRun: vi.fn(), historySelectedRun, setHistorySelectedRun: vi.fn(),
      scheduleDashboardReconcile: vi.fn(), loadProjects: vi.fn(),
    };
  }

  it('drops the run, moves an Overview selection off it, reconciles and reloads projects', () => {
    const d = deps('run-A');
    const { result } = renderHook(() => useHandleRunDeleted(d));
    act(() => result.current('run-B'));
    expect(d.dropRunFromCache).toHaveBeenCalledWith('run-B');
    expect(d.setSelectedRun).toHaveBeenCalledTimes(1);
    expect(d.setSelectedRun.mock.calls[0][0]('run-B')).toBe(LATEST_RUN_ID);
    expect(d.setSelectedRun.mock.calls[0][0]('run-A')).toBe('run-A');
    expect(d.setHistorySelectedRun).not.toHaveBeenCalled();
    expect(d.scheduleDashboardReconcile).toHaveBeenCalledTimes(1);
    expect(d.loadProjects).toHaveBeenCalledTimes(1);
  });

  it('resets the History selection when it pointed at the deleted run', () => {
    const d = deps('run-B');
    const { result } = renderHook(() => useHandleRunDeleted(d));
    act(() => result.current('run-B'));
    expect(d.setHistorySelectedRun).toHaveBeenCalledWith(LATEST_RUN_ID);
  });
});
