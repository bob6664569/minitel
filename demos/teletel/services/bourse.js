/**
 * 3615 BOURSE — live quotes of a small fictional Paris market.
 *
 *   Cotations (live board) -> fiche valeur (chart, high/low) -> ordre
 *   Indice 36 (intraday mosaic chart), Portefeuille (session.data)
 *
 * Quotes move every 2.5 s. Live pages only send what changed on screen:
 * each field remembers what it last displayed and rewrites the differing
 * characters only, which keeps the stream well under 1200 baud.
 */
import { Page, pad } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import { ESC } from '../../../src/js/videotex/constants.js';
import { market, fr, variation, HEADLINES, POINTS, POINT_MS } from './bourse-market.js';

const BAND = 'magenta';
const START_CASH = 100000;
const FEES = 0.006;

/** Thrown to go back to the board. */
const HOME = Symbol('cotations');

const pad2 = (n) => String(n).padStart(2, '0');
const clock = (t = new Date()) => `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;

/* Rising chart line, the service's emblem (12 x 3 cells). */
const EMBLEM = [
  '.....................###',
  '......................##',
  '.....................#.#',
  '..........#.........#...',
  '.........#.#.......#....',
  '........#...#.....#.....',
  '..#....#.....#...#......',
  '.#.#..#.......#.#.......',
  '#...##.........#........',
];

/* ---------------------------------------------------------------------- */
/* Incremental display                                                     */
/* ---------------------------------------------------------------------- */

/**
 * Remembers what each field shows, and only rewrites the characters that
 * changed. Zone colours are re-sent when a space is written, so zebra bands
 * and coloured pills survive partial updates.
 */
class Display {
  constructor() {
    this.shown = new Map();
  }

  text(v, id, row, col, text, { color = 'white', bg, invert = false, force = false, size } = {}) {
    const old = this.shown.get(id);
    this.shown.set(id, text);
    let a = 0;
    let b = text.length - 1;
    if (!force && old !== undefined && old.length === text.length) {
      while (a <= b && old[a] === text[a]) a++;
      while (b >= a && old[b] === text[b]) b--;
    }
    if (a > b) return false;
    v.moveTo(row, col + a);
    if (bg !== undefined) v.bg(bg);
    if (size) v.size(size);
    v.color(color);
    if (invert) v.invert(true);
    v.text(text.slice(a, b + 1));
    return true;
  }

  /** Mosaic cells, rewritten only when they change. */
  mosaic(v, id, row, col, cells, { color, bg = 'black' }) {
    const signature = `${color}:${bg}:${cells.join(',')}`;
    if (this.shown.get(id) === signature) return false;
    this.shown.set(id, signature);
    v.moveTo(row, col).bg(bg).color(color).mosaic(cells);
    return true;
  }
}

/* Direction pills: a mosaic arrow opens a coloured zone, the figure follows. */
const PILLS = {
  up: { bg: 'green', color: 'black', arrow: [0b111000, 0b110100] },
  down: { bg: 'red', color: 'white', arrow: [0b001011, 0b000111] },
  flat: { bg: 'white', color: 'black', arrow: [0b001100, 0b001100] },
};

const direction = (value, reference) => (value > reference + 1e-9 ? 'up' : value < reference - 1e-9 ? 'down' : 'flat');

/**
 * A variation pill at (row, col): a mosaic arrow opens a coloured zone, the
 * 5-character figure follows, a space closes it. 8 cells. With `inline`,
 * it is written at the cursor (the caller is already there).
 */
function pill(d, v, id, row, col, value, reference, { zone = 'black', width = 5, inline = false } = {}) {
  const dir = direction(value, reference);
  const style = PILLS[dir];
  const text = pad(variation(value, reference).replace('=', ' '), width, 'right');
  const signature = `${style.color}:${style.bg}:${style.arrow.join(',')}`;
  if (inline || d.shown.get(`${id}:arrow`) !== signature) {
    if (!inline) v.moveTo(row, col).bg(zone);
    v.text(' ').bg(style.bg).color(style.color).mosaic(style.arrow).text(text).bg(zone).text(' ');
    d.shown.set(`${id}:arrow`, signature);
    d.shown.set(`${id}:text`, text);
  } else {
    d.text(v, `${id}:text`, row, col + 3, text, { color: style.color, bg: style.bg });
  }
}

/* ---------------------------------------------------------------------- */
/* Page furniture                                                          */
/* ---------------------------------------------------------------------- */

function header(p, title, { right, size = 'double' } = {}) {
  p.band(1, { bg: BAND, rows: 3 });
  p.print(1, 2, '3615 BOURSE', { color: 'black', bg: BAND });
  if (right) p.right(1, 27, right, { color: 'white', bg: BAND });
  p.print(3, 2, title, { color: 'white', bg: BAND, size });
  p.art(1, 29, EMBLEM, { ink: 'white', background: BAND });
  p.hline(4, { color: BAND, style: 'top' });
  return p;
}

function seance() {
  const t = new Date();
  return `Séance ${pad2(t.getDate())}/${pad2(t.getMonth() + 1)}`;
}

/**
 * Area chart, two points per cell, green above `base` and red below; the
 * base (previous close) shows as a dotted line where the area leaves room.
 * Returns rows of { bits, color } cells so callers can redraw what moves.
 */
function chartCells(values, { height, min, max, base }) {
  const span = max - min || 1;
  const level = (x) => Math.max(1, Math.min(height * 3, Math.round(((x - min) / span) * (height * 3 - 1)) + 1));
  const levels = values.map(level);
  const baseLevel = base >= min && base <= max ? level(base) : -1;
  const rows = [];
  for (let r = 0; r < height; r++) {
    const floor = (height - 1 - r) * 3;
    const cells = [];
    for (let c = 0; c < Math.ceil(values.length / 2); c++) {
      let bits = 0;
      [levels[c * 2], levels[c * 2 + 1] ?? levels[c * 2]].forEach((lv, side) => {
        const fill = Math.max(0, Math.min(3, lv - floor));
        if (fill >= 1) bits |= 1 << (4 + side);
        if (fill >= 2) bits |= 1 << (2 + side);
        if (fill >= 3) bits |= 1 << side;
      });
      const avg = (values[c * 2] + (values[c * 2 + 1] ?? values[c * 2])) / 2;
      if (!bits && baseLevel > floor && baseLevel <= floor + 3) {
        // Dotted previous-close line: one sub-pixel every other column.
        cells.push({ bits: c % 2 ? 0 : 1 << ((3 - (baseLevel - floor)) * 2), color: 'cyan' });
      } else {
        cells.push({ bits, color: avg >= base ? 'green' : 'red' });
      }
    }
    rows.push(cells);
  }
  return rows;
}

/** Emit a chart row, changing colour only for cells that show something. */
function chartRow(v, row, col, cells) {
  v.moveTo(row, col);
  let color = null;
  let run = [];
  const flush = () => {
    if (run.length) v.mosaic(run);
    run = [];
  };
  for (const cell of cells) {
    if (cell.bits && cell.color !== color) {
      flush();
      v.color(cell.color);
      color = cell.color;
    }
    run.push(cell.bits);
  }
  flush();
  return v;
}

/** Chart scaled to its data, price scale on the right, hours underneath. */
function drawChart(p, values, { row, col, height, base, times }) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = Math.max((high - low) * 0.1, high * 0.0015);
  const scale = { height, min: low - margin, max: high + margin, base };
  chartCells(values, scale).forEach((cells, r) => chartRow(p, row + r, col, cells));
  const right = col + Math.ceil(values.length / 2) + 1;
  const digits = high >= 1000 ? 0 : 1;
  p.print(row, right, fr(high, digits), { color: 'white' });
  p.print(row + height - 1, right, fr(low, digits), { color: 'white' });
  const baseRow = row + Math.round((1 - (base - scale.min) / (scale.max - scale.min)) * (height - 1));
  if (baseRow > row + 1 && baseRow < row + height - 2) p.print(baseRow, right, fr(base, digits), { color: 'cyan' });
  // Hour marks under the chart.
  let last = -1;
  const labels = [];
  times.forEach((t, i) => {
    const date = new Date(t);
    if (i % 2 === 0 && date.getHours() !== last && date.getMinutes() < 10) {
      labels.push([Math.floor(i / 2), `${date.getHours()}h`]);
      last = date.getHours();
    }
  });
  labels.forEach(([c, text], i) => {
    const next = labels[i + 1];
    if (c + text.length < right - col && (!next || next[0] - c >= 4)) p.print(row + height, col + c, text, { color: 'cyan' });
  });
  return scale;
}

/* ---------------------------------------------------------------------- */
/* Live loop                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Show a live page: `render()` draws it, `update(now)` returns the
 * incremental changes. Characters typed go to the field; a function key
 * ends the loop with { key, value }.
 *
 * Pacing: every batch ends with an ENQROM request. The terminal answers
 * once it has displayed everything before it, so a new batch is only sent
 * when the previous one is on screen — at 1200 baud or at full speed.
 */
async function live(session, render, update, field, { keys = ['ENVOI', 'RETOUR', 'SOMMAIRE', 'GUIDE'], valid = () => true } = {}) {
  let value = '';
  let waiting = false;
  let sentAt = 0;
  const park = (v) => v.moveTo(field.row, field.col + Math.min(value.length, field.length - 1)).cursor(true);
  const send = (v) => {
    session.write(park(v).raw(ESC, 0x39, 0x7b));
    waiting = true;
    sentAt = Date.now();
  };
  send(render());
  let next = Date.now() + 1000;
  for (;;) {
    const event = await session.next({ timeout: Math.max(20, next - Date.now()) });
    if (event?.type === 'response') {
      waiting = false;
      continue;
    }
    if (event?.type === 'char') {
      const ch = event.char.toUpperCase();
      if (value.length < field.length && field.accept.test(ch)) {
        value += ch;
        session.write(park(new Videotex().moveTo(field.row, field.col + value.length - 1).color('yellow').text(ch)));
      } else {
        session.write(new Videotex().bell());
      }
      continue;
    }
    if (event?.type === 'key') {
      if (event.key === 'CORRECTION' || event.key === 'LEFT') {
        if (value) {
          value = value.slice(0, -1);
          session.write(park(new Videotex().moveTo(field.row, field.col + value.length).color('yellow').text('.')));
        }
        continue;
      }
      if (event.key === 'ANNULATION') {
        value = '';
        session.write(park(new Videotex().moveTo(field.row, field.col).color('yellow').fill('.', field.length)));
        continue;
      }
      if (event.key === 'REPETITION') {
        value = '';
        send(render());
        continue;
      }
      if (!keys.includes(event.key)) continue;
      if (event.key === 'ENVOI' && !valid(value)) {
        value = '';
        session.write(park(new Videotex().bell().moveTo(field.row, field.col).color('yellow').fill('.', field.length)));
        continue;
      }
      return { key: event.key, value };
    }
    // Every second: advance the market and send what changed, once the
    // terminal has caught up (a lost answer is forgotten after 8 s).
    const now = Date.now();
    next = now + 1000 - (now % 1000);
    if (waiting && now - sentAt < 8000) continue;
    const v = update(now);
    if (v.length) send(new Videotex().cursor(false).append(v));
  }
}

/* ---------------------------------------------------------------------- */
/* Board                                                                   */
/* ---------------------------------------------------------------------- */

const BOARD_TOP = 7;
const NEWS_WIDTH = 29;
const zoneOf = (i) => (i % 2 ? 'blue' : 'black');

/** Live cells of a stock row: price, variation pill, volume. */
function stockRow(d, v, s, i, { flash = false } = {}) {
  const row = BOARD_TOP + i;
  const zone = zoneOf(i);
  d.text(v, `price${i}`, row, 18, pad(fr(s.price), 8, 'right'), { color: 'white', bg: zone, invert: flash, force: flash });
  pill(d, v, `var${i}`, row, 26, s.price, s.prev, { zone });
  d.text(v, `vol${i}`, row, 35, pad(fr(s.volume, 0), 6, 'right'), { color: 'cyan', bg: zone });
}

function boardPage(m, d) {
  const p = new Page().clear().cursor(false);
  header(p, 'COTATIONS', { right: seance() });
  p.print(5, 2, 'INDICE 36', { color: 'yellow' });
  d.text(p, 'index', 5, 12, pad(fr(m.index), 8, 'right'), { color: 'white', force: true });
  pill(d, p, 'indexVar', 5, 21, m.index, m.indexPrev);
  d.text(p, 'clock', 5, 32, clock(), { color: 'cyan', force: true });
  p.moveTo(6, 1).color('cyan').invert(true).text('  N VALEUR          COURS  VAR %  VOLUME');
  m.stocks.forEach((s, i) => {
    // One pass per row; the display remembers what each cell shows.
    const zone = zoneOf(i);
    const price = pad(fr(s.price), 8, 'right');
    const volume = pad(fr(s.volume, 0), 6, 'right');
    p.moveTo(BOARD_TOP + i, 1);
    if (zone !== 'black') p.bg(zone);
    p.color('yellow').text(pad(String(i + 1), 3, 'right')).color('white').text(` ${pad(s.short, 12)} ${price}`);
    d.shown.set(`price${i}`, price);
    pill(d, p, `var${i}`, BOARD_TOP + i, 26, s.price, s.prev, { zone, inline: true });
    p.color('cyan').text(volume);
    d.shown.set(`vol${i}`, volume);
  });
  p.label(20, 2, 'DEPECHE', { color: 'white', bg: 'red' });
  d.text(p, 'news', 20, 12, pad(HEADLINES[0], NEWS_WIDTH), { color: 'yellow', force: true });
  p.moveTo(22, 2).color('cyan').invert(true).text(' I ').invert(false).color('white').text(' Indice 36  ')
    .color('cyan').invert(true).text(' P ').invert(false).color('white').text(' Portefeuille');
  p.hints(23, [['GUIDE', 'aide'], ['SOMMAIRE', 'quitter']]);
  p.print(24, 2, 'N° de valeur, I ou P', { color: 'white' });
  p.color('yellow').text(' .. ');
  p.key(24, 33, 'ENVOI');
  return p;
}

async function board(session, state) {
  const m = market();
  const d = new Display();
  let flashed = [];
  let lastPrices = m.stocks.map((s) => s.price);
  let newsAt = Date.now();
  let news = 0;
  const update = (now) => {
    const v = new Page();
    m.update(now);
    d.text(v, 'clock', 5, 32, clock(new Date(now)), { color: 'cyan' });
    // A price that moves lights up (inverse video) until the next step.
    const moved = [];
    m.stocks.forEach((s, i) => {
      if (s.price !== lastPrices[i]) moved.push(i);
      else if (flashed.includes(i)) d.text(v, `price${i}`, BOARD_TOP + i, 18, pad(fr(s.price), 8, 'right'), { color: 'white', bg: i % 2 ? 'blue' : 'black', force: true });
      stockRow(d, v, s, i, { flash: moved.includes(i) });
    });
    flashed = moved;
    lastPrices = m.stocks.map((s) => s.price);
    d.text(v, 'index', 5, 12, pad(fr(m.index), 8, 'right'), { color: 'white' });
    pill(d, v, 'indexVar', 5, 21, m.index, m.indexPrev);
    if (now - newsAt > 12000) {
      newsAt = now;
      news = (news + 1) % HEADLINES.length;
      d.text(v, 'news', 20, 12, pad(HEADLINES[news], NEWS_WIDTH), { color: 'yellow' });
    }
    return v;
  };
  for (;;) {
    const { key, value } = await live(session, () => {
      d.shown.clear();
      flashed = [];
      return boardPage(m, d);
    }, update, { row: 24, col: 24, length: 2, accept: /[0-9IP]/ }, {
      keys: ['ENVOI', 'SUITE', 'SOMMAIRE', 'GUIDE'],
      valid: (v) => v === 'I' || v === 'P' || !!m.stocks[Number(v) - 1],
    });
    if (key === 'SOMMAIRE') return;
    try {
      if (key === 'GUIDE') await help(session);
      else if (key === 'SUITE' || value === 'I') await indexPage(session, state);
      else if (value === 'P') await portfolio(session, state);
      else await stockPage(session, state, m.stocks[Number(value) - 1]);
    } catch (error) {
      if (error !== HOME) throw error;
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Index                                                                   */
/* ---------------------------------------------------------------------- */

function chartTimes(m) {
  const start = m.chartStart;
  return Array.from({ length: POINTS }, (_, i) => start + i * POINT_MS);
}

function breadth(m) {
  let up = 0;
  let down = 0;
  for (const s of m.stocks) {
    if (s.price > s.prev) up++;
    else if (s.price < s.prev) down++;
  }
  return [up, down, m.stocks.length - up - down];
}

/** Big live figure (double size), pill, clock and a flashing DIRECT tag. */
function headline(d, v, value, reference, { force = false, unit } = {}) {
  const text = pad(fr(value), 8, 'right');
  if (force || d.shown.get('big') !== text) {
    // Double-size figures are rewritten whole: diffing would split glyphs.
    d.shown.set('big', text);
    v.moveTo(6, 2).color('white').size('double').text(text);
  }
  if (force && unit) v.print(6, 19, unit, { color: 'white', size: 'tall' });
  if (force) v.print(5, 33, 'DIRECT', { color: 'red', flash: true });
  pill(d, v, 'var', 6, 21, value, reference);
  d.text(v, 'clock', 6, 32, clock(), { color: 'cyan', force });
}

function indexView(m, d) {
  let scale = null;
  let points = -1;
  const values = () => [...m.indexHistory, m.index].slice(-64);
  const chart = (p) => {
    scale = drawChart(p, values(), { row: 8, col: 2, height: 10, base: m.indexPrev, times: chartTimes(m).slice(-64) });
    points = m.lastPoint;
    for (let r = 0; r < 10; r++) d.shown.delete(`c${r}`);
  };
  const stats = (v, force = false) => {
    const [up, down, same] = breadth(m);
    if (force) {
      [['Ouverture', 19, 2], ['Veille', 19, 23], ['Plus haut', 20, 2], ['Plus bas', 20, 23]]
        .forEach(([label, row, col]) => v.print(row, col, label, { color: 'cyan' }));
    }
    d.text(v, 'open', 19, 12, pad(fr(m.indexOpen), 8, 'right'), { color: 'white', force });
    d.text(v, 'prev', 19, 32, pad(fr(m.indexPrev), 8, 'right'), { color: 'white', force });
    d.text(v, 'high', 20, 12, pad(fr(m.indexHigh), 8, 'right'), { color: 'green', force });
    d.text(v, 'low', 20, 32, pad(fr(m.indexLow), 8, 'right'), { color: 'red', force });
    d.text(v, 'up', 21, 2, pad(`${up} hausse${up > 1 ? 's' : ''}`, 11), { color: 'green', force });
    d.text(v, 'down', 21, 15, pad(`${down} baisse${down > 1 ? 's' : ''}`, 11), { color: 'red', force });
    d.text(v, 'same', 21, 28, pad(`${same} stable${same > 1 ? 's' : ''}`, 10), { color: 'white', force });
  };
  const render = () => {
    d.shown.clear();
    const p = new Page().clear().cursor(false);
    header(p, 'INDICE 36', { right: seance() });
    headline(d, p, m.index, m.indexPrev, { force: true });
    chart(p);
    stats(p, true);
    p.hints(23, [['RETOUR', 'cotations'], ['GUIDE', 'aide']]);
    p.print(24, 2, 'Portefeuille : tapez P', { color: 'white' });
    p.color('yellow').text(' . ');
    p.key(24, 33, 'ENVOI');
    return p;
  };
  const update = (now) => {
    const v = new Page();
    m.update(now);
    headline(d, v, m.index, m.indexPrev);
    stats(v);
    // Every five minutes the chart scrolls; otherwise its last column follows the index.
    if (points !== m.lastPoint) {
      chart(v);
      return v;
    }
    const cells = chartCells(values(), scale);
    const last = cells[0].length - 1;
    cells.forEach((row, r) => d.mosaic(v, `c${r}`, 8 + r, 2 + last, [row[last].bits], { color: row[last].color }));
    return v;
  };
  return { render, update };
}

async function indexPage(session, state) {
  const m = market();
  const d = new Display();
  for (;;) {
    const view = indexView(m, d);
    const { key } = await live(session, view.render, view.update, { row: 24, col: 25, length: 1, accept: /[P]/ }, { valid: (v) => v === 'P' });
    if (key === 'SOMMAIRE') throw HOME;
    if (key === 'RETOUR') return;
    if (key === 'GUIDE') await help(session);
    else await portfolio(session, state);
  }
}

/* ---------------------------------------------------------------------- */
/* Stock page                                                              */
/* ---------------------------------------------------------------------- */

function holding(state, s) {
  return state.positions[s.code] || { qty: 0, cost: 0 };
}

function stockView(m, d, state, s) {
  let scale = null;
  let points = -1;
  const values = () => [...s.history, s.price].slice(-48);
  const chart = (p) => {
    scale = drawChart(p, values(), { row: 8, col: 2, height: 8, base: s.prev, times: chartTimes(m).slice(-48) });
    points = m.lastPoint;
    for (let r = 0; r < 8; r++) d.shown.delete(`c${r}`);
  };
  const figures = (v, force = false) => {
    if (force) {
      [['Ouvert.', 8], ['+ haut', 10], ['+ bas', 12], ['Veille', 14]].forEach(([label, row]) => v.print(row, 33, label, { color: 'cyan' }));
      v.print(18, 2, 'Volume', { color: 'cyan' });
      v.print(18, 24, 'Capit.', { color: 'cyan' });
    }
    d.text(v, 'open', 9, 33, pad(fr(s.open), 8, 'right'), { color: 'white', force });
    d.text(v, 'high', 11, 33, pad(fr(s.high), 8, 'right'), { color: 'green', force });
    d.text(v, 'low', 13, 33, pad(fr(s.low), 8, 'right'), { color: 'red', force });
    d.text(v, 'prev', 15, 33, pad(fr(s.prev), 8, 'right'), { color: 'white', force });
    d.text(v, 'volume', 18, 9, pad(`${fr(s.volume, 0)} titres`, 14), { color: 'white', force });
    d.text(v, 'cap', 18, 31, pad(`${fr((s.price * s.shares) / 1000, 1)} MdF`, 9, 'right'), { color: 'white', force });
  };
  const position = (v, force = false) => {
    const h = holding(state, s);
    if (!h.qty) {
      if (force) v.print(20, 2, 'Vous ne détenez aucun titre.', { color: 'yellow' });
      return;
    }
    const gain = (s.price - h.cost) * h.qty;
    if (force) v.print(20, 2, `${h.qty} titre${h.qty > 1 ? 's' : ''} en portefeuille`, { color: 'yellow' });
    d.text(v, 'gain', 20, 30, pad(`${gain >= 0 ? '+' : ''}${fr(gain, 0)} F`, 10, 'right'), { color: gain >= 0 ? 'green' : 'red', force });
  };
  const render = () => {
    d.shown.clear();
    const p = new Page().clear().cursor(false);
    const title = s.name.toUpperCase();
    header(p, title, { right: s.sector, size: title.length <= 13 ? 'double' : 'tall' });
    headline(d, p, s.price, s.prev, { force: true, unit: 'F' });
    chart(p);
    figures(p, true);
    position(p, true);
    p.hints(22, [['RETOUR', 'cotations'], ['SOMMAIRE', 'accueil']]);
    p.print(24, 2, 'Ordre : 1 achat, 2 vente', { color: 'white' });
    p.color('yellow').text(' . ');
    p.key(24, 33, 'ENVOI');
    return p;
  };
  const update = (now) => {
    const v = new Page();
    m.update(now);
    headline(d, v, s.price, s.prev);
    figures(v);
    position(v);
    if (points !== m.lastPoint) {
      chart(v);
      return v;
    }
    const cells = chartCells(values(), scale);
    const last = cells[0].length - 1;
    cells.forEach((row, r) => d.mosaic(v, `c${r}`, 8 + r, 2 + last, [row[last].bits], { color: row[last].color }));
    return v;
  };
  return { render, update };
}

async function stockPage(session, state, s) {
  const m = market();
  const d = new Display();
  for (;;) {
    const view = stockView(m, d, state, s);
    const { key, value } = await live(session, view.render, view.update, { row: 24, col: 28, length: 1, accept: /[12]/ }, { valid: (v) => v === '1' || v === '2' });
    if (key === 'SOMMAIRE') throw HOME;
    if (key === 'RETOUR') return;
    if (key === 'GUIDE') await help(session);
    else await order(session, state, s, value === '1' ? 'buy' : 'sell');
  }
}

/* ---------------------------------------------------------------------- */
/* Orders                                                                  */
/* ---------------------------------------------------------------------- */

function orderPage(state, s, side, message) {
  const p = new Page().clear().cursor(false);
  header(p, side === 'buy' ? "ORDRE D'ACHAT" : 'ORDRE DE VENTE', { size: 'tall', right: s.short });
  const h = holding(state, s);
  p.panel(6, 2, 10, 38, { bg: 'blue', shadow: 'cyan' });
  p.print(7, 4, s.name, { color: 'yellow', bg: 'blue' });
  p.print(8, 4, 'Cours actuel', { color: 'cyan', bg: 'blue' });
  p.right(8, 36, `${fr(s.price)} F`, { color: 'white', bg: 'blue' });
  p.print(9, 4, 'Liquidités', { color: 'cyan', bg: 'blue' });
  p.right(9, 36, `${fr(state.cash)} F`, { color: 'white', bg: 'blue' });
  if (side === 'sell') {
    p.print(10, 4, 'Titres détenus', { color: 'cyan', bg: 'blue' });
    p.right(10, 36, String(h.qty), { color: 'white', bg: 'blue' });
  }
  const max = side === 'buy' ? Math.floor(state.cash / (s.price * (1 + FEES))) : h.qty;
  p.print(13, 3, 'Quantité', { color: 'white' });
  p.print(13, 22, 'titres', { color: 'white' });
  p.print(14, 3, `(maximum ${max})`, { color: 'cyan' });
  p.print(16, 3, 'Au cours du marché, frais 0,6 %.', { color: 'cyan' });
  p.print(17, 3, 'Exécution immédiate.', { color: 'cyan' });
  if (message) p.print(19, 3, message, { color: 'red', flash: true });
  p.hints(22, [['RETOUR', 'annuler'], ['CORRECTION', 'effacer']]);
  p.print(24, 2, "Confirmer l'ordre", { color: 'white' });
  p.key(24, 33, 'ENVOI');
  return { page: p, max };
}

async function order(session, state, s, side) {
  let message = null;
  for (;;) {
    const { page, max } = orderPage(state, s, side, message);
    session.write(page);
    const { key, value } = await session.input({ row: 13, col: 14, length: 6, color: 'yellow', accept: /[0-9]/ });
    if (key === 'SOMMAIRE') throw HOME;
    if (key === 'RETOUR') return;
    if (key === 'GUIDE') {
      await help(session);
      continue;
    }
    if (key !== 'ENVOI') continue;
    const qty = Number(value);
    if (!qty) {
      message = 'Indiquez une quantité.';
    } else if (qty > max) {
      message = side === 'buy' ? 'Liquidités insuffisantes.' : 'Vous ne détenez pas assez de titres.';
    } else {
      await confirm(session, state, s, side, qty);
      return;
    }
    session.write(new Videotex().bell());
  }
}

async function confirm(session, state, s, side, qty) {
  const m = market();
  const price = m.trade(s, qty);
  const gross = price * qty;
  const fees = Math.max(15, Math.round(gross * FEES * 100) / 100);
  const h = holding(state, s);
  if (side === 'buy') {
    state.cash -= gross + fees;
    h.cost = (h.cost * h.qty + gross + fees) / (h.qty + qty);
    h.qty += qty;
  } else {
    state.cash += gross - fees;
    h.qty -= qty;
    if (!h.qty) h.cost = 0;
  }
  state.positions[s.code] = h;
  if (!h.qty) delete state.positions[s.code];

  const p = new Page().clear().cursor(false);
  header(p, 'AVIS D\'OPERE', { size: 'tall', right: s.short });
  p.panel(6, 3, 15, 36, { bg: 'white', shadow: BAND });
  p.label(7, 4, side === 'buy' ? 'ACHAT' : 'VENTE', { ...(side === 'buy' ? { color: 'black', bg: 'green' } : { color: 'white', bg: 'red' }), close: false });
  p.text(' ').bg('white').text(' ');
  p.right(7, 35, clock(), { color: 'blue', bg: 'white' });
  p.print(9, 5, s.name, { color: 'black', bg: 'white' });
  p.print(10, 5, `${qty} titre${qty > 1 ? 's' : ''} à ${fr(price)} F`, { color: 'black', bg: 'white' });
  p.print(11, 5, 'Montant', { color: 'blue', bg: 'white' });
  p.right(11, 35, `${fr(gross)} F`, { color: 'black', bg: 'white' });
  p.print(12, 5, 'Frais', { color: 'blue', bg: 'white' });
  p.right(12, 35, `${fr(fees)} F`, { color: 'black', bg: 'white' });
  p.print(14, 5, side === 'buy' ? 'Total débité' : 'Total crédité', { color: 'blue', bg: 'white' });
  p.right(14, 35, `${fr(side === 'buy' ? gross + fees : gross - fees)} F`, { color: 'red', bg: 'white', size: 'tall' });
  p.panel(18, 9, 19, 31, { bg: 'green' });
  p.print(19, 11, 'ORDRE EXECUTE', { color: 'black', bg: 'green', size: 'tall', flash: true });
  p.print(21, 2, `Liquidités : ${fr(state.cash)} F`, { color: 'yellow' });
  p.hints(23, [['ENVOI', 'portefeuille'], ['RETOUR', 'valeur']]);
  session.write(p);
  const key = await session.waitKey(['ENVOI', 'RETOUR', 'SOMMAIRE', 'SUITE']);
  if (key === 'SOMMAIRE') throw HOME;
  if (key === 'ENVOI' || key === 'SUITE') await portfolio(session, state);
}

/* ---------------------------------------------------------------------- */
/* Portfolio                                                               */
/* ---------------------------------------------------------------------- */

function portfolioView(m, d, state) {
  const held = () => m.stocks.filter((s) => state.positions[s.code]?.qty).slice(0, 7);
  const totals = () => {
    const stocks = held().reduce((sum, s) => sum + s.price * state.positions[s.code].qty, 0);
    return { stocks, total: stocks + state.cash };
  };
  const rowValues = (v, s, i, force = false) => {
    const h = state.positions[s.code];
    const gain = (s.price - h.cost) * h.qty;
    d.text(v, `cours${i}`, 6 + i, 23, pad(fr(s.price), 8, 'right'), { color: 'white', force });
    d.text(v, `gain${i}`, 6 + i, 32, pad(`${gain >= 0 ? '+' : ''}${fr(gain, 0)}`, 9, 'right'), { color: gain >= 0 ? 'green' : 'red', force });
  };
  const summary = (v, force = false) => {
    const { stocks, total } = totals();
    const perf = (total / START_CASH - 1) * 100;
    const share = Math.round((stocks / total) * 100);
    if (d.shown.get('share') !== share || force) {
      d.shown.set('share', share);
      v.progress(14, 15, 25, stocks / total, { color: 'yellow', track: 'blue' });
    }
    d.text(v, 'shares', 15, 15, pad(`titres ${share} %`, 10), { color: 'yellow', force });
    d.text(v, 'cashes', 15, 25, pad(`liquidités ${100 - share} %`, 15, 'right'), { color: 'cyan', force });
    d.text(v, 'stocks', 17, 24, pad(`${fr(stocks)} F`, 15, 'right'), { color: 'white', force });
    d.text(v, 'cash', 18, 24, pad(`${fr(state.cash)} F`, 15, 'right'), { color: 'white', force });
    d.text(v, 'total', 20, 22, pad(`${fr(total)} F`, 17, 'right'), { color: 'yellow', size: 'tall', force });
    d.text(v, 'perf', 21, 32, pad(`${perf >= 0 ? '+' : ''}${fr(perf)} %`, 8, 'right'), { color: perf >= 0 ? 'green' : 'red', force });
  };
  const render = () => {
    d.shown.clear();
    const p = new Page().clear().cursor(false);
    header(p, 'PORTEFEUILLE', { right: seance() });
    const list = held();
    p.moveTo(5, 1).color('cyan').invert(true).text('  N VALEUR       QTE    COURS   +/- VAL.');
    if (!list.length) {
      p.center(8, 'Portefeuille vide', { color: 'yellow', size: 'tall' });
      p.center(10, `${fr(START_CASH, 0)} F fictifs pour débuter :`, { color: 'white' });
      p.center(11, 'choisissez une valeur, tapez 1.', { color: 'white' });
    }
    list.forEach((s, i) => {
      const h = state.positions[s.code];
      p.moveTo(6 + i, 1).color('yellow').text(pad(String(s.index + 1), 3, 'right'))
        .color(i % 2 ? 'cyan' : 'white').text(` ${pad(s.short, 12)}${pad(String(h.qty), 5, 'right')}`);
      rowValues(p, s, i, true);
    });
    p.print(14, 2, 'Répartition', { color: 'cyan' });
    p.hline(16, { color: BAND, style: 'middle' });
    p.print(17, 2, 'Titres', { color: 'cyan' });
    p.print(18, 2, 'Liquidités', { color: 'cyan' });
    p.print(20, 2, 'TOTAL', { color: 'white', size: 'tall' });
    p.print(21, 2, 'Performance', { color: 'cyan' });
    summary(p, true);
    p.hints(23, [['RETOUR', 'cotations'], ['I', 'indice']]);
    p.print(24, 2, 'N° de valeur ou I', { color: 'white' });
    p.color('yellow').text(' .. ');
    p.key(24, 33, 'ENVOI');
    return p;
  };
  const update = (now) => {
    const v = new Page();
    m.update(now);
    held().forEach((s, i) => rowValues(v, s, i));
    summary(v);
    return v;
  };
  return { render, update };
}

async function portfolio(session, state) {
  const m = market();
  const d = new Display();
  for (;;) {
    const view = portfolioView(m, d, state);
    const { key, value } = await live(session, view.render, view.update, { row: 24, col: 21, length: 2, accept: /[0-9I]/ }, {
      valid: (v) => v === 'I' || !!m.stocks[Number(v) - 1],
    });
    if (key === 'SOMMAIRE') throw HOME;
    if (key === 'RETOUR') return;
    if (key === 'GUIDE') await help(session);
    else if (value === 'I') await indexPage(session, state);
    else await stockPage(session, state, m.stocks[Number(value) - 1]);
  }
}

/* ---------------------------------------------------------------------- */
/* Help                                                                    */
/* ---------------------------------------------------------------------- */

async function help(session) {
  const p = new Page().clear().cursor(false);
  header(p, 'GUIDE');
  p.print(6, 2, 'Les cours défilent en direct :', { color: 'white' });
  p.print(7, 2, 'un cours qui change s\'allume.', { color: 'white' });
  const rows = [
    [PILLS.up, '+1,25', 'hausse sur la veille'],
    [PILLS.down, '-0,48', 'baisse sur la veille'],
    [PILLS.flat, ' 0,00', 'inchangé'],
  ];
  rows.forEach(([style, text, label], i) => {
    const row = 9 + i;
    p.moveTo(row, 3).bg(style.bg).color(style.color).mosaic(style.arrow).text(text).bg('black').text(' ');
    p.print(row, 13, label, { color: 'cyan' });
  });
  const keys = [
    ['1 à 12', 'fiche d\'une valeur'],
    ['I', "l'INDICE 36"],
    ['P', 'votre portefeuille'],
    ['1 / 2', 'acheter / vendre'],
  ];
  keys.forEach(([name, text], i) => {
    p.moveTo(13 + i, 3).color('yellow').invert(true).text(pad(name, 8, 'center')).invert(false);
    p.print(13 + i, 13, text, { color: 'white' });
  });
  p.panel(18, 2, 20, 38, { bg: 'blue', shadow: BAND });
  p.print(18, 4, 'Portefeuille fictif de 100 000 F.', { color: 'white', bg: 'blue' });
  p.print(19, 4, 'Cours simulés : aucun conseil en', { color: 'cyan', bg: 'blue' });
  p.print(20, 4, 'placement, bien entendu !', { color: 'cyan', bg: 'blue' });
  p.hints(23, [['RETOUR', 'revenir à la page']]);
  session.write(p);
  await session.waitKey();
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

export default {
  code: 'BOURSE',
  name: 'Bourse',
  description: 'Cours en direct, INDICE 36, portefeuille',
  async run(session) {
    const state = session.data.bourse || (session.data.bourse = { cash: START_CASH, positions: {} });
    await board(session, state);
  },
};
