/**
 * Videotex stream writer — a chainable builder that produces the exact bytes
 * a Minitel server sends.
 *
 *   const page = new Videotex()
 *     .clear().cursor(false)
 *     .moveTo(1, 1).bg('blue').text(' '.repeat(40))
 *     .moveTo(3, 4).size('double').color('yellow').text('3615 METEO');
 *   terminal.write(page);        // or page.bytes()
 *
 * Remember the Videotex rule: background, underline and conceal are zone
 * attributes. They only take effect at the next space (or mosaic character),
 * and every positioning (moveTo) resets all attributes.
 */
import * as C from './constants.js';
import { encodeChar, g1Byte } from './charset.js';

const SIZES = {
  normal: C.ATTR.NORMAL_SIZE,
  tall: C.ATTR.DOUBLE_HEIGHT,
  'double-height': C.ATTR.DOUBLE_HEIGHT,
  wide: C.ATTR.DOUBLE_WIDTH,
  'double-width': C.ATTR.DOUBLE_WIDTH,
  double: C.ATTR.DOUBLE_SIZE,
  'double-size': C.ATTR.DOUBLE_SIZE,
};

/** Colour name or index (0..7) to index. */
export function colorIndex(color) {
  if (typeof color === 'number') return color & 7;
  const index = C.COLOR_INDEX[color];
  if (index === undefined) throw new Error(`Unknown Minitel colour "${color}"`);
  return index;
}

/**
 * Sextant bits from a 2x3 pattern, e.g. sextant('#.', '##', '.#').
 * Accepts either three 2-char rows or a single 6-char string.
 */
export function sextant(...rows) {
  const s = rows.join('');
  let bits = 0;
  for (let i = 0; i < 6; i++) if (s[i] && s[i] !== '.' && s[i] !== ' ') bits |= 1 << i;
  return bits;
}

export class Videotex {
  constructor(initial) {
    this.out = [];
    this.mosaicMode = false;
    if (initial) this.append(initial);
  }

  get length() {
    return this.out.length;
  }

  /** Raw bytes, numbers or binary strings. */
  raw(...parts) {
    for (const part of parts) {
      if (typeof part === 'number') this.out.push(part & 0xff);
      else if (typeof part === 'string') for (let i = 0; i < part.length; i++) this.out.push(part.charCodeAt(i) & 0xff);
      else for (const b of part) this.out.push(b & 0xff);
    }
    return this;
  }

  /** Append another writer or byte sequence. The mode tracking follows the appended stream. */
  append(other) {
    if (other instanceof Videotex) {
      this.out.push(...other.out);
      this.mosaicMode = other.mosaicMode;
    } else {
      this.raw(other);
      this.mosaicMode = false;
    }
    return this;
  }

  /* ---------------------------------------------------------------- */
  /* Screen and cursor                                                 */
  /* ---------------------------------------------------------------- */

  /** FF: clear the page (rows 1..24), home the cursor, reset attributes. */
  clear() {
    this.mosaicMode = false;
    return this.raw(C.FF);
  }

  /** RS: cursor to row 1 column 1, attributes reset. */
  home() {
    this.mosaicMode = false;
    return this.raw(C.RS);
  }

  /** US: absolute positioning (row 0 is the status row). Resets attributes. */
  moveTo(row, col = 1) {
    this.mosaicMode = false;
    return this.raw(C.US, 0x40 + row, 0x40 + col);
  }

  /** Show (CON) or hide (COFF) the cursor. */
  cursor(visible = true) {
    return this.raw(visible ? C.CON : C.COFF);
  }

  newline() {
    return this.raw(C.CR, C.LF);
  }

  cr() { return this.raw(C.CR); }
  lf(n = 1) { for (let i = 0; i < n; i++) this.raw(C.LF); return this; }
  up(n = 1) { for (let i = 0; i < n; i++) this.raw(C.VT); return this; }
  left(n = 1) { for (let i = 0; i < n; i++) this.raw(C.BS); return this; }
  right(n = 1) { for (let i = 0; i < n; i++) this.raw(C.HT); return this; }

