/**
 * 3615 CODE — the design system inside the Minitel.
 *
 * A guided tour of what the terminal can do, in eight pages: a test card,
 * the palette and its grey levels, the character sets, the 64 mosaics,
 * character sizes, attributes (with a live demo of the zone rule), a line
 * speed test, and the credits. SUITE / RETOUR leaf through the pages,
 * SOMMAIRE comes back to the menu.
 */
import { Page, LINE } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import { GREY_LEVELS, SS2, ESC } from '../../../src/js/videotex/constants.js';
import { g1Byte } from '../../../src/js/videotex/charset.js';
import { indicesToCells, encodeCells } from '../../../src/js/mosaic/mosaic.js';

/** Colours in bar order: brightest to darkest, as on a test card. */
const BARS = ['white', 'yellow', 'cyan', 'green', 'magenta', 'red', 'blue', 'black'];
const NAMES = {
  black: 'NOIR', red: 'ROUGE', green: 'VERT', yellow: 'JAUNE', blue: 'BLEU', magenta: 'MAGENTA', cyan: 'CYAN', white: 'BLANC',
};
const INDEX = { black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7 };
const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/* ---------------------------------------------------------------------- */
/* Shared furniture                                                        */
/* ---------------------------------------------------------------------- */

/** The 3615 CODE signature: a thin line in the eight colours. */
function rainbow(p, row, style = 'bottom') {
  p.moveTo(row, 1);
  BARS.forEach((color) => p.color(color).mosaic(new Array(5).fill(color === 'black' ? 0 : LINE[style])));
  return p;
}

/** Key cap in inverse video, keeping the zone colour around it. */
function cap(p, row, col, name, { bg = 'black', color = 'white' } = {}) {
  return p.moveTo(row, col).bg(bg).color(color).invert(true).text(` ${name} `).invert(false);
}

/**
 * Double-size text on a background. The zone delimiter is itself double
 * size, so that the upper half row gets the background too.
 */
function bigLabel(p, row, col, text, { color = 'white', bg = 'black' } = {}) {
  return p.moveTo(row, col - 2).bg(bg).color(color).size('double').text(` ${text}`);
}

/** Section header: signature line, title, page number. */
function header(p, index) {
  const section = SECTIONS[index];
  p.status(` 3615 CODE  ${index + 1}/8  ${section.title}`, { color: 'white' });
  rainbow(p, 1);
  p.print(3, 2, section.title.toUpperCase(), { color: 'white', size: 'double' });
  p.right(2, 39, section.tag, { color: 'cyan' });
  p.right(3, 39, `${index + 1}/8`, { color: 'yellow' });
  p.hline(4, { color: 'blue', style: 'top' });
  return p;
}

/** Navigation hints on row 24 (RETOUR gives way when room is short). */
function footer(p, extra = []) {
  let pairs = [...extra, ['SUITE', '>'], ['RETOUR', '<'], ['SOMMAIRE', 'menu']];
  const width = (list) => list.reduce((n, [key, label]) => n + key.length + label.length + 3, -2);
  if (width(pairs) > 38) pairs = pairs.filter(([key]) => key !== 'RETOUR');
  return p.hints(24, pairs, { col: 2 });
}

/* ---------------------------------------------------------------------- */
/* 1. Test card                                                            */
/* ---------------------------------------------------------------------- */

let testCard = null;

