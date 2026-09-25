/**
 * 3615 METEO — graphics: the mosaic map of France, weather pictograms and a
 * cell-grid encoder that keeps text readable on top of mosaics.
 *
 * Everything is drawn on the sextant grid (2 sub-pixels per column, 3 per
 * row). Pictures are palette-index images ({ width, height, data }) that are
 * composed, cut into cells, then encoded with as few attribute changes as
 * possible. A grid can also be diffed against the previous one so that only
 * the cells that changed are sent (today's map -> tomorrow's map).
 */
import { pixelArt, indicesToCells } from '../../../src/js/mosaic/mosaic.js';
import { colorIndex } from '../../../src/js/videotex/writer.js';

export const SEA = colorIndex('blue');
export const LAND = colorIndex('green');

/* ---------------------------------------------------------------------- */
/* Map of France                                                           */
/* ---------------------------------------------------------------------- */

/** Mainland outline (lat, lon), clockwise from Dunkerque. */
const MAINLAND = [
  [51.05, 2.37], [50.7, 3.2], [50.3, 4.1], [50.14, 4.83], [49.6, 5.5], [49.5, 5.8], [49.45, 6.4], [49.1, 7.0],
  [48.97, 8.23], [48.58, 7.8], [47.58, 7.59], [47.4, 7.0], [47.0, 6.6], [46.2, 6.15], [46.4, 6.8], [45.83, 6.86],
  [45.1, 6.7], [44.8, 7.0], [44.1, 7.7], [43.78, 7.5], [43.7, 7.27], [43.55, 7.0], [43.27, 6.64], [43.1, 5.93],
  [43.3, 5.37], [43.4, 4.6], [43.4, 3.7], [43.2, 3.1], [42.7, 3.04], [42.43, 3.17], [42.5, 2.5], [42.6, 1.5],
  [42.8, 0.7], [42.8, -0.3], [43.0, -1.0], [43.37, -1.78], [43.48, -1.56], [44.2, -1.3], [44.66, -1.25],
  [45.57, -1.07], [46.15, -1.2], [46.5, -1.8], [47.27, -2.2], [47.5, -3.1], [47.7, -3.4], [47.8, -4.37],
  [48.04, -4.73], [48.38, -4.5], [48.6, -4.6], [48.7, -4.0], [48.68, -3.8], [48.83, -3.2], [48.52, -2.76],
  [48.65, -2.0], [48.64, -1.51], [48.8, -1.57], [49.2, -1.6], [49.72, -1.94], [49.65, -1.62], [49.67, -1.26],
  [49.4, -1.2], [49.35, -0.5], [49.5, 0.1], [49.76, 0.37], [49.93, 1.08], [50.2, 1.6], [50.73, 1.6], [50.95, 1.85],
];
const CORSICA = [[43.0, 9.4], [42.7, 9.45], [42.1, 9.55], [41.4, 9.25], [41.6, 8.8], [41.9, 8.6], [42.3, 8.6], [42.6, 8.8]];

const K = Math.cos((46.5 * Math.PI) / 180);
const project = ([lat, lon]) => [lon * K, lat];
const POLYGONS = [MAINLAND.map(project), CORSICA.map(project)];
const BOUNDS = (() => {
  const all = POLYGONS.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
})();

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Rasterise France into a box of `cols` x `rows` cells. A sub-pixel is
 * 4 x 3.33 native pixels, so one degree of latitude spans more sub-pixel
 * rows than the same distance spans sub-pixel columns (ratio 0.8).
 * Returns the index image and a `locate(lat, lon)` -> { x, y } sub-pixel helper.
 */
export function franceMap(cols, rows, { sea = SEA, land = LAND, aspect = 0.8 } = {}) {
  const width = cols * 2;
  const height = rows * 3;
  const { minX, maxX, minY, maxY } = BOUNDS;
  const sy = Math.min((height - 1) / (maxY - minY), (width - 1) / ((maxX - minX) * aspect));
  const sx = sy * aspect;
  const offX = (width - (maxX - minX) * sx) / 2;
  const offY = (height - (maxY - minY) * sy) / 2;
  const data = new Int8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 3x3 supersampling, majority wins: smoother coasts.
      let hits = 0;
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          const px = minX + (x + (a + 0.5) / 3 - offX) / sx;
          const py = maxY - (y + (b + 0.5) / 3 - offY) / sy;
          if (POLYGONS.some((poly) => inside(poly, px, py))) hits++;
        }
      }
      data[y * width + x] = hits >= 5 ? land : sea;
    }
  }
  const locate = (lat, lon) => {
    const [x, y] = project([lat, lon]);
    return { x: (x - minX) * sx + offX, y: (maxY - y) * sy + offY };
  };
  return { width, height, data, locate };
}

