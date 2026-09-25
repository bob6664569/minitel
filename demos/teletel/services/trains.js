/**
 * 3615 TRAINS — timetables and bookings on a fictional early-1990s French
 * rail network.
 *
 *   Sommaire -> Horaires (form) -> timetable (zebra table + day graph)
 *            -> train detail (route diagram, fares) -> booking -> ticket
 *   Sommaire -> Départs en direct (live split-flap board)
 *   Sommaire -> Mes réservations
 *
 * Network, timetables and fares are generated deterministically in
 * trains-network.js.
 */
import { Page, pad, wrap } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import { STATIONS, findStation, timetable, clock, duration, stationName, hash, random } from './trains-network.js';

const BAND = 'blue';
const ACCENT = 'yellow';
const PER_PAGE = 5;

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const TYPE_CODES = { TGV: 'TGV', RAPIDE: 'RAP', EXPRESS: 'EXP', TER: 'TER', NUIT: 'EXP' };

/** Thrown to go back to the service's sommaire. */
const HOME = Symbol('sommaire');

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad2 = (n) => String(n).padStart(2, '0');

/* ---------------------------------------------------------------------- */
/* Graphics                                                                */
/* ---------------------------------------------------------------------- */

/* TGV power car, nose to the left (20 x 3 cells). */
const TGV = [
  '...........wwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  '........wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  '......wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  '....ww.......ww.........................',
  '..wwww.......ww.........................',
  '.wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  '..ww..ww............ww..ww..........ww..',
];

/* Small TGV for page headers (11 x 2 cells). */
const MINI_TGV = [
  '.......wwwwwwwwwwwwwwwww',
  '....wwwwwwwwwwwwwwwwwwww',
  '..ww.....ww.............',
  '.wwwwwwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwwwwwww',
  '..ww..ww.......ww..ww...',
];

/* Rail seen from the side: rail on top, sleepers below. */
function rail(p, row, { color = 'white', col = 1, width = 40 } = {}) {
  const cells = [];
  for (let i = 0; i < width; i++) cells.push(i % 2 ? 0b000011 : 0b001111);
  return p.moveTo(row, col).color(color).mosaic(cells);
}

/** Common page header: band, double-size title, small TGV on the rail. */
function header(p, title, { right, size = 'double' } = {}) {
  p.band(1, { bg: BAND, rows: 3 });
  p.print(1, 2, '3615 TRAINS', { color: ACCENT, bg: BAND });
  if (right) p.right(1, 26, right, { color: 'cyan', bg: BAND });
  p.print(3, 2, title, { color: 'white', bg: BAND, size });
  p.art(2, 29, MINI_TGV, { background: BAND });
  rail(p, 4);
  return p;
}

/** A full 40-column row made of [text, colour] segments, on an optional zone colour. */
function line(p, row, segments, { bg, col = 1, width = 40 } = {}) {
  p.moveTo(row, col);
  if (bg !== undefined) p.bg(bg);
  let end = col - 1;
  for (const [text, color, style] of segments) {
    p.color(color);
    if (style?.invert) p.invert(true);
    p.text(text);
    if (style?.invert) p.invert(false);
    end += [...text].length;
  }
  if (bg !== undefined && end < width) p.fill(' ', width - end);
  return p;
}

/* ---------------------------------------------------------------------- */
/* Dates                                                                   */
/* ---------------------------------------------------------------------- */

/** Travel date from JJ/MM: this year, or next year if already past. */
function travelDate(day, month) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(today.getFullYear(), month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (d < today) d.setFullYear(d.getFullYear() + 1);
  return d;
}

const longDate = (d) => `${cap(DAYS[d.getDay()])} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const shortDate = (d) => `${cap(DAYS[d.getDay()]).slice(0, 3)}. ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

/* ---------------------------------------------------------------------- */
/* Help                                                                    */
/* ---------------------------------------------------------------------- */

async function help(session) {
  const p = new Page().clear().cursor(false);
  header(p, 'GUIDE');
  const keys = [
    ['ENVOI', 'valider, rechercher'],
    ['SUITE', 'champ ou page suivant'],
    ['RETOUR', 'champ ou page précédent'],
    ['CORRECTION', 'effacer une lettre'],
    ['ANNULATION', 'effacer le champ'],
    ['REPETITION', 'réafficher la page'],
    ['SOMMAIRE', 'revenir au sommaire'],
  ];
  keys.forEach(([key, text], i) => {
    p.key(6 + i * 2, 2, pad(key, 10, 'center'));
    p.print(6 + i * 2, 16, text, { color: 'white' });
  });
  p.panel(20, 2, 22, 38, { bg: 'cyan', shadow: BAND });
  p.print(21, 4, 'Gares : tapez le début du nom', { color: 'black', bg: 'cyan' });
  p.print(22, 4, 'MARS pour Marseille, ST ET...', { color: BAND, bg: 'cyan' });
  p.hints(24, [['RETOUR', 'revenir à la page']]);
  session.write(p);
  await session.waitKey();
}