/** The test card picture: 80 x 72 sub-pixels, two colours per cell at most. */
function testCardCells() {
  if (testCard) return testCard;
  const K = 0;
  const B = 4;
  const W = 7;
  const width = 80;
  const height = 72;
  const data = new Int8Array(width * height).fill(B);
  const set = (x, y, c) => {
    if (x >= 0 && x < width && y >= 0 && y < height) data[y * width + x] = c;
  };
  const rect = (c0, r0, c1, r1, c) => {
    for (let y = (r0 - 1) * 3; y < r1 * 3; y++) for (let x = (c0 - 1) * 2; x < c1 * 2; x++) set(x, y, c);
  };
  // Castellated frame.
  for (let c = 1; c <= 40; c += 2) {
    const on = ((c - 1) / 2) % 2 === 0;
    rect(c, 1, c + 1, 1, on ? W : K);
    rect(c, 24, c + 1, 24, on ? K : W);
  }
  for (let r = 2; r <= 23; r++) {
    rect(1, r, 1, r, r % 2 ? K : W);
    rect(40, r, 40, r, r % 2 ? W : K);
  }
  // The circle.
  for (let a = 0; a < 2 * Math.PI; a += 0.001) {
    const x = Math.floor(40 + Math.cos(a) * 27);
    const y = Math.floor(31.5 + Math.sin(a) * 28);
    set(x, y, W);
    set(x + (Math.cos(a) > 0 ? -1 : 1), y, W);
  }
  rect(11, 3, 30, 5, K); // name plate
  // Colour bars over the grey ramp, on a black plate with a fine white edge.
  rect(12, 6, 29, 14, K);
  for (let x = 22; x <= 57; x++) {
    set(x, 15, W);
    set(x, 41, W);
  }
  for (let y = 15; y <= 41; y++) {
    set(22, y, W);
    set(57, y, W);
  }
  BARS.forEach((c, i) => rect(13 + i * 2, 7, 14 + i * 2, 11, INDEX[c]));
  [...BARS].reverse().forEach((c, i) => rect(13 + i * 2, 12, 14 + i * 2, 13, INDEX[c]));
  // Resolution gratings: columns, checkerboard, rows.
  rect(12, 15, 29, 17, K);
  for (let y = 15 * 3 - 2; y < 17 * 3 - 1; y++) {
    for (let x = 12 * 2; x < 18 * 2; x++) set(x, y, x % 2 ? K : W);
    for (let x = 18 * 2; x < 23 * 2; x++) set(x, y, (x + y) % 2 ? K : W);
    for (let x = 23 * 2; x < 28 * 2; x++) set(x, y, y % 2 ? K : W);
  }
  rect(2, 19, 39, 23, K); // type specimen strip
  testCard = indicesToCells({ width, height, data });
  return testCard;
}

function mirePage() {
  const p = new Page().clear().cursor(false);
  p.status(' 3615 CODE : mire   SUITE >  SOMMAIRE', { color: 'white' });
  encodeCells(p, testCardCells(), { row: 1, col: 1 });
  bigLabel(p, 5, 13, '3615 CODE', { color: 'yellow' });
  // Type specimen: sizes, then the three attributes.
  p.moveTo(21, 3).color('white').text('Aa');
  p.moveTo(21, 6).color('white').size('tall').text('Aa');
  p.moveTo(21, 9).color('white').size('wide').text('Aa');
  p.moveTo(21, 14).color('white').size('double').text('Aa');
  p.moveTo(20, 20).color('cyan').text('40 x 25');
  p.moveTo(21, 20).color('green').text('8 couleurs');
  p.moveTo(20, 31).color('yellow').text('G0 G1 G2');
  p.moveTo(21, 31).color('magenta').text('1200 bd');
  p.moveTo(23, 3).color('white').flash(true).text('CLIGNOTANT');
  p.moveTo(23, 15).color('white').invert(true).text(' INVERSE ');
  p.moveTo(23, 26).color('white').underline(true).text(' SOULIGNE');
  return p;
}

/* ---------------------------------------------------------------------- */
/* 2. Palette                                                              */
/* ---------------------------------------------------------------------- */

function palettePage(index) {
  const p = header(new Page().clear().cursor(false), index);
  p.print(6, 2, 'COULEUR', { color: 'white' });
  p.print(6, 13, 'ENCRE', { color: 'white' });
  p.print(6, 20, 'FOND', { color: 'white' });
  p.print(6, 27, 'GRIS', { color: 'white' });
  [...BARS].reverse().forEach((color, i) => {
    const row = 7 + i;
    const n = INDEX[color];
    const dark = GREY_LEVELS[n] <= 0.6;
    p.moveTo(row, 1).bg(color).color(dark ? 'white' : 'black').text(` ${n} ${NAMES[color].padEnd(7)}`).bg('black').text(' ');
    if (color === 'black') p.moveTo(row, 13).color('white').invert(true).text(`ESC ${hex(0x40 + n)}`).invert(false);
    else p.moveTo(row, 13).color(color).text(`ESC ${hex(0x40 + n)}`);
    p.moveTo(row, 20).color('white').text(`ESC ${hex(0x50 + n)}`);
    p.right(row, 30, `${Math.round(GREY_LEVELS[n] * 100)}%`, { color: 'cyan' });
    if (n) p.progress(row, 32, 8, GREY_LEVELS[n], { color, track: 'black' });
  });
  p.paragraph(16, 2, 'En noir et blanc, chaque couleur devient un gris. Du plus sombre au plus clair :', { width: 38, color: 'cyan' });
  [19, 20].forEach((row) => {
    p.moveTo(row, 1);
    [...BARS].reverse().forEach((color) => p.color(color).mosaic(new Array(5).fill(color === 'black' ? 0 : LINE.full)));
  });
  p.moveTo(21, 1).color('white');
  [...BARS].reverse().forEach((color) => p.text(`${Math.round(GREY_LEVELS[INDEX[color]] * 100)}%`.padStart(4).padEnd(5)));
  p.print(22, 2, 'La mire range ses barres ainsi.', { color: 'green' });
  return footer(p);
}

