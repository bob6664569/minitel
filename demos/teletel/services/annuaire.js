/**
 * 3611 ANNUAIRE — the electronic telephone directory, answering 3611
 * directly (no kiosk).
 *
 *   Search page laid out like the real 3611: NOM or RUBRIQUE, LOCALITE,
 *   then DEPARTEMENT, ADRESSE and PRENOM to narrow the search down; GUIDE
 *   on a field offers a list to choose from.
 *   -> list of subscribers (zebra, SUITE / RETOUR) -> card per entry.
 *
 * White pages for people, yellow pages for professions. Subscribers are
 * fictional, generated from embedded tables (annuaire-data.js), with
 * 8-digit numbers of the 1985-1996 numbering plan.
 */
import { Page, pad, wrap } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import {
  DEPARTMENTS, PROFESSIONS, findLocality, findDepartment, departmentLabel, findRubrique, townsOf,
  searchName, searchRubrique, searchBusiness, isBusinessName, key, plain,
} from './annuaire-data.js';

const PER_PAGE = 6;
const FREE_SECONDS = 180;

/* Old rotary telephone, front view (8 x 3 cells): '#' is the ink, the dial a hole. */
const PHONE = [
  '...##########...',
  '.##############.',
  '.###........###.',
  '....########....',
  '...###....###...',
  '..###.####.###..',
  '..###.####.###..',
  '.#####....#####.',
  '.##############.',
];

/* Small telephone for page headers (4 x 2 cells). */
const HANDSET = [
  '.######.',
  '##....##',
  '#......#',
  '..####..',
  '.######.',
  '.######.',
];

/* Telephone emblem of the search page, drawn in separated mosaics (7 x 5 cells). */
const EMBLEM = [
  '..............',
  '..##########..',
  '.############.',
  '###........###',
  '##..........##',
  '.....####.....',
  '...########...',
  '..##########..',
  '.####....####.',
  '.###..##..###.',
  '.###.####.###.',
  '.###..##..###.',
  '.####....####.',
  '##############',
];

/* The big "11" of the directory: two bold ones, 7 x 3 cells together. */
const ONE = ['..####', '.#####', '######', '..####', '..####', '..####', '..####', '..####', '..####'];
const ELEVEN = ONE.map((line) => `${line}..${line}`);

/** Band colour: white pages for people, yellow pages for professions. */
const bandOf = (query) => (query?.rubrique ? 'yellow' : 'white');

/** Status row: the free minutes, then the tariff. */
function status(p, session) {
  const left = Math.ceil(FREE_SECONDS - session.elapsed);
  const text = left > 0
    ? `gratuit encore ${left >= 60 ? `${Math.floor(left / 60)} mn ${String(left % 60).padStart(2, '0')}` : `${left} s`}`
    : '0,12 F la minute';
  return p.status(` 3611 ANNUAIRE${pad(text, 24, 'right')}`, { color: 'white' });
}

/** Header of the inner pages: a white (or yellow) band with a title. */
function header(p, title, { band = 'white', right, size = 'double' } = {}) {
  p.band(1, { bg: band, rows: 3 });
  p.print(1, 2, band === 'yellow' ? '3611 ANNUAIRE  PROFESSIONNELS' : '3611 ANNUAIRE ELECTRONIQUE', { color: 'blue', bg: band });
  if (right) p.right(3, 32, right, { color: 'red', bg: band });
  p.print(3, 2, title, { color: 'black', bg: band, size });
  p.art(2, 35, HANDSET, { ink: 'black', background: band });
  p.hline(4, { color: band, style: 'top' });
  return p;
}

/* ---------------------------------------------------------------------- */
/* Help                                                                    */
/* ---------------------------------------------------------------------- */