/* ---------------------------------------------------------------------- */
/* Sommaire                                                                */
/* ---------------------------------------------------------------------- */

const NEWS = [
  ['A SAVOIR', 'Compostez votre billet avant', "l'accès au train."],
  ['TGV', 'Réservation obligatoire, même', 'pour les abonnés.'],
  ['ASTUCE', 'Voyagez en période bleue :', "c'est moins cher !"],
];

function homePage(state) {
  const p = new Page().clear().cursor(false);
  const now = new Date();
  p.band(1, { bg: BAND, rows: 5 });
  p.print(1, 2, '3615', { color: 'white', bg: BAND });
  p.right(1, 39, `${cap(DAYS[now.getDay()])} ${now.getDate()} ${MONTHS[now.getMonth()]}`, { color: 'cyan', bg: BAND });
  p.bigText(2, 2, 'TRAINS', { color: ACCENT, background: BAND });
  p.art(3, 21, TGV, { background: BAND });
  p.print(5, 2, 'Horaires - Billets', { color: 'cyan', bg: BAND });
  rail(p, 6);

  const count = state.bookings.length;
  const items = [
    ['Horaires et réservation', 'Trouvez votre train'],
    ['Départs en direct', 'Le tableau des grandes gares'],
    ['Mes réservations', count ? `${count} dossier${count > 1 ? 's' : ''} en cours` : 'Aucun dossier'],
  ];
  items.forEach(([label, hint], i) => {
    const row = 8 + i * 3;
    p.moveTo(row, 3).color('cyan').invert(true).text(` ${i + 1} `).invert(false).color('white').text(` ${label}`);
    p.print(row + 1, 8, hint, { color: 'cyan' });
  });

  const [title, a, b] = NEWS[state.visits++ % NEWS.length];
  p.panel(17, 3, 19, 37, { bg: 'magenta', shadow: BAND });
  p.label(17, 3, title, { color: ACCENT, bg: 'red', close: false });
  p.print(18, 5, a, { color: 'white', bg: 'magenta' });
  p.print(19, 5, b, { color: 'white', bg: 'magenta' });

  p.hints(22, [['GUIDE', "mode d'emploi"], ['SOMMAIRE', 'quitter']]);
  p.prompt({ label: 'Votre choix', length: 1 });
  return p;
}

/* ---------------------------------------------------------------------- */
/* Search form                                                             */
/* ---------------------------------------------------------------------- */

const FORM = [
  { name: 'from', row: 7, col: 14, length: 20, uppercase: true },
  { name: 'to', row: 11, col: 14, length: 20, uppercase: true },
  { name: 'day', row: 15, col: 14, length: 2, accept: /[0-9]/ },
  { name: 'month', row: 15, col: 17, length: 2, accept: /[0-9]/ },
  { name: 'hour', row: 15, col: 30, length: 2, accept: /[0-9]/ },
];

function searchPage(message) {
  const p = new Page().clear().cursor(false);
  header(p, 'HORAIRES');
  p.moveTo(7, 2).color('green').mosaic(0b111100).color('white').text(' Départ');
  p.box(6, 12, 8, 35, { color: 'cyan' });
  p.moveTo(11, 2).color('red').mosaic(0b111100).color('white').text(' Arrivée');
  p.box(10, 12, 12, 35, { color: 'cyan' });
  p.print(15, 3, 'Date', { color: 'white' });
  p.box(14, 12, 16, 20, { color: 'cyan' });
  p.print(15, 16, '/', { color: 'cyan' });
  p.print(15, 22, 'Heure', { color: 'white' });
  p.box(14, 28, 16, 33, { color: 'cyan' });
  p.print(15, 32, 'h', { color: 'cyan' });
  if (message) {
    message.lines.forEach((text, i) => p.print(18 + i, 3, text, { color: i ? 'white' : message.color || ACCENT }));
  } else {
    p.print(18, 3, 'Tapez le nom des gares puis ENVOI.', { color: 'cyan' });
    p.print(19, 3, 'Date et heure : tapez par-dessus.', { color: 'cyan' });
  }
  p.hints(22, [['SUITE', 'champ suivant'], ['RETOUR', 'précédent']]);
  p.print(24, 2, 'Rechercher les trains', { color: 'white' });
  p.key(24, 32, 'ENVOI');
  return p;
}

