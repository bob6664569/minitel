/**
 * 3611 ANNUAIRE — the electronic telephone directory, answering 3611
 * directly (no kiosk).
 *
 *   Form: Nom (or Rubrique), Localité (or Département) -> ENVOI
 *   -> list of subscribers (zebra, SUITE / RETOUR) -> card per entry.
 *
 * White pages for people, yellow pages for professions. Subscribers are
 * fictional, generated from embedded tables (annuaire-data.js), with
 * 8-digit numbers of the 1985-1996 numbering plan.
 */
import { Page, pad, wrap } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import {
  DEPARTMENTS, findLocality, findDepartment, findRubrique, townsOf, searchName, searchRubrique, key,
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
  p.print(6, 2, 'NOM', { color: 'yellow' });
  p.print(6, 13, "nom de famille ou raison", { color: 'white' });
  p.print(7, 13, 'sociale : DUPONT, MARTIN', { color: 'white' });
  p.print(9, 2, 'RUBRIQUE', { color: 'yellow' });
  p.print(9, 13, 'une profession : PLOMBIER,', { color: 'white' });
  p.print(10, 13, 'MEDECIN, RESTAURANT...', { color: 'white' });
  p.print(12, 2, 'LOCALITE', { color: 'yellow' });
  p.print(12, 13, 'la commune : LYON, BREST', { color: 'white' });
  p.print(14, 2, 'DEPT.', { color: 'yellow' });
  p.print(14, 13, 'ou le département : 33', { color: 'white' });
  const keys = [['SUITE', 'champ suivant'], ['RETOUR', 'champ précédent'], ['ANNULATION', 'effacer le champ'], ['ENVOI', 'lancer la recherche']];
  keys.forEach(([name, text], i) => {
    p.key(16 + i, 2, pad(name, 10, 'center'));
    p.print(16 + i, 16, text, { color: 'cyan' });
  });
  p.panel(21, 2, 22, 38, { bg: 'blue' });
  p.print(21, 4, 'Gratuit les 3 premières minutes,', { color: 'white', bg: 'blue' });
  p.print(22, 4, 'puis 0,12 F la minute.', { color: 'white', bg: 'blue' });
  p.hints(24, [['RETOUR', 'revenir à la page']]);
  session.write(p);
  await session.waitKey();
}

/* ---------------------------------------------------------------------- */
/* Search form                                                             */
/* ---------------------------------------------------------------------- */

const FORM = [
  { name: 'nom', row: 9, col: 15, length: 24, uppercase: true },
  { name: 'rubrique', row: 11, col: 15, length: 24, uppercase: true },
  { name: 'localite', row: 14, col: 15, length: 24, uppercase: true },
  { name: 'dept', row: 16, col: 15, length: 2, uppercase: true, accept: /[0-9AB]/i },
];

