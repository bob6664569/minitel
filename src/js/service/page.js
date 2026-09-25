/**
 * Page — a Videotex writer with the building blocks of Télétel pages:
 * bands, headers, menus, prompts, key caps, mosaic lines and panels, big
 * mosaic lettering, pixel art, tables, bar charts.
 *
 *   session.write(new Page()
 *     .clear()
 *     .header({ title: 'METEO', code: 'METEO', color: 'cyan' })
 *     .menu(['Prévisions', 'Carte de France'], { row: 8 })
 *     .prompt({ label: 'Votre choix' }));
 *
 * Every helper positions itself (moveTo), so calls can come in any order.
 * Zone attributes are handled for you: text written on a band re-sends the
 * band colour so that its spaces do not break the band.
 */
import { Videotex, colorIndex } from '../videotex/writer.js';
import { textWidth, toMinitelText } from '../videotex/charset.js';
import { getGlyph } from '../font/glyphs.js';
import { indicesToCells, encodeCells, pixelArt } from '../mosaic/mosaic.js';

export const WIDTH = 40;

/* ---------------------------------------------------------------------- */
/* Text utilities                                                          */
/* ---------------------------------------------------------------------- */

/** Word-wrap text to `width` cells. Explicit '\n' are kept. */
export function wrap(text, width = WIDTH) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (textWidth(w) > width) {
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (textWidth(line) + 1 + textWidth(w) <= width) line += ` ${w}`;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Pad or truncate to `width` cells. align: 'left' | 'right' | 'center'. */
export function pad(text, width, align = 'left') {
  let s = toMinitelText(String(text));
  if ([...s].length > width) s = [...s].slice(0, width).join('');
  const room = width - [...s].length;
  if (align === 'right') return ' '.repeat(room) + s;
  if (align === 'center') return ' '.repeat(Math.floor(room / 2)) + s + ' '.repeat(Math.ceil(room / 2));
  return s + ' '.repeat(room);
}

/** Column to centre `text` on a 40-column row (1-based). */
export function centerCol(text, width = WIDTH, size = 1) {
  return Math.max(1, Math.floor((width - textWidth(text) * size) / 2) + 1);
}

/** Price in francs, French style: 1,29 F */
export function francs(value, digits = 2) {
  return `${value.toFixed(digits).replace('.', ',')} F`;
}

/* Sextant patterns for lines (bit0..5 = TL TR ML MR BL BR). */
export const LINE = Object.freeze({
  top: 0b000011,
  middle: 0b001100,
  bottom: 0b110000,
  full: 0b111111,
  left: 0b010101,
  right: 0b101010,
});

export class Page extends Videotex {
  /* -------------------------------------------------------------- */
  /* Text                                                            */
  /* -------------------------------------------------------------- */

  /**
   * Write text at (row, col) with a style:
   * { color, bg, size, flash, invert, underline }.
   * With a `bg`, a delimiter space is written in the cell before `col` (the
   * Videotex way to open a background zone) and the colour is re-sent so the
   * text's own spaces keep it.
   */
  print(row, col, text, style = {}) {
    const needsDelimiter = style.bg !== undefined && col > 1 && !String(text).startsWith(' ');
    this.moveTo(row, needsDelimiter ? col - 1 : col);
    if (needsDelimiter) this.bg(style.bg).text(' ');
    this.style(style);
    return this.text(text);
  }

  /** Centred text. */
  center(row, text, style = {}) {
    const scale = style.size === 'wide' || style.size === 'double' ? 2 : 1;
    return this.print(row, centerCol(text, WIDTH, scale), text, style);
  }

  /** Right-aligned text ending at column `endCol`. */
  right(row, endCol, text, style = {}) {
    const scale = style.size === 'wide' || style.size === 'double' ? 2 : 1;
    return this.print(row, endCol - textWidth(text) * scale + 1, text, style);
  }

  /**
   * Text on its own background: a delimiter space opens the zone, a black
   * delimiter closes it. Occupies text length + 2 cells.
   */
  label(row, col, text, { color = 'white', bg = 'blue', close = true } = {}) {
    this.moveTo(row, col).color(color).bg(bg).text(` ${text}`);
    if (close) this.bg('black').text(' ');
    return this;
  }

  /** Key cap in inverse video, e.g. key(24, 34, 'ENVOI'). */
  key(row, col, name, { color = 'white' } = {}) {
    return this.moveTo(row, col).color(color).invert(true).text(` ${name} `).invert(false);
  }

  /** Word-wrapped paragraph; the row after the last line is in `this.nextRow`. */
  paragraph(row, col, text, { width = WIDTH - col + 1, color = 'white', bg, align = 'left', lineHeight = 1, maxRows = 24 } = {}) {
    const lines = wrap(text, width);
    let r = row;
    for (const line of lines) {
      if (r > maxRows) break;
      if (line) {
        const c = align === 'center' ? col + Math.floor((width - textWidth(line)) / 2) : align === 'right' ? col + width - textWidth(line) : col;
        this.print(r, c, line, { color, bg });
      }
      r += lineHeight;
    }
    this.nextRow = r;
    return this;
  }

  /* -------------------------------------------------------------- */
  /* Bands, panels, lines                                            */
  /* -------------------------------------------------------------- */

  /** Fill whole rows with a background colour. */
  band(row, { bg = 'blue', rows = 1, col = 1, width = WIDTH } = {}) {
    for (let r = row; r < row + rows; r++) {
      this.moveTo(r, col).bg(bg).fill(' ', width);
      if (col + width <= WIDTH) this.bg('black').text(' ');
    }
    return this;
  }

  /** Rectangle of colour ("pavé"), optionally with a mosaic drop shadow. */
  panel(top, left, bottom, right, { bg = 'blue', shadow } = {}) {
    const width = right - left + 1;
    for (let r = top; r <= bottom; r++) {
      this.moveTo(r, left).bg(bg).fill(' ', width);
      if (right < WIDTH) {
        if (shadow && r > top) this.color(shadow).bg('black').mosaic(LINE.left);
        else this.bg('black').text(' ');
      }
    }
    if (shadow && bottom < 24) {
      this.moveTo(bottom + 1, left + 1).color(shadow).mosaic(new Array(width).fill(LINE.top));
    }
    return this;
  }

  /** Horizontal mosaic line: style top | middle | bottom | full. */
  hline(row, { col = 1, width = WIDTH, color = 'white', bg, style = 'middle', separated = false } = {}) {
    this.moveTo(row, col).color(color);
    if (bg !== undefined) this.bg(bg);
    if (separated) this.separated(true);
    return this.mosaic(new Array(width).fill(LINE[style]));
  }

  /** Vertical mosaic line: style left | right | full. */
  vline(col, { row = 1, height = 24, color = 'white', bg, style = 'left' } = {}) {
    for (let r = row; r < row + height; r++) {
      this.moveTo(r, col).color(color);
      if (bg !== undefined) this.bg(bg);
      this.mosaic(LINE[style]);
    }
    return this;
  }

  /** Frame drawn with half-cell mosaic strokes. */
  box(top, left, bottom, right, { color = 'white', bg } = {}) {
    const width = right - left + 1;
    const start = (r, c) => {
      this.moveTo(r, c).color(color);
      if (bg !== undefined) this.bg(bg);
    };
    // Corners only light the sextant where both strokes meet.
    start(top, left);
    this.mosaic([0b100000, ...new Array(Math.max(0, width - 2)).fill(LINE.bottom), 0b010000]);
    for (let r = top + 1; r < bottom; r++) {
      start(r, left);
      this.mosaic(LINE.right);
      start(r, right);
      this.mosaic(LINE.left);
    }
    start(bottom, left);
    this.mosaic([0b000010, ...new Array(Math.max(0, width - 2)).fill(LINE.top), 0b000001]);
    return this;
  }

  /* -------------------------------------------------------------- */
  /* Page furniture                                                  */
  /* -------------------------------------------------------------- */

  /**
   * Service header: a colour band over rows 1..3 with a double-size title,
   * the service code on the right and an optional subtitle on row 4.
   */
  header({ title, code, subtitle, color = 'white', bg = 'blue', accent = 'yellow', number = '3615' } = {}) {
    this.band(1, { bg, rows: 3 });
    if (code) this.right(1, 39, `${number} ${code}`, { color: accent, bg });
    if (title) this.print(3, 2, title.toUpperCase(), { color, bg, size: 'double' });
    this.hline(4, { color: bg, style: 'top' });
    if (subtitle) this.print(5, 2, subtitle, { color: accent });
    return this;
  }

  /**
   * Numbered menu. Items are strings or { label, hint }.
   * The number sits in an inverse-video key cap.
   */
  menu(items, { row = 6, col = 3, color = 'white', numberColor = 'cyan', hintColor = 'yellow', gap = 2, start = 1 } = {}) {
    items.forEach((item, i) => {
      const { label, hint } = typeof item === 'string' ? { label: item } : item;
      const r = row + i * gap;
      const n = String(start + i);
      this.moveTo(r, col).color(numberColor).invert(true).text(` ${n.padStart(2)} `).invert(false);
      this.color(color).text(` ${label}`);
      if (hint) this.right(r, 39, hint, { color: hintColor });
    });
    return this;
  }

  /**
   * Prompt line (row 24 by default): "Votre choix .. puis ENVOI".
   * Returns the page; the input field is described in `this.field`.
   */
  prompt({ row = 24, label = 'Votre choix', length = 2, key = 'ENVOI', color = 'white', fieldColor = 'cyan' } = {}) {
    const col = 2;
    this.print(row, col, `${label} `, { color });
    const fieldCol = col + textWidth(label) + 1;
    this.color(fieldColor).fill('.', length);
    this.color(color).text(' puis');
    this.key(row, WIDTH - textWidth(key) - 2, key);
    this.field = { row, col: fieldCol, length, color: fieldColor };
    return this;
  }

  /** Hints line, e.g. hints(23, [['SUITE', 'page suivante'], ['SOMMAIRE', 'accueil']]). */
  hints(row, pairs, { color = 'cyan', col = 2 } = {}) {
    this.moveTo(row, col);
    pairs.forEach(([key, text], i) => {
      if (i) this.text('  ');
      this.color('white').invert(true).text(key).invert(false).color(color).text(` ${text}`);
    });
    return this;
  }

  /** "Page 1/3" indicator, right-aligned. */
  pager(page, total, { row = 1, color = 'white', bg } = {}) {
    return this.right(row, 39, `${page}/${total}`, { color, bg });
  }

  /** Status row message. */
  message(text, options) {
    return this.status(text, options);
  }

  /* -------------------------------------------------------------- */
  /* Graphics                                                        */
  /* -------------------------------------------------------------- */

  /**
   * Pixel art (see mosaic/pixelArt): colour letters k r g y b m c w,
   * '#' for `ink`, '.' transparent. Two pixels per column, three per row.
   */
  art(row, col, lines, { ink = 'white', background, separated } = {}) {
    const image = pixelArt(lines, { ink: colorIndex(ink) });
    const cells = indicesToCells(image, { background: background === undefined ? -1 : colorIndex(background) });
    return encodeCells(this, cells, { row, col, separated });
  }

  /**
   * Giant lettering drawn with mosaics from the Minitel font itself:
   * each character is 3 columns x 3 rows.
   */
  bigText(row, col, text, { color = 'white', background, spacing = 1 } = {}) {
    const chars = [...toMinitelText(text)];
    const advance = 5 + spacing;
    const width = chars.length * advance;
    const height = 9;
    const data = new Int8Array(width * height).fill(-1);
    const ink = colorIndex(color);
    chars.forEach((ch, i) => {
      const glyph = getGlyph(ch);
      if (!glyph) return;
      for (let y = 0; y < height; y++) {
        const bits = glyph[y + 1];
        for (let x = 0; x < 5; x++) if (bits & (0x80 >> (x + 1))) data[y * width + i * advance + x] = ink;
      }
    });
    const cells = indicesToCells({ width, height, data }, { background: background === undefined ? -1 : colorIndex(background) });
    return encodeCells(this, cells, { row, col });
  }

  /** Horizontal progress bar with half-cell resolution. */
  progress(row, col, width, ratio, { color = 'green', bg = 'black', track = 'blue' } = {}) {
    const halves = Math.round(Math.max(0, Math.min(1, ratio)) * width * 2);
    const cells = [];
    for (let i = 0; i < width; i++) {
      const filled = Math.max(0, Math.min(2, halves - i * 2));
      cells.push(filled === 2 ? LINE.full : filled === 1 ? LINE.left : 0);
    }
    this.moveTo(row, col).color(color).bg(track === undefined ? bg : track);
    return this.mosaic(cells);
  }

  /**
   * Vertical bar chart with 1/3-cell resolution. Two bars per cell column
   * when `pair` is true (each bar is half a cell wide).
   */
  chart(row, col, values, { height = 6, color = 'green', bg = 'black', max, pair = false } = {}) {
    const top = max ?? Math.max(...values, 1);
    const levels = values.map((v) => Math.round((Math.max(0, v) / top) * height * 3));
    const columns = pair ? Math.ceil(levels.length / 2) : levels.length;
    for (let r = 0; r < height; r++) {
      const cellRow = row + r; // row is the top of the chart
      const floor = (height - 1 - r) * 3; // sub-rows below this cell
      const cells = [];
      for (let c = 0; c < columns; c++) {
        const pairLevels = pair ? [levels[c * 2] ?? 0, levels[c * 2 + 1] ?? 0] : [levels[c], levels[c]];
        let bits = 0;
        pairLevels.forEach((level, side) => {
          const fill = Math.max(0, Math.min(3, level - floor));
          // fill bottom-up: bottom band (bits 4/5), middle (2/3), top (0/1)
          if (fill >= 1) bits |= 1 << (4 + side);
          if (fill >= 2) bits |= 1 << (2 + side);
          if (fill >= 3) bits |= 1 << side;
        });
        cells.push(bits);
      }
      this.moveTo(cellRow, col).color(color).bg(bg).mosaic(cells);
    }
    return this;
  }

  /**
   * Simple table. columns: [{ title, width, align, color }], rows: arrays of cells.
   * Header in inverse video; zebra rows optional.
   */
  table(row, col, columns, rows, { headerColor = 'cyan', color = 'white', zebra, gap = 1 } = {}) {
    const line = (cells, style, r) => {
      if (style.bg !== undefined && col > 1) this.moveTo(r, col - 1).bg(style.bg).text(' ');
      else this.moveTo(r, col);
      columns.forEach((c, i) => {
        if (i && gap) this.text(' '.repeat(gap));
        const cellColor = typeof c.color === 'function' ? c.color(cells[i], cells) : c.color;
        this.style({ ...style, color: style.invert ? style.color : cellColor || style.color }).text(pad(cells[i] ?? '', c.width, c.align));
      });
      if (style.invert) this.invert(false);
    };
    line(columns.map((c) => c.title), { color: headerColor, invert: true }, row);
    rows.forEach((cells, i) => {
      const r = row + 1 + i;
      const width = columns.reduce((a, c) => a + c.width + gap, -gap);
      if (zebra && i % 2) this.band(r, { bg: zebra, col: Math.max(1, col - 1), width: width + (col > 1 ? 1 : 0) });
      line(cells, { color, bg: zebra && i % 2 ? zebra : undefined }, r);
    });
    return this;
  }
}

/** Shorthand: page().clear()... */
export function page() {
  return new Page();
}
