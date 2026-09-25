/**
 * Minitel page memory: 24 rows of 40 cells plus the status row 0.
 *
 * The model follows the Videotex attribute rules of the STUM1B:
 *  - character attributes (foreground, flash, size, inversion) are stored on
 *    every character written;
 *  - zone attributes (background, underline, conceal) only take effect at a
 *    delimiter — a space in alphanumeric mode, any character in mosaic
 *    mode — and last until the next delimiter or the end of the row.
 * `resolveRow()` applies those serial rules and returns what is displayed.
 */
import { COLS, ROWS } from './constants.js';

export function defaultAttributes() {
  return {
    fg: 7,
    bg: 0,
    flash: false,
    invert: false,
    underline: false,
    conceal: false,
    width: 1,
    height: 1,
    mosaic: false,
  };
}

export class Cell {
  constructor() {
    this.clear();
  }

  clear() {
    this.char = ' ';
    this.mosaic = false;
    this.fg = 7;
    this.bg = 0;
    this.flash = false;
    this.invert = false;
    this.underline = false; // G0: underline zone attribute, G1: separated mosaic
    this.conceal = false;
    this.delimiter = false; // G0 space carrying zone attributes
    this.width = 1;
    this.height = 1;
    this.partX = 0;
    this.partY = 0;
    return this;
  }

  copyFrom(other) {
    Object.assign(this, other);
    return this;
  }
}