async function help(session) {
  const p = new Page().clear().cursor(false);
  status(p, session);
  header(p, "MODE D'EMPLOI", { size: 'tall' });
  const lines = [
    [6, 'NOM', 'nom de famille, raison sociale'],
    [7, '', 'ou organisme : MARTIN, MAIRIE'],
    [9, 'RUBRIQUE', 'une profession : PLOMBIERS,'],
    [10, '', 'MEDECINS, TAXIS...'],
    [12, 'LOCALITE', 'la commune : DIJON, BREST'],
    [13, 'DEPARTEMENT', 'numéro ou nom : 21, COTE D OR'],
    [15, 'ADRESSE', 'pour préciser : une rue'],
    [16, 'PRENOM', "le prénom de l'abonné"],
  ];
  for (const [row, label, text] of lines) {
    if (label) p.print(row, 2, label, { color: 'yellow' });
    p.print(row, 15, text, { color: 'white' });
  }
  p.print(18, 2, 'GUIDE sur RUBRIQUE, LOCALITE ou', { color: 'cyan' });
  p.print(19, 2, 'DEPARTEMENT : choisir dans une liste.', { color: 'cyan' });
  p.panel(21, 2, 22, 38, { bg: 'blue' });
  p.print(21, 4, 'Gratuit les 3 premières minutes,', { color: 'white', bg: 'blue' });
  p.print(22, 4, 'puis 0,12 F la minute.', { color: 'white', bg: 'blue' });
  p.hints(24, [['RETOUR', 'revenir à la page']]);
  session.write(p);
  await session.waitKey();
}

/* ---------------------------------------------------------------------- */
/* Search page                                                             */
/* ---------------------------------------------------------------------- */

/* Fields start after the labels' colon, in column 12. */
const FIELD_COL = 13;
const FIELD_WIDTH = 27;
const FORM = [
  { name: 'nom', row: 5, label: 'NOM:' },
  { name: 'rubrique', row: 7, label: 'RUBRIQUE:', rows: 2 },
  { name: 'localite', row: 10, label: 'LOCALITE:', rows: 2 },
  { name: 'dept', row: 13, label: 'DEPARTEMENT:' },
  { name: 'adresse', row: 14, label: 'ADRESSE:' },
  { name: 'prenom', row: 15, label: 'PRENOM:' },
].map((f) => ({ ...f, col: FIELD_COL, length: FIELD_WIDTH * (f.rows || 1), width: FIELD_WIDTH, uppercase: true }));

const EMPTY = Object.freeze({ nom: '', rubrique: '', localite: '', dept: '', adresse: '', prenom: '' });

/* Key legend, bottom right: what each key does, then the key. */
const LEGEND = [
  ['ligne suivante', 'Suite'],
  ['ligne précédente', 'Retour'],
  ['effacer', 'Correc.'],
  ['choisir dans une liste', 'Guide'],
  ['obtenir la réponse', 'Envoi'],
];

function homePage(session, message) {
  const p = new Page().clear().cursor(false);
  status(p, session);
  p.art(1, 1, EMBLEM, { ink: 'white', separated: true });
  p.band(1, { bg: 'blue', rows: 3, col: 13, width: 28 });
  ['RECHERCHE', 'PAR NOM', 'OU PAR RUBRIQUE'].forEach((text, i) => p.print(1 + i, 14, text, { color: 'white', bg: 'blue' }));
  p.art(1, 33, ELEVEN, { ink: 'white', background: 'blue' });

  for (const f of FORM) p.right(f.row, FIELD_COL - 1, f.label, { color: 'cyan' });
  p.print(6, 9, 'ou', { color: 'white' });
  p.print(12, FIELD_COL, 'vous pouvez préciser', { color: 'white' });
  p.moveTo(16, 1).color('white').text('_'.repeat(40));
  LEGEND.forEach(([text, name], i) => {
    p.right(17 + i, 31, text, { color: 'white' });
    // Underlined inverse video: a dark line under each key separates the boxes.
    p.moveTo(17 + i, 33).invert(true).underline(true).text(pad(` ${name}`, 8));
  });

  if (message) {
    const top = 25 - message.lines.length;
    p.panel(top, 2, 24, 38, { bg: 'red' });
    message.lines.forEach((text, i) => p.print(top + i, 4, text, { color: 'white', bg: 'red' }));
  } else {
    p.print(23, 2, 'Exemples : MARTIN à LYON,', { color: 'blue' });
    p.print(24, 2, 'OFFICE DU TOURISME à DIJON', { color: 'blue' });
  }
  return p;
}

/** Street words that say nothing about the street itself. */
const STREET_WORDS = new Set(['RUE', 'R', 'AVENUE', 'AV', 'AVE', 'BOULEVARD', 'BD', 'PLACE', 'PL', 'CHEMIN', 'CH', 'IMPASSE',
  'IMP', 'ALLEE', 'ALL', 'QUAI', 'ROUTE', 'RTE', 'COURS', 'SQUARE', 'SQ', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'D', 'L', 'BIS']);