/* ---------------------------------------------------------------------- */
/* Pictograms                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Weather types, in legend order. Small icons are 6x6 sub-pixels (3 cells x
 * 2 rows); every cell holds at most one ink colour so that it can sit on
 * land or sea. Rain is blue: it reads on green land in colour and in grey.
 */
export const WEATHER = Object.freeze({
  sun: { label: 'Soleil', icon: [
    'y....y',
    '..yy..',
    '.yyyy.',
    '.yyyy.',
    '..yy..',
    'y....y',
  ] },
  partly: { label: 'Eclaircies', icon: [
    '..yy..',
    '.yyyy.',
    '.yyyy.',
    '..wwww',
    '.wwwww',
    'wwwwww',
  ] },
  cloudy: { label: 'Nuageux', icon: [
    '......',
    '..ww..',
    '.wwww.',
    '.wwwww',
    'wwwwww',
    '......',
  ] },
  fog: { label: 'Brouillard', icon: [
    'wwwww.',
    '......',
    '.wwwww',
    'wwwww.',
    '......',
    '.wwwww',
  ] },
  showers: { label: 'Averses', icon: [
    '.yy...',
    'yyyy..',
    'yyywww',
    '.wwwww',
    '..b..b',
    '.b..b.',
  ] },
  rain: { label: 'Pluie', icon: [
    '..ww..',
    '.wwww.',
    'wwwwww',
    '..b..b',
    '.b..b.',
    'b..b..',
  ] },
  storm: { label: 'Orages', icon: [
    '..ww..',
    '.wwww.',
    'wwwwww',
    '..yyy.',
    '.yyy..',
    '..y...',
  ] },
  snow: { label: 'Neige', icon: [
    '..ww..',
    '.wwww.',
    'wwwwww',
    'w...w.',
    '..w...',
    'w...w.',
  ] },
});

/** Service logo: a sun behind a cloud, 10x9 sub-pixels (5 cells x 3 rows). */
export const LOGO = [
  '....y.....',
  '.y.yyy....',
  '..yyyyy...',
  '.yyyyyyy..',
  '..yyyywww.',
  '.y.ywwwwww',
  '...wwwwwww',
  '..wwwwwwww',
  '..........',
];

/**
 * Large pictograms for the city pages: 12x12 sub-pixels (6 cells x 4 rows),
 * built from the same shapes as the small ones.
 */
const BIG_SUN = [
  '.....yy.....',
  '.y...yy...y.',
  '..y......y..',
  '....yyyy....',
  '...yyyyyy...',
  'yy.yyyyyy.yy',
  'yy.yyyyyy.yy',
  '...yyyyyy...',
  '....yyyy....',
  '..y......y..',
  '.y...yy...y.',
  '.....yy.....',
];
const BIG_CLOUD = [
  '............',
  '............',
  '............',
  '......ww....',
  '....wwwwww..',
  '..wwwwwwwww.',
  '.wwwwwwwwwww',
  'wwwwwwwwwwww',
  '.wwwwwwwwww.',
  '............',
  '............',
  '............',
];

const BIG = {
  sun: BIG_SUN,
  partly: [
    '..y..y......',
    '....yy..y...',
    '.y.yyyy.....',
    '..yyyyyy....',
    'y.yyyyyy.y..',
    '..yyyyyy....',
    '.y.yyyyww...',
    '....wwwwww..',
    '..wwwwwwwww.',
    '.wwwwwwwwwww',
    'wwwwwwwwwwww',
    '.wwwwwwwwww.',
  ],
  cloudy: BIG_CLOUD,
  fog: [
    '............',
    'wwwwwwwwww..',
    '............',
    '..wwwwwwwwww',
    '............',
    'wwwwwwwwwww.',
    '............',
    '.wwwwwwwwwww',
    '............',
    'wwwwwwwww...',
    '............',
    '............',
  ],
  showers: [
    '....y.......',
    '.y..y..y....',
    '...yyy......',
    'yy.yyyyww...',
    '...yyywwwww.',
    '..wwwwwwwwww',
    '.wwwwwwwwwww',
    'wwwwwwwwwww.',
    '............',
    '..b....b....',
    '.b....b.....',
    'b....b......',
  ],
  rain: [
    '.....ww.....',
    '...wwwwww...',
    '.wwwwwwwwww.',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    '.wwwwwwwwww.',
    '..b..b..b..b',
    '.b..b..b..b.',
    'b..b..b..b..',
    '..b..b..b..b',
    '.b..b..b..b.',
    'b..b..b..b..',
  ],
  storm: [
    '.....ww.....',
    '...wwwwww...',
    '.wwwwwwwwww.',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    '.wwwwwwwwww.',
    '.....yyy....',
    '....yyy.....',
    '...yyyyyy...',
    '.....yyy....',
    '....yy......',
    '...y........',
  ],
  snow: [
    '.....ww.....',
    '...wwwwww...',
    '.wwwwwwwwww.',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    '.wwwwwwwwww.',
    '..w.....w...',
    '.www...www..',
    '..w..w..w...',
    '....www.....',
    '.w...w....w.',
    'www......www',
  ],
};