/* ---------------------------------------------------------------------- */
/* 3. Characters                                                           */
/* ---------------------------------------------------------------------- */

const G2 = [['£', 0x23], ['$', 0x24], ['#', 0x26], ['§', 0x27], ['←', 0x2c], ['↑', 0x2d], ['→', 0x2e], ['↓', 0x2f], ['°', 0x30],
  ['±', 0x31], ['÷', 0x38], ['¼', 0x3c], ['½', 0x3d], ['¾', 0x3e], ['Œ', 0x6a], ['œ', 0x7a], ['ß', 0x7b]];

function charsPage(index) {
  const p = header(new Page().clear().cursor(false), index);
  p.moveTo(5, 6).color('cyan');
  for (let i = 0; i < 16; i++) p.text(`${i.toString(16).toUpperCase()} `);
  for (let hi = 2; hi <= 7; hi++) {
    const row = 4 + hi;
    p.moveTo(row, 2).color('cyan').text(`${hi}x`);
    p.moveTo(row, 6).color('white');
    for (let lo = 0; lo < 16; lo++) {
      p.raw(hi * 16 + lo).text(' ');
    }
  }
  p.moveTo(6, 6).color('blue').invert(true).text('SP').invert(false); // 0x20: the space
  p.print(13, 2, 'Accents', { color: 'yellow' });
  p.print(13, 10, 'à â ä ç é è ê ë î ï ô ö ù û ü ÿ', { color: 'white' });
  p.print(14, 10, 'SS2 (19h) + accent + lettre', { color: 'cyan' });
  p.print(15, 10, '41 grave  42 aigu  43 circ.', { color: 'green' });
  p.print(16, 10, '48 tréma  4B cédille', { color: 'green' });
  p.print(18, 2, 'Jeu G2', { color: 'yellow' });
  p.print(18, 10, 'SS2 (19h) + code', { color: 'cyan' });
  G2.forEach(([, code], i) => {
    const row = 19 + Math.floor(i / 6);
    const col = 2 + (i % 6) * 6 + (i >= 12 ? 3 : 0);
    p.moveTo(row, col).color('white').raw(SS2, code).color('green').text(` ${hex(code)}`);
  });
  p.print(22, 2, "Pas d'accent sur les majuscules.", { color: 'white' });
  return footer(p);
}

/* ---------------------------------------------------------------------- */
/* 4. Mosaics                                                              */
/* ---------------------------------------------------------------------- */

function mosaicPage(index) {
  const p = header(new Page().clear().cursor(false), index);
  p.moveTo(6, 6).color('cyan');
  for (let i = 0; i < 8; i++) p.text(`+${i} `);
  // Joined in white, then disjoint in yellow: HT skips the cells in between.
  const HT = 0x09;
  for (let r = 0; r < 8; r++) {
    const row = 7 + r * 2;
    p.moveTo(row, 2).color('cyan').text(hex(g1Byte(r * 8)));
    p.moveTo(row, 6).color('white');
    for (let c = 0; c < 8; c++) p.mosaic(r * 8 + c).raw(HT, HT);
    p.moveTo(row, 7).color('yellow').separated(true);
    for (let c = 0; c < 8; c++) p.mosaic(r * 8 + c).raw(HT, HT);
  }
  // Sextant weights.
  const weights = [[1, 2], [4, 8], [16, 64]];
  weights.forEach(([left, right], i) => {
    const row = 7 + i * 2;
    p.moveTo(row, 31).bg('blue').color('yellow').text(` ${String(left).padStart(2)} `).bg('black').text(' ');
    p.moveTo(row, 36).bg('blue').color('yellow').text(` ${String(right).padStart(2)} `).bg('black').text(' ');
  });
  p.print(13, 31, 'code =', { color: 'white' });
  p.print(14, 31, '20h +', { color: 'white' });
  p.print(15, 31, 'poids', { color: 'white' });
  p.print(17, 31, 'soudées', { color: 'white' });
  p.print(18, 31, 'et', { color: 'cyan' });
  p.print(19, 31, 'disjointes', { color: 'yellow' });
  p.moveTo(23, 2).color('white').mosaic(0b110101).color('cyan').text(' = 20h + 1 + 4 + 16 + 64 = 75h');
  return footer(p);
}

