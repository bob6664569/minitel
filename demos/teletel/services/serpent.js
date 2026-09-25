/**
 * 3615 SERPENT — the snake game, in mosaic graphics.
 *
 * The snake lives on a grid of sub-pixels: every character cell is a 2x3
 * sextant, so it moves by a sixth of a cell. Each tick resends only the
 * cells that changed (the head and the tail), and a small cursor planner
 * reuses what the terminal already knows (cursor position, mosaic set,
 * colour) to reach the next cell with one-byte BS/HT/LF/VT moves whenever
 * that is cheaper than a US positioning. A tick costs about ten bytes, and
 * the pace never asks more of the line than 1200 bauds can carry.
 */
import { Page } from '../../../src/js/service/page.js';
import { Videotex, colorIndex } from '../../../src/js/videotex/writer.js';
import { getGlyph } from '../../../src/js/font/glyphs.js';

/* Playfield: rows 3..23, columns 2..39, framed by half-cell strokes. */
const TOP = 3;
const LEFT = 2;
const ROWS = 21;
const COLS = 38;
const W = COLS * 2;
const H = ROWS * 3;

/** Characters per second we allow ourselves: 1200 bauds carry 120. */
const LINE_RATE = 110;

const MOVES = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const DIGITS = { 8: 'UP', 2: 'DOWN', 4: 'LEFT', 6: 'RIGHT' };

/* Apple: '.#' '##' '##' (a stalk on a round fruit, at 2x3). */
const APPLE = 0b111110;
const GOLD_EVERY = 5;
const GOLD_TICKS = 70;

/** Best score since the page was loaded. */
let record = 0;

const BS = 0x08;
const HT = 0x09;
const LF = 0x0a;
const VT = 0x0b;

const pad = (n, width) => String(n).padStart(width, '0');

/** Direction for an input event, or null. */
function direction(event) {
  if (event.type === 'key' && MOVES[event.key]) return event.key;
  if (event.type === 'char' && DIGITS[event.char]) return DIGITS[event.char];
  return null;
}

/* ---------------------------------------------------------------------- */
/* Cursor planner                                                          */
/* ---------------------------------------------------------------------- */

/**
 * Writes single mosaic cells as cheaply as possible. It tracks the terminal
 * state left by its own writes; anything else written in between must call
 * forget().
 */
class Painter {
  constructor() {
    this.known = false;
  }

  forget() {
    this.known = false;
  }

  /** Bytes needed to draw a cell: [cost, relative?]. */
  cost(row, col, bits, fg, flash) {
    const ink = bits !== 0;
    const fresh = 5 + (ink && fg !== 7 ? 2 : 0) + (ink && flash ? 2 : 0);
    if (!this.known) return [fresh, false];
    const near = Math.abs(row - this.row) + Math.abs(col - this.col) + 1 + (this.mosaic ? 0 : 1)
      + (ink && fg !== this.fg ? 2 : 0) + (ink && flash !== this.flash ? 2 : 0);
    return near < fresh ? [near, true] : [fresh, false];
  }

  cell(v, row, col, bits, color = 'green', flash = false) {
    const fg = colorIndex(color);
    const [, relative] = this.cost(row, col, bits, fg, flash);
    if (relative) {
      for (; this.row < row; this.row++) v.raw(LF);
      for (; this.row > row; this.row--) v.raw(VT);
      for (; this.col < col; this.col++) v.raw(HT);
      for (; this.col > col; this.col--) v.raw(BS);
    } else {
      v.moveTo(row, col);
      Object.assign(this, { known: true, row, col, fg: 7, flash: false, mosaic: false });
    }
    if (bits !== 0 && fg !== this.fg) {
      v.color(fg);
      this.fg = fg;
    }
    if (bits !== 0 && flash !== this.flash) {
      v.flash(flash);
      this.flash = flash;
    }
    v.mosaicMode = this.mosaic; // SO only when the terminal is not in mosaic yet
    v.mosaic(bits);
    this.mosaic = true;
    this.col++;
    return v;
  }
}

/* ---------------------------------------------------------------------- */
/* Title screen crawler                                                    */
/* ---------------------------------------------------------------------- */

/**
 * A little snake running laps around the rules panel of the title screen,
 * on a closed path of screen sub-pixels (80 x 72 for rows 1..24).
 */
