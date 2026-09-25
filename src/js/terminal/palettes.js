/**
 * Display palettes. Colour indices follow the Videotex order:
 * 0 black, 1 red, 2 green, 3 yellow, 4 blue, 5 magenta, 6 cyan, 7 white.
 */
import { GREY_LEVELS } from '../videotex/constants.js';

/** Phosphor-like primaries of a colour Minitel (softened P22 look). */
export const COLOR_PALETTE = Object.freeze([
  [0, 0, 0],
  [255, 58, 46],
  [52, 232, 84],
  [255, 236, 72],
  [52, 84, 255],
  [236, 64, 236],
  [64, 232, 255],
  [246, 246, 255],
]);

/** Cool white phosphor of the monochrome Minitel 1 / 1B / 2. */
export const PHOSPHORS = Object.freeze({
  white: [232, 240, 255],
  amber: [255, 176, 64],
  green: [110, 255, 140],
});

/** Monochrome palette: STUM1B grey levels tinted by the phosphor colour. */
export function monoPalette(phosphor = PHOSPHORS.white) {
  return GREY_LEVELS.map((level) => phosphor.map((c) => Math.round(c * level)));
}

/** Resolve a theme name ('mono' | 'color' | 'amber' | 'green') or a custom palette. */
export function resolvePalette(theme = 'mono', phosphor) {
  if (Array.isArray(theme)) return theme;
  if (theme === 'color') return COLOR_PALETTE.map((c) => [...c]);
  if (theme === 'amber') return monoPalette(PHOSPHORS.amber);
  if (theme === 'green') return monoPalette(PHOSPHORS.green);
  return monoPalette(phosphor ? parseColor(phosphor) : PHOSPHORS.white);
}

/** '#rgb', '#rrggbb' or [r, g, b] to [r, g, b]. */
export function parseColor(value) {
  if (Array.isArray(value)) return value;
  let hex = String(value).trim().replace(/^#/, '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
