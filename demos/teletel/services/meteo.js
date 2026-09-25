/**
 * 3615 METEO — la météo de toute la France, comme en 1990.
 *
 * Pages: sommaire, carte de France du jour et du lendemain (mosaïque avec
 * pictogrammes), prévisions à trois jours par ville, bulletin national,
 * guide. Forecasts are generated deterministically from the date (see
 * meteo-data.js), so the service needs no network.
 *
 * Keys: ENVOI validates, SUITE / RETOUR change day or page, SOMMAIRE goes
 * back to the menu (and from the menu to the kiosk), GUIDE shows the help,
 * REPETITION redraws the page.
 */
import { Page, wrap } from '../../../src/js/service/page.js';
import { textWidth } from '../../../src/js/videotex/charset.js';
import {
  franceMap, WEATHER, LOGO, icon, bigIcon, windArrow, canvas, blit, toGrid, gridText, encodeGrid, SEA,
} from './meteo-art.js';
import {
  CITIES, forecast, nationalForecast, bulletin, sunTimes, dayNumber, longDate, weekday,
} from './meteo-data.js';

const ORDER = Object.keys(WEATHER);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const deg = (t) => `${t}°`;

/* ---------------------------------------------------------------------- */
/* Page furniture                                                          */
/* ---------------------------------------------------------------------- */

/**
 * Common header: blue band with the sun-and-cloud logo, a subtitle and the
 * service number on row 1, the page title in double size on rows 2-3.
 */
function header(p, title, sub) {
  p.band(1, { bg: 'blue', rows: 3 });
  p.art(1, 2, LOGO, { background: 'blue' });
  if (sub) p.print(1, 9, sub, { color: 'cyan', bg: 'blue' });
  p.right(1, 39, '3615 METEO', { color: 'yellow', bg: 'blue' });
  p.print(3, 9, title.toUpperCase(), { color: 'white', bg: 'blue', size: 'double' });
  p.hline(4, { color: 'blue', style: 'top' });
  return p;
}

/** Key cap in inverse video followed by its meaning. */
function hint(p, row, col, key, text, { color = 'cyan', padded = true } = {}) {
  p.moveTo(row, col).color('white').invert(true).text(padded ? ` ${key} ` : key).invert(false);
  if (text) p.color(color).text(` ${text}`);
  return p;
}

/** A pictogram grid (3 x 2 cells) on a plain background, widened to `cols`. */
function iconGrid(pic, { bg = 0, cols } = {}) {
  const img = canvas(pic.width, pic.height, bg);
  blit(img, pic, 0, 0);
  const g = toGrid(img);
  const width = cols ?? g.cols;
  const cells = [];
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < width; x++) cells.push(x < g.cols ? g.cells[y * g.cols + x] : null);
  }
  return { cols: width, rows: g.rows, cells };
}

/**
 * Pictogram on a sky-blue tile (6x6 sub-pixels): readable on the green land
 * in colour and in grey levels alike. Rain turns cyan on the blue.
 */
function tile(type) {
  const pic = icon(type);
  const data = Int8Array.from(pic.data, (v) => (v < 0 ? SEA : v === SEA ? 6 : v));
  return { width: pic.width, height: pic.height, data };
}

/**
 * Horizontal bar, 2/3 of a cell high so that stacked bars stay apart, with
 * half-cell resolution. The empty part is left black.
 */
function bar(p, row, col, width, ratio, color) {
  const halves = Math.round(Math.max(0, Math.min(1, ratio)) * width * 2);
  const cells = [];
  for (let i = 0; i < width; i++) {
    const filled = Math.max(0, Math.min(2, halves - i * 2));
    cells.push(filled === 2 ? 0b111100 : filled === 1 ? 0b010100 : 0);
  }
  return p.moveTo(row, col).color(color).mosaic(cells);
}

/** Pictogram with its label on the first row: the legend entry. */
function legend(p, row, col, type) {
  const g = iconGrid(tile(type), { cols: 14 });
  gridText(g, 0, 3, ` ${WEATHER[type].label}`, { color: 'white', bg: 'black' });
  return encodeGrid(p, g, { row, col });
}

function status(session, text) {
  session.write(new Page().status(` 3615 METEO  ${text}`.slice(0, 38), { color: 'white' }));
}