export class Screen {
  constructor({ cols = COLS, rows = ROWS } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: rows + 1 }, () => Array.from({ length: cols }, () => new Cell()));
    this.dirty = new Uint8Array(rows + 1);
    this.reset();
  }

  /** Full terminal reset, including the status row. */
  reset() {
    for (let r = 0; r <= this.rows; r++) this.clearRow(r);
    this.cursor = { row: 1, col: 1 };
    this.cursorVisible = false;
    this.attrs = defaultAttributes();
    this.saved = null;
    this.rouleau = false;
    this.insertMode = false;
    this.revealed = false;
    this.lastChar = ' ';
    this.lastMosaic = false;
    this.indicator = null;
    this.version = (this.version || 0) + 1;
  }

  /**
   * Connection indicator shown by the terminal itself in the last column of
   * row 0 ('F' offline, 'C' connected); servers cannot overwrite it.
   */
  setIndicator(ch) {
    this.indicator = ch || null;
    this.markDirty(0);
  }

  markDirty(row) {
    this.dirty[row] = 1;
    this.version++;
  }

  markAllDirty() {
    this.dirty.fill(1);
    this.version++;
  }

  cell(row, col) {
    return this.grid[row][col - 1];
  }

  resetAttributes() {
    this.attrs = defaultAttributes();
  }

  /* ---------------------------------------------------------------- */
  /* Clearing and scrolling                                            */
  /* ---------------------------------------------------------------- */

  clearRow(row, from = 1, to = this.cols) {
    const cells = this.grid[row];
    for (let c = from; c <= to; c++) cells[c - 1].clear();
    this.markDirty(row);
  }

  /** FF: clear rows 1..24, home the cursor, reset attributes. */
  clearScreen() {
    for (let r = 1; r <= this.rows; r++) this.clearRow(r);
    this.cursor = { row: 1, col: 1 };
    this.saved = null;
    this.resetAttributes();
  }

  /** CSI J variants. */
  eraseDisplay(mode = 0) {
    const { row, col } = this.cursor;
    if (row === 0) return;
    if (mode === 0) {
      this.clearRow(row, col);
      for (let r = row + 1; r <= this.rows; r++) this.clearRow(r);
    } else if (mode === 1) {
      for (let r = 1; r < row; r++) this.clearRow(r);
      this.clearRow(row, 1, col);
    } else {
      for (let r = 1; r <= this.rows; r++) this.clearRow(r);
    }
  }

  /** CSI K variants. */
  eraseLine(mode = 0) {
    const { row, col } = this.cursor;
    if (mode === 0) this.clearRow(row, col);
    else if (mode === 1) this.clearRow(row, 1, col);
    else this.clearRow(row);
  }

  /** CAN: fill from the cursor to the end of the row with spaces in the current attributes. */
  cancelRow() {
    const { row, col } = this.cursor;
    for (let c = col; c <= this.cols; c++) this.writeCell(row, c, ' ', false, 1, 1, 0, 0);
  }

  scrollUp(top = 1, bottom = this.rows) {
    const [first] = this.grid.splice(top, 1);
    this.grid.splice(bottom, 0, first);
    first.forEach((cell) => cell.clear());
    for (let r = top; r <= bottom; r++) this.dirty[r] = 1;
    this.version++;
  }

  scrollDown(top = 1, bottom = this.rows) {
    const [last] = this.grid.splice(bottom, 1);
    this.grid.splice(top, 0, last);
    last.forEach((cell) => cell.clear());
    for (let r = top; r <= bottom; r++) this.dirty[r] = 1;
    this.version++;
  }

  insertLines(n) {
    const { row } = this.cursor;
    if (row === 0) return;
    for (let i = 0; i < n; i++) this.scrollDown(row, this.rows);
  }

  deleteLines(n) {
    const { row } = this.cursor;
    if (row === 0) return;
    for (let i = 0; i < n; i++) this.scrollUp(row, this.rows);
  }

  insertChars(n) {
    const { row, col } = this.cursor;
    const cells = this.grid[row];
    for (let i = 0; i < n; i++) {
      const cell = cells.pop().clear();
      cells.splice(col - 1, 0, cell);
    }
    this.markDirty(row);
  }

  deleteChars(n) {
    const { row, col } = this.cursor;
    const cells = this.grid[row];
    for (let i = 0; i < n; i++) {
      const [cell] = cells.splice(col - 1, 1);
      cells.push(cell.clear());
    }
    this.markDirty(row);
  }

  /* ---------------------------------------------------------------- */
  /* Cursor movement                                                   */
  /* ---------------------------------------------------------------- */

  /** US / CSI H positioning. Moving into row 0 saves the page position. */
  moveTo(row, col, { resetAttributes = true } = {}) {
    row = Math.max(0, Math.min(this.rows, row));
    col = Math.max(1, Math.min(this.cols, col));
    if (row === 0 && this.cursor.row !== 0) {
      this.saved = { cursor: { ...this.cursor }, attrs: { ...this.attrs } };
    } else if (row !== 0) {
      this.saved = null;
    }
    this.cursor = { row, col };
    if (resetAttributes) this.resetAttributes();
  }

  home() {
    this.cursor = { row: 1, col: 1 };
    this.saved = null;
    this.resetAttributes();
  }

  carriageReturn() {
    this.cursor.col = 1;
  }

  lineFeed() {
    const c = this.cursor;
    if (c.row === 0) {
      // Leaving the status row restores the page position.
      if (this.saved) {
        this.cursor = this.saved.cursor;
        this.attrs = this.saved.attrs;
        this.saved = null;
      } else {
        this.cursor = { row: 1, col: c.col };
      }
      return;
    }
    if (c.row < this.rows) c.row++;
    else if (this.rouleau) this.scrollUp();
    else c.row = 1;
  }

  cursorUp() {
    const c = this.cursor;
    if (c.row === 0) return;
    if (c.row > 1) c.row--;
    else if (this.rouleau) this.scrollDown();
    else c.row = this.rows;
  }

  cursorLeft() {
    const c = this.cursor;
    if (c.col > 1) {
      c.col--;
    } else if (c.row !== 0) {
      c.col = this.cols;
      this.cursorUp();
    }
  }

  cursorRight() {
    this.advance(1);
  }

  advance(n) {
    const c = this.cursor;
    c.col += n;
    if (c.col > this.cols) {
      if (c.row === 0) {
        c.col = this.cols;
        return;
      }
      c.col = 1;
      this.lineFeed();
    }
  }

  /** CSI-style relative movement, clamped (no wrap). */
  moveBy(dRow, dCol) {
    const c = this.cursor;
    if (c.row !== 0) c.row = Math.max(1, Math.min(this.rows, c.row + dRow));
    c.col = Math.max(1, Math.min(this.cols, c.col + dCol));
  }

  /* ---------------------------------------------------------------- */
  /* Writing                                                           */
  /* ---------------------------------------------------------------- */

  writeCell(row, col, ch, mosaic, width, height, partX, partY) {
    const a = this.attrs;
    const cell = this.grid[row][col - 1];
    cell.char = ch;
    cell.mosaic = mosaic;
    cell.fg = a.fg;
    cell.bg = a.bg;
    cell.flash = a.flash;
    cell.invert = mosaic ? false : a.invert;
    cell.underline = a.underline;
    cell.conceal = a.conceal;
    cell.delimiter = !mosaic && ch === ' ';
    cell.width = width;
    cell.height = height;
    cell.partX = partX;
    cell.partY = partY;
    this.markDirty(row);
  }

  /** Display a character at the cursor with the current attributes. */
  put(ch, mosaic = false) {
    const { row, col } = this.cursor;
    let width = mosaic ? 1 : this.attrs.width;
    let height = mosaic ? 1 : this.attrs.height;
    if (row <= 1) height = 1; // double height needs the row above
    if (row === 0 || col === this.cols) width = 1;
    if (this.insertMode) this.insertChars(width);
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        this.writeCell(row - (height - 1) + dy, col + dx, ch, mosaic, width, height, dx, dy);
      }
    }
    this.lastChar = ch;
    this.lastMosaic = mosaic;
    this.advance(width);
  }

  /** REP: repeat the last displayed character. */
  repeat(count) {
    for (let i = 0; i < count; i++) this.put(this.lastChar, this.lastMosaic);
  }

  /* ---------------------------------------------------------------- */
  /* Reading                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Resolve serial attributes of a row. Returns, for each column, what is
   * displayed: { char, mosaic, fg, bg, flash, underline, separated, conceal,
   * width, height, partX, partY }. Inversion is already applied.
   */
  resolveRow(row, out = []) {
    const cells = this.grid[row];
    let zoneBg = 0;
    let zoneUnderline = false;
    let zoneConceal = false;
    for (let c = 0; c < this.cols; c++) {
      const cell = cells[c];
      if (cell.mosaic) {
        zoneBg = cell.bg;
        zoneUnderline = false;
        zoneConceal = cell.conceal;
      } else if (cell.delimiter) {
        zoneBg = cell.bg;
        zoneUnderline = cell.underline;
        zoneConceal = cell.conceal;
      }
      const r = out[c] || (out[c] = {});
      r.char = cell.char;
      r.mosaic = cell.mosaic;
      r.flash = cell.flash;
      r.width = cell.width;
      r.height = cell.height;
      r.partX = cell.partX;
      r.partY = cell.partY;
      if (row === 0 && c === this.cols - 1 && this.indicator) {
        Object.assign(r, { char: this.indicator, mosaic: false, fg: 7, bg: 0, flash: false, underline: false, separated: false, conceal: false, width: 1, height: 1, partX: 0, partY: 0 });
        continue;
      }
      if (cell.mosaic) {
        r.fg = cell.fg;
        r.bg = cell.bg;
        r.underline = false;
        r.separated = cell.underline;
        r.conceal = cell.conceal && !this.revealed;
      } else {
        r.fg = cell.invert ? zoneBg : cell.fg;
        r.bg = cell.invert ? cell.fg : zoneBg;
        r.underline = zoneUnderline;
        r.separated = false;
        r.conceal = zoneConceal && !this.revealed;
      }
    }
    return out;
  }

  /** Plain text of a row (status row is 0). */
  rowText(row) {
    return this.grid[row].map((cell) => (cell.height === 2 && cell.partY === 0 ? ' ' : cell.char)).join('');
  }

  /** Plain text of the page (rows 1..24), trailing spaces trimmed. */
  toText({ statusRow = false } = {}) {
    const lines = [];
    for (let r = statusRow ? 0 : 1; r <= this.rows; r++) lines.push(this.rowText(r).replace(/\s+$/, ''));
    return lines.join('\n');
  }

  /** Serializable snapshot, e.g. for tests or thumbnails. */
  snapshot() {
    return this.grid.map((row) => row.map((cell) => ({ ...cell })));
  }
}
