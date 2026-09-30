import { withinRadius } from './hitTest.js';
import { PACK_BASE_SIZE } from './packLayout.js';

// The SVG view box the pack is authored in: a PAD margin around BASE_SIZE
// layout units, fitted to the container with the aspect ratio kept
// (xMidYMid meet). The canvas reproduces the same mapping so the two
// renderers place every circle identically.
export const PACK_VIEW_PAD = 20;
const VIEW_SPAN = PACK_BASE_SIZE + PACK_VIEW_PAD * 2;

/** Pixels per layout unit and the pixel origin of the view box. */
export function packViewport(width, height) {
  const scale = Math.min(width, height) / VIEW_SPAN;
  return {
    scale,
    ox: (width - VIEW_SPAN * scale) / 2 + PACK_VIEW_PAD * scale,
    oy: (height - VIEW_SPAN * scale) / 2 + PACK_VIEW_PAD * scale,
  };
}

/** Container pixel to layout units. */
export function toLayoutPoint(px, py, viewport) {
  return { x: (px - viewport.ox) / viewport.scale, y: (py - viewport.oy) / viewport.scale };
}

/** Index of the deepest circle under a layout point, or null. Circles nest,
 * so the smallest one containing the point is the one on top. The root
 * (index of depth 0) is never a hit: clicking it is a background click. */
export function hitCircle(circles, screenCoords, x, y) {
  let best = null;
  for (let i = 0; i < circles.length; i++) {
    if (circles[i].depth === 0) continue;
    const sc = screenCoords[i];
    if (!withinRadius(x, y, sc.cx, sc.cy, sc.r)) continue;
    if (best === null || sc.r < screenCoords[best].r) best = i;
  }
  return best;
}

/** Whether a circle is worth drawing: at least half a pixel, and inside
 * the view box. Zoomed-in packs leave most circles offscreen or sub-pixel. */
export function isDrawable(sc, viewport) {
  const MIN_PX = 0.5;
  if (sc.r * viewport.scale < MIN_PX) return false;
  return sc.cx + sc.r > -PACK_VIEW_PAD && sc.cx - sc.r < PACK_BASE_SIZE + PACK_VIEW_PAD
    && sc.cy + sc.r > -PACK_VIEW_PAD && sc.cy - sc.r < PACK_BASE_SIZE + PACK_VIEW_PAD;
}
