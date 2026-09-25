/**
 * Mosaic (semi-graphic) imaging: turn pixels into Videotex G1 cells.
 *
 * A mosaic cell is 2x3 sub-pixels and can only show two colours (foreground
 * and background). Everything here works on a sub-pixel grid: 80x75 for a
 * full 40x25 screen.
 *
 * - `pixelArt()` parses character art ("wwyy..bb") into palette indices.
 * - `imageToMosaic()` converts RGB(A) pixels with optional dithering.
 * - `indicesToCells()` builds cells from palette indices.
 * - `encodeCells()` emits compact Videotex (attribute tracking, REP, bit
 *   inversion to avoid colour changes, transparent cells skipped).
 * - `cellsToHTML()` renders cells as Unicode sextants for the CSS kit.
 */
import { COLOR_PALETTE, monoPalette } from '../terminal/palettes.js';
import { sextantChar } from '../font/glyphs.js';
import { COLORS } from '../videotex/constants.js';

/** Letters used in pixel art: k r g y b m c w (Videotex colour order). */
export const ART_COLORS = Object.freeze({ k: 0, r: 1, g: 2, y: 3, b: 4, m: 5, c: 6, w: 7 });

/**
 * Parse pixel art. Each string is a row; letters are colours (see
 * ART_COLORS), '#' is `ink`, and '.' or ' ' are transparent (-1).
 * Returns { width, height, data: Int8Array }.
 */
export function pixelArt(lines, { ink = 7 } = {}) {
  const rows = Array.isArray(lines) ? lines : String(lines).split('\n');
  const clean = rows.map((l) => l.replace(/\s+$/, '')).filter((l, i, all) => l.length || (i > 0 && i < all.length - 1));
  const height = clean.length;
  const width = Math.max(0, ...clean.map((l) => l.length));
  const data = new Int8Array(width * height).fill(-1);
  clean.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch === '#') data[y * width + x] = ink;
      else if (ART_COLORS[ch] !== undefined) data[y * width + x] = ART_COLORS[ch];
    }
  });
  return { width, height, data };
}

/**
 * Build cells from a palette-index grid (-1 = transparent).
 * Returns { cols, rows, cells } where each cell is { bits, fg, bg, transparent }.
 */
export function indicesToCells({ width, height, data }, { background = -1 } = {}) {
  const cols = Math.ceil(width / 2);
  const rows = Math.ceil(height / 3);
  const cells = new Array(cols * rows);
  const counts = new Int16Array(8);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      counts.fill(0);
      const sub = [];
      let empty = true;
      for (let i = 0; i < 6; i++) {
        const x = cx * 2 + (i & 1);
        const y = cy * 3 + (i >> 1);
        let v = x < width && y < height ? data[y * width + x] : -1;
        if (v >= 0) empty = false;
        else v = background;
        sub.push(v);
        if (v >= 0) counts[v]++;
      }
      if (empty) {
        cells[cy * cols + cx] = { bits: 0, fg: 7, bg: 0, transparent: true };
        continue;
      }
      // Two most frequent colours; transparent sub-pixels become the background.
      const order = [...counts.keys()].filter((i) => counts[i] > 0).sort((a, b) => counts[b] - counts[a]);
      const hasHoles = sub.some((v) => v < 0);
      const fg = order[0];
      const bg = hasHoles ? 0 : order[1] ?? order[0];
      let bits = 0;
      sub.forEach((v, i) => {
        const target = v < 0 ? bg : v;
        if (target === fg && fg !== bg) bits |= 1 << i;
        else if (target !== bg && target !== fg) {
          // Third colour: snap to whichever of fg/bg is closer in luminance.
          if (Math.abs(luma(target) - luma(fg)) < Math.abs(luma(target) - luma(bg))) bits |= 1 << i;
        }
      });
      if (fg === bg) bits = 63;
      cells[cy * cols + cx] = { bits, fg, bg, transparent: false };
    }
  }
  return { cols, rows, cells };
}