class Crawler {
  constructor({ left = 1, right = 78, top = 31, bottom = 58, length = 22 } = {}) {
    // Horizontal runs undulate by one sub-pixel: the body slithers.
    const wave = (x) => Math.round(Math.sin(x / 2.5));
    this.path = [];
    for (let x = left; x < right; x++) this.path.push([x, top + wave(x)]);
    for (let y = top; y < bottom; y++) this.path.push([right, y]);
    for (let x = right; x > left; x--) this.path.push([x, bottom + wave(x)]);
    for (let y = bottom; y > top; y--) this.path.push([left, y]);
    this.lit = new Uint8Array(80 * 72);
    this.length = length;
    this.head = length - 1;
    for (let i = 0; i < length; i++) this.set(i, 1);
    this.painter = new Painter();
  }

  set(i, on) {
    const [x, y] = this.path[i % this.path.length];
    this.lit[y * 80 + x] = on;
    return [Math.floor(y / 3), x >> 1];
  }

  bits(cy, cx) {
    let bits = 0;
    for (let i = 0; i < 6; i++) if (this.lit[(cy * 3 + (i >> 1)) * 80 + cx * 2 + (i & 1)]) bits |= 1 << i;
    return bits;
  }

  draw(v, [cy, cx]) {
    return this.painter.cell(v, cy + 1, cx + 1, this.bits(cy, cx));
  }

  /** Every cell of the crawler. */
  drawAll(v = new Videotex()) {
    const done = new Set();
    for (let i = this.head - this.length + 1; i <= this.head; i++) {
      const [x, y] = this.path[i % this.path.length];
      const key = `${Math.floor(y / 3)}:${x >> 1}`;
      if (done.has(key)) continue;
      done.add(key);
      this.draw(v, [Math.floor(y / 3), x >> 1]);
    }
    return v;
  }

  step(v = new Videotex()) {
    const tail = this.set(this.head - this.length + 1, 0);
    this.head++;
    const head = this.set(this.head, 1);
    // Nearest cell first: the planner then reaches it with a byte or two.
    const cells = tail[0] === head[0] && tail[1] === head[1] ? [head] : [tail, head];
    const green = colorIndex('green');
    if (cells.length === 2 && this.painter.cost(head[0] + 1, head[1] + 1, 1, green, false)[0]
      < this.painter.cost(tail[0] + 1, tail[1] + 1, 1, green, false)[0]) cells.reverse();
    cells.forEach((cell) => this.draw(v, cell));
    return v;
  }
}

/* ---------------------------------------------------------------------- */
/* Game                                                                    */
/* ---------------------------------------------------------------------- */

class Game {
  constructor() {
    this.grid = new Uint8Array(W * H);
    this.body = []; // sub-pixel indices, tail first
    this.dir = 'RIGHT';
    this.turns = [];
    this.grow = 0;
    this.score = 0;
    this.apples = 0;
    this.ticks = 0;
    this.painter = new Painter();
    const y = Math.floor(H / 2);
    for (let x = 10; x < 22; x++) this.occupy(y * W + x);
    this.gold = null;
    this.food = this.spawn();
  }

  get level() {
    return Math.min(9, 1 + Math.floor(this.apples / 4));
  }

  /** Milliseconds per step: from 7 to 12 steps a second. */
  get interval() {
    return Math.max(82, 145 - this.apples * 3);
  }

  get length() {
    return this.body.length + this.grow;
  }

  occupy(index) {
    this.grid[index] = 1;
    this.body.push(index);
  }

  get head() {
    return this.body[this.body.length - 1];
  }

  /** Cell coordinates of a sub-pixel index. */
  static cellOf(index) {
    return [(index % W) >> 1, Math.floor(Math.floor(index / W) / 3)];
  }

  bitsAt(cx, cy) {
    let bits = 0;
    for (let i = 0; i < 6; i++) {
      const x = cx * 2 + (i & 1);
      const y = cy * 3 + (i >> 1);
      if (this.grid[y * W + x]) bits |= 1 << i;
    }
    return bits;
  }

