import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ZoomablePackView from './ZoomablePackView.jsx';
import { PACK_WORKER_NODE_THRESHOLD, buildPackRoot, slimTree, packSlim } from '../core/packLayout.js';

// Large trees lay out in the worker. The first Map visit renders before the
// reply, so the view must pick up the positions when they land: the focus
// transform is derived from the root's radius, which does not exist yet at
// first render.

let resolveReply;
vi.mock('../core/packWorkerClient.js', () => ({
  requestPackLayout: () => new Promise((resolve) => { resolveReply = resolve; }),
  resetPackWorker: () => {},
}));

function file(i) {
  return { path: `src/f${i}.py`, name: `f${i}.py`, isFile: true, violations: 1, compliance: 0, severity: {} };
}

function bigTree() {
  const children = Array.from({ length: PACK_WORKER_NODE_THRESHOLD }, (_, i) => file(i));
  const folder = { path: 'src', name: 'src', isFile: false, violations: children.length, compliance: 0, severity: {}, children };
  return { path: '', name: '/', isFile: false, violations: children.length, compliance: 0, severity: {}, children: [folder] };
}

const ctx = {
  clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
  fillText: vi.fn(), setTransform: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  ctx.arc.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ZoomablePackView when the worker reply lands after first render', () => {
  it('draws every circle at finite coordinates once the layout settles', async () => {
    const tree = bigTree();
    const { container } = render(<ZoomablePackView node={tree} viewMode="health" />);
    expect(container.querySelector('canvas')).toBeNull();

    const xyr = packSlim(slimTree(buildPackRoot(tree, 'health')));
    await act(async () => { resolveReply(xyr); });

    expect(container.querySelector('canvas')).toBeInTheDocument();
    expect(ctx.arc).toHaveBeenCalled();
    for (const call of ctx.arc.mock.calls) {
      expect(Number.isFinite(call[0])).toBe(true);
      expect(Number.isFinite(call[1])).toBe(true);
      expect(Number.isFinite(call[2])).toBe(true);
    }
  });
});
