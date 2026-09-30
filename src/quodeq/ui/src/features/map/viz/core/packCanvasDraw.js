import { nodeColor, nodeBorderColor } from './mapColors.js';
import { isDrillableFolder } from './fileTree.js';
import { isDrawable } from './packCanvasGeometry.js';
import { TAU } from './galaxyCore.js';

const FOLDER_FILL_ALPHA = 0.2;
const FOLDER_FILL_ALPHA_HOVER = 0.3;
const FILE_FILL_ALPHA = 0.85;
const STROKE_PX = 1;
const LABEL_MIN_R = 10;
const LABEL_FONT_MAX = 11;
const LABEL_FONT_MIN = 8;
const LABEL_FONT_DIVISOR = 4;
const LABEL_GAP = 4;
const VAR_PREFIX = 'var(';

/** Resolve `var(--name)` through the container's computed style; anything
 * else is already a colour. Memoised per draw so the ~6 distinct variables
 * are read once, not once per circle. */
export function makeColorResolver(style) {
  const memo = new Map();
  return (css) => {
    if (!css || !css.startsWith(VAR_PREFIX)) return css;
    let hit = memo.get(css);
    if (hit === undefined) {
      const name = css.slice(VAR_PREFIX.length, -1).trim();
      hit = style.getPropertyValue(name).trim() || css;
      memo.set(css, hit);
    }
    return hit;
  };
}

function circleStyle(c, viewMode, hovered, color) {
  const d = c.data;
  if (c.depth === 0) return { fill: color('var(--color-surface-alt)'), stroke: color('var(--color-border)'), alpha: 1 };
  const fill = color(nodeColor(d, viewMode));
  const stroke = color(nodeBorderColor(d, viewMode));
  if (isDrillableFolder(d)) return { fill, stroke, alpha: hovered ? FOLDER_FILL_ALPHA_HOVER : FOLDER_FILL_ALPHA };
  return { fill, stroke, alpha: FILE_FILL_ALPHA };
}

function drawCircle(ctx, sc, style, viewport) {
  ctx.beginPath();
  ctx.arc(viewport.ox + sc.cx * viewport.scale, viewport.oy + sc.cy * viewport.scale, sc.r * viewport.scale, 0, TAU);
  ctx.globalAlpha = style.alpha;
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = STROKE_PX;
  ctx.strokeStyle = style.stroke;
  ctx.stroke();
}

function drawLabel(ctx, c, sc, viewport, color) {
  const px = sc.r * viewport.scale;
  const size = Math.min(LABEL_FONT_MAX, Math.max(LABEL_FONT_MIN, px / LABEL_FONT_DIVISOR));
  ctx.font = `${isDrillableFolder(c.data) ? '600' : '400'} ${size}px ${color('var(--font-sans)')}`;
  ctx.fillStyle = color('var(--color-text)');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const name = c.data.name.includes('/') ? c.data.name.split('/')[0] : c.data.name;
  ctx.fillText(name, viewport.ox + sc.cx * viewport.scale, viewport.oy + (sc.cy - sc.r) * viewport.scale - LABEL_GAP);
}

/** Paint one frame. `screenCoords` are layout units after the focus
 * transform; `viewport` maps them to pixels. Returns how many circles were
 * drawn, for tests. */
export function drawPack(ctx, { circles, screenCoords, viewport, viewMode, hover, focusNode, showLabels, style, width, height }) {
  const color = makeColorResolver(style);
  ctx.clearRect(0, 0, width, height);
  let drawn = 0;
  circles.forEach((c, i) => {
    const sc = screenCoords[i];
    if (!isDrawable(sc)) return;
    drawCircle(ctx, sc, circleStyle(c, viewMode, hover === i, color), viewport);
    drawn++;
  });
  if (!showLabels) return drawn;
  circles.forEach((c, i) => {
    const sc = screenCoords[i];
    if (sc.r * viewport.scale > LABEL_MIN_R && c.parent === focusNode) drawLabel(ctx, c, sc, viewport, color);
  });
  return drawn;
}