const LUMA = [0, 0.5, 0.7, 0.9, 0.4, 0.6, 0.8, 1];
function luma(index) {
  return LUMA[index] ?? 0;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/**
 * Convert RGBA pixels to mosaic cells.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} image sub-pixel image (2 px per column, 3 per row)
 * @param {object} [options]
 * @param {'color'|'mono'|Array} [options.palette='color']
 * @param {'none'|'ordered'|'floyd-steinberg'} [options.dither='ordered']
 * @param {number} [options.strength=1] dithering strength
 */
export function imageToMosaic(image, { palette = 'color', dither = 'ordered', strength = 1 } = {}) {
  const pal = Array.isArray(palette) ? palette : palette === 'mono' ? monoPalette([255, 255, 255]) : COLOR_PALETTE;
  const { width, height, data } = image;
  const cols = Math.ceil(width / 2);
  const rows = Math.ceil(height / 3);
  // Working buffer in float RGB, with error diffusion.
  const buf = new Float32Array(cols * 2 * rows * 3 * 3);
  const W = cols * 2;
  for (let y = 0; y < rows * 3; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(width - 1, x);
      const sy = Math.min(height - 1, y);
      const i = (sy * width + sx) * 4;
      const a = data[i + 3] / 255;
      const o = (y * W + x) * 3;
      buf[o] = data[i] * a;
      buf[o + 1] = data[i + 1] * a;
      buf[o + 2] = data[i + 2] * a;
    }
  }
  const mono = palette === 'mono';
  const dist = (r, g, b, c) => {
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    if (mono) {
      const d = 0.299 * dr + 0.587 * dg + 0.114 * db;
      return d * d;
    }
    return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
  };

  const cells = new Array(cols * rows);
  const sub = new Float32Array(18);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      for (let i = 0; i < 6; i++) {
        const x = cx * 2 + (i & 1);
        const y = cy * 3 + (i >> 1);
        const o = (y * W + x) * 3;
        let bias = 0;
        if (dither === 'ordered') bias = BAYER4[(y & 3) * 4 + (x & 3)] * 96 * strength;
        sub[i * 3] = buf[o] + bias;
        sub[i * 3 + 1] = buf[o + 1] + bias;
        sub[i * 3 + 2] = buf[o + 2] + bias;
      }
      // Best colour pair for this cell.
      let best = Infinity;
      let fg = 7;
      let bg = 0;
      for (let a = 0; a < pal.length; a++) {
        for (let b = a; b < pal.length; b++) {
          let err = 0;
          for (let i = 0; i < 6 && err < best; i++) {
            const r = sub[i * 3];
            const g = sub[i * 3 + 1];
            const bl = sub[i * 3 + 2];
            err += Math.min(dist(r, g, bl, pal[a]), dist(r, g, bl, pal[b]));
          }
          if (err < best) {
            best = err;
            fg = b;
            bg = a;
          }
        }
      }
      let bits = 0;
      for (let i = 0; i < 6; i++) {
        const x = cx * 2 + (i & 1);
        const y = cy * 3 + (i >> 1);
        const o = (y * W + x) * 3;
        const r = sub[i * 3];
        const g = sub[i * 3 + 1];
        const bl = sub[i * 3 + 2];
        const useFg = dist(r, g, bl, pal[fg]) < dist(r, g, bl, pal[bg]);
        if (useFg) bits |= 1 << i;
        if (dither === 'floyd-steinberg') {
          const c = pal[useFg ? fg : bg];
          const er = (buf[o] - c[0]) * strength;
          const eg = (buf[o + 1] - c[1]) * strength;
          const eb = (buf[o + 2] - c[2]) * strength;
          const spread = (dx, dy, k) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny >= rows * 3) return;
            const p = (ny * W + nx) * 3;
            buf[p] += er * k;
            buf[p + 1] += eg * k;
            buf[p + 2] += eb * k;
          };
          spread(1, 0, 7 / 16);
          spread(-1, 1, 3 / 16);
          spread(0, 1, 5 / 16);
          spread(1, 1, 1 / 16);
        }
      }
      if (fg === bg) bits = 63;
      cells[cy * cols + cx] = { bits, fg, bg, transparent: false };
    }
  }
  return { cols, rows, cells };
}