const addressWords = (text) => plain(text).split(/[^A-Z0-9]+/).filter((w) => w && !STREET_WORDS.has(w) && !/^\d+$/.test(w));

/** Turn the form values into a query, or an error message. */
function parseQuery(values) {
  const nom = values.nom.trim();
  const rub = values.rubrique.trim();
  if (!nom && !rub) return { error: ['Indiquez un NOM ou une RUBRIQUE.'], index: 0 };
  let rubrique = null;
  if (!nom) {
    const found = findRubrique(rub);
    if (!found.rubrique) {
      const lines = [`Rubrique inconnue : ${rub}`.slice(0, 34)];
      if (found.suggestions.length) lines.push(`Essayez ${found.suggestions.map((r) => r.name).join(', ')}`.slice(0, 34));
      else lines.push('GUIDE : liste des rubriques');
      return { error: lines, index: 1 };
    }
    rubrique = found.rubrique;
  } else if (key(nom).length < 2) {
    return { error: ['Nom trop court : 2 lettres minimum.'], index: 0 };
  }

  const loc = values.localite.trim();
  const dept = values.dept.trim();
  let deptCode = null;
  if (dept) {
    deptCode = findDepartment(dept);
    if (!deptCode) return { error: [`Département inconnu : ${dept}`.slice(0, 34), 'GUIDE : liste des départements'], index: 3 };
  }
  let towns;
  let place;
  let town = null;
  if (loc) {
    const found = findLocality(loc);
    if (!found.town) {
      const lines = [`Localité inconnue : ${loc}`.slice(0, 34)];
      if (found.suggestions.length) lines.push(...wrap(`Voulez-vous dire ${found.suggestions.map((t) => plain(t.name)).join(', ')} ?`, 34).slice(0, 2));
      else lines.push('Précisez le département.');
      return { error: lines, index: 2 };
    }
    town = found.town;
    if (deptCode && town.dept !== deptCode) {
      // The same name may exist in the department that was typed.
      const k = key(loc);
      const local = townsOf(deptCode).find((t) => t.key.startsWith(k));
      if (!local) return { error: [`${plain(town.name)} n'est pas dans le ${deptCode}.`.slice(0, 34)], index: 3 };
      town = local;
    }
    towns = [town];
    deptCode = town.dept;
    place = `${plain(town.name)} (${town.dept})`;
  } else if (deptCode) {
    towns = townsOf(deptCode);
    place = `${departmentLabel(deptCode)} (${deptCode})`;
  } else {
    return { error: ['Indiquez la LOCALITE', 'ou le DEPARTEMENT.'], index: 2 };
  }
  return {
    query: {
      nom: plain(nom), rubrique, towns, town, dept: deptCode, place,
      prenom: key(values.prenom), adresse: addressWords(values.adresse),
    },
  };
}

/** Directory entries for a query, narrowed by first name and street. */
function find(query) {
  let list;
  if (query.rubrique) list = searchRubrique(query.rubrique, query.towns);
  else if (isBusinessName(query.nom)) list = searchBusiness(query.nom, query.towns);
  else list = searchName(query.nom, query.towns);
  if (query.prenom) list = list.filter((e) => (e.business ? key(e.name).includes(query.prenom) : key(e.first).startsWith(query.prenom)));
  if (query.adresse.length) list = list.filter((e) => query.adresse.every((word) => key(e.street).includes(word)));
  return list;
}

/* ---------------------------------------------------------------------- */
/* GUIDE: choose in a list                                                 */
/* ---------------------------------------------------------------------- */

const LIST_ROWS = 16;

/** Department codes in directory order: 01 ... 19, 2A, 2B, 21 ... */
const deptOrder = (code) => (code === '2A' ? 20.1 : code === '2B' ? 20.2 : Number(code));

