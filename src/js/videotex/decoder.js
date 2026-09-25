/**
 * Videotex stream decoder: turns the bytes a Minitel receives into
 * operations on a Screen. Covers the STUM1B Videotex mode: C0 controls,
 * attributes, G0/G1/G2 sets, REP, US positioning (binary and decimal forms),
 * row 0, CSI cursor/erase functions, and the PRO1/PRO2/PRO3 protocol
 * sequences a server commonly relies on.
 */
import * as C from './constants.js';
import { g0Char, g1Char, composeAccent } from './charset.js';

const GROUND = 0;
const ESCAPE = 1;
const CSI_PARAMS = 2;
const US_ARGS = 3;
const REP_ARG = 4;
const SS2_ARG = 5;
const ACCENT_BASE = 6;
const PRO_ARGS = 7;
const SKIP = 8;
const DESIGNATE = 9;

export class Decoder {
  /**
   * @param {import('./screen.js').Screen} screen
   * @param {object} [hooks]
   * @param {() => void} [hooks.onBell] BEL received
   * @param {(bytes: number[]) => void} [hooks.onResponse] bytes the terminal answers (ENQROM, cursor position...)
   * @param {(mode: string, value: boolean) => void} [hooks.onMode] keyboard modes (minuscules, echo)
   * @param {string} [hooks.identity] 3-character ENQROM identification
   */
  constructor(screen, hooks = {}) {
    this.screen = screen;
    this.hooks = hooks;
    this.identity = hooks.identity || 'Cu;';
    this.reset();
  }

  reset() {
    this.state = GROUND;
    this.mosaic = false;
    this.args = [];
    this.expected = 0;
    this.accent = 0;
  }

  /** Feed bytes (Uint8Array, number[] or binary string). */
  write(input) {
    if (typeof input === 'string') {
      for (let i = 0; i < input.length; i++) this.feed(input.charCodeAt(i) & 0x7f);
    } else {
      for (let i = 0; i < input.length; i++) this.feed(input[i] & 0x7f);
    }
  }

  feed(b) {
    switch (this.state) {
      case GROUND: return this.ground(b);
      case ESCAPE: return this.escape(b);
      case CSI_PARAMS: return this.csi(b);
      case US_ARGS: return this.usArgs(b);
      case REP_ARG:
        this.state = GROUND;
        if (b >= 0x40) this.screen.repeat(b - 0x40);
        return undefined;
      case SS2_ARG: return this.ss2(b);
      case ACCENT_BASE: {
        this.state = GROUND;
        if (b >= 0x20) this.putText(composeAccent(this.accent, String.fromCharCode(b)));
        return undefined;
      }
      case PRO_ARGS:
        this.args.push(b);
        if (this.args.length === this.expected) {
          this.state = GROUND;
          this.protocol(this.args);
        }
        return undefined;
      case SKIP:
        if (--this.expected <= 0) this.state = GROUND;
        return undefined;
      case DESIGNATE:
        // ESC ( [SP] F : G-set designation (DRCS...). Consume and ignore.
        if (b !== 0x20) this.state = GROUND;
        return undefined;
      default:
        this.state = GROUND;
        return undefined;
    }
  }

  /* ---------------------------------------------------------------- */

  ground(b) {
    if (b >= 0x20) {
      if (this.mosaic && (b < 0x40 || b >= 0x60)) {
        this.screen.put(g1Char(b), true);
      } else {
        this.putText(g0Char(b));
      }
      return;
    }
    const s = this.screen;
    switch (b) {
      case C.BEL: this.hooks.onBell?.(); break;
      case C.BS: s.cursorLeft(); break;
      case C.HT: s.cursorRight(); break;
      case C.LF: s.lineFeed(); break;
      case C.VT: s.cursorUp(); break;
      case C.FF: s.clearScreen(); this.mosaic = false; break;
      case C.CR: s.carriageReturn(); break;
      case C.SO: this.mosaic = true; break;
      case C.SI: this.mosaic = false; break;
      case C.CON: s.cursorVisible = true; s.version++; break;
      case C.COFF: s.cursorVisible = false; s.version++; break;
      case C.REP: this.state = REP_ARG; break;
      case C.SEP: this.skip(1); break;
      case C.CAN: s.cancelRow(); break;
      case C.SS2: if (!this.mosaic) this.state = SS2_ARG; break;
      case C.SUB: this.putText('▒'); break;
      case C.ESC: this.state = ESCAPE; break;
      case C.SS3: this.skip(1); break;
      case C.RS: s.home(); this.mosaic = false; break;
      case C.US: this.state = US_ARGS; this.args = []; break;
      default: break; // NUL, SOH, EOT, SYN... ignored
    }
  }

  putText(ch) {
    this.screen.put(ch, false);
  }

  ss2(b) {
    this.state = GROUND;
    if (C.G2_ACCENTS[b]) {
      this.accent = b;
      this.state = ACCENT_BASE;
    } else if (C.G2_CHARS[b]) {
      this.putText(C.G2_CHARS[b]);
    } else if (b >= 0x20) {
      this.putText('?');
    }
  }

  usArgs(b) {
    this.args.push(b);
    const [first] = this.args;
    const decimal = first >= 0x30 && first <= 0x39;
    if (this.args.length < (decimal ? 4 : 2)) return;
    this.state = GROUND;
    let row;
    let col;
    if (decimal) {
      const digits = this.args.map((d) => d - 0x30);
      row = digits[0] * 10 + digits[1];
      col = digits[2] * 10 + digits[3];
    } else {
      row = this.args[0] - 0x40;
      col = this.args[1] - 0x40;
    }
    if (row < 0 || row > this.screen.rows) return;
    this.screen.moveTo(row, col);
    this.mosaic = false;
  }