  /** A free cell away from the head for a new apple. */
  spawn() {
    const [hx, hy] = Game.cellOf(this.head);
    const taken = (cx, cy) => this.bitsAt(cx, cy) !== 0
      || (this.food && this.food.cx === cx && this.food.cy === cy)
      || (this.gold && this.gold.cx === cx && this.gold.cy === cy);
    for (let tries = 0; tries < 400; tries++) {
      const cx = Math.floor(Math.random() * COLS);
      const cy = Math.floor(Math.random() * ROWS);
      if (Math.abs(cx - hx) < 4 && Math.abs(cy - hy) < 3) continue;
      if (!taken(cx, cy)) return { cx, cy };
    }
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) if (!taken(cx, cy)) return { cx, cy };
    return null;
  }

  queue(dir) {
    const last = this.turns.length ? this.turns[this.turns.length - 1] : this.dir;
    if (dir !== last && dir !== OPPOSITE[last] && this.turns.length < 3) this.turns.push(dir);
  }

  /** One step. Draws into `v`; returns 'crash', 'apple', 'gold' or null. */
  step(v) {
    this.ticks++;
    if (this.turns.length) this.dir = this.turns.shift();
    const [dx, dy] = MOVES[this.dir];
    const x = (this.head % W) + dx;
    const y = Math.floor(this.head / W) + dy;
    let tail = -1;
    if (this.grow > 0) this.grow--;
    else {
      tail = this.body.shift();
      this.grid[tail] = 0;
    }
    const index = y * W + x;
    if (x < 0 || x >= W || y < 0 || y >= H || this.grid[index]) {
      if (tail >= 0) {
        this.body.unshift(tail);
        this.grid[tail] = 1;
      }
      return 'crash';
    }
    this.occupy(index);

    const dirty = new Map();
    const touch = (i) => {
      const [cx, cy] = Game.cellOf(i);
      dirty.set(cy * COLS + cx, [cx, cy]);
    };
    if (tail >= 0) touch(tail);
    touch(index);

    let event = null;
    const [cx, cy] = Game.cellOf(index);
    if (this.food && this.food.cx === cx && this.food.cy === cy) {
      event = 'apple';
      this.apples++;
      this.score += 10 * this.level;
      this.grow += 6;
      this.food = null;
    } else if (this.gold && this.gold.cx === cx && this.gold.cy === cy) {
      event = 'gold';
      this.score += 50 * this.level;
      this.grow += 2;
      this.gold = null;
    }
    this.paint(v, [...dirty.values()]);

    if (event === 'apple') {
      this.food = this.spawn();
      if (this.food) this.drawFood(v, this.food, 'red');
      if (this.apples % GOLD_EVERY === 0 && !this.gold) {
        this.gold = this.spawn();
        if (this.gold) {
          this.gold.until = this.ticks + GOLD_TICKS;
          this.drawFood(v, this.gold, 'yellow', true);
        }
      }
    }
    if (this.gold && this.ticks >= this.gold.until) {
      this.painter.cell(v, TOP + this.gold.cy, LEFT + this.gold.cx, 0);
      this.gold = null;
    }
    if (event) this.drawCounters(v);
    return event;
  }

  /** Draw cells, always going to the cheapest one next. */
  paint(v, cells) {
    const green = colorIndex('green');
    const todo = cells.map(([cx, cy]) => ({ row: TOP + cy, col: LEFT + cx, bits: this.bitsAt(cx, cy) }));
    while (todo.length) {
      let best = 0;
      let bestCost = Infinity;
      todo.forEach((c, i) => {
        const [cost] = this.painter.cost(c.row, c.col, c.bits, green, false);
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
        }
      });
      const [c] = todo.splice(best, 1);
      this.painter.cell(v, c.row, c.col, c.bits);
    }
  }

  drawFood(v, food, color, flash = false) {
    this.painter.cell(v, TOP + food.cy, LEFT + food.cx, APPLE, color, flash);
  }

  /** Score, length and level in the header band. */
  drawCounters(v) {
    v.moveTo(1, 18).color('black').text(pad(this.score, 5));
    v.moveTo(1, 30).color('black').text(pad(Math.min(999, this.length), 3));
    v.moveTo(1, 39).color('black').text(String(this.level));
    this.painter.forget();
  }

  /** The red wave running from the head to the tail. */
  drawCrash(v) {
    const seen = new Set();
    for (let i = this.body.length - 1; i >= 0 && seen.size < 80; i--) {
      const [cx, cy] = Game.cellOf(this.body[i]);
      const key = cy * COLS + cx;
      if (seen.has(key)) continue;
      seen.add(key);
      this.painter.cell(v, TOP + cy, LEFT + cx, this.bitsAt(cx, cy), 'red', seen.size === 1);
    }
    this.painter.forget();
    return v.bell();
  }

  /** Snake and apples on some rows of the playfield (all of them by default). */
  drawRows(v, from = 0, to = ROWS - 1) {
    for (let cy = from; cy <= to; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const bits = this.bitsAt(cx, cy);
        if (bits) this.painter.cell(v, TOP + cy, LEFT + cx, bits);
      }
    }
    if (this.food && this.food.cy >= from && this.food.cy <= to) this.drawFood(v, this.food, 'red');
    if (this.gold && this.gold.cy >= from && this.gold.cy <= to) this.drawFood(v, this.gold, 'yellow', true);
    return v;
  }

  /** Every cell of the playfield (REPETITION, first display). */
  drawAll(v) {
    this.painter.forget();
    this.drawRows(v);
    this.drawCounters(v);
    return v;
  }
}

