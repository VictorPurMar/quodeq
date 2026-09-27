/**
 * Strip leading "Principle — " or "Principle - " prefix from reason text
 * to avoid duplication when the principle is shown separately.
 */
export function stripPrinciplePrefix(reason, principle) {
  if (!reason || !principle) return reason;
  for (const sep of [' — ', ' - ']) {
    if (reason.startsWith(principle + sep)) {
      return reason.slice(principle.length + sep.length);
    }
  }
  return reason;
}
/**
 * Splits a `path:line` reference into its parts. An explicit `rawLine` wins
 * over a line embedded in the path.
 *
 * @returns {{filePath: string|null, line: number|null}}
 */
export function parseFileRef(rawFile, rawLine) {
  if (!rawFile) return { filePath: null, line: rawLine ?? null };
  const m = rawFile.match(/^(.*?)(?::(\d+))?$/);
  const filePath = m[1] || rawFile;
  const line = rawLine ?? (m[2] ? parseInt(m[2], 10) : null);
  return { filePath, line };
}

const DELTA_CLAMP = 4;
const ANGLE_BASE = 90;
const ANGLE_RANGE = 55;

/**
 * Convert a score delta into a rotation angle for trend arrows.
 * Clamps the delta to [-4, 4] and maps it to an angle around 90 degrees.
 *
 * @param {number} d - Score delta value
 * @returns {number} Rotation angle in degrees (35..145)
 */
export function angleFromDelta(d) {
  const clamped = Math.max(-DELTA_CLAMP, Math.min(DELTA_CLAMP, d));
  return ANGLE_BASE - Math.sign(clamped) * Math.sqrt(Math.abs(clamped) / DELTA_CLAMP) * ANGLE_RANGE;
}

const RATIO_DECIMALS = 1;
const WHOLE_SUFFIX = '.0';

/**
 * The ratio of violations to compliance items as "1:N", N to one decimal
 * with a whole number left bare: "1:0.9", "1:1.3", "1:5". The first number
 * is always the violations.
 *
 * @param {number} violations - Number of violations
 * @param {number} compliance - Number of compliance items
 * @returns {string} Formatted ratio string or em-dash when no violations
 */
export function complianceRatio(violations, compliance) {
  if (violations === 0) return '—';
  const n = (compliance / violations).toFixed(RATIO_DECIMALS);
  return `1:${n.endsWith(WHOLE_SUFFIX) ? n.slice(0, -WHOLE_SUFFIX.length) : n}`;
}