  escape(b) {
    this.state = GROUND;
    if (b < 0x20) return this.ground(b); // control inside an escape: abort it
    const s = this.screen;
    const a = s.attrs;
    if (b >= 0x40 && b <= 0x47) { a.fg = b - 0x40; return; }
    if (b >= 0x50 && b <= 0x57) { a.bg = b - 0x50; return; }
    switch (b) {
      case C.ATTR.FLASH: a.flash = true; break;
      case C.ATTR.STEADY: a.flash = false; break;
      case C.ATTR.NORMAL_SIZE: a.width = 1; a.height = 1; break;
      case C.ATTR.DOUBLE_HEIGHT: a.width = 1; a.height = 2; break;
      case C.ATTR.DOUBLE_WIDTH: a.width = 2; a.height = 1; break;
      case C.ATTR.DOUBLE_SIZE: a.width = 2; a.height = 2; break;
      case C.ATTR.CONCEAL: a.conceal = true; break;
      case C.ATTR.REVEAL: a.conceal = false; break;
      case C.ATTR.UNDERLINE_OFF: a.underline = false; break;
      case C.ATTR.UNDERLINE_ON: a.underline = true; break;
      case C.ATTR.INVERT_OFF: a.invert = false; break;
      case C.ATTR.INVERT_ON: a.invert = true; break;
      case C.ATTR.TRANSPARENT: a.bg = 0; break;
      case C.CSI: this.state = CSI_PARAMS; this.args = ['']; break;
      case C.PRO1: this.expectProtocol(1); break;
      case C.PRO2: this.expectProtocol(2); break;
      case C.PRO3: this.expectProtocol(3); break;
      case 0x61: // cursor position request
        this.respond([C.US, 0x40 + s.cursor.row, 0x40 + s.cursor.col]);
        break;
      case 0x23: // ESC # SP attr : screen-wide attribute (mask / unmask)
        this.state = PRO_ARGS;
        this.args = [0x23];
        this.expected = 3;
        break;
      case 0x28: case 0x29: case 0x2a: case 0x2b:
        this.state = DESIGNATE;
        break;
      case 0x25: this.skip(1); break;
      default: break;
    }
  }

  csi(b) {
    if (b < 0x20) {
      this.state = GROUND;
      return this.ground(b);
    }
    if (b >= 0x30 && b <= 0x39) {
      this.args[this.args.length - 1] += String.fromCharCode(b);
      return;
    }
    if (b === 0x3b) {
      this.args.push('');
      return;
    }
    this.state = GROUND;
    if (b < 0x40) return; // malformed sequence: drop it
    const s = this.screen;
    const n = (i, fallback = 1) => (this.args[i] === '' || this.args[i] === undefined ? fallback : Number(this.args[i]));
    switch (b) {
      case 0x41: s.moveBy(-n(0), 0); break; // A up
      case 0x42: s.moveBy(n(0), 0); break; // B down
      case 0x43: s.moveBy(0, n(0)); break; // C right
      case 0x44: s.moveBy(0, -n(0)); break; // D left
      case 0x48: case 0x66: s.moveTo(n(0), n(1), { resetAttributes: false }); break; // H / f
      case 0x4a: s.eraseDisplay(n(0, 0)); break; // J
      case 0x4b: s.eraseLine(n(0, 0)); break; // K
      case 0x40: s.insertChars(n(0)); break; // @
      case 0x50: s.deleteChars(n(0)); break; // P
      case 0x4c: s.insertLines(n(0)); break; // L
      case 0x4d: s.deleteLines(n(0)); break; // M
      case 0x68: if (n(0, 0) === 4) s.insertMode = true; break; // h
      case 0x6c: if (n(0, 0) === 4) s.insertMode = false; break; // l
      default: break;
    }
  }

  expectProtocol(count) {
    this.state = PRO_ARGS;
    this.args = [];
    this.expected = count;
  }

  skip(count) {
    this.state = SKIP;
    this.expected = count;
  }

  protocol(args) {
    const s = this.screen;
    if (args[0] === 0x23) {
      // ESC # SP X: mask (0x58) or unmask (0x5f) the whole screen.
      if (args[2] === C.ATTR.CONCEAL) { s.revealed = false; s.markAllDirty(); }
      if (args[2] === C.ATTR.REVEAL) { s.revealed = true; s.markAllDirty(); }
      return;
    }
    if (args.length === 1) {
      if (args[0] === C.ENQROM) this.respond([C.SOH, ...[...this.identity].map((c) => c.charCodeAt(0)), C.EOT]);
      if (args[0] === C.PRO1_RESET) { s.reset(); this.reset(); s.markAllDirty(); }
      return;
    }
    if (args.length === 2) {
      const [action, mode] = args;
      if (action !== C.PRO_START && action !== C.PRO_STOP) return;
      const on = action === C.PRO_START;
      if (mode === C.MODE_ROULEAU) s.rouleau = on;
      if (mode === C.MODE_MINUSCULES) this.hooks.onMode?.('lowercase', on);
      return;
    }
    const [action, receiver, emitter] = args;
    if (receiver === C.RECEIVER_SCREEN && emitter === C.EMITTER_KEYBOARD) {
      if (action === C.AIGUILLAGE_ON) this.hooks.onMode?.('echo', true);
      if (action === C.AIGUILLAGE_OFF) this.hooks.onMode?.('echo', false);
    }
  }

  respond(bytes) {
    this.hooks.onResponse?.(bytes);
  }
}