function suggestionLines(title, text, found) {
  if (!found.suggestions.length) return { color: 'red', lines: [`${title} inconnue :`, text.slice(0, 34)] };
  const names = found.suggestions.map((s) => s.name.toUpperCase());
  return { lines: [`${title} : voulez-vous dire`, ...wrap(names.join(', '), 35).slice(0, 2)] };
}

async function search(session, state) {
  const now = new Date();
  const values = { from: '', to: '', day: pad2(now.getDate()), month: pad2(now.getMonth() + 1), hour: pad2(now.getHours()) };
  let message = null;
  let index = 0;
  for (;;) {
    session.write(searchPage(message));
    const fields = FORM.map((f) => ({ ...f, color: 'white', value: values[f.name] }));
    const result = await session.form(fields, { index });
    Object.assign(values, result.values);
    index = result.index;
    message = null;
    if (result.key === 'SOMMAIRE') throw HOME;
    if (result.key === 'GUIDE') {
      await help(session);
      continue;
    }
    if (result.key !== 'ENVOI') continue;

    const from = findStation(values.from);
    const to = findStation(values.to);
    const date = travelDate(Number(values.day), Number(values.month));
    const hour = Number(values.hour || 0);
    if (!from.station) {
      message = suggestionLines('Gare de départ', values.from, from);
      index = 0;
    } else if (!to.station) {
      message = suggestionLines("Gare d'arrivée", values.to, to);
      index = 1;
    } else if (from.station === to.station) {
      message = { color: 'red', lines: ['Départ et arrivée identiques'] };
      index = 1;
    } else if (!date) {
      message = { color: 'red', lines: ['Date invalide (JJ/MM)'] };
      index = 2;
    } else if (!(hour >= 0 && hour <= 23)) {
      message = { color: 'red', lines: ['Heure invalide (0 à 23)'] };
      index = 4;
    } else {
      values.from = from.station.name.toUpperCase();
      values.to = to.station.name.toUpperCase();
      await results(session, state, { from: from.station, to: to.station, date, hour });
      continue;
    }
    session.write(new Videotex().bell());
  }
}

/* ---------------------------------------------------------------------- */
/* Timetable                                                               */
/* ---------------------------------------------------------------------- */

const AXIS_START = 0;
const AXIS_MINUTES = 24 * 60;

/** Mosaic cells (cols 2..39) of a day bar for a train. */
function dayBar(train) {
  const px = (m) => Math.max(0, Math.min(75, Math.floor(((m - AXIS_START) / AXIS_MINUTES) * 76)));
  const spans = [];
  if (train.arr <= 1440) spans.push([px(train.dep), px(train.arr)]);
  else spans.push([px(train.dep), 75], [0, px(train.arr - 1440)]);
  const cells = new Array(38).fill(0);
  for (const [a, b] of spans) {
    for (let x = a; x <= b; x++) {
      const cell = x >> 1;
      const side = x & 1;
      cells[cell] |= (x === a || x === b) ? (0b010101 << side) : (0b000100 << side);
    }
  }
  return cells;
}