/** Wait for one of `keys`; other function keys ring the bell. */
async function choose(session, keys) {
  for (;;) {
    const key = await session.waitKey();
    if (keys.includes(key)) return key;
    session.write(new Page().bell());
  }
}

const NAV = ['RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE', 'REPETITION'];

/* ---------------------------------------------------------------------- */
/* Sommaire                                                                */
/* ---------------------------------------------------------------------- */

const MENU = [
  { label: 'Carte de France', hint: "aujourd'hui", go: 'map' },
  { label: 'Carte de France', hint: 'demain', go: 'map+1' },
  { label: 'Prévisions par ville', hint: '3 jours', go: 'cities' },
  { label: 'Bulletin national', hint: 'texte', go: 'bulletin' },
];

function homePage(day) {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: 'blue', rows: 5 });
  encodeGrid(p, iconGrid(bigIcon('partly'), { bg: SEA }), { row: 1, col: 2, after: SEA });
  p.bigText(2, 11, 'METEO', { color: 'yellow', background: 'blue' });
  p.print(5, 9, 'Prévisions pour toute la France', { color: 'white', bg: 'blue' });
  p.hline(6, { color: 'blue', style: 'top' });

  p.print(7, 3, cap(longDate(day)), { color: 'cyan' });
  MENU.forEach((item, i) => {
    const r = 9 + i * 2;
    p.moveTo(r, 3).color('cyan').invert(true).text(` ${i + 1} `).invert(false);
    p.color('white').text(` ${item.label}`);
    p.right(r, 38, item.hint, { color: 'yellow' });
  });

  // Today at a glance: three cities with their pictogram.
  p.panel(17, 2, 20, 38, { bg: 'blue', shadow: 'cyan' });
  ['Paris', 'Lyon', 'Marseille'].forEach((name, i) => {
    const f = forecast(CITIES.find((c) => c.name === name), day);
    const g = iconGrid(tile(f.type), { cols: 13 });
    gridText(g, 0, 3, ` ${name}`, { color: 'white', bg: 'blue' });
    gridText(g, 1, 3, ` ${deg(f.min)}/${deg(f.max)}`, { color: 'yellow', bg: 'blue' });
    encodeGrid(p, g, { row: 18, col: [3, 15, 26][i], after: SEA });
  });
  hint(p, 22, 3, 'GUIDE', 'aide et légende des cartes');
  p.prompt({ row: 24, label: 'Votre choix', length: 1 });
  return p;
}

/** Error line: replaces the row's content, flashing in red. */
function errorLine(row, text) {
  return new Page().moveTo(row, 1).clearEOL().center(row, text, { color: 'red', flash: true }).bell();
}

async function home(session, day) {
  let draw = true;
  let field;
  for (;;) {
    if (draw) {
      const p = homePage(day);
      field = p.field;
      session.write(p);
      status(session, 'Sommaire');
    }
    draw = false;
    const { key, value } = await session.input({ ...field, color: 'cyan' });
    if (key === 'SOMMAIRE') return 'exit';
    if (key === 'GUIDE') return 'guide';
    if (key === 'REPETITION') draw = true;
    else if (key === 'ENVOI' && MENU[Number(value) - 1]) return MENU[Number(value) - 1].go;
    else if (key === 'ENVOI') session.write(errorLine(22, 'Tapez un numéro de 1 à 4'));
    else session.write(new Page().bell());
  }
}

/* ---------------------------------------------------------------------- */
/* Carte de France                                                         */
/* ---------------------------------------------------------------------- */

const MAP = { row: 5, col: 1, cols: 25, rows: 20 };
const PANEL = 27;

/**
 * City badges on the map, in cells of the map box: the pictogram's top-left
 * corner and where the temperature goes (a zone delimiter then 2 digits).
 */