/**
 * Encode cells as Videotex at (row, col), appending to a writer.
 * Keeps track of the terminal's attributes to send as few bytes as possible.
 *
 * @param {import('../videotex/writer.js').Videotex} v
 * @param {{cols:number, rows:number, cells:Array}} mosaic
 * @param {object} [options]
 * @param {number} [options.row=1]
 * @param {number} [options.col=1]
 * @param {boolean} [options.separated=false]
 */
export function encodeCells(v, { cols, rows, cells }, { row = 1, col = 1, separated = false, maxCols = 40, maxRow = 24 } = {}) {
  for (let cy = 0; cy < rows; cy++) {
    const r = row + cy;
    if (r < 1 || r > maxRow) continue;
    let positioned = false;
    let fg = 7;
    let bg = 0;
    let last = null;
    let run = 0;
    const flush = () => {
      if (run > 0) v.repeat(run);
      run = 0;
    };
    for (let cx = 0; cx < cols; cx++) {
      const c = col + cx;
      if (c < 1 || c > maxCols) continue;
      const cell = cells[cy * cols + cx];
      if (!cell || cell.transparent) {
        flush();
        positioned = false;
        last = null;
        continue;
      }
      if (!positioned) {
        v.moveTo(r, c);
        if (separated) v.separated(true);
        fg = 7;
        bg = 0;
        positioned = true;
      }
      let { bits, fg: cf, bg: cb } = cell;
      // Solid cells and inverted patterns can often avoid a colour change.
      if (bits === 0 || bits === 63 || cf === cb) {
        const colour = bits === 0 ? cb : cf;
        if (colour === fg) { bits = 63; cf = fg; cb = bg; } else if (colour === bg) { bits = 0; cf = fg; cb = bg; } else { bits = 63; cf = colour; cb = bg; }
      } else if ((cb !== fg) + (cf !== bg) < (cf !== fg) + (cb !== bg)) {
        // Inverting the pattern swaps the colours and saves attribute changes.
        bits = ~bits & 63;
        [cf, cb] = [cb, cf];
      }
      const key = `${bits}:${cf}:${cb}`;
      if (key === last && run < 63) {
        run++;
        continue;
      }
      flush();
      if (cf !== fg) { v.color(cf); fg = cf; }
      if (cb !== bg) { v.bg(cb); bg = cb; }
      v.mosaic(bits);
      last = key;
    }
    flush();
  }
  return v;
}

/**
 * Render cells as HTML: one line per cell row, sextant characters in spans
 * coloured with the design-system classes (mt-fg-*, mt-bg-*).
 */
export function cellsToHTML({ cols, rows, cells }) {
  const lines = [];
  for (let cy = 0; cy < rows; cy++) {
    let html = '';
    let open = null;
    let text = '';
    const close = () => {
      if (open !== null) html += `<span class="${open}">${text}</span>`;
      text = '';
    };
    for (let cx = 0; cx < cols; cx++) {
      const cell = cells[cy * cols + cx];
      const cls = cell.transparent ? 'mt-transparent' : `mt-fg-${COLORS[cell.fg]} mt-bg-${COLORS[cell.bg]}`;
      if (cls !== open) {
        close();
        open = cls;
      }
      text += cell.transparent ? ' ' : sextantChar(cell.bits);
    }
    close();
    lines.push(html);
  }
  return lines.join('\n');
}

/** Scale an image source into an ImageData at sub-pixel resolution (browser only). */
export function sampleImage(source, cols, rows, { fit = 'cover', adjust, mirror = false } = {}) {
  const width = cols * 2;
  const height = rows * 3;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  // Sub-pixels are 4x3.33 native pixels: correct the aspect ratio.
  const targetRatio = (width * 4) / (height * (10 / 3));
  const sourceRatio = sw / sh;
  let dw = width;
  let dh = height;
  if ((fit === 'cover') === sourceRatio > targetRatio) dw = width * (sourceRatio / targetRatio);
  else dh = height * (targetRatio / sourceRatio);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  if (adjust) ctx.filter = adjust;
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return ctx.getImageData(0, 0, width, height);
}