  /** CAN: clear from the cursor to the end of the row. */
  clearEOL() {
    return this.raw(C.CAN);
  }

  /** CSI J: 0 = to end of screen, 1 = from start, 2 = whole screen. */
  eraseScreen(mode = 2) {
    return this.raw(C.ESC, C.CSI, ...String(mode).split('').map((c) => c.charCodeAt(0)), 0x4a);
  }

  /** CSI K: 0 = to end of row, 1 = from start of row, 2 = whole row. */
  eraseLine(mode = 2) {
    return this.raw(C.ESC, C.CSI, ...String(mode).split('').map((c) => c.charCodeAt(0)), 0x4b);
  }

  bell() {
    return this.raw(C.BEL);
  }

  /** CSI sequence: ESC [ params final. */
  csi(params, final) {
    return this.raw(C.ESC, C.CSI, String(params ?? ''), final);
  }

  /** CSI n L / CSI n M: insert or delete rows at the cursor (the rows below move). */
  insertLines(n = 1) { return this.csi(n, 'L'); }
  deleteLines(n = 1) { return this.csi(n, 'M'); }

  /** CSI n @ / CSI n P: insert or delete characters at the cursor. */
  insertChars(n = 1) { return this.csi(n, '@'); }
  deleteChars(n = 1) { return this.csi(n, 'P'); }

  /** Relative cursor moves without wrapping (CSI A/B/C/D). */
  cursorBy(rows = 0, cols = 0) {
    if (rows < 0) this.csi(-rows, 'A');
    if (rows > 0) this.csi(rows, 'B');
    if (cols > 0) this.csi(cols, 'C');
    if (cols < 0) this.csi(-cols, 'D');
    return this;
  }

  /** ESC 6/1: ask the terminal where its cursor is (it answers US row col). */
  requestCursor() {
    return this.raw(C.ESC, 0x61);
  }

  /** PRO1 ENQROM: ask the terminal for its identification. */
  requestIdentity() {
    return this.raw(C.ESC, C.PRO1, C.ENQROM);
  }

  /** PRO2 START/STOP ROULEAU: scroll instead of wrapping at the bottom. */
  scroll(on = true) {
    return this.raw(C.ESC, C.PRO2, on ? C.PRO_START : C.PRO_STOP, C.MODE_ROULEAU);
  }

  /** PRO2 START/STOP MINUSCULES: keyboard types lowercase by default. */
  lowercase(on = true) {
    return this.raw(C.ESC, C.PRO2, on ? C.PRO_START : C.PRO_STOP, C.MODE_MINUSCULES);
  }

  /** PRO3 keyboard-to-screen switch: local echo on/off. */
  echo(on = true) {
    return this.raw(C.ESC, C.PRO3, on ? C.AIGUILLAGE_ON : C.AIGUILLAGE_OFF, C.RECEIVER_SCREEN, C.EMITTER_KEYBOARD);
  }

  /** Write a message in the status row (row 0), then come back. */
  status(message = '', { color } = {}) {
    this.moveTo(0, 1);
    if (color !== undefined) this.color(color);
    return this.text(message).clearEOL().lf();
  }

  /* ---------------------------------------------------------------- */
  /* Attributes                                                        */
  /* ---------------------------------------------------------------- */

  /** Foreground colour (name or 0..7). */
  color(color) {
    return this.raw(C.ESC, C.ATTR.FG + colorIndex(color));
  }

  /** Background colour — a zone attribute, validated by the next space or mosaic. */
  bg(color) {
    return this.raw(C.ESC, C.ATTR.BG + colorIndex(color));
  }

  flash(on = true) {
    return this.raw(C.ESC, on ? C.ATTR.FLASH : C.ATTR.STEADY);
  }