export function icon(type) {
  return pixelArt(WEATHER[type].icon);
}

/**
 * Wind arrows (6x6 sub-pixels), indexed by the direction the wind comes
 * from: 0 = north (the arrow points south), then clockwise by 45°.
 */
const ARROW_S = ['..ww..', '..ww..', '..ww..', 'wwwwww', '.wwww.', '..ww..'];
const ARROW_SW = ['....ww', '...ww.', 'w.ww..', 'www...', 'www...', 'wwww..'];
const flipV = (a) => [...a].reverse();
const flipH = (a) => a.map((l) => [...l].reverse().join(''));
const ARROW_W = ['..w...', '.ww...', 'wwwwww', 'wwwwww', '.ww...', '..w...'];
const ARROWS = [
  ARROW_S, // from north
  ARROW_SW, // from north-east
  ARROW_W, // from east
  flipV(ARROW_SW), // from south-east
  flipV(ARROW_S), // from south
  flipH(flipV(ARROW_SW)), // from south-west
  flipH(ARROW_W), // from west
  flipH(ARROW_SW), // from north-west
];

export function windArrow(dir) {
  return pixelArt(ARROWS[dir & 7]);
}

export function bigIcon(type) {
  return pixelArt(BIG[type]);
}

/* ---------------------------------------------------------------------- */
/* Images                                                                  */
/* ---------------------------------------------------------------------- */

/** Blank index image filled with a colour. */
export function canvas(width, height, fill = 0) {
  return { width, height, data: new Int8Array(width * height).fill(fill) };
}

