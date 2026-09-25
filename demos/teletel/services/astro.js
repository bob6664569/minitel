/**
 * 3615 ASTRO — l'horoscope du jour, signe par signe.
 *
 * Pages: accueil étoilé avec les douze signes, horoscope du jour et du
 * lendemain (amour, travail, santé, humeur, chiffre et couleur porte-bonheur)
 * et guide. Horoscopes come from phrase templates chosen with a PRNG seeded
 * by the date and the sign (see astro-data.js): same day, same horoscope.
 *
 * Keys: ENVOI validates, SUITE shows tomorrow, RETOUR comes back, SOMMAIRE
 * returns to the list of signs (and from the list to the kiosk), GUIDE shows
 * the help, REPETITION redraws the page.
 */
import { Page, wrap } from '../../../src/js/service/page.js';
import { textWidth } from '../../../src/js/videotex/charset.js';
import {
  SIGNS, ELEMENTS, horoscope, dateRange, longRange, sunSign, dayNumber, longDate,
} from './astro-data.js';
import { GLYPHS, MOON, starfield } from './astro-art.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------------------------------------------------------------- */
/* Furniture                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Common header: a starry night band (rows 1-4) with a pixel-art glyph on
 * the left, a small line on row 1, the title in double size on rows 2-3 and
 * a line on row 4. `bottom` is a list of [text, colour] pieces.
 */
function header(p, { art, title, top, bottom = [], seed = 1 }) {
  p.band(1, { bg: 'blue', rows: 4 });
  const titleEnd = 10 + textWidth(title) * 2;
  const bottomEnd = 10 + bottom.reduce((n, [text]) => n + textWidth(text), 0);
  const field = starfield(seed, 80, 12, {
    count: 10,
    twinkles: 2,
    avoid: [
      { x: 0, y: 0, w: 16, h: 12 }, // glyph
      { x: 17, y: 0, w: (Math.max(titleEnd, bottomEnd, 10 + textWidth(top || '')) - 9) * 2, h: 12 }, // texts
      { x: 56, y: 0, w: 24, h: 3 }, // service number
    ],
  });
  p.art(1, 1, field, { background: 'blue' });
  p.art(1, 3, art, { ink: 'yellow', background: 'blue' });
  if (top) p.print(1, 10, top, { color: 'cyan', bg: 'blue' });
  p.right(1, 39, '3615 ASTRO', { color: 'yellow', bg: 'blue' });
  p.print(3, 10, title.toUpperCase(), { color: 'white', bg: 'blue', size: 'double' });
  let col = 10;
  bottom.forEach(([text, color]) => {
    p.print(4, col, text, { color, bg: 'blue' });
    col += textWidth(text);
  });
  p.hline(5, { color: 'blue', style: 'top' });
  return p;
}

/** Key cap in inverse video followed by its meaning. */
function hint(p, row, col, key, text, { color = 'cyan' } = {}) {
  p.moveTo(row, col).color('white').invert(true).text(key).invert(false);
  if (text) p.color(color).text(` ${text}`);
  return p;
}

/** Number key cap coloured by the sign's element. */
function signCap(p, row, col, index) {
  const { color } = ELEMENTS[SIGNS[index].element];
  return p.moveTo(row, col).color(color).invert(true).text(`${String(index + 1).padStart(2)} `).invert(false);
}

/** Rating as five stars: lit ones in yellow, the others in blue. */
function stars(p, row, col, n, { on = 'yellow', off = 'blue' } = {}) {
  p.moveTo(row, col).color(on).text('*'.repeat(n));
  if (n < 5) p.color(off).text('*'.repeat(5 - n));
  return p;
}

function status(session, text) {
  session.write(new Page().status(` 3615 ASTRO  ${text}`.slice(0, 38), { color: 'white' }));
}

/** Wait for one of `keys`; other function keys ring the bell. */
async function choose(session, keys) {
  for (;;) {
    const key = await session.waitKey();
    if (keys.includes(key)) return key;
    session.write(new Page().bell());
  }
}

/* ---------------------------------------------------------------------- */
/* Accueil                                                                 */
/* ---------------------------------------------------------------------- */

