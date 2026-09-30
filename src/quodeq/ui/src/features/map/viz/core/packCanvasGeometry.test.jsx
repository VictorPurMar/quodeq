import { describe, it, expect } from 'vitest';
import { packViewport, toLayoutPoint, hitCircle, isDrawable, PACK_VIEW_PAD } from './packCanvasGeometry.js';
import { PACK_BASE_SIZE } from './packLayout.js';

const SPAN = PACK_BASE_SIZE + PACK_VIEW_PAD * 2;

describe('packViewport', () => {
  it('fits the view box to the shorter side and centres it, like the SVG', () => {
    const v = packViewport(SPAN * 2, SPAN);
    expect(v.scale).toBe(1);
    expect(v.oy).toBe(PACK_VIEW_PAD);
    expect(v.ox).toBe(SPAN / 2 + PACK_VIEW_PAD);
  });

  it('round-trips a pixel through layout units', () => {
    const v = packViewport(320, 200);
    const p = toLayoutPoint(100, 50, v);
    expect(v.ox + p.x * v.scale).toBeCloseTo(100);
    expect(v.oy + p.y * v.scale).toBeCloseTo(50);
  });
});

describe('hitCircle', () => {
  const circles = [{ depth: 0 }, { depth: 1 }, { depth: 2 }];
  const coords = [{ cx: 300, cy: 300, r: 300 }, { cx: 200, cy: 200, r: 100 }, { cx: 220, cy: 220, r: 20 }];

  it('picks the deepest circle under the point', () => {
    expect(hitCircle(circles, coords, 225, 225)).toBe(2);
    expect(hitCircle(circles, coords, 150, 150)).toBe(1);
  });

  it('treats the root as background', () => {
    expect(hitCircle(circles, coords, 500, 500)).toBeNull();
  });
});

describe('isDrawable', () => {
  const v = packViewport(SPAN, SPAN);
  it('skips offscreen circles', () => {
    expect(isDrawable({ cx: 5000, cy: 300, r: 10 }, v)).toBe(false);
    expect(isDrawable({ cx: 300, cy: 300, r: 10 }, v)).toBe(true);
  });
});

// Sub-pixel circles still paint: the SVG view keeps them visible through
// its non-scaling 1px stroke, and that texture is what makes a zoomed-out
// folder read as full rather than empty.
describe('isDrawable keeps sub-pixel circles', () => {
  it('draws a circle far smaller than a pixel when it is inside the view', () => {
    expect(isDrawable({ cx: 300, cy: 300, r: 0.05 })).toBe(true);
  });
});