const BADGES = [
  { city: 'Lille', icon: [12, 0], temp: [12, 2] },
  { city: 'Paris', icon: [10, 4], temp: [10, 6] },
  { city: 'Strasbourg', icon: [19, 4], temp: [19, 6] },
  { city: 'Brest', icon: [0, 5], temp: [0, 7] },
  { city: 'Nantes', icon: [5, 7], temp: [5, 9] },
  { city: 'Lyon', icon: [15, 9], temp: [15, 11] },
  { city: 'Bordeaux', icon: [7, 11], temp: [7, 13] },
  { city: 'Toulouse', icon: [10, 14], temp: [10, 16] },
  { city: 'Marseille', icon: [15, 14], temp: [15, 16] },
  { city: 'Nice', icon: [19, 13], temp: [19, 15] },
  { city: 'Ajaccio', icon: [22, 17], temp: [19, 18] },
];

let baseMap = null;
function mapBase() {
  if (!baseMap) baseMap = franceMap(MAP.cols, MAP.rows);
  return baseMap;
}

/** The map with a day's pictograms and maximum temperatures. */
function mapGrid(day) {
  const base = mapBase();
  const img = { width: base.width, height: base.height, data: Int8Array.from(base.data) };
  const list = nationalForecast(day);
  const seaAt = (cx, cy) => {
    let sea = 0;
    for (let i = 0; i < 6; i++) if (base.data[(cy * 3 + (i >> 1)) * base.width + cx * 2 + (i & 1)] === SEA) sea++;
    return sea > 3;
  };
  const shown = new Set();
  const badges = BADGES.map((b) => ({ ...b, f: list.find((x) => x.city.name === b.city) }));
  for (const { icon: [ix, iy], f } of badges) {
    blit(img, tile(f.type), ix * 2, iy * 3);
    shown.add(f.type);
  }
  const grid = toGrid(img);
  for (const { temp: [tx, ty], f } of badges) {
    const sea = seaAt(tx + 1, ty);
    gridText(grid, ty, tx, ` ${String(f.max).padStart(2)}`, { color: sea ? 'white' : 'black', bg: sea ? 'blue' : 'green' });
  }
  return { grid, types: ORDER.filter((t) => shown.has(t)) };
}

/** Right-hand panel: date, legend of the pictograms on the map, keys. */
function mapPanel(p, date, offset, types, full) {
  if (!full) for (const r of [5, 6, ...Array.from({ length: 13 }, (_, i) => 8 + i), 22]) p.moveTo(r, PANEL).clearEOL();
  const [dayName, ...rest] = longDate(date).split(' ');
  p.print(5, PANEL, cap(dayName), { color: 'yellow' });
  p.print(6, PANEL, rest.join(' '), { color: 'white' });
  const step = types.length > 4 ? 2 : 3;
  types.slice(0, 6).forEach((type, i) => legend(p, 8 + i * step, PANEL, type));
  if (full) {
    p.print(21, PANEL, 'Maxi en °C', { color: 'green' });
    hint(p, 23, PANEL, 'GUIDE', 'aide', { padded: false });
    hint(p, 24, PANEL, 'SOMMAIRE', 'menu', { padded: false });
  }
  if (offset === 0) hint(p, 22, PANEL, 'SUITE', 'demain', { padded: false });
  else if (offset === MAP_DAYS - 1) hint(p, 22, PANEL, 'RETOUR', 'demain', { padded: false });
  else hint(p, 22, PANEL, 'SUITE', '', { padded: false }).text(' ').invert(true).color('white').text('RETOUR').invert(false);
  return p;
}

const MAP_DAYS = 3;
const mapTitle = (day, offset) => (offset === 0 ? "Aujourd'hui" : offset === 1 ? 'Demain' : cap(weekday(day + offset)));

async function mapPage(session, day, offset) {
  let shown = null; // grid on screen
  for (;;) {
    const { grid, types } = mapGrid(day + offset);
    const title = mapTitle(day, offset);
    const p = new Page();
    if (!shown) {
      p.clear().cursor(false);
      header(p, title, 'Carte de France');
    } else {
      p.print(3, 9, title.toUpperCase().padEnd(11), { color: 'white', bg: 'blue', size: 'double' });
    }
    encodeGrid(p, grid, { row: MAP.row, col: MAP.col, prev: shown });
    mapPanel(p, day + offset, offset, types, !shown);
    session.write(p);
    status(session, `Carte ${offset + 1}/${MAP_DAYS}`);
    shown = grid;
    const key = await choose(session, offset < MAP_DAYS - 1 ? [...NAV, 'SUITE'] : NAV);
    if (key === 'SUITE') offset++;
    else if (key === 'RETOUR' && offset > 0) offset--;
    else if (key === 'REPETITION') shown = null;
    else if (key === 'GUIDE') {
      if ((await guide(session)) === 'home') return 'home';
      shown = null;
    } else return 'home';
  }
}