function listPage(session, title, items, start, codeWidth) {
  const p = new Page().clear().cursor(false);
  status(p, session);
  header(p, title, { size: 'tall' });
  const perPage = LIST_ROWS * 2;
  const pages = Math.ceil(items.length / perPage);
  if (pages > 1) p.right(5, 39, `${Math.floor(start / perPage) + 1}/${pages}`, { color: 'white' });
  const shown = items.slice(start, start + perPage);
  const perColumn = Math.min(LIST_ROWS, Math.ceil(shown.length / 2));
  const labelWidth = 18 - codeWidth - 1;
  shown.forEach((item, i) => {
    const row = 6 + (i % perColumn);
    const col = i < perColumn ? 2 : 21;
    const label = item.label.length > labelWidth ? `${item.label.slice(0, labelWidth - 1)}.` : item.label;
    p.print(row, col, pad(item.code, codeWidth, 'right'), { color: 'yellow' });
    p.print(row, col + codeWidth + 1, label, { color: 'white' });
  });
  const hints = [];
  if (start + perPage < items.length) hints.push(['SUITE', 'page suivante']);
  hints.push(['RETOUR', start ? 'page précédente' : 'formulaire']);
  p.hints(22, hints);
  p.prompt({ label: 'Votre choix', length: codeWidth, fieldColor: 'yellow' });
  return p;
}

/**
 * A list to choose from. `pick(value)` turns what was typed into an item.
 * Returns the chosen item, or null to go back to the form.
 */
async function choose(session, { title, items, pick }) {
  const codeWidth = Math.max(...items.map((item) => item.code.length));
  const perPage = LIST_ROWS * 2;
  let start = 0;
  let draw = true;
  for (;;) {
    const page = listPage(session, title, items, start, codeWidth);
    if (draw) session.write(page);
    draw = true;
    const { key: k, value } = await session.input({ ...page.field, color: 'yellow', uppercase: true, accept: /[0-9AB]/i });
    if (k === 'SOMMAIRE' || (k === 'RETOUR' && !start)) return null;
    if (k === 'RETOUR') start -= perPage;
    else if (k === 'SUITE' && start + perPage < items.length) start += perPage;
    else if (k === 'ENVOI' && pick(value)) return pick(value);
    else if (k !== 'REPETITION') {
      session.write(new Videotex().bell());
      draw = false;
    }
  }
}

/**
 * GUIDE on a field of the search page: rubriques, departments or the
 * towns of the department; the help page elsewhere. Returns { name, value }
 * for the field to fill, or null.
 */
async function guide(session, field, values) {
  if (field === 'rubrique') {
    const items = PROFESSIONS.map((r, i) => ({ code: String(i + 1), label: r.name, value: r.name }));
    const item = await choose(session, { title: 'RUBRIQUES', items, pick: (v) => items[Number(v) - 1] });
    return item && { name: 'rubrique', value: item.value };
  }
  const dept = findDepartment(values.dept);
  if (field === 'localite' && dept) {
    const items = townsOf(dept).map((t, i) => ({ code: String(i + 1), label: t.name, value: plain(t.name) }));
    const item = await choose(session, { title: `COMMUNES (${dept})`, items, pick: (v) => items[Number(v) - 1] });
    return item && { name: 'localite', value: item.value };
  }
  if (field === 'dept' || field === 'localite') {
    const items = Object.keys(DEPARTMENTS)
      .sort((a, b) => deptOrder(a) - deptOrder(b))
      .map((code) => ({ code, label: DEPARTMENTS[code][0], value: departmentLabel(code) }));
    const item = await choose(session, { title: 'DEPARTEMENTS', items, pick: (v) => items.find((it) => it.code === findDepartment(v)) });
    return item && { name: 'dept', value: item.value };
  }
  await help(session);
  return null;
}

/* ---------------------------------------------------------------------- */
/* Results                                                                 */
/* ---------------------------------------------------------------------- */

const titleOf = (query) => (query.rubrique ? query.rubrique.name : query.nom);

/** Shorten a name to `width` cells on a word boundary when possible. */
function fitWords(text, width) {
  if (text.length <= width) return text;
  let out = '';
  for (const word of text.split(' ')) {
    if (`${out} ${word}`.trim().length > width) break;
    out = `${out} ${word}`.trim();
  }
  return out || text.slice(0, width);
}
const addressOf = (entry, width = 36) => {
  const full = `${entry.street}, ${entry.postcode} ${entry.town.toUpperCase()}`;
  return full.length <= width ? full : `${entry.street}, ${entry.town.toUpperCase()}`;
};