/* ---------------------------------------------------------------------- */
/* 5. Sizes                                                                */
/* ---------------------------------------------------------------------- */

function sizesPage(index) {
  const p = header(new Page().clear().cursor(false), index);
  const line = (row, label, code) => {
    p.print(row, 2, label, { color: 'cyan' });
    p.right(row, 39, `ESC ${code}`, { color: 'yellow' });
  };
  line(6, 'Normale', '4C');
  p.print(7, 4, 'Minitel 3615', { color: 'white' });
  line(9, 'Double hauteur', '4D');
  p.print(11, 4, 'Minitel 3615', { color: 'white', size: 'tall' });
  line(13, 'Double largeur', '4E');
  p.print(14, 4, 'Minitel', { color: 'white', size: 'wide' });
  line(16, 'Double taille', '4F');
  p.print(18, 4, 'Minitel', { color: 'white', size: 'double' });
  p.print(20, 2, 'Géante (mosaïque 3 x 3)', { color: 'cyan' });
  p.bigText(21, 4, '3615', { color: 'green' });
  p.paragraph(21, 20, 'Le double se dessine vers le haut : la rangée du dessus.', { width: 20, color: 'white' });
  return footer(p);
}

/* ---------------------------------------------------------------------- */
/* 6. Attributes                                                           */
/* ---------------------------------------------------------------------- */

const MASK = [ESC, 0x23, 0x20, 0x58];
const UNMASK = [ESC, 0x23, 0x20, 0x5f];

/** The zone demo: what is sent, token by token. */
const ZONE_DEMO = [
  ['ESC 54', [ESC, 0x54]],
  ['M', [0x4d]], ['I', [0x49]], ['N', [0x4e]], ['I', [0x49]],
  ['SP', [0x20]],
  ['T', [0x54]], ['E', [0x45]], ['L', [0x4c]],
];

function attributesPage(index) {
  const p = header(new Page().clear().cursor(false), index);
  const line = (row, label, codes) => {
    p.print(row, 2, label, { color: 'cyan' });
    p.print(row, 16, codes, { color: 'yellow' });
  };
  line(6, 'Clignotement', 'ESC 48/49');
  p.moveTo(6, 29).color('white').flash(true).text('Minitel');
  line(8, 'Inversion', 'ESC 5D/5C');
  p.moveTo(8, 28).color('white').invert(true).text(' Minitel ');
  line(10, 'Soulignement', 'ESC 5A/59');
  p.moveTo(10, 28).color('white').underline(true).text(' Minitel').underline(false).text(' ');
  line(12, 'Masquage', 'ESC 58/5F');
  p.moveTo(12, 28).color('white').conceal(true).text(' 3615 CODE');
  p.print(13, 16, 'ENVOI : démasquer', { color: 'green' });

  p.hline(14, { col: 2, width: 38, color: 'blue', style: 'bottom' });
  p.print(15, 2, 'Le fond est un attribut de zone :', { color: 'white' });
  p.print(16, 2, "il attend le prochain espace.", { color: 'white' });
  p.print(18, 2, 'Envoi', { color: 'cyan' });
  let col = 9;
  ZONE_DEMO.forEach(([label]) => {
    p.moveTo(18, col).color('yellow').text(label);
    col += label.length + 1;
  });
  p.print(20, 2, 'Ecran', { color: 'cyan' });
  p.moveTo(20, 9).color('blue').fill('.', 8);
  return footer(p, [['ENVOI', 'masque']]);
}