/* ---------------------------------------------------------------------- */
/* Prévisions par ville                                                    */
/* ---------------------------------------------------------------------- */

const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** City from a number (1..n) or the beginning of its name. */
function findCity(value) {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return CITIES[Number(v) - 1] || null;
  const key = plain(v);
  return CITIES.find((c) => plain(c.name).startsWith(key)) || null;
}

const tempColor = (t) => (t >= 25 ? 'yellow' : t <= 5 ? 'cyan' : 'green');

function citiesPage(day) {
  const p = new Page().clear().cursor(false);
  header(p, 'Villes', 'Prévisions 3 jours');
  const half = Math.ceil(CITIES.length / 2);
  const list = nationalForecast(day);
  p.right(5, 20, 'maxi', { color: 'green' });
  p.right(5, 40, 'maxi', { color: 'green' });
  CITIES.forEach((c, i) => {
    const r = 6 + (i % half) * 2;
    const col = i < half ? 2 : 22;
    const f = list[i];
    p.moveTo(r, col).color('cyan').invert(true).text(`${String(i + 1).padStart(2)} `).invert(false);
    p.color('white').text(` ${c.name}`);
    p.right(r, col + 18, deg(f.max), { color: tempColor(f.max) });
  });
  p.print(24, 2, 'Ville : numéro ou nom', { color: 'white' });
  p.moveTo(24, 24).color('cyan').fill('.', 9);
  p.key(24, 34, 'ENVOI');
  p.field = { row: 24, col: 24, length: 9 };
  return p;
}

async function cities(session, day) {
  let draw = true;
  let field;
  for (;;) {
    if (draw) {
      const p = citiesPage(day);
      field = p.field;
      session.write(p);
      status(session, 'Villes');
    }
    draw = true;
    const { key, value } = await session.input({ ...field, color: 'cyan', uppercase: true });
    if (key === 'SOMMAIRE' || key === 'RETOUR') return 'home';
    if (key === 'GUIDE') {
      if ((await guide(session)) === 'home') return 'home';
    } else if (key === 'ENVOI') {
      const city = findCity(value);
      if (city) {
        if ((await cityPage(session, day, city)) === 'home') return 'home';
      } else {
        session.write(errorLine(23, value.trim() ? `Ville inconnue : ${value.trim()}` : 'Tapez un numéro ou un nom de ville'));
        draw = false;
      }
    } else if (key !== 'REPETITION') {
      session.write(new Page().bell());
      draw = false;
    }
  }
}

const REGION_LABELS = {
  bretagne: 'Bretagne',
  normandie: 'Normandie',
  nord: 'Nord-Picardie',
  idf: 'Ile-de-France',
  loire: 'Pays de la Loire',
  est: 'Alsace-Lorraine',
  bourgogne: 'Bourgogne',
  massif: 'Massif central',
  rhone: 'Rhône-Alpes',
  aquitaine: 'Aquitaine',
  midi: 'Midi-Pyrénées',
  languedoc: 'Languedoc',
  provence: "Provence-Côte d'Azur",
  corse: 'Corse',
};

const SKY_TEXT = {
  sun: 'Grand soleil',
  partly: 'Eclaircies',
  cloudy: 'Ciel couvert',
  fog: 'Brouillard',
  showers: 'Averses',
  rain: 'Pluie',
  storm: 'Orages',
  snow: 'Neige',
};

const SLOTS = ['Nuit', 'Matin', 'Après-midi', 'Soirée'];