/* ---------------------------------------------------------------------- */
/* Pages                                                                   */
/* ---------------------------------------------------------------------- */

const SNAKE_ART = [
  '..................................................gggggggg.................gg...',
  '................................................gggggggggggg..............gg....',
  '..............................................gggggggggggggggg............g.....',
  '............................................ggggggggggggwwggggg........rrrr.rrr.',
  '.........................................gggggggggggggggwkgggggg......rrrrrrrrrr',
  '.....gggyyg............................yggggggggggggggggwwgggggg......rrwwrrrrrr',
  'ggyyggggyyggggyyg....................gyygggggggggggggggggggggggg....r.rrwrrrrrrr',
  '....ggggyyggggyyggggy.............ggggyygggggggggggggggggggkkkkkrrrr..rrrrrrrrrr',
  '.........yggggyyggggyyggggyyggggyyggggyygggggggggggggggggggggggg....r.rrrrrrrrrr',
  '............ggyyggggyyggggyyggggyyggggyyggg..gggggggggggggggggg........rrrrrrrr.',
  '..............yyggggyyggggyyggggyyggggyyg.....gggggggggggggggg.........rrrrrrrr.',
  '.................gggyyggggyyggggyygggg..........gggggggggggg............rrr.rrr.',
  '...................gyyggggyyggggyygg..............gggggggg......................',
  '.......................gggyygggg................................................',
  '................................................................................',
];

/** Key cap on any background: inverse video, the zone colour kept around it. */
function cap(p, row, col, name, { bg = 'black', color = 'white' } = {}) {
  p.moveTo(row, col).bg(bg).color(color).invert(true).text(` ${name} `).invert(false);
  return p;
}

/** "[ ↑ ↓ ← → ] ou [ 8 2 4 6 ]" */
function controls(p, row, col, { bg = 'black', color = 'white', text = 'cyan' } = {}) {
  cap(p, row, col, '↑ ↓ ← →', { bg, color });
  p.color(text).text(' ou ');
  return cap(p, row, col + 13, '8 2 4 6', { bg, color });
}

function titlePage() {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: 'green', rows: 4 });
  p.bigText(2, 10, 'SERPENT', { color: 'black', background: 'green' });
  p.hline(5, { color: 'green', style: 'top' });
  p.art(6, 1, SNAKE_ART);

  p.panel(12, 3, 18, 37, { bg: 'cyan', shadow: 'blue' });
  p.print(13, 5, 'Guidez le serpent vers les pommes', { color: 'black', bg: 'cyan' });
  p.print(14, 5, 'rouges : il grandit et accélère.', { color: 'black', bg: 'cyan' });
  p.print(15, 5, 'Evitez les murs et votre queue !', { color: 'black', bg: 'cyan' });
  controls(p, 17, 5, { bg: 'cyan', color: 'black', text: 'black' });
  p.color('black').text('  diriger');

  p.print(22, 3, 'RECORD', { color: 'yellow', size: 'tall' });
  p.print(22, 10, pad(record, 5), { color: 'white', size: 'double' });
  p.moveTo(22, 22).color('white').flash(true).invert(true).text(' ENVOI ').invert(false).color('yellow').text(' pour jouer');
  p.hints(24, [['GUIDE', 'mode d\'emploi'], ['SOMMAIRE', 'quitter']], { col: 3 });
  return p;
}