function homePage(session, message) {
  const p = new Page().clear().cursor(false);
  status(p, session);
  p.band(1, { bg: 'white', rows: 5 });
  p.bigText(2, 2, '3611', { color: 'blue', background: 'white' });
  p.art(2, 15, PHONE, { ink: 'black', background: 'white' });
  p.print(3, 24, 'ANNUAIRE', { color: 'black', bg: 'white', size: 'double' });
  p.print(5, 17, 'E L E C T R O N I Q U E', { color: 'red', bg: 'white' });
  p.hline(6, { color: 'white', style: 'top' });
  p.label(7, 2, 'GRATUIT', { color: 'white', bg: 'red' });
  p.print(7, 12, 'les 3 premières minutes', { color: 'yellow' });

  p.print(9, 2, 'NOM', { color: 'cyan' });
  p.print(10, 2, 'ou raison sociale', { color: 'blue' });
  p.print(11, 2, 'ou RUBRIQUE', { color: 'cyan' });
  p.print(12, 2, 'profession', { color: 'blue' });
  p.hline(13, { col: 2, width: 37, color: 'blue', style: 'middle' });
  p.print(14, 2, 'LOCALITE', { color: 'cyan' });
  p.print(16, 2, 'ou DEPT.', { color: 'cyan' });
  p.print(16, 19, 'numéro (ex. 69)', { color: 'blue' });

  if (message) {
    p.panel(18, 2, 19 + message.lines.length - 1, 38, { bg: message.bg || 'red' });
    message.lines.forEach((text, i) => p.print(18 + i, 4, text, { color: 'white', bg: message.bg || 'red' }));
  } else {
    p.print(18, 2, 'Exemples :', { color: 'white' });
    p.print(18, 13, 'MARTIN', { color: 'yellow' });
    p.print(18, 21, 'à', { color: 'white' });
    p.print(18, 23, 'LYON', { color: 'yellow' });
    p.print(19, 13, 'PLOMBIER', { color: 'yellow' });
    p.print(19, 22, 'dans le', { color: 'white' });
    p.print(19, 30, '33', { color: 'yellow' });
  }
  p.hints(22, [['SUITE', 'champ suivant'], ['GUIDE', 'aide']]);
  p.print(24, 2, 'Lancez la recherche', { color: 'white' });
  p.key(24, 33, 'ENVOI');
  return p;
}

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
      else lines.push('Ex. PLOMBIER, MEDECIN, TAXI');
      return { error: lines, index: 1 };
    }
    rubrique = found.rubrique;
  } else if (key(nom).length < 2) {
    return { error: ['Nom trop court : 2 lettres minimum.'], index: 0 };
  }
  const loc = values.localite.trim();
  const dept = values.dept.trim();
  let towns;
  let place;
  let town = null;
  let deptCode = null;
  if (loc) {
    const found = findLocality(loc);
    if (!found.town) {
      const lines = [`Localité inconnue : ${loc}`.slice(0, 34)];
      if (found.suggestions.length) lines.push(...wrap(`Voulez-vous dire ${found.suggestions.map((t) => t.name.toUpperCase()).join(', ')} ?`, 34).slice(0, 2));
      else lines.push('Précisez le département.');
      return { error: lines, index: 2 };
    }
    town = found.town;
    towns = [town];
    deptCode = town.dept;
    place = `${town.name.toUpperCase()} (${town.dept})`;
  } else if (dept) {
    deptCode = findDepartment(dept);
    if (!deptCode) return { error: [`Département inconnu : ${dept}`], index: 3 };
    towns = townsOf(deptCode);
    place = `${DEPARTMENTS[deptCode][0].toUpperCase()} (${deptCode})`;
  } else {
    return { error: ['Indiquez la LOCALITE', 'ou le DEPARTEMENT.'], index: 2 };
  }
  return { query: { nom: key(nom), rubrique, towns, town, dept: deptCode, place } };
}

/* ---------------------------------------------------------------------- */
/* Results                                                                 */
/* ---------------------------------------------------------------------- */

const titleOf = (query) => (query.rubrique ? query.rubrique.name : query.nom);
const nameOf = (entry) => (entry.business ? entry.name : `${entry.name} ${entry.first}`);
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
    const phoneWidth = e.phone.length;
    const nameWidth = 40 - 5 - phoneWidth - 2;
    const name = e.business ? e.name : e.name;
    p.moveTo(row, 1).bg(bg).color('yellow').invert(true).text(` ${i + 1} `).invert(false)
      .color('white').text(' ').text(pad(name, Math.min(nameWidth, name.length)));
    if (!e.business) p.color('cyan').text(pad(` ${e.first}`, Math.max(0, nameWidth - name.length)));
    else p.text(' '.repeat(Math.max(0, nameWidth - name.length)));
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
  const hints = [];
  if (query.town) {
    p.panel(18, 2, 19, 38, { bg: 'blue' });
    p.print(18, 4, 'Chercher dans tout le département', { color: 'white', bg: 'blue' });
    p.print(19, 4, `${DEPARTMENTS[query.dept][0]} (${query.dept})`, { color: 'yellow', bg: 'blue' });
    p.key(19, 31, 'SUITE');
    hints.push(['SUITE', 'tout le département']);
  }
  p.hints(22, [['SOMMAIRE', 'nouvelle recherche']]);
  return p;
}

/** Results loop. Returns 'new' for a new search, 'back' to refine the form. */
async function results(session, query) {
  for (;;) {
    const list = query.rubrique ? searchRubrique(query.rubrique, query.towns) : searchName(query.nom, query.towns);
    if (!list.length) {
      session.write(noResultPage(session, query));
      const k = await session.waitKey(['SUITE', 'SOMMAIRE', 'RETOUR', 'ENVOI', 'GUIDE']);
      if (k === 'SUITE' && query.town) {
        query = { ...query, towns: townsOf(query.dept), town: null, place: `${DEPARTMENTS[query.dept][0].toUpperCase()} (${query.dept})` };
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
    const values = { nom: '', rubrique: '', localite: '', dept: '' };
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
        Object.assign(values, { nom: '', rubrique: '', localite: '', dept: '' });
        index = 0;
        continue;
      }
      if (result.key === 'GUIDE') {
        await help(session);
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
        Object.assign(values, { nom: '', rubrique: '', localite: '', dept: '' });
        index = 0;
      }
    }
  },
};