async function attributes(session, index) {
  session.write(attributesPage(index));
  let masked = true;
  let demo = true;
  try {
    for (;;) {
      let key = null;
      if (demo) {
        demo = false;
        key = await runZoneDemo(session);
      }
      key = key || await session.waitKey(['ENVOI', 'SUITE', 'RETOUR', 'SOMMAIRE', 'REPETITION', 'GUIDE']);
      if (key === 'ENVOI') {
        masked = !masked;
        const hint = masked ? 'ENVOI : démasquer' : 'ENVOI : masquer  ';
        session.write(new Videotex().raw(masked ? MASK : UNMASK).moveTo(13, 16).color('green').text(hint));
      } else if (key === 'REPETITION') {
        masked = true;
        session.write(new Videotex().raw(MASK), attributesPage(index));
        demo = true;
      } else {
        return key;
      }
    }
  } finally {
    if (session.connected) session.write(new Videotex().raw(MASK));
  }
}

/**
 * The zone rule, live: the bytes go out one by one, highlighted as they
 * leave, and the "screen" line receives exactly those bytes. Any function
 * key stops the demo and is handed back.
 */
async function runZoneDemo(session) {
  const positions = [];
  let col = 9;
  ZONE_DEMO.forEach(([label]) => {
    positions.push(col);
    col += label.length + 1;
  });
  const pause = async (ms) => {
    const event = await session.next({ timeout: ms, filter: (e) => e.type === 'key' });
    return event ? event.key : null;
  };
  session.write(new Videotex().moveTo(20, 9).color('blue').fill('.', 8).moveTo(22, 2).text(' ').repeat(37).moveTo(23, 2).text(' ').repeat(37));
  let key = await pause(800);
  for (let i = 0; i < ZONE_DEMO.length && !key; i++) {
    const v = new Videotex();
    if (i) v.moveTo(18, positions[i - 1]).color('green').text(ZONE_DEMO[i - 1][0]);
    v.moveTo(18, positions[i]).color('white').invert(true).text(ZONE_DEMO[i][0]).invert(false);
    // Replay everything sent so far on the screen line, as a server would.
    v.moveTo(20, 9);
    for (let j = 0; j <= i; j++) v.raw(ZONE_DEMO[j][1]);
    session.write(v);
    key = await pause(i === 0 ? 1000 : 600);
  }
  if (!key) {
    session.write(new Videotex().moveTo(18, positions[ZONE_DEMO.length - 1]).color('green').text(ZONE_DEMO[ZONE_DEMO.length - 1][0])
      .moveTo(22, 2).color('green').text("L'espace a ouvert le fond bleu :")
      .moveTo(23, 2).color('green').text("il court jusqu'au bout de la rangée."));
  }
  return key;
}

/* ---------------------------------------------------------------------- */
/* 7. Line speed                                                           */
/* ---------------------------------------------------------------------- */

/** Bit timeline of a character: start, 7 bits (LSB first), parity, stop. */
function frameBits(code) {
  const data = [];
  for (let i = 0; i < 7; i++) data.push((code >> i) & 1);
  const parity = data.reduce((a, b) => a ^ b, 0);
  return [0, ...data, parity, 1];
}

function speedPage(index) {
  const p = header(new Page().clear().cursor(false), index);
  const intro = "1200 bauds, c'est 1200 bits par seconde. Un caractère en coûte 10 : départ, 7 bits, parité, arrêt. "
    + 'Soit 120 caractères/s.';
  p.paragraph(6, 2, intro, { width: 38, color: 'white' });
  // One character on the wire: "A" = 41h.
  const bits = frameBits(0x41);
  p.print(11, 2, 'La lettre A (41h) sur la ligne :', { color: 'cyan' });
  const cells = [];
  let level = 1; // idle line is high
  bits.forEach((bit) => {
    for (let k = 0; k < 3; k++) {
      let pattern = bit ? LINE.top : LINE.bottom;
      if (k === 0 && bit !== level) pattern = LINE.left | (bit ? 0b000010 : 0b100000);
      cells.push(pattern);
    }
    level = bit;
  });
  p.moveTo(13, 2).color('white').mosaic(LINE.top, LINE.top).color('green').mosaic(cells).color('white').mosaic(LINE.top, LINE.top);
  p.moveTo(14, 4).color('yellow');
  ['D', ...bits.slice(1, 8).map(String), 'P', 'A'].forEach((label) => p.text(`${label}  `));
  p.print(15, 2, 'D départ  P parité paire  A arrêt', { color: 'cyan' });
  p.print(22, 2, 'Une page de 1000 caractères : 8 s.', { color: 'green' });
  return footer(p, [['ENVOI', 'test']]);
}