function homePage(day) {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: 'blue', rows: 5 });
  const field = starfield(day * 7 + 1, 80, 15, {
    count: 10,
    twinkles: 3,
    avoid: [{ x: 1, y: 0, w: 13, h: 13 }, { x: 20, y: 2, w: 60, h: 10 }, { x: 20, y: 12, w: 42, h: 3 }],
  });
  p.art(1, 1, field, { background: 'blue' });
  p.art(1, 3, MOON, { ink: 'yellow', background: 'blue' });
  p.bigText(2, 12, 'ASTRO', { color: 'yellow', background: 'blue' });
  p.print(5, 12, "L'horoscope du jour", { color: 'white', bg: 'blue' });
  p.hline(6, { color: 'blue', style: 'top' });

  const season = sunSign(day);
  p.print(7, 2, cap(longDate(day)), { color: 'cyan' });
  SIGNS.forEach((sign, i) => {
    const row = 9 + (i % 6) * 2;
    const col = i < 6 ? 2 : 22;
    signCap(p, row, col, i);
    p.color('white').text(` ${sign.name}`);
    if (i === season) p.color('yellow').flash(true).text(' *').flash(false);
  });
  // Date ranges, both columns in one go.
  for (let i = 0; i < 6; i++) {
    p.print(10 + i * 2, 6, `${dateRange(SIGNS[i])}       ${dateRange(SIGNS[i + 6])}`, { color: 'magenta' });
  }
  // Elements legend and the sign of the season
  p.moveTo(21, 2);
  Object.values(ELEMENTS).forEach(({ label, color }, i) => {
    if (i) p.text('  ');
    p.color(color).invert(true).text(' ').invert(false).color('white').text(` ${label}`);
  });
  p.moveTo(22, 2).color('yellow').flash(true).text('*').flash(false).color('magenta').text(` Saison ${SIGNS[season].of}`);
  hint(p, 22, 34, 'GUIDE', '');
  p.prompt({ row: 24, label: 'Votre signe', length: 2 });
  return p;
}

async function home(session, day) {
  let draw = true;
  let field;
  for (;;) {
    if (draw) {
      const p = homePage(day);
      field = p.field;
      session.write(p);
      status(session, 'Les signes');
    }
    draw = false;
    const { key, value } = await session.input({ ...field, color: 'cyan', accept: /[0-9]/ });
    const n = Number(value);
    if (key === 'SOMMAIRE') return -1;
    if (key === 'GUIDE') return 'guide';
    if (key === 'REPETITION') draw = true;
    else if (key === 'ENVOI' && n >= 1 && n <= 12) return n - 1;
    else if (key === 'ENVOI') {
      session.write(new Page().moveTo(22, 1).clearEOL().center(22, 'Tapez un numéro de 1 à 12', { color: 'red', flash: true }).bell());
    } else session.write(new Page().bell());
  }
}

/* ---------------------------------------------------------------------- */
/* Horoscope                                                               */
/* ---------------------------------------------------------------------- */

const RUBRICS = [
  ['amour', ' AMOUR ', 'magenta'],
  ['travail', ' TRAVAIL ', 'cyan'],
  ['sante', ' SANTE ', 'green'],
];

function signHeader(p, index) {
  const sign = SIGNS[index];
  return header(p, {
    art: GLYPHS[index],
    title: sign.name,
    top: longRange(sign),
    bottom: [[`Signe ${ELEMENTS[sign.element].article}`, 'yellow'], [` - ${sign.planet.replace(/^(la|le) /, '')}`, 'white']],
    seed: index * 31 + 7,
  });
}

function signContent(p, index, day, offset) {
  const h = horoscope(index, day + offset);
  p.print(6, 2, `${offset ? 'Demain' : "Aujourd'hui"}, ${longDate(day + offset)}`, { color: 'cyan' });
  p.right(6, 39, `${offset + 1}/2`, { color: 'white' });
  RUBRICS.forEach(([key, label, color], i) => {
    const row = 8 + i * 4;
    p.moveTo(row, 2).color(color).invert(true).text(label).invert(false);
    stars(p, row, 35, h[key].stars);
    wrap(h[key].text, 38).slice(0, 2).forEach((line, j) => p.print(row + 1 + j, 2, line, { color: 'white' }));
  });

  // Mood, lucky number and colour on a magenta panel
  p.panel(20, 2, 22, 38, { bg: 'magenta', shadow: 'blue' });
  p.print(20, 3, 'HUMEUR', { color: 'black', bg: 'magenta' });
  stars(p, 20, 10, h.humeur.stars, { on: 'white', off: 'black' });
  p.print(22, 3, h.humeur.text, { color: 'white', bg: 'magenta', size: 'tall' });
  p.print(20, 17, 'CHIFFRE', { color: 'black', bg: 'magenta' });
  p.print(22, 19, `${h.chiffre}`, { color: 'white', bg: 'magenta', size: 'double' });
  p.print(20, 28, 'COULEUR', { color: 'black', bg: 'magenta' });
  const [ink, name] = h.couleur;
  for (const r of [21, 22]) p.moveTo(r, 27).bg('magenta').color(ink).mosaic(63, 63);
  p.print(22, 30, name, { color: 'white', bg: 'magenta' });
  return p;
}