function skyComment(f) {
  const slots = [0, 1, 2, 3].map((i) => (f.hourly[i * 2] + f.hourly[i * 2 + 1]) / 2);
  const when = ['la nuit', 'le matin', "l'après-midi", 'en soirée'][slots.indexOf(Math.max(...slots))];
  switch (f.type) {
    case 'sun': return 'Ciel dégagé toute la journée.';
    case 'partly': return 'Passages nuageux et belles éclaircies.';
    case 'cloudy': return 'Ciel gris, rares gouttes possibles.';
    case 'fog': return 'Brouillard au lever du jour, puis soleil voilé.';
    case 'showers': return `Averses, surtout ${when}.`;
    case 'rain': return `Pluie, plus soutenue ${when}.`;
    case 'storm': return `Orages, surtout ${when}.`;
    case 'snow': return 'Chutes de neige, prudence sur les routes.';
    default: return '';
  }
}

function cityContent(p, day, city, offset) {
  const f = forecast(city, day + offset);

  // Day tabs
  let col = 2;
  ["Aujourd'hui", 'Demain', cap(weekday(day + 2))].forEach((label, i) => {
    const text = ` ${label} `;
    p.moveTo(5, col);
    if (i === offset) p.color('yellow').invert(true).text(text).invert(false);
    else p.color('cyan').text(text);
    col += textWidth(text) + 1;
  });
  p.right(5, 39, `${offset + 1}/3`, { color: 'white' });

  // Pictogram and sky
  encodeGrid(p, iconGrid(bigIcon(f.type)), { row: 7, col: 3 });
  p.print(8, 11, SKY_TEXT[f.type], { color: 'white', size: 'tall' });
  p.paragraph(9, 11, skyComment(f), { width: 29, color: 'cyan' });

  // Temperatures in giant digits
  p.print(12, 4, 'mini', { color: 'cyan' });
  p.bigText(13, 3, deg(f.min), { color: 'cyan' });
  p.print(12, 23, 'maxi', { color: 'yellow' });
  p.bigText(13, 22, deg(f.max), { color: 'yellow' });

  p.hline(16, { col: 2, width: 38, color: 'blue', style: 'middle' });

  // Rain by part of the day
  p.print(17, 3, 'RISQUE DE PLUIE', { color: 'green' });
  SLOTS.forEach((label, i) => {
    const v = Math.round((f.hourly[i * 2] + f.hourly[i * 2 + 1]) / 2);
    const r = 18 + i;
    p.print(r, 3, label, { color: 'white' });
    bar(p, r, 14, 8, v / 100, v >= 50 ? 'yellow' : 'cyan');
    p.right(r, 25, `${v}%`, { color: v >= 50 ? 'yellow' : 'white' });
  });

  // Wind
  const w = f.wind;
  p.print(17, 28, 'VENT', { color: 'green' });
  encodeGrid(p, iconGrid(windArrow(w.dir)), { row: 18, col: 28 });
  p.print(18, 32, cap(w.label), { color: 'white' });
  p.print(19, 32, `${w.speed} km/h`, { color: 'white' });
  p.print(20, 28, `rafales ${w.gust}`, { color: 'cyan' });
  if (w.name) p.print(21, 28, cap(w.name), { color: 'yellow' });

  const sun = sunTimes(day + offset, city.lat, city.lon);
  p.hline(22, { col: 2, width: 38, color: 'blue', style: 'middle' });
  p.print(23, 3, 'Soleil', { color: 'green' });
  p.moveTo(23, 10).color('white').text(`lever ${sun.rise}   coucher ${sun.set}`);
  return p;
}

async function cityPage(session, day, city) {
  let offset = 0;
  let full = true;
  for (;;) {
    const p = new Page();
    if (full) {
      p.clear().cursor(false);
      header(p, city.name, REGION_LABELS[city.region]);
    } else {
      for (let r = 5; r <= 24; r++) p.moveTo(r, 1).clearEOL();
    }
    cityContent(p, day, city, offset);
    let col = 2;
    if (offset < 2) { hint(p, 24, col, 'SUITE', '', { padded: false }); col += 7; }
    if (offset > 0) { hint(p, 24, col, 'RETOUR', '', { padded: false }); col += 8; }
    hint(p, 24, 23, 'SOMMAIRE', 'villes', { padded: false });
    session.write(p);
    status(session, city.name);
    full = false;
    const key = await choose(session, offset < 2 ? [...NAV, 'SUITE'] : NAV);
    if (key === 'SUITE') offset++;
    else if (key === 'RETOUR' && offset > 0) offset--;
    else if (key === 'REPETITION') full = true;
    else if (key === 'GUIDE') {
      if ((await guide(session)) === 'home') return 'home';
      full = true;
    } else return 'cities';
  }
}