function resultsPage({ from, to, date }, trains, start, { partial = false } = {}) {
  const p = new Page();
  const title = `${from.name} > ${to.name}`.toUpperCase();
  if (!partial) {
    p.clear().cursor(false);
    header(p, title, { size: title.length <= 13 ? 'double' : 'tall' });
    p.print(5, 2, longDate(date), { color: 'cyan' });
    line(p, 6, [[' N  DEP.  ARR.   DUREE TRAIN    PRIX 2e ', 'cyan', { invert: true }]]);
  }
  const pages = Math.max(1, Math.ceil(trains.length / PER_PAGE));
  const pageNo = Math.min(pages, Math.floor(start / PER_PAGE) + 1);
  p.right(5, 39, pad(`${start + 1}-${Math.min(trains.length, start + PER_PAGE)} sur ${trains.length}`, 12, 'right'), { color: 'white' });
  for (let i = 0; i < PER_PAGE; i++) {
    const row = 7 + i * 2;
    const t = trains[start + i];
    const bg = i % 2 ? BAND : undefined;
    if (!t) {
      p.moveTo(row, 1).clearEOL().moveTo(row + 1, 1).clearEOL();
      continue;
    }
    const arrow = t.arr > 1440 ? '+' : ' ';
    line(p, row, [
      [` ${i + 1} `, ACCENT, { invert: true }],
      [` ${clock(t.dep)}`, 'white'],
      ['→', 'cyan'],
      [`${clock(t.arr)}${arrow}`, 'white'],
      [pad(duration(t.minutes), 6, 'right'), 'cyan'],
      // Magenta is too close to the blue band on a monochrome screen.
      [` ${TYPE_CODES[t.type]} ${t.number}`, bg && t.color === 'magenta' ? 'white' : t.color],
      [pad(`${t.price2} F`, 8, 'right'), 'white'],
    ], { bg: bg ?? 'black' });
    p.moveTo(row + 1, 1).bg(bg ?? 'black').text(' ').color(t.color).mosaic([...dayBar(t), 0]);
  }
  if (!partial) {
    // Day axis: ticks every 3 hours, labels every 6.
    const ticks = new Array(38).fill(0b000011);
    for (let h = 0; h <= 24; h += 3) {
      const x = Math.min(75, Math.floor((h / 24) * 76));
      ticks[x >> 1] |= h % 6 ? 0b000000 : (0b010000 << (x & 1)) | (0b000100 << (x & 1));
    }
    p.moveTo(17, 2).color('cyan').mosaic(ticks);
    p.moveTo(18, 2).color('cyan').text('0h        6h       12h       18h    24h');
    p.moveTo(20, 2);
    [['TGV', 'yellow'], ['Rapide', 'cyan'], ['Express', 'green'], ['TER', 'white'], ['Nuit', 'magenta']].forEach(([label, color], i) => {
      p.color(color).mosaic(0b111111).color('white').text(` ${label}${i < 4 ? ' ' : ''}`);
    });
  }
  const hints = [];
  if (pageNo < pages) hints.push(['SUITE', 'suivants']);
  hints.push(['RETOUR', pageNo > 1 ? 'précédents' : 'recherche']);
  p.moveTo(22, 1).clearEOL();
  p.hints(22, hints);
  if (!partial) p.prompt({ label: 'N° du train choisi', length: 1 });
  return p;
}