function resultsPage(session, query, list, start) {
  const p = new Page().clear().cursor(false);
  const band = bandOf(query);
  status(p, session);
  const title = titleOf(query);
  header(p, title, { band, size: title.length <= 15 ? 'double' : 'tall' });
  const pages = Math.ceil(list.length / PER_PAGE);
  const page = Math.floor(start / PER_PAGE) + 1;
  p.print(5, 2, query.place, { color: 'yellow' });
  p.right(5, 39, `${list.length} ${query.rubrique ? 'adresse' : 'abonné'}${list.length > 1 ? 's' : ''}  ${page}/${pages}`, { color: 'white' });
  for (let i = 0; i < PER_PAGE; i++) {
    const e = list[start + i];
    if (!e) break;
    const row = 6 + i * 2;
    const bg = i % 2 ? 'blue' : 'black';
    // Name (and first name) on the left, number on the right.
    const nameWidth = 40 - 5 - e.phone.length - 2;
    const name = fitWords(e.name, nameWidth);
    p.moveTo(row, 1).bg(bg).color('yellow').invert(true).text(` ${i + 1} `).invert(false)
      .color('white').text(` ${name}`);
    if (e.business) p.text(' '.repeat(Math.max(0, nameWidth - name.length)));
    else p.color('cyan').text(pad(` ${e.first}`, Math.max(0, nameWidth - name.length)));
    p.color('yellow').text(` ${e.phone} `);
    p.moveTo(row + 1, 1).bg(bg).color('cyan').text(`    ${pad(addressOf(e), 36)}`);
  }
  const hints = [];
  if (page < pages) hints.push(['SUITE', 'page suivante']);
  if (page > 1) hints.push(['RETOUR', 'précédente']);
  if (hints.length) p.hints(20, hints);
  p.hints(21, [['SOMMAIRE', 'nouvelle recherche']]);
  p.prompt({ label: 'N° pour la fiche', length: 1, fieldColor: 'yellow' });
  return p;
}

function noResultPage(session, query) {
  const p = new Page().clear().cursor(false);
  status(p, session);
  header(p, titleOf(query), { band: bandOf(query), size: titleOf(query).length <= 12 ? 'double' : 'tall' });
  p.bigText(6, 3, 'AUCUN', { color: 'red' });
  p.bigText(9, 3, 'ABONNE', { color: 'red' });
  p.art(7, 25, PHONE, { ink: 'white' });
  p.print(13, 2, `à ${query.place}`, { color: 'yellow' });
  p.print(15, 2, "Vérifiez l'orthographe du nom,", { color: 'white' });
  p.print(16, 2, 'ou élargissez la recherche.', { color: 'white' });
  if (query.town) {
    // Offer the whole department with one key.
    p.panel(18, 2, 19, 38, { bg: 'blue' });
    p.print(18, 4, 'Chercher dans tout le département', { color: 'white', bg: 'blue' });
    p.print(19, 4, `${DEPARTMENTS[query.dept][0]} (${query.dept})`, { color: 'yellow', bg: 'blue' });
    p.key(19, 31, 'SUITE');
  }
  p.hints(22, [['SOMMAIRE', 'nouvelle recherche']]);
  return p;
}