async function signPage(session, index, day) {
  let offset = 0;
  let full = true;
  for (;;) {
    const p = new Page();
    if (full) {
      p.clear().cursor(false);
      signHeader(p, index);
    } else {
      for (let r = 6; r <= 24; r++) p.moveTo(r, 1).clearEOL();
    }
    signContent(p, index, day, offset);
    if (offset === 0) hint(p, 24, 2, 'SUITE', 'demain');
    else hint(p, 24, 2, 'RETOUR', "aujourd'hui");
    hint(p, 24, 24, 'SOMMAIRE', 'signes');
    session.write(p);
    status(session, SIGNS[index].name);
    full = false;
    const key = await choose(session, offset === 0 ? ['SUITE', 'RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE', 'REPETITION'] : ['RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE', 'REPETITION']);
    if (key === 'SUITE') offset = 1;
    else if (key === 'RETOUR' && offset === 1) offset = 0;
    else if (key === 'REPETITION') full = true;
    else if (key === 'GUIDE') {
      if ((await guide(session)) === 'home') return;
      full = true;
    } else return;
  }
}

/* ---------------------------------------------------------------------- */
/* Guide                                                                   */
/* ---------------------------------------------------------------------- */

async function guide(session) {
  for (;;) {
    session.write(guidePage());
    status(session, 'Guide');
    const key = await session.waitKey(['RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE', 'SUITE', 'REPETITION']);
    if (key !== 'REPETITION') return key === 'SOMMAIRE' ? 'home' : 'back';
  }
}

function guidePage() {
  const p = new Page().clear().cursor(false);
  header(p, { art: MOON, title: 'Guide', top: "Mode d'emploi", bottom: [['Bonne lecture !', 'yellow']], seed: 99 });
  p.paragraph(7, 2, 'Chaque jour, les astres vous parlent : amour, travail, santé et humeur, notés de une à cinq étoiles.', { width: 38, color: 'white' });
  [
    ['ENVOI', 'voir votre horoscope'],
    ['SUITE', "l'horoscope de demain"],
    ['RETOUR', "revenir à aujourd'hui"],
    ['SOMMAIRE', 'la liste des signes'],
    ['REPETITION', 'réafficher la page'],
  ].forEach(([key, text], i) => {
    p.moveTo(11 + i, 2).color('white').invert(true).text(` ${key.padEnd(10)} `).invert(false).color('cyan').text(` ${text}`);
  });
  p.print(17, 2, 'LES QUATRE ELEMENTS', { color: 'yellow' });
  Object.entries(ELEMENTS).forEach(([id, { label, color }], i) => {
    const names = SIGNS.filter((s) => s.element === id).map((s) => s.name).join(', ');
    p.moveTo(18 + i, 2).color(color).invert(true).text(` ${label.padEnd(5)} `).invert(false).color('white').text(` ${names}`);
  });
  p.print(23, 2, 'Les astres guident, vous décidez !', { color: 'magenta' });
  hint(p, 24, 2, 'RETOUR', 'page précédente');
  hint(p, 24, 26, 'SOMMAIRE', 'signes');
  return p;
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

export default {
  code: 'ASTRO',
  name: 'Astro',
  description: "L'horoscope du jour pour les 12 signes",
  async run(session) {
    const day = dayNumber();
    for (;;) {
      const choice = await home(session, day);
      if (choice === -1) return;
      if (choice === 'guide') await guide(session);
      else await signPage(session, choice, day);
    }
  },
};