/** A dense block: colourful mosaics that nothing can compress. */
function denseBlock(row, rows, progressRow) {
  const v = new Videotex();
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  let seed = 3615;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < rows; r++) {
    v.moveTo(row + r, 1);
    for (let c = 0; c < 40; c++) {
      const t = (c + r * 3) / 7;
      const fg = colors[Math.floor(t + random() * 1.5) % colors.length];
      const bg = colors[Math.floor(t + 3 + random() * 1.5) % colors.length];
      v.color(fg).bg(bg).mosaic(1 + Math.floor(random() * 62));
    }
    // Progress, sent inside the stream: it moves as the terminal gets there.
    v.moveTo(progressRow, 2).color('yellow').mosaic(new Array(Math.round(((r + 1) / rows) * 30)).fill(LINE.full));
  }
  return v;
}

async function speed(session, index) {
  const page = speedPage(index);
  session.write(page);
  for (;;) {
    const key = await session.waitKey(['ENVOI', 'SUITE', 'RETOUR', 'SOMMAIRE', 'REPETITION', 'GUIDE']);
    if (key === 'REPETITION') {
      session.write(speedPage(index));
      continue;
    }
    if (key !== 'ENVOI') return key;
    // Make sure the page itself is on screen before starting the clock.
    session.flush();
    session.write(new Videotex().moveTo(23, 2).text(' ').repeat(38)
      .moveTo(21, 2).color('white').text('Chargement...').raw(ESC, 0x61));
    await session.next({ timeout: 20000, filter: (e) => e.type === 'response' });
    const block = denseBlock(17, 4, 21);
    const start = Date.now();
    session.write(block.raw(ESC, 0x61)); // ESC 61h: the terminal answers once it got there
    const answer = await session.next({ timeout: 60000, filter: (e) => e.type === 'response' });
    const seconds = Math.max(0.001, (Date.now() - start) / 1000);
    const rate = block.length / seconds;
    const v = new Videotex().moveTo(21, 2).text(' ').repeat(38);
    if (!answer) v.moveTo(23, 2).color('red').text('Pas de réponse du terminal');
    else if (seconds < 0.25) v.moveTo(23, 2).color('yellow').text(`${block.length} car. : instantané (modem coupé)`);
    else {
      const baud = Math.round((rate * 10) / 100) * 100;
      const time = seconds.toFixed(1).replace('.', ',');
      v.moveTo(23, 2).color('yellow').text(`${block.length} car. en ${time} s = ${Math.round(rate)} car/s`);
      v.moveTo(21, 2).color('white').text(`soit environ ${baud} bauds`);
    }
    session.write(v);
  }
}

/* ---------------------------------------------------------------------- */
/* 8. About                                                                */
/* ---------------------------------------------------------------------- */

const MINITEL = [
  '..wwwwwwwwwwwwwwwwwwwwww..',
  '.wwwwwwwwwwwwwwwwwwwwwwww.',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkyyyyyyyyyykkkkkkkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkggggggggggggggggkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkggggggggggggkkkkkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwkkcccccccccccccccccckkww',
  'wwkkkkkkkkkkkkkkkkkkkkkkww',
  'wwwwwwwwwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwwwwwrrww',
  '.wwwwwwwwwwwwwwwwwwwwwwww.',
  '..........................',
  '.wwwwwwwwwwwwwwwwwwwwwwww.',
  'wkwkwkwkwkwkwkwkwkwkwkwkww',
  'wwwwwwwwwwwwwwwwwwwwwwwwww',
  'wkwkwkwkwkwkwkwkwkwkwkwkww',
  '.wwwwwwwwwwwwwwwwwwwwwwww.',
];