  /** Inverse video (alphanumeric mode). */
  invert(on = true) {
    return this.raw(C.ESC, on ? C.ATTR.INVERT_ON : C.ATTR.INVERT_OFF);
  }

  /** Underline in text mode, separated (disjoint) mosaics in mosaic mode. */
  underline(on = true) {
    return this.raw(C.ESC, on ? C.ATTR.UNDERLINE_ON : C.ATTR.UNDERLINE_OFF);
  }

  separated(on = true) {
    return this.underline(on);
  }

  conceal(on = true) {
    return this.raw(C.ESC, on ? C.ATTR.CONCEAL : C.ATTR.REVEAL);
  }

  /** 'normal' | 'tall' | 'wide' | 'double' (double height + width). */
  size(kind = 'normal') {
    const code = SIZES[kind];
    if (!code) throw new Error(`Unknown character size "${kind}"`);
    return this.raw(C.ESC, code);
  }

  /** Apply several attributes at once: { color, bg, size, flash, invert, underline }. */
  style({ color, bg, size, flash, invert, underline, conceal } = {}) {
    if (color !== undefined) this.color(color);
    if (bg !== undefined) this.bg(bg);
    if (size !== undefined) this.size(size);
    if (flash !== undefined) this.flash(flash);
    if (invert !== undefined) this.invert(invert);
    if (underline !== undefined) this.underline(underline);
    if (conceal !== undefined) this.conceal(conceal);
    return this;
  }

  /* ---------------------------------------------------------------- */
  /* Content                                                           */
  /* ---------------------------------------------------------------- */

  alpha() {
    if (this.mosaicMode) {
      this.mosaicMode = false;
      this.raw(C.SI);
    }
    return this;
  }

  graphics() {
    if (!this.mosaicMode) {
      this.mosaicMode = true;
      this.raw(C.SO);
    }
    return this;
  }

  /**
   * Text in the alphanumeric set. Accents use G2, other characters are
   * transliterated. Runs of 4+ identical characters are compressed with REP.
   * '\n' becomes CR LF.
   */
  text(value) {
    this.alpha();
    const chars = [...String(value)];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '\n') {
        this.newline();
        continue;
      }
      if (ch === '\r') continue;
      const bytes = encodeChar(ch);
      let run = 1;
      if (bytes.length === 1) while (chars[i + run] === ch) run++;
      this.raw(bytes);
      if (run >= 4) {
        this.repeat(run - 1);
        i += run - 1;
      }
    }
    return this;
  }

  /** Mosaic characters from sextant bit patterns (0..63). Runs are compressed with REP. */
  mosaic(...patterns) {
    this.graphics();
    const list = patterns.flat();
    for (let i = 0; i < list.length; i++) {
      const bits = list[i];
      let run = 1;
      while (list[i + run] === bits) run++;
      this.raw(g1Byte(bits));
      if (run >= 4) {
        this.repeat(run - 1);
        i += run - 1;
      }
    }
    return this;
  }

  /** REP: repeat the previous character `count` times. */
  repeat(count) {
    while (count > 0) {
      const n = Math.min(count, 63);
      this.raw(C.REP, 0x40 + n);
      count -= n;
    }
    return this;
  }

  /** Repeat a single character `count` times (uses REP). */
  fill(ch, count) {
    if (count <= 0) return this;
    this.text(ch);
    if (count > 1) this.repeat(count - 1);
    return this;
  }

  /* ---------------------------------------------------------------- */
  /* Output                                                            */
  /* ---------------------------------------------------------------- */

  bytes() {
    return Uint8Array.from(this.out);
  }

  toString() {
    let s = '';
    for (let i = 0; i < this.out.length; i += 4096) s += String.fromCharCode(...this.out.slice(i, i + 4096));
    return s;
  }
}

/** Shorthand: vdt().clear().text('...') */
export function vdt(initial) {
  return new Videotex(initial);
}