async function results(session, state, query) {
  const dow = query.date.getDay();
  const trains = timetable(query.from, query.to, { dow });
  if (!trains.length) {
    session.write(new Page().clear().cursor(false).center(12, 'Aucun train direct', { color: 'red' }));
    await session.sleep(1500);
    return;
  }
  let start = trains.findIndex((t) => t.dep >= query.hour * 60);
  if (start < 0) start = Math.max(0, trains.length - PER_PAGE);
  // 'full' page, 'partial' (the table only, when paginating) or nothing.
  let draw = 'full';
  for (;;) {
    if (draw) session.write(resultsPage(query, trains, start, { partial: draw === 'partial' }));
    draw = null;
    const { key, value } = await session.input({ row: 24, col: 21, length: 1, color: 'cyan', accept: /[1-5]/ });
    const n = Number(value);
    const train = n ? trains[start + n - 1] : null;
    if (key === 'SOMMAIRE') throw HOME;
    if (key === 'GUIDE') {
      await help(session);
      draw = 'full';
    } else if (key === 'REPETITION') {
      draw = 'full';
    } else if (key === 'SUITE' && start + PER_PAGE < trains.length) {
      start += PER_PAGE;
      draw = 'partial';
    } else if (key === 'RETOUR') {
      if (start === 0) return;
      start = Math.max(0, start - PER_PAGE);
      draw = 'partial';
    } else if (key === 'ENVOI' && train) {
      await detail(session, state, query, train);
      draw = 'full';
    } else {
      session.write(new Videotex().bell());
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Train detail                                                            */
/* ---------------------------------------------------------------------- */

const PERIOD_COLORS = { bleue: 'cyan', blanche: 'white', rouge: 'red' };

/** A station name that fits `width` cells: full name, else the town. */
function fit(stop, width) {
  return stop.name.length <= width ? stop.name : stop.station.name.slice(0, width);
}

function detailPage(query, train) {
  const p = new Page().clear().cursor(false);
  header(p, `${train.label.toUpperCase()} ${train.number}`, { right: shortDate(query.date) });
  p.moveTo(5, 2).color('cyan').text('Durée ').color('white').text(duration(train.minutes))
    .color('cyan').text('  Distance ').color('white').text(`${train.km} km`);

  // Route diagram: a thick line in the train colour, stations as white ticks.
  const stops = train.stops;
  const compact = stops.length > 7;
  const step = compact ? 1 : 2;
  const top = 7;
  stops.forEach((stop, i) => {
    const row = top + i * step;
    const end = i === 0 || i === stops.length - 1;
    const color = end ? ACCENT : 'white';
    p.print(row, 2, clock(stop.time), { color });
    p.moveTo(row, 8).color('white').mosaic(end ? 0b101010 : 0b001000)
      .color(train.color).mosaic(i === 0 ? 0b111100 : i === stops.length - 1 ? 0b001111 : 0b111111)
      .color('white').mosaic(end ? 0b010101 : 0b000100);
    p.print(row, 12, fit(stop, 19), { color });
    if (i < stops.length - 1 && !compact) p.moveTo(row + 1, 9).color(train.color).mosaic(0b111111);
  });

  // Fares: a blue pavé with a cyan shadow.
  p.panel(7, 32, 14, 39, { bg: BAND, shadow: 'cyan' });
  p.print(8, 33, '1re cl.', { color: 'cyan', bg: BAND });
  p.right(10, 38, `${train.price1} F`, { color: 'white', bg: BAND, size: 'tall' });
  p.print(11, 33, '2e cl.', { color: 'cyan', bg: BAND });
  p.right(13, 38, `${train.price2} F`, { color: ACCENT, bg: BAND, size: 'tall' });
  p.print(16, 33, 'Période', { color: 'white' });
  p.print(18, 33, train.period, { color: PERIOD_COLORS[train.period], size: 'tall' });

  // On-board services as badges.
  let col = 2;
  const badge = (text, bg, color) => {
    p.label(20, col, text, { bg, color });
    col += text.length + 3;
  };
  if (train.bar) badge('VOITURE-BAR', 'green', 'black');
  if (train.couchettes) badge('COUCHETTES', 'magenta', 'white');
  if (train.reservation) badge(train.couchettes ? 'RESA' : 'RESA OBLIGATOIRE', 'red', 'white');
  if (!train.bar && !train.reservation) badge('SANS RESERVATION', 'cyan', 'black');

  p.hints(22, [['RETOUR', 'liste'], ['SOMMAIRE', 'accueil']]);
  p.print(24, 2, 'Réserver en classe ', { color: 'white' });
  p.color('cyan').text('.').color('white').text(' (1 ou 2)');
  p.key(24, 33, 'ENVOI');
  p.field = { row: 24, col: 21 };
  return p;
}

async function detail(session, state, query, train) {
  let draw = true;
  for (;;) {
    const page = detailPage(query, train);
    if (draw) session.write(page);
    draw = true;
    const { key, value } = await session.input({ ...page.field, length: 1, color: 'cyan', accept: /[12]/ });
    if (key === 'SOMMAIRE') throw HOME;
    if (key === 'RETOUR') return;
    if (key === 'GUIDE') await help(session);
    else if (key === 'ENVOI' && value) await book(session, state, query, train, value);
    else if (key !== 'REPETITION') {
      session.write(new Videotex().bell());
      draw = false;
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Booking                                                                 */
/* ---------------------------------------------------------------------- */

function bookingPage(query, train, message) {
  const p = new Page().clear().cursor(false);
  header(p, 'RESERVATION');
  const first = train.stops[0];
  const last = train.stops[train.stops.length - 1];
  p.panel(6, 2, 8, 38, { bg: BAND });
  p.print(6, 3, `${train.label} ${train.number}`, { color: ACCENT, bg: BAND });
  p.right(6, 37, longDate(query.date), { color: 'cyan', bg: BAND });
  p.print(7, 3, `${clock(first.time)}  ${first.name}`, { color: 'white', bg: BAND });
  p.print(8, 3, `${clock(last.time)}  ${last.name}`, { color: 'white', bg: BAND });
  const rows = [
    [11, 'Classe', '1re ou 2e classe'],
    [13, 'Voyageurs', 'de 1 à 6'],
    [15, 'Place', 'F fenêtre C couloir'],
    [17, 'Voiture', 'N non-fumeurs F fumeurs'],
  ];
  for (const [row, label, hint] of rows) {
    p.print(row, 3, label, { color: 'white' });
    p.moveTo(row, 13).color('cyan').text(':');
    p.print(row, 18, hint, { color: 'cyan' });
  }
  if (message) p.print(19, 3, message, { color: 'red', flash: true });
  p.hints(22, [['SUITE', 'champ suivant'], ['SOMMAIRE', 'abandon']]);
  p.print(24, 2, 'Confirmer la réservation', { color: 'white' });
  p.key(24, 33, 'ENVOI');
  return p;
}

const BOOKING_FORM = [
  { name: 'klass', row: 11, col: 15, length: 1, accept: /[12]/ },
  { name: 'count', row: 13, col: 15, length: 1, accept: /[1-6]/ },
  { name: 'seat', row: 15, col: 15, length: 1, accept: /[FCfc]/, uppercase: true },
  { name: 'smoke', row: 17, col: 15, length: 1, accept: /[FNfn]/, uppercase: true },
];

async function book(session, state, query, train, klass) {
  const values = { klass, count: '1', seat: 'F', smoke: 'N' };
  let message = null;
  let index = 1;
  for (;;) {
    session.write(bookingPage(query, train, message));
    const fields = BOOKING_FORM.map((f) => ({ ...f, color: ACCENT, value: values[f.name] }));
    const result = await session.form(fields, { index });
    Object.assign(values, result.values);
    index = result.index;
    message = null;
    if (result.key === 'SOMMAIRE') throw HOME;
    if (result.key === 'GUIDE') {
      await help(session);
      continue;
    }
    if (result.key !== 'ENVOI') continue;
    const missing = BOOKING_FORM.findIndex((f) => !values[f.name]);
    if (missing >= 0) {
      message = 'Merci de remplir tous les champs';
      index = missing;
      session.write(new Videotex().bell());
      continue;
    }
    const booking = makeBooking(query, train, values);
    state.bookings.push(booking);
    await ticket(session, booking, { fresh: true });
    return;
  }
}

function makeBooking(query, train, { klass, count, seat, smoke }) {
  const rand = random(hash(`${train.number}${Date.now()}`));
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = '';
  for (let i = 0; i < 6; i++) ref += letters[Math.floor(rand() * letters.length)];
  const n = Number(count);
  const first = train.stops[0];
  const last = train.stops[train.stops.length - 1];
  const coach = train.night ? 90 + Math.floor(rand() * 9) : klass === '1' ? 1 + Math.floor(rand() * 4) : 5 + Math.floor(rand() * 13);
  const base = 11 + Math.floor(rand() * 70);
  const places = Array.from({ length: n }, (_, i) => base + i);
  return {
    ref,
    train: `${train.label} ${train.number}`,
    date: query.date,
    from: first.name,
    to: last.name,
    dep: clock(first.time),
    arr: clock(last.time),
    klass,
    count: n,
    coach,
    places,
    seat: seat === 'F' ? 'Fenêtre' : 'Couloir',
    smoke: smoke === 'F' ? 'Fumeurs' : 'Non-fumeurs',
    night: train.night,
    total: (klass === '1' ? train.price1 : train.price2) * n,
  };
}

function ticketPage(b, { fresh }) {
  const p = new Page().clear().cursor(false);
  header(p, fresh ? 'CONFIRMATION' : 'MON BILLET');
  // The ticket: a white card with a blue shadow.
  p.panel(6, 2, 16, 37, { bg: 'white', shadow: BAND });
  p.print(7, 3, `BILLET ${b.train}`, { color: BAND, bg: 'white' });
  p.right(7, 36, `${b.klass === '1' ? '1re' : '2e'} CLASSE`, { color: 'red', bg: 'white' });
  p.moveTo(8, 3).bg('white').color('black').mosaic(new Array(34).fill(0b001100));
  p.print(9, 3, `Dép. ${b.dep}  ${b.from}`, { color: 'black', bg: 'white' });
  p.print(10, 3, `Arr. ${b.arr}  ${b.to}`, { color: 'black', bg: 'white' });
  p.print(11, 3, longDate(b.date), { color: BAND, bg: 'white' });
  const places = b.places.length > 1 ? `Places ${b.places[0]} à ${b.places[b.places.length - 1]}` : `Place ${b.places[0]}`;
  p.print(13, 3, `Voiture ${b.coach}  ${places}`, { color: 'black', bg: 'white' });
  p.print(14, 3, b.night ? 'Couchette  ' + b.smoke : `${b.seat}  ${b.smoke}`, { color: 'black', bg: 'white' });
  p.print(15, 3, `${b.count} voyageur${b.count > 1 ? 's' : ''}`, { color: 'black', bg: 'white' });
  p.right(15, 36, `${b.total},00 F`, { color: 'red', bg: 'white', size: 'tall' });

  p.print(19, 2, 'Dossier', { color: 'white' });
  p.print(19, 11, b.ref, { color: ACCENT, size: 'double' });
  if (fresh) {
    p.panel(18, 26, 19, 37, { bg: 'green' });
    p.print(19, 28, 'CONFIRME', { color: 'black', bg: 'green', size: 'tall', flash: true });
  }
  p.print(21, 2, 'Retirez votre billet en gare', { color: 'cyan' });
  p.print(22, 2, 'avant le départ du train.', { color: 'cyan' });
  p.hints(24, [['SOMMAIRE', 'accueil'], ['RETOUR', 'retour']]);
  return p;
}

async function ticket(session, booking, { fresh = false } = {}) {
  for (;;) {
    session.write(ticketPage(booking, { fresh }));
    const key = await session.waitKey(['SOMMAIRE', 'RETOUR', 'ENVOI', 'GUIDE', 'REPETITION']);
    if (key === 'SOMMAIRE' || (fresh && key === 'ENVOI')) throw HOME;
    if (key === 'RETOUR' || key === 'ENVOI') return;
    if (key === 'GUIDE') await help(session);
  }
}

/* ---------------------------------------------------------------------- */
/* My bookings                                                             */
/* ---------------------------------------------------------------------- */

async function bookings(session, state) {
  let draw = true;
  for (;;) {
    const p = new Page().clear().cursor(false);
    header(p, 'MES BILLETS');
    const list = state.bookings.slice(-5);
    if (!list.length) {
      p.center(10, 'Aucune réservation', { color: ACCENT, size: 'tall' });
      p.center(13, 'Choisissez un train dans les', { color: 'white' });
      p.center(14, 'horaires, puis réservez-le.', { color: 'white' });
      p.hints(24, [['SOMMAIRE', 'accueil']]);
      session.write(p);
      if (await session.waitKey(['SOMMAIRE', 'RETOUR', 'ENVOI', 'REPETITION']) === 'REPETITION') continue;
      return;
    }
    // Each booking as a small ticket stub.
    list.forEach((b, i) => {
      const row = 6 + i * 3;
      p.panel(row, 3, row + 1, 37, { bg: 'white', shadow: BAND });
      p.moveTo(row, 3).color(BAND).invert(true).text(` ${i + 1} `).invert(false)
        .bg('white').text(' ').color('red').text(b.ref).color('black').text(`  ${pad(b.train, 12)}${shortDate(b.date)}`);
      p.print(row + 1, 8, `${b.dep} ${b.from.split(' ')[0]} → ${b.to.split(' ')[0]}`.slice(0, 29), { color: BAND, bg: 'white' });
    });
    p.hints(22, [['SOMMAIRE', 'accueil']]);
    p.prompt({ label: 'N° du billet', length: 1 });
    if (draw) session.write(p);
    draw = true;
    const { key, value } = await session.input({ row: 24, col: 15, length: 1, color: 'cyan', accept: /[1-5]/ });
    const b = list[Number(value) - 1];
    if (key === 'SOMMAIRE' || key === 'RETOUR') return;
    if (key === 'GUIDE') await help(session);
    else if (key === 'ENVOI' && b) await ticket(session, b);
    else if (key !== 'REPETITION') {
      session.write(new Videotex().bell());
      draw = false;
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Live departures board                                                   */
/* ---------------------------------------------------------------------- */

const BOARD_STATIONS = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille', 'Strasbourg', 'Nantes', 'Toulouse'];
const BOARD_ROWS = 7;
const BOARD_TOP = 7;
const FLAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SHORT_NAMES = { 'CLERMONT-FERRAND': 'CLERMONT-FD', 'MANTES-LA-JOLIE': 'MANTES' };

/** Upcoming departures of a station, one every 1 to 4 minutes after `from`. */
function boardDepartures(station, from, count, seed) {
  const rand = random(hash(`${station.key}${seed}`));
  const targets = STATIONS.filter((s) => s !== station && s.rank <= 2);
  const list = [];
  let time = from;
  while (list.length < count) {
    time += 1 + Math.floor(rand() * 4);
    const to = targets[Math.floor(rand() * targets.length)];
    const trains = timetable(station, to, { dow: new Date().getDay() });
    if (!trains.length) continue;
    const t = trains[Math.floor(rand() * trains.length)];
    const names = [];
    for (const s of t.stops.slice(1, -1)) {
      if (`via ${[...names, s.station.name].join(', ')}`.length > 25) break;
      names.push(s.station.name);
    }
    const name = to.name.toUpperCase();
    list.push({
      time,
      to: name.length > 13 ? SHORT_NAMES[name] || name.slice(0, 13) : name,
      train: `${TYPE_CODES[t.type]} ${t.number}`,
      voie: station === STATIONS[0] && t.type === 'TGV' ? 'ABCDEFGHIJKLMN'[Math.floor(rand() * 14)] : String(1 + Math.floor(rand() * 18)),
      delay: rand() < 0.15 ? 5 * (1 + Math.floor(rand() * 4)) : 0,
      via: names.length ? `via ${names.join(', ')}` : 'direct',
    });
  }
  return list;
}

/** One departure: a blue "flap" row, then the stops in cyan. `flap` scrambles it. */
function boardRow(p, row, d, { flap = 0, now = 0 } = {}) {
  if (!d) return p.moveTo(row, 1).clearEOL().moveTo(row + 1, 1).clearEOL();
  const roll = (text) => (flap ? [...text].map((ch, i) => (ch === ' ' ? ch : FLAPS[(ch.charCodeAt(0) * 7 + i * 5 + flap * 11) % FLAPS.length])).join('') : text);
  const hhmm = `${pad2(Math.floor(d.time / 60) % 24)}h${pad2(d.time % 60)}`;
  const voie = d.time - now <= 12 ? d.voie : '';
  line(p, row, [
    [` ${roll(hhmm)} `, ACCENT],
    [roll(pad(d.to, 14)), 'white'],
    [roll(pad(d.train, 9)), 'cyan'],
  ], { bg: BAND, width: 33 });
  p.moveTo(row, 34).color('white').invert(true).text(` ${pad(roll(voie), 2, 'center')} `).invert(false).bg('black').text(' ');
  if (flap) return p;
  p.moveTo(row + 1, 8).color('cyan').text(pad(d.via, 25));
  if (d.delay) p.color('red').flash(true).text(`+${d.delay} mn`);
  else p.clearEOL();
  return p;
}

function boardPage(name, list, now) {
  const p = new Page().clear().cursor(false);
  header(p, 'DEPARTS');
  p.print(5, 2, name.toUpperCase(), { color: ACCENT });
  line(p, 6, [[' HEURE DESTINATION    TRAIN      VOIE  ', 'cyan', { invert: true }]]);
  for (let i = 0; i < BOARD_ROWS; i++) boardRow(p, BOARD_TOP + i * 2, list[i], { now });
  p.hints(22, [['SUITE', 'gare suivante'], ['SOMMAIRE', 'accueil']]);
  p.print(24, 2, 'Voie affichée 12 mn avant le départ', { color: 'cyan' });
  return p;
}

async function board(session) {
  let stationIndex = 0;
  for (;;) {
    const station = findStation(BOARD_STATIONS[stationIndex]).station;
    const name = station === STATIONS[0] ? 'Paris - toutes gares' : stationName(station);
    const minuteOf = (t) => t.getHours() * 60 + t.getMinutes();
    let now = minuteOf(new Date());
    let list = boardDepartures(station, now - 1, 30, now);
    session.write(boardPage(name, list, now));
    let clock = '';
    for (;;) {
      const t = new Date();
      const hhmmss = `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;
      if (hhmmss !== clock) {
        session.write(new Videotex().moveTo(5, 31).color('white').text(hhmmss));
        clock = hhmmss;
      }
      if (minuteOf(t) !== now) {
        now = minuteOf(t);
        const before = list.slice(0, BOARD_ROWS);
        list = list.filter((d) => d.time + d.delay >= now);
        if (list.length < BOARD_ROWS + 2) list.push(...boardDepartures(station, list[list.length - 1].time, 20, now));
        // Rows that changed roll their flaps, top to bottom, then settle.
        const changed = [];
        for (let i = 0; i < BOARD_ROWS; i++) {
          const d = list[i];
          const old = before[i];
          if (d !== old || (d.time - now === 12)) changed.push(i);
        }
        if (changed.length) {
          const rolling = new Page();
          changed.forEach((i) => boardRow(rolling, BOARD_TOP + i * 2, list[i], { flap: 1, now }));
          session.write(rolling);
          await session.sleep(400);
          const settled = new Page();
          changed.forEach((i) => boardRow(settled, BOARD_TOP + i * 2, list[i], { now }));
          session.write(settled);
        }
      }
      const event = await session.next({ timeout: 1000 - new Date().getMilliseconds() });
      if (!event || event.type !== 'key') continue;
      if (event.key === 'SOMMAIRE' || event.key === 'RETOUR') return;
      if (event.key === 'SUITE') {
        stationIndex = (stationIndex + 1) % BOARD_STATIONS.length;
        break;
      }
      if (event.key === 'REPETITION') break;
      if (event.key === 'GUIDE') {
        await help(session);
        break;
      }
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

export default {
  code: 'TRAINS',
  name: 'Trains',
  description: 'Horaires et réservations',
  async run(session) {
    const state = session.data.trains || (session.data.trains = { bookings: [], visits: 0 });
    let draw = true;
    for (;;) {
      if (draw) session.write(homePage(state));
      draw = true;
      const { key, value } = await session.input({ row: 24, col: 14, length: 1, color: 'cyan', accept: /[1-3]/ });
      if (key === 'SOMMAIRE') return;
      try {
        if (key === 'GUIDE') await help(session);
        else if (key === 'ENVOI' && value === '1') await search(session, state);
        else if (key === 'ENVOI' && value === '2') await board(session);
        else if (key === 'ENVOI' && value === '3') await bookings(session, state);
        else if (key !== 'REPETITION') {
          session.write(new Videotex().bell());
          draw = false;
        }
      } catch (error) {
        if (error !== HOME) throw error;
      }
    }
  },
};
