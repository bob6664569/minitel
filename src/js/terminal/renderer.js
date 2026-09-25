/**
 * Framebuffer renderer: draws a Screen at the Minitel's native resolution
 * (320x250 for 40 columns) into a canvas, one row at a time, only when a row
 * changed. Handles flashing, the cursor, double sizes, inversion, underline,
 * conceal and separated mosaics. The CRT stage upscales this canvas.
 */
import { CELL_WIDTH, CELL_HEIGHT, NOTDEF, getGlyph, sextantBits, sextantRows } from '../font/glyphs.js';
import { resolvePalette } from './palettes.js';

const FLASH_ON_MS = 640;
const FLASH_PERIOD_MS = 960;
const CURSOR_PERIOD_MS = 800;

function createCanvas(width, height) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export class Renderer {
  constructor({ cols = 40, rows = 24, theme = 'mono', phosphor } = {}) {
    this.cols = cols;
    this.rows = rows + 1; // status row 0 included
    this.width = cols * CELL_WIDTH;
    this.height = this.rows * CELL_HEIGHT;
    this.canvas = createCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.image = this.ctx.createImageData(this.width, this.height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.rowBuffer = [];
    this.pending = new Set();
    this.flashRows = new Uint8Array(this.rows);
    this.flashPhase = true;
    this.cursorPhase = true;
    this.cursor = null;
    this.cursorKey = '';
    this.revealed = false;
    this.forceAll = true;
    this.setTheme(theme, phosphor);
  }

  /** Switch palette ('mono' | 'color' | 'amber' | 'green' | [[r,g,b] x 8]). */
  setTheme(theme, phosphor) {
    this.theme = theme;
    this.rgb = resolvePalette(theme, phosphor);
    this.palette = new Uint32Array(this.rgb.map(([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0));
    this.forceAll = true;
  }

  /** Advance blink phases; returns true when a redraw is needed. */
  tick(now) {
    const flash = now % FLASH_PERIOD_MS < FLASH_ON_MS;
    const cursor = now % CURSOR_PERIOD_MS < CURSOR_PERIOD_MS / 2;
    let changed = false;
    if (flash !== this.flashPhase) {
      this.flashPhase = flash;
      for (let r = 0; r < this.rows; r++) {
        if (this.flashRows[r]) {
          this.pending.add(r);
          changed = true;
        }
      }
    }
    if (cursor !== this.cursorPhase) {
      this.cursorPhase = cursor;
      if (this.cursor) {
        this.pending.add(this.cursor.row);
        changed = true;
      }
    }
    return changed;
  }

  /** Draw what changed. Returns true if the canvas was updated. */
  render(screen) {
    const { pending } = this;
    for (let r = 0; r < this.rows; r++) {
      if (this.forceAll || screen.dirty[r]) pending.add(r);
    }
    this.forceAll = false;

    const cursor = screen.cursorVisible ? screen.cursor : null;
    const key = cursor ? `${cursor.row}:${cursor.col}` : '';
    if (key !== this.cursorKey) {
      if (this.cursor) pending.add(this.cursor.row);
      if (cursor) pending.add(cursor.row);
      this.cursor = cursor ? { row: cursor.row, col: cursor.col } : null;
      this.cursorKey = key;
    }
    if (screen.revealed !== this.revealed) {
      this.revealed = screen.revealed;
      for (let r = 0; r < this.rows; r++) pending.add(r);
    }
    if (!pending.size) return false;

    let minRow = this.rows;
    let maxRow = -1;
    for (const r of pending) {
      this.drawRow(screen, r);
      screen.dirty[r] = 0;
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
    }
    // The cursor is drawn over a freshly drawn row only, never twice.
    if (this.cursor && this.cursorPhase && pending.has(this.cursor.row)) this.drawCursor(screen, this.cursor);
    pending.clear();
    this.ctx.putImageData(this.image, 0, 0, 0, minRow * CELL_HEIGHT, this.width, (maxRow - minRow + 1) * CELL_HEIGHT);
    return true;
  }

  drawRow(screen, row) {
    const cells = screen.resolveRow(row, this.rowBuffer);
    const { pixels, palette, width } = this;
    let hasFlash = 0;
    for (let c = 0; c < this.cols; c++) {
      const cell = cells[c];
      const glyph = cell.mosaic
        ? sextantRows(sextantBits(cell.char), cell.separated)
        : getGlyph(cell.char) || NOTDEF;
      if (cell.flash) hasFlash = 1;
      const hidden = cell.conceal || (cell.flash && !this.flashPhase);
      const fg = palette[cell.fg];
      const bg = palette[cell.bg];
      const w = cell.width;
      const h = cell.height;
      const offX = cell.partX * CELL_WIDTH;
      const offY = cell.partY * CELL_HEIGHT;
      const underlineRow = cell.underline && !hidden && cell.partY === h - 1;
      let p = row * CELL_HEIGHT * width + c * CELL_WIDTH;
      for (let y = 0; y < CELL_HEIGHT; y++) {
        const bits = hidden ? 0 : glyph[((y + offY) / h) | 0];
        const underline = underlineRow && y === CELL_HEIGHT - 1;
        for (let x = 0; x < CELL_WIDTH; x++) {
          const on = underline || (bits & (0x80 >> (((x + offX) / w) | 0))) !== 0;
          pixels[p + x] = on ? fg : bg;
        }
        p += width;
      }
    }
    this.flashRows[row] = hasFlash;
  }

  drawCursor(screen, { row, col }) {
    const cell = screen.resolveRow(row)[col - 1];
    if (!cell) return;
    const { pixels, palette, width } = this;
    const bg = palette[cell.bg];
    const fg = palette[cell.fg === cell.bg ? (cell.bg === 7 ? 0 : 7) : cell.fg];
    let p = row * CELL_HEIGHT * width + (col - 1) * CELL_WIDTH;
    for (let y = 0; y < CELL_HEIGHT; y++) {
      for (let x = 0; x < CELL_WIDTH; x++) pixels[p + x] = pixels[p + x] === bg ? fg : bg;
      p += width;
    }
  }

  /** Force a full redraw on the next render (theme change, context restore...). */
  invalidate() {
    this.forceAll = true;
  }
}