/* ---------------------------------------------------------------------- */
/* Bulletin national                                                       */
/* ---------------------------------------------------------------------- */

const TEXT_TOP = 6;
const TEXT_BOTTOM = 23;

/**
 * Flow the bulletin sections into screen pages: [[{ heading, lines }]].
 * A section starts a new page when it does not fit, and is split (with a
 * "suite" heading) only when it is longer than a whole page.
 */
function paginate(sections) {
  const room = TEXT_BOTTOM - TEXT_TOP + 1;
  const pages = [[]];
  let used = 0;
  for (const [heading, text] of sections) {
    let lines = text.split('\n').flatMap((para) => wrap(para, 38));
    let title = heading;
    while (lines.length) {
      if (used && used + lines.length + 1 > room) {
        pages.push([]);
        used = 0;
      }
      const part = lines.slice(0, room - used - 1);
      pages[pages.length - 1].push({ heading: title, lines: part });
      used += part.length + 2;
      lines = lines.slice(part.length);
      title = `${heading} (suite)`;
    }
  }
  return pages;
}

async function bulletinPages(session, day) {
  const pages = paginate(bulletin(day));
  let index = 0;
  for (;;) {
    const p = new Page().clear().cursor(false);
    header(p, 'Bulletin', `National  ${index + 1}/${pages.length}`);
    let row = TEXT_TOP;
    for (const { heading, lines } of pages[index]) {
      p.moveTo(row++, 2).color('yellow').invert(true).text(` ${heading} `).invert(false);
      for (const line of lines) if (row <= TEXT_BOTTOM) p.print(row++, 2, line, { color: 'white' });
      row++;
    }
    let col = 2;
    if (index < pages.length - 1) { hint(p, 24, col, 'SUITE', 'page suivante', { padded: false }); col += 21; }
    if (index > 0) hint(p, 24, col, 'RETOUR', index < pages.length - 1 ? '' : 'page précédente', { padded: false });
    hint(p, 24, 31, 'SOMMAIRE', '', { padded: false });
    session.write(p);
    status(session, `Bulletin ${index + 1}/${pages.length}`);
    const key = await choose(session, index < pages.length - 1 ? [...NAV, 'SUITE'] : NAV);
    if (key === 'SUITE') index++;
    else if (key === 'RETOUR' && index > 0) index--;
    else if (key === 'GUIDE') {
      if ((await guide(session)) === 'home') return 'home';
    } else if (key !== 'REPETITION') return 'home';
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
  header(p, 'Guide', "Mode d'emploi");
  [
    ['ENVOI', 'valider votre choix'],
    ['SUITE', 'jour ou page suivante'],
    ['RETOUR', 'jour ou page précédente'],
    ['SOMMAIRE', 'revenir au menu'],
    ['REPETITION', 'réafficher la page'],
  ].forEach(([key, text], i) => {
    p.moveTo(6 + i, 2).color('white').invert(true).text(` ${key.padEnd(10)} `).invert(false).color('cyan').text(` ${text}`);
  });
  p.print(12, 2, 'LEGENDE DES CARTES', { color: 'yellow' });
  p.hline(12, { col: 21, width: 18, color: 'yellow', style: 'middle' });
  ORDER.forEach((type, i) => legend(p, 13 + Math.floor(i / 2) * 3, i % 2 ? 22 : 3, type));
  p.hints(24, [['RETOUR', 'page précédente'], ['SOMMAIRE', 'menu']]);
  return p;
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

export default {
  code: 'METEO',
  name: 'Météo',
  description: 'Prévisions pour toute la France',
  async run(session) {
    const day = dayNumber();
    let page = 'home';
    for (;;) {
      if (page === 'exit') return;
      if (page === 'map') page = await mapPage(session, day, 0);
      else if (page === 'map+1') page = await mapPage(session, day, 1);
      else if (page === 'cities') page = await cities(session, day);
      else if (page === 'bulletin') page = await bulletinPages(session, day);
      else if (page === 'guide') page = (await guide(session), 'home');
      else page = await home(session, day);
    }
  },
};