function helpPage() {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: 'green', rows: 3 });
  p.print(3, 3, 'MODE D\'EMPLOI', { color: 'black', bg: 'green', size: 'double' });
  p.hline(4, { color: 'green', style: 'top' });

  p.print(6, 3, 'Diriger', { color: 'yellow' });
  controls(p, 6, 15);
  p.print(7, 15, 'Minitel 1 : chiffres', { color: 'green' });
  p.print(9, 3, 'Pause', { color: 'yellow' });
  cap(p, 9, 15, 'ENVOI');
  p.print(11, 3, 'Abandon', { color: 'yellow' });
  cap(p, 11, 15, 'SOMMAIRE');
  p.print(13, 3, 'Réafficher', { color: 'yellow' });
  cap(p, 13, 15, 'REPETITION');

  p.hline(14, { col: 3, width: 36, color: 'blue', style: 'bottom' });
  p.moveTo(15, 3).color('red').mosaic(APPLE);
  p.print(15, 5, 'Pomme rouge', { color: 'red' });
  p.print(15, 19, '10 pts x niveau', { color: 'white' });
  p.print(16, 19, 'et 6 anneaux de plus', { color: 'cyan' });
  p.moveTo(17, 3).color('yellow').flash(true).mosaic(APPLE);
  p.print(17, 5, "Pomme d'or", { color: 'yellow' });
  p.print(17, 19, '50 pts x niveau', { color: 'white' });
  p.print(18, 19, 'fugace : faites vite', { color: 'cyan' });
  p.print(19, 5, 'Niveau', { color: 'green' });
  p.print(19, 19, 'toutes les 4 pommes', { color: 'white' });
  p.hline(20, { col: 3, width: 36, color: 'blue', style: 'top' });

  p.paragraph(21, 3, "Le saviez-vous ? Chaque pas du serpent ne coûte qu'une dizaine de caractères.", { width: 36, color: 'green' });
  p.hints(24, [['ENVOI', 'jouer'], ['SOMMAIRE', 'retour']], { col: 3 });
  return p;
}

function gamePage(game) {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: 'green' });
  p.print(1, 2, 'SERPENT', { color: 'black', bg: 'green' });
  p.print(1, 12, 'SCORE', { color: 'black', bg: 'green' });
  p.print(1, 25, 'LONG', { color: 'black', bg: 'green' });
  p.print(1, 35, 'NIV', { color: 'black', bg: 'green' });
  p.box(2, 1, 24, 40, { color: 'blue' });
  game.drawAll(p);
  return p;
}

/** Giant flashing letters (mosaic), e.g. yellow on the panel colour. */
function bigFlash(p, row, col, text, { color = 'yellow', bg = 'red' } = {}) {
  const glyphs = [...text].map((ch) => getGlyph(ch));
  const width = glyphs.length * 3; // 5 pixels + 1 space = 3 cells per letter
  for (let cy = 0; cy < 3; cy++) {
    const cells = [];
    for (let cx = 0; cx < width; cx++) {
      let bits = 0;
      for (let i = 0; i < 6; i++) {
        const x = cx * 2 + (i & 1);
        const y = cy * 3 + (i >> 1);
        const glyph = glyphs[Math.floor(x / 6)];
        const gx = x % 6;
        if (glyph && gx < 5 && glyph[y + 1] & (0x80 >> (gx + 1))) bits |= 1 << i;
      }
      cells.push(bits);
    }
    p.moveTo(row + cy, col).color(color).bg(bg).flash(true).mosaic(cells);
  }
  return p;
}

