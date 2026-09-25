/**
 * 3615 ASTRO — data: the twelve signs and the horoscope generator.
 *
 * A horoscope is built from phrase templates (an astral opener and a
 * prediction whose tone follows the day's rating), chosen with a PRNG seeded
 * by the date and the sign: the same sign always reads the same horoscope on
 * the same day.
 */

import { wrap } from '../../../src/js/service/page.js';

export const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Local calendar day as an integer (days since 1970-01-01). */
export function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
}

/** "vendredi 25 septembre" */
export function longDate(day) {
  const d = new Date(day * 864e5);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/* ---------------------------------------------------------------------- */
/* Signs                                                                   */
/* ---------------------------------------------------------------------- */

/** from / to: [month, day]. */
export const SIGNS = [
  { name: 'Bélier', of: 'du Bélier', from: [3, 21], to: [4, 19], element: 'feu', planet: 'Mars' },
  { name: 'Taureau', of: 'du Taureau', from: [4, 20], to: [5, 20], element: 'terre', planet: 'Vénus' },
  { name: 'Gémeaux', of: 'des Gémeaux', from: [5, 21], to: [6, 20], element: 'air', planet: 'Mercure' },
  { name: 'Cancer', of: 'du Cancer', from: [6, 21], to: [7, 22], element: 'eau', planet: 'la Lune' },
  { name: 'Lion', of: 'du Lion', from: [7, 23], to: [8, 22], element: 'feu', planet: 'le Soleil' },
  { name: 'Vierge', of: 'de la Vierge', from: [8, 23], to: [9, 22], element: 'terre', planet: 'Mercure' },
  { name: 'Balance', of: 'de la Balance', from: [9, 23], to: [10, 22], element: 'air', planet: 'Vénus' },
  { name: 'Scorpion', of: 'du Scorpion', from: [10, 23], to: [11, 21], element: 'eau', planet: 'Pluton' },
  { name: 'Sagittaire', of: 'du Sagittaire', from: [11, 22], to: [12, 21], element: 'feu', planet: 'Jupiter' },
  { name: 'Capricorne', of: 'du Capricorne', from: [12, 22], to: [1, 19], element: 'terre', planet: 'Saturne' },
  { name: 'Verseau', of: 'du Verseau', from: [1, 20], to: [2, 18], element: 'air', planet: 'Uranus' },
  { name: 'Poissons', of: 'des Poissons', from: [2, 19], to: [3, 20], element: 'eau', planet: 'Neptune' },
];

export const ELEMENTS = {
  feu: { label: 'Feu', color: 'red', article: 'de Feu' },
  terre: { label: 'Terre', color: 'green', article: 'de Terre' },
  air: { label: 'Air', color: 'yellow', article: "d'Air" },
  eau: { label: 'Eau', color: 'cyan', article: "d'Eau" },
};

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** "21/03 - 19/04" */
export function dateRange(sign) {
  const f = (m, d) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return `${f(...sign.from)} - ${f(...sign.to)}`;
}

/** "21 mars - 19 avril" */
export function longRange(sign) {
  const f = ([m, d]) => `${d === 1 ? '1er' : d} ${MONTH_SHORT[m - 1]}`;
  return `${f(sign.from)} - ${f(sign.to)}`;
}

/** Sign of the Sun on a day (index 0..11). */
export function sunSign(day) {
  const d = new Date(day * 864e5);
  const m = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  return SIGNS.findIndex(({ from, to }) => (m === from[0] && dd >= from[1]) || (m === to[0] && dd <= to[1]));
}

/* ---------------------------------------------------------------------- */
/* Seeded randomness                                                       */
/* ---------------------------------------------------------------------- */

function hash(...values) {
  let h = 2166136261;
  for (const v of values) {
    const s = String(v);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x5bd1;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(...seed) {
  let a = hash(...seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------------- */
/* Phrase bank                                                             */
/* ---------------------------------------------------------------------- */

/** Openers use {de} / {a}: the sign's ruler with its preposition. Tones: 0 bad, 1 neutral, 2 good. */
const TEXTS = {
  amour: {
    open: [
      ['Mars vous rend susceptible :', 'Vénus fait grise mine :', 'Mercure rétrograde :', "Saturne vous met à l'épreuve :"],
      ['Côté coeur,', 'La Lune traverse votre ciel :', 'Vénus reste discrète :', 'En amour,'],
      ['Vénus vous sourit :', 'Cupidon a sorti son arc :', 'Les astres sont avec vous :', 'Sous le regard {de},'],
    ],
    core: [
      ['évitez les sujets qui fâchent au dîner.', 'une petite brouille est vite arrivée, restez diplomate.', 'la jalousie est mauvaise conseillère.', 'ne tirez pas de conclusions hâtives.', 'un malentendu est possible : parlez franchement.', "votre partenaire réclame plus d'attention.", 'bouder ne mènera à rien, faites le premier pas.'],
      ['le calme plat, idéal pour un tête-à-tête.', "prenez le temps d'écouter l'autre.", 'pas de grande passion, mais de la tendresse.', 'un petit geste suffira à raviver la flamme.', 'laissez venir, rien ne presse.', 'une vieille connaissance refait surface.', 'une balade main dans la main vous rapprochera.'],
      ['un regard croisé pourrait chambouler votre coeur.', 'votre charme fait des ravages, profitez-en !', 'une déclaration inattendue vous fera rougir.', "complicité et fous rires avec l'être aimé.", "célibataire ? L'amour est tout proche.", "un dîner aux chandelles s'impose ce soir.", "osez dire ce que vous ressentez : c'est partagé !", 'un message inattendu sur votre Minitel vous fera sourire.'],
    ],
  },
  travail: {
    open: [
      ['Saturne freine vos ardeurs :', 'Mercure rétrograde :', "Mars vous pousse à l'impatience :", 'Pluton brouille les cartes :'],
      ['Côté travail,', 'Au bureau,', 'Mercure vous conseille :', "Sous l'oeil {de},"],
      ['Jupiter booste votre carrière :', 'Mercure vous inspire :', 'Le Soleil éclaire vos projets :', 'Grâce {a},'],
    ],
    core: [
      ['remettez les grandes décisions à plus tard.', 'un collègue grincheux pourrait vous agacer.', 'vérifiez deux fois vos chiffres.', 'le téléphone sonne sans arrêt, gardez votre calme.', 'une tâche ingrate vous tombe dessus.', 'ne signez rien sans avoir tout relu.', "la photocopieuse vous en veut aujourd'hui : patience !"],
      ['une journée de routine, sans mauvaise surprise.', 'classez vos dossiers, cela servira bientôt.', 'patience, vos efforts porteront leurs fruits.', 'soignez les détails, on vous observe.', "une réunion s'éternise, gardez le sourire.", 'un bon moment pour apprendre du nouveau.', 'rangez votre bureau, les idées suivront.'],
      ['une promotion pourrait bien se profiler.', 'vos idées font mouche en réunion.', 'votre patron remarque enfin vos efforts.', 'un projet en sommeil redémarre en trombe.', "c'est le jour pour demander une augmentation !", "une rencontre professionnelle s'annonce fructueuse.", "votre sens de l'organisation fait des miracles."],
    ],
  },
  sante: {
    core: [
      ["Petit coup de fatigue : une sieste s'impose.", "Gare aux courants d'air et aux excès de table.", 'Stress en hausse : respirez profondément.', 'Jambes lourdes : levez le pied ce soir.', 'Migraine en vue, fuyez le bruit.'],
      ["Buvez de l'eau et couchez-vous tôt.", 'Un peu de vitamine C ne vous fera pas de mal.', 'Forme correcte, mais ménagez votre dos.', 'Une tisane ce soir et tout ira bien.', 'Une promenade digestive vous fera du bien.', "Une cure de vitamines et de grand air s'impose."],
      ["Vous débordez d'énergie : pourquoi pas un footing ?", 'Forme olympique ! Le Soleil vous recharge.', "Teint éclatant et moral d'acier.", 'Excellente vitalité : dansez, nagez, bougez !', 'Sommeil réparateur et bonne mine garantis.', 'Moral au beau fixe : vous rayonnez !'],
    ],
  },
};

const MOODS = [
  ['Grognonne', 'Distraite', 'Susceptible', 'Nostalgique'],
  ['Rêveuse', 'Sereine', 'Zen', 'Songeuse', 'Tranquille'],
  ['Pétillante', 'Conquérante', 'Rayonnante', 'Taquine', 'Espiègle', 'Romantique', 'Bavarde'],
];

/** Lucky colours: Minitel colour + name. */
const COLOURS = [
  ['red', 'rouge'], ['green', 'vert'], ['yellow', 'jaune'], ['blue', 'bleu'],
  ['magenta', 'violet'], ['cyan', 'turquoise'], ['white', 'blanc'],
];

/** "de Mars", "d'Uranus", "du Soleil", "de la Lune" and "à Mars", "au Soleil"... */
const of = (planet) => {
  if (planet.startsWith('le ')) return `du ${planet.slice(3)}`;
  return /^[AEIOUY]/.test(planet) ? `d'${planet}` : `de ${planet}`;
};
const to = (planet) => (planet.startsWith('le ') ? `au ${planet.slice(3)}` : `à ${planet}`);

const tone = (stars) => (stars <= 2 ? 0 : stars === 3 ? 1 : 2);
const pick = (r, list) => list[Math.floor(r() * list.length)];

/** Opener + prediction, kept within two screen lines of `width` columns. */
function sentence(r, bank, stars, sign, width = 38) {
  const t = tone(stars);
  const core = pick(r, bank.core[t]);
  if (!bank.open) return core;
  const open = pick(r, bank.open[t]).replace('{de}', of(sign.planet)).replace('{a}', to(sign.planet));
  const full = `${open} ${core}`;
  return wrap(full, width).length <= 2 ? full : core.charAt(0).toUpperCase() + core.slice(1);
}

/**
 * Horoscope of a sign on a day:
 * { amour, travail, sante: { stars, text }, humeur: { stars, text }, chiffre, couleur }
 */
export function horoscope(signIndex, day) {
  const sign = SIGNS[signIndex];
  const r = rng('astro', day, signIndex);
  // Ratings lean positive: a horoscope should make you smile.
  const stars = () => Math.min(5, 1 + Math.floor(r() * 3) + Math.floor(r() * 2.6));
  const amour = stars();
  const travail = stars();
  const sante = stars();
  const humeur = Math.max(1, Math.min(5, Math.round((amour + travail + sante) / 3 + (r() - 0.5))));
  return {
    sign,
    amour: { stars: amour, text: sentence(r, TEXTS.amour, amour, sign) },
    travail: { stars: travail, text: sentence(r, TEXTS.travail, travail, sign) },
    sante: { stars: sante, text: sentence(r, TEXTS.sante, sante, sign) },
    humeur: { stars: humeur, text: pick(r, MOODS[tone(humeur)]) },
    chiffre: 1 + Math.floor(r() * 9),
    couleur: pick(r, COLOURS),
  };
}