function aboutPage(index) {
  const p = header(new Page().clear().cursor(false), index);
  p.art(6, 2, MINITEL);
  p.print(7, 18, 'minitel', { color: 'white', size: 'double' });
  p.print(8, 18, 'design system Vidéotex', { color: 'cyan' });
  const facts = [
    ['40 x 25', 'caractères'],
    ['8', 'couleurs, 8 gris'],
    ['3', 'jeux G0 G1 G2'],
    ['1200', 'bauds, 7 bits'],
  ];
  facts.forEach(([n, text], i) => {
    p.right(10 + i, 22, n, { color: 'yellow' });
    p.print(10 + i, 24, text, { color: 'white' });
  });
  p.print(15, 2, 'Référence', { color: 'yellow' });
  p.paragraph(15, 13, 'STUM1B, Spécifications techniques d\'utilisation du Minitel 1B.', { width: 27, color: 'white' });
  p.hline(18, { col: 2, width: 38, color: 'blue', style: 'top' });
  p.paragraph(19, 2, 'Chaque page de ce service part en Vidéotex pur, octet par octet, comme en 1990.', { width: 38, color: 'green' });
  return footer(p);
}

/* ---------------------------------------------------------------------- */
/* Menu                                                                    */
/* ---------------------------------------------------------------------- */

const SECTIONS = [
  { title: 'Mire', tag: 'mire de réglage', blurb: 'barres, gris, finesse', page: mirePage },
  { title: 'Palette', tag: '8 couleurs', blurb: '8 couleurs, 8 gris', page: palettePage },
  { title: 'Caractères', tag: 'G0 G2', blurb: 'G0, G2 et accents', page: charsPage },
  { title: 'Mosaïques', tag: 'jeu G1', blurb: 'les 64 sextants', page: mosaicPage },
  { title: 'Tailles', tag: 'ESC 4C-4F', blurb: 'doubles et géantes', page: sizesPage },
  { title: 'Attributs', tag: 'zones', blurb: 'clignoter, masquer...', run: attributes },
  { title: 'Débit', tag: '1200 bauds', blurb: 'chrono en main', run: speed },
  { title: 'A propos', tag: 'crédits', blurb: 'le design system', page: aboutPage },
];

function menuPage() {
  const p = new Page().clear().cursor(false);
  p.status(' 3615 CODE', { color: 'white' });
  rainbow(p, 1, 'full');
  p.bigText(3, 3, 'CODE', { color: 'white' });
  p.print(3, 18, '3615', { color: 'yellow', size: 'double' });
  p.print(4, 18, 'le Minitel', { color: 'white' });
  p.print(5, 18, 'sous le capot', { color: 'cyan' });
  p.hline(6, { color: 'blue', style: 'top' });
  SECTIONS.forEach((section, i) => {
    const row = 7 + i * 2;
    const color = BARS[i] === 'black' ? 'white' : BARS[i];
    p.moveTo(row, 3).color(color).invert(true).text(` ${i + 1} `).invert(false);
    p.print(row, 8, section.title, { color: 'white' });
    p.right(row, 39, section.blurb, { color: 'cyan' });
  });
  p.print(23, 3, 'Votre choix', { color: 'white' });
  p.moveTo(23, 15).color('yellow').text('.');
  p.moveTo(23, 17).color('white').text('puis');
  cap(p, 23, 22, 'ENVOI');
  p.hints(24, [['GUIDE', 'à propos'], ['SOMMAIRE', 'quitter']], { col: 3 });
  return p;
}

/** Show one section; resolves to the key that left it. */
async function show(session, index) {
  const section = SECTIONS[index];
  if (section.run) return section.run(session, index);
  session.write(section.page(index));
  for (;;) {
    const key = await session.waitKey(['SUITE', 'RETOUR', 'SOMMAIRE', 'REPETITION', 'GUIDE', 'ENVOI']);
    if (key === 'REPETITION') session.write(section.page(index));
    else return key;
  }
}

export default {
  code: 'CODE',
  name: 'Code',
  description: 'Le design system dans le Minitel',
  async run(session) {
    for (;;) {
      session.write(menuPage());
      const { key, value } = await session.input({ row: 23, col: 15, length: 1, color: 'yellow', placeholder: '.', accept: /[1-8]/ });
      if (key === 'SOMMAIRE') return;
      let index = key === 'GUIDE' ? 7 : key === 'ENVOI' && value ? Number(value) - 1 : -1;
      while (index >= 0) {
        const next = await show(session, index);
        if (next === 'SUITE' || next === 'ENVOI') index = (index + 1) % SECTIONS.length;
        else if (next === 'RETOUR') index = (index + SECTIONS.length - 1) % SECTIONS.length;
        else if (next === 'GUIDE') index = 7;
        else index = -1;
      }
    }
  },
};