function overPage(game, newRecord) {
  const p = new Page();
  const line = (row, label, value) => {
    p.print(row, 10, label, { color: 'black', bg: 'yellow' });
    p.text(' ').fill('.', 20 - label.length - value.length).text(` ${value}`);
  };
  p.panel(7, 7, 18, 34, { bg: 'yellow', shadow: 'red' });
  bigFlash(p, 8, 14, 'PERDU', { color: 'black', bg: 'yellow' });
  line(12, 'Score', pad(game.score, 5));
  line(13, 'Pommes', String(game.apples));
  if (newRecord) {
    p.moveTo(14, 10).bg('yellow').color('black').flash(true).invert(true).text(' NOUVEAU RECORD ! ');
  } else {
    line(14, 'Record', pad(record, 5));
  }
  cap(p, 16, 8, 'ENVOI', { bg: 'yellow', color: 'black' });
  p.color('black').text(' rejouer');
  cap(p, 16, 24, 'SOMMAIRE', { bg: 'yellow', color: 'black' });
  return p;
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Keys that mean something on the title and help pages. */
function wanted(event) {
  if (event.type === 'key') return ['ENVOI', 'SOMMAIRE', 'GUIDE', 'REPETITION'].includes(event.key) || Boolean(direction(event));
  return event.type === 'char' && Boolean(direction(event));
}

/**
 * Title screen. Once the page is on screen (the terminal answers a cursor
 * position request, ESC 0x61, only after displaying what came before) a
 * snake starts running laps around the rules. Resolves to the first key.
 */
async function title(session) {
  const STEP = 115;
  const page = titlePage();
  session.write(page.raw(0x1b, 0x61));
  const crawler = new Crawler();
  let started = false;
  let next = clock() + (page.length * 1000) / 60 + 2000; // if the terminal never answers
  const start = () => {
    started = true;
    session.write(crawler.drawAll());
    next = clock() + STEP;
  };
  for (;;) {
    const wait = next - clock();
    const event = wait > 0 ? await session.next({ timeout: wait }) : null;
    if (event && event.type === 'response') {
      if (!started) start();
    } else if (event) {
      if (wanted(event)) return event;
    } else if (!started) {
      start();
    } else {
      const v = crawler.step();
      session.write(v);
      next = Math.max(next + Math.max(STEP, (v.length * 1000) / LINE_RATE), clock() - STEP);
    }
  }
}

/** One game; resolves to 'again' or 'menu'. */
async function play(session) {
  const game = new Game();
  session.flush();
  const hint = new Videotex().moveTo(20, 8).color('yellow').text('Une flèche ou 8 4 6 2 : partez !');
  session.write(gamePage(game).append(hint));

  // Wait for the first direction (or ENVOI to go straight on).
  for (;;) {
    const event = await session.next();
    const dir = direction(event);
    if (dir) {
      if (dir !== OPPOSITE[game.dir]) game.dir = dir;
      break;
    }
    if (event.type === 'key' && event.key === 'ENVOI') break;
    if (event.type === 'key' && event.key === 'SOMMAIRE') return 'menu';
    if (event.type === 'key' && event.key === 'REPETITION') session.write(gamePage(game).append(hint));
  }
  // Wipe the hint, then put back whatever it covered.
  game.painter.forget();
  session.write(game.drawRows(new Videotex().moveTo(20, 8).text(' ').repeat(31), 20 - TOP, 20 - TOP));
  game.painter.forget();

  let next = clock();
  for (;;) {
    // Collect keys until the next step is due.
    for (;;) {
      const wait = next - clock();
      if (wait <= 0) break;
      const event = await session.next({ timeout: wait });
      if (!event) break;
      const dir = direction(event);
      if (dir) game.queue(dir);
      else if (event.type === 'key') {
        if (event.key === 'SOMMAIRE') return 'menu';
        if (event.key === 'REPETITION') {
          session.write(gamePage(game));
        } else if (event.key === 'ENVOI') {
          session.write(new Videotex().moveTo(1, 2).bg('green').color('black').flash(true).text('PAUSE  '));
          game.painter.forget();
          const key = await session.waitKey(['ENVOI', 'SOMMAIRE', 'REPETITION']);
          if (key === 'SOMMAIRE') return 'menu';
          session.write(key === 'REPETITION' ? gamePage(game) : new Videotex().moveTo(1, 2).color('black').text('SERPENT'));
          game.painter.forget();
          next = clock();
        }
      }
    }
    const v = new Videotex();
    const event = game.step(v);
    if (event === 'crash') break;
    if (event === 'gold') v.bell();
    if (v.length) session.write(v);
    // Never ask more of the line than it can carry.
    next += Math.max(game.interval, (v.length * 1000) / LINE_RATE);
    next = Math.max(next, clock() - game.interval);
  }

  const newRecord = game.score > record;
  if (newRecord) record = game.score;
  session.write(game.drawCrash(new Videotex()));
  await session.sleep(900);
  session.flush();
  session.write(overPage(game, newRecord));
  for (;;) {
    const key = await session.waitKey(['ENVOI', 'SOMMAIRE', 'REPETITION']);
    if (key === 'ENVOI') return 'again';
    if (key === 'SOMMAIRE') return 'menu';
    session.write(gamePage(game).append(overPage(game, newRecord)));
  }
}

export default {
  code: 'SERPENT',
  name: 'Serpent',
  description: 'Le jeu du serpent en mosaïque',
  async run(session) {
    let help = false;
    for (;;) {
      let event;
      if (help) {
        session.write(helpPage());
        do event = await session.next(); while (!wanted(event));
      } else {
        event = await title(session);
      }
      const key = event.type === 'key' ? event.key : null;
      if (key === 'SOMMAIRE') {
        if (!help) return;
        help = false;
      } else if (key === 'GUIDE') {
        help = true;
      } else if (key === 'ENVOI' || direction(event)) {
        let outcome = await play(session);
        while (outcome === 'again') outcome = await play(session);
        help = false;
      }
    }
  },
};