/** Results loop. Returns 'new' for a new search, 'back' to refine the form. */
async function results(session, query) {
  for (;;) {
    const list = find(query);
    if (!list.length) {
      session.write(noResultPage(session, query));
      const k = await session.waitKey(['SUITE', 'SOMMAIRE', 'RETOUR', 'ENVOI', 'GUIDE', 'REPETITION']);
      if (k === 'REPETITION') continue;
      if (k === 'SUITE' && query.town) {
        query = { ...query, towns: townsOf(query.dept), town: null, place: `${departmentLabel(query.dept)} (${query.dept})` };
        continue;
      }
      if (k === 'GUIDE') {
        await help(session);
        continue;
      }
      return k === 'SOMMAIRE' ? 'new' : 'back';
    }
    let start = 0;
    let draw = true;
    for (;;) {
      const page = resultsPage(session, query, list, start);
      if (draw) session.write(page);
      draw = true;
      const { key: k, value } = await session.input({ ...page.field, color: 'yellow', accept: /[1-6]/ });
      if (k === 'SOMMAIRE') return 'new';
      if (k === 'GUIDE') await help(session);
      else if (k === 'SUITE' && start + PER_PAGE < list.length) start += PER_PAGE;
      else if (k === 'RETOUR' && start > 0) start -= PER_PAGE;
      else if (k === 'RETOUR') return 'back';
      else if (k === 'ENVOI' && value && list[start + Number(value) - 1]) {
        const index = await card(session, query, list, start + Number(value) - 1);
        if (index === null) return 'new';
        start = Math.floor(index / PER_PAGE) * PER_PAGE;
      } else if (k !== 'REPETITION') {
        session.write(new Videotex().bell());
        draw = false;
      }
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Card                                                                    */
/* ---------------------------------------------------------------------- */

function cardPage(session, query, list, index) {
  const e = list[index];
  const p = new Page().clear().cursor(false);
  const band = bandOf(query);
  status(p, session);
  header(p, e.business ? 'PROFESSIONNEL' : 'ABONNE', { band, size: 'double', right: `${index + 1}/${list.length}` });
  // A visiting card: white, with a blue shadow.
  p.panel(6, 3, 18, 36, { bg: 'white', shadow: 'blue' });
  if (e.business) {
    const lines = wrap(e.name, 31);
    p.print(8, 5, lines[0], { color: 'blue', bg: 'white', size: 'tall' });
    if (lines[1]) p.print(9, 5, lines[1], { color: 'blue', bg: 'white' });
  } else {
    p.print(8, 5, e.name, { color: 'blue', bg: 'white', size: e.name.length <= 15 ? 'double' : 'tall' });
    p.print(9, 5, e.first, { color: 'black', bg: 'white' });
  }
  if (e.activity) p.print(10, 5, e.activity, { color: 'red', bg: 'white' });
  p.print(12, 5, e.street, { color: 'black', bg: 'white' });
  p.print(13, 5, `${e.postcode} ${e.town.toUpperCase()}`, { color: 'black', bg: 'white' });
  p.moveTo(15, 5).bg('white').color('black').mosaic(new Array(30).fill(0b000011));
  p.print(17, 5, e.phone, { color: 'red', bg: 'white', size: 'double' });

  // Dialling from elsewhere: 16 for the province, 16 (1) for Paris.
  const paris = e.phone.startsWith('(1)');
  p.print(20, 2, paris ? 'Depuis la province :' : 'Depuis Paris et sa région :', { color: 'cyan' });
  p.print(21, 2, `16 ${e.phone}`, { color: 'yellow' });
  const hints = [];
  if (index < list.length - 1) hints.push(['SUITE', 'suivant']);
  if (index > 0) hints.push(['RETOUR', 'précédent']);
  p.hints(23, hints);
  p.hints(24, [['ENVOI', 'liste'], ['SOMMAIRE', 'autre recherche']]);
  return p;
}

/** Card loop; returns the index to show in the list, or null for a new search. */
async function card(session, query, list, index) {
  let draw = true;
  for (;;) {
    if (draw) session.write(cardPage(session, query, list, index));
    draw = true;
    const k = await session.waitKey(['SUITE', 'RETOUR', 'ENVOI', 'SOMMAIRE', 'GUIDE', 'REPETITION']);
    if (k === 'SOMMAIRE') return null;
    if (k === 'ENVOI') return index;
    if (k === 'GUIDE') await help(session);
    else if (k === 'SUITE' && index < list.length - 1) index++;
    else if (k === 'RETOUR' && index > 0) index--;
    else if (k === 'RETOUR') return index;
    else if (k !== 'REPETITION') {
      session.write(new Videotex().bell());
      draw = false;
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

export default {
  code: 'ANNUAIRE',
  number: '3611',
  direct: true,
  name: 'Annuaire électronique',
  description: "L'annuaire de tous les abonnés au téléphone",
  async run(session) {
    const values = { ...EMPTY };
    let message = null;
    let index = 0;
    // A direct service: returning would hang up, so only CONNEXION FIN ends it.
    for (;;) {
      session.write(homePage(session, message));
      const fields = FORM.map((f) => ({ ...f, color: 'white', value: values[f.name] }));
      const result = await session.form(fields, { index });
      Object.assign(values, result.values);
      index = result.index;
      message = null;
      if (result.key === 'SOMMAIRE') {
        Object.assign(values, EMPTY);
        index = 0;
        continue;
      }
      if (result.key === 'GUIDE') {
        const chosen = await guide(session, FORM[index].name, values);
        if (chosen) {
          values[chosen.name] = chosen.value;
          index = FORM.findIndex((f) => f.name === chosen.name);
        }
        continue;
      }
      if (result.key !== 'ENVOI') continue;
      const parsed = parseQuery(values);
      if (parsed.error) {
        message = { lines: parsed.error };
        index = parsed.index;
        session.write(new Videotex().bell());
        continue;
      }
      if (await results(session, parsed.query) === 'new') {
        Object.assign(values, EMPTY);
        index = 0;
      }
    }
  },
};