/** Draw `src` (transparent = -1) onto `dst` at sub-pixel (x, y). */
export function blit(dst, src, x, y) {
  for (let j = 0; j < src.height; j++) {
    for (let i = 0; i < src.width; i++) {
      const v = src.data[j * src.width + i];
      const dx = x + i;
      const dy = y + j;
      if (v < 0 || dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      dst.data[dy * dst.width + dx] = v;
    }
  }
  return dst;
}

/**
 * Cut an index image into a cell grid (see encodeGrid). `background` fills
 * transparent sub-pixels.
 */
export function toGrid(image, { background = 0 } = {}) {
  const { cols, rows, cells } = indicesToCells(image, { background });
  return {
    cols,
    rows,
    cells: cells.map((c) => (c.transparent ? null : { bits: c.bits, fg: c.fg, bg: c.bg })),
  };
}

/** Put text into a grid: each character becomes a text cell on zone `bg`. */
export function gridText(grid, row, col, text, { color = 'white', bg }) {
  const fg = colorIndex(color);
  const zone = colorIndex(bg);
  [...text].forEach((ch, i) => {
    const c = col + i;
    if (c >= 0 && c < grid.cols && row >= 0 && row < grid.rows) grid.cells[row * grid.cols + c] = { ch, fg, bg: zone };
  });
  return grid;
}

/* ---------------------------------------------------------------------- */
/* Grid encoder                                                            */
/* ---------------------------------------------------------------------- */

const sameCell = (a, b) => {
  if (!a || !b) return a === b;
  if (a.ch !== undefined || b.ch !== undefined) return a.ch === b.ch && a.fg === b.fg && a.bg === b.bg;
  const norm = (c) => (c.bits === 0 ? [63, c.bg, c.bg] : c.bits === 63 || c.fg === c.bg ? [63, c.fg, c.fg] : [c.bits, c.fg, c.bg]);
  const [x, y] = [norm(a), norm(b)];
  return (x[0] === y[0] && x[1] === y[1] && x[2] === y[2]) || (x[0] === (~y[0] & 63) && x[1] === y[2] && x[2] === y[1]);
};

/**
 * Encode a cell grid at (row, col) into a Videotex writer.
 *
 * Cells: { bits, fg, bg } mosaic, { ch, fg, bg } text, or null (untouched).
 * Text takes its background from the zone: a space carries `bg` itself, any
 * other character relies on the cell to its left, so the mosaic before a
 * text run is oriented to show `bg` as its background.
 * With `prev`, only cells that differ from the previous grid are sent.
 * `after` is the zone colour the last cell of each row leaves behind for
 * whatever follows it on screen (black by default).
 */
export function encodeGrid(v, grid, { row = 1, col = 1, prev, after = 0 } = {}) {
  const { cols, rows, cells } = grid;
  for (let y = 0; y < rows; y++) {
    const line = cells.slice(y * cols, y * cols + cols);
    const send = line.map((cell, x) => cell && (!prev || !sameCell(cell, prev.cells[y * cols + x])));
    // Text drawn on a mosaic zone: its left neighbour must be (re)sent too.
    line.forEach((cell, x) => {
      if (send[x] && cell.ch !== undefined && cell.ch !== ' ' && x > 0 && line[x - 1] && line[x - 1].ch === undefined) send[x - 1] = true;
    });
    // Bridge 1-cell gaps: cheaper than a new positioning.
    for (let x = 1; x < cols - 1; x++) {
      if (!send[x] && line[x] && line[x].ch === undefined && send[x - 1] && send[x + 1]) send[x] = true;
    }
    let positioned = false;
    let fg = 7;
    let bg = 0;
    let lastKey = null;
    let lastByte = null;
    let run = 0;
    const flush = () => {
      if (run >= 3) v.repeat(run);
      else for (let i = 0; i < run; i++) v.raw(lastByte);
      run = 0;
    };
    for (let x = 0; x < cols; x++) {
      const cell = line[x];
      if (!send[x]) {
        flush();
        positioned = false;
        lastKey = null;
        continue;
      }
      if (!positioned) {
        v.moveTo(row + y, col + x);
        fg = 7;
        bg = 0;
        positioned = true;
      }
      if (cell.ch !== undefined) {
        // Text: a space carries the zone colour, other characters only a colour.
        const space = cell.ch === ' ';
        const key = space ? `s:${cell.bg}` : `t${cell.ch}:${cell.fg}`;
        const code = cell.ch.charCodeAt(0);
        if (key === lastKey && code >= 0x20 && code < 0x7f && run < 60) { run++; continue; }
        flush();
        v.alpha();
        if (space && cell.bg !== bg) { v.bg(cell.bg); bg = cell.bg; }
        if (!space && cell.fg !== fg) { v.color(cell.fg); fg = cell.fg; }
        v.text(cell.ch);
        lastByte = code;
        lastKey = key;
        continue;
      }
      // Mosaic: choose the orientation (bits or inverted bits).
      const next = line[x + 1];
      let wantBg = next && next.ch !== undefined && next.ch !== ' ' ? next.bg : undefined;
      // Last cell before untouched cells: leave the `after` zone behind it.
      const edge = after !== null && (x === cols - 1 ? col + x < 40 : next === null);
      if (edge) wantBg = after;
      let { bits, fg: cf, bg: cb } = cell;
      if (bits === 0) cf = cb;
      if (bits === 63) cb = cf;
      if (cf === cb) {
        // Solid cell: pick whichever form needs no attribute change.
        const k = cf;
        if (wantBg !== undefined && k === wantBg) { bits = 0; cf = fg; cb = k; } else if (k === fg) { bits = 63; cf = fg; cb = bg; } else if (k === bg) { bits = 0; cf = fg; cb = bg; } else { bits = 63; cf = k; cb = bg; }
        if (wantBg !== undefined && k !== wantBg) { bits = 63; cf = k; cb = wantBg; } // fg shows everywhere anyway
      } else {
        const keep = (cf !== fg) + (cb !== bg);
        const flip = (cb !== fg) + (cf !== bg);
        let invert = flip < keep;
        if (wantBg !== undefined) invert = cf === wantBg ? true : cb === wantBg ? false : invert;
        if (invert) { bits = ~bits & 63; [cf, cb] = [cb, cf]; }
      }
      const key = `m${bits}:${cf}:${cb}`;
      if (key === lastKey && run < 60) {
        run++;
      } else {
        flush();
        if (cf !== fg) { v.color(cf); fg = cf; }
        if (cb !== bg) { v.bg(cb); bg = cb; }
        v.mosaic(bits);
        lastByte = v.out[v.out.length - 1];
        lastKey = key;
      }
      // Close the zone with a mosaic space when the cell could not.
      if (edge && cb !== after) {
        flush();
        v.bg(after).mosaic(0);
        bg = after;
      }
    }
    flush();
  }
  return v;
}
