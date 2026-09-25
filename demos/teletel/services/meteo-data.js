/**
 * 3615 METEO — data: cities, climate normals and a deterministic weather
 * generator seeded by the date, plus the texts of the national bulletin.
 *
 * The weather follows "episodes" of four days (anticyclone, Atlantic front,
 * unsettled north-westerly flow, stormy southerly flow, Mediterranean
 * episode, cold wave) chosen according to the season. Within an episode the
 * systems move from west to east, so today, tomorrow and the day after are
 * consistent with each other, and every consultation of the same day gives
 * the same forecast.
 */

/* ---------------------------------------------------------------------- */
/* Dates                                                                   */
/* ---------------------------------------------------------------------- */

export const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Local calendar day as an integer (days since 1970-01-01). */
export function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
}

/** Date object (UTC midnight) of a day number. */
export function dayDate(day) {
  return new Date(day * 864e5);
}

/** "mardi 25 septembre" */
export function longDate(day) {
  const d = dayDate(day);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function weekday(day) {
  return DAYS[dayDate(day).getUTCDay()];
}

function dayOfYear(day) {
  const d = dayDate(day);
  return Math.floor((day * 864e5 - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
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
    h ^= 0x9e37;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG seeded from any values. */
export function rng(...seed) {
  let a = hash(...seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random number in [0, 1) for a seed. */
const rand = (...seed) => rng(...seed)();

/* ---------------------------------------------------------------------- */
/* Cities                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * normals: [January min, January max, July min, July max] in °C.
 * coast: wind exposure; south: Mediterranean shelter from Atlantic rain;
 * valley: prone to morning fog; wind: local wind names by flow.
 */
export const CITIES = [
  { name: 'Paris', lat: 48.86, lon: 2.35, normals: [3, 7, 16, 25], region: 'idf', valley: 0.3 },
  { name: 'Lille', lat: 50.63, lon: 3.06, normals: [1, 6, 13, 23], region: 'nord', valley: 0.3 },
  { name: 'Strasbourg', lat: 48.58, lon: 7.75, normals: [-1, 4, 14, 26], region: 'est', valley: 0.6 },
  { name: 'Brest', lat: 48.39, lon: -4.49, normals: [4, 9, 12, 20], region: 'bretagne', coast: 1 },
  { name: 'Nantes', lat: 47.22, lon: -1.55, normals: [3, 9, 14, 25], region: 'loire', coast: 0.4 },
  { name: 'Lyon', lat: 45.76, lon: 4.84, normals: [0, 6, 16, 28], region: 'rhone', valley: 0.7, bise: 1 },
  { name: 'Bordeaux', lat: 44.84, lon: -0.58, normals: [3, 10, 15, 27], region: 'aquitaine', valley: 0.4 },
  { name: 'Toulouse', lat: 43.6, lon: 1.44, normals: [2, 10, 16, 28], region: 'midi', autan: 1 },
  { name: 'Marseille', lat: 43.3, lon: 5.37, normals: [3, 12, 20, 30], region: 'provence', south: 1, mistral: 1 },
  { name: 'Nice', lat: 43.7, lon: 7.26, normals: [6, 13, 20, 27], region: 'provence', south: 1, coast: 0.3 },
  { name: 'Ajaccio', lat: 41.93, lon: 8.74, normals: [4, 14, 17, 28], region: 'corse', south: 1, coast: 0.5 },
  { name: 'Rennes', lat: 48.11, lon: -1.68, normals: [2, 8, 13, 24], region: 'bretagne' },
  { name: 'Rouen', lat: 49.44, lon: 1.1, normals: [1, 7, 12, 23], region: 'normandie', valley: 0.4 },
  { name: 'Dijon', lat: 47.32, lon: 5.04, normals: [-1, 5, 14, 26], region: 'bourgogne', valley: 0.5, bise: 1 },
  { name: 'Clermont-Fd', lat: 45.78, lon: 3.08, normals: [-1, 7, 13, 27], region: 'massif', valley: 0.5, alt: 1 },
  { name: 'Limoges', lat: 45.83, lon: 1.26, normals: [0, 8, 13, 25], region: 'massif', valley: 0.4, alt: 1 },
  { name: 'Montpellier', lat: 43.61, lon: 3.88, normals: [3, 12, 19, 29], region: 'languedoc', south: 1, mistral: 0.6 },
  { name: 'Biarritz', lat: 43.48, lon: -1.56, normals: [5, 12, 16, 24], region: 'aquitaine', coast: 0.7 },
];

/** Areas named in the bulletin, TV-forecast style, in reading order (north-west first). */
export const REGIONS = {
  bretagne: 'la Bretagne',
  normandie: 'la Normandie',
  nord: 'le Nord',
  idf: "l'Ile-de-France",
  loire: 'les Pays de la Loire',
  est: 'le Nord-Est',
  bourgogne: 'la Bourgogne',
  massif: 'le Massif central',
  rhone: 'la région lyonnaise',
  aquitaine: "l'Aquitaine",
  midi: 'le Toulousain',
  languedoc: 'le Languedoc',
  provence: 'la Provence',
  corse: 'la Corse',
};

/* ---------------------------------------------------------------------- */
/* Weather generator                                                       */
/* ---------------------------------------------------------------------- */

const EPISODE_DAYS = 4;

/** Episode weights by month (0 = January). */
const SEASON = {
  anticyclone: [3, 3, 3, 3, 3, 4, 5, 5, 4, 3, 2, 3],
  atlantic: [4, 4, 3, 3, 2, 2, 1, 1, 2, 4, 5, 4],
  unsettled: [2, 2, 3, 3, 2, 1, 1, 1, 1, 2, 2, 2],
  southerly: [0, 0, 0, 1, 2, 3, 3, 3, 2, 1, 0, 0],
  mediterranean: [0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 2, 1],
  coldwave: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2],
};

/** Episode in force on a day: { type, phase 0..3, seed }. */
export function episode(day) {
  const index = Math.floor(day / EPISODE_DAYS);
  const phase = day - index * EPISODE_DAYS;
  const month = dayDate(index * EPISODE_DAYS).getUTCMonth();
  const weights = Object.entries(SEASON).map(([type, w]) => [type, w[month]]);
  let pick = rand('episode', index) * weights.reduce((a, [, w]) => a + w, 0);
  let type = 'anticyclone';
  for (const [t, w] of weights) {
    if (pick < w) { type = t; break; }
    pick -= w;
  }
  return { type, phase, index };
}

/** Seasonal normal (min, max) of a city on a day, cosine between January and July. */
function normal(city, day) {
  const s = (1 - Math.cos((2 * Math.PI * (dayOfYear(day) - 20)) / 365)) / 2;
  const [jn, jx, un, ux] = city.normals;
  return { min: jn + (un - jn) * s, max: jx + (ux - jx) * s, s };
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Eight compass points, clockwise from the north. */
const COMPASS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];

/**
 * Forecast for a city on a day:
 * { type, min, max, rain (0..100 %), hourly[8] (% per 3 h), wind: { dir, speed, gust, name } }
 */
export function forecast(city, day) {
  const ep = episode(day);
  const r = rng('city', city.name, day);
  const n = normal(city, day);
  const winter = 1 - n.s; // 1 in January, 0 in July
  // West -> east coordinate, fronts arrive first in the north-west.
  const u = (city.lon + 5 - (city.lat - 46) * 0.9) / 15;
  const north = (city.lat - 42) / 9;
  let cloud = 0.2;
  let rain = 0;
  let storm = false;
  let fog = false;
  let anomaly = (rand('anom', ep.index) - 0.5) * 4 + (rand('anomd', day) - 0.5) * 2;
  let wind = { dir: 6, speed: 15 };
  let peak = 15; // hour of the rain peak
  const t = ep.phase;
  switch (ep.type) {
    case 'anticyclone':
      cloud = 0.05 + r() * 0.3 + (north > 0.7 ? 0.15 : 0);
      fog = winter > 0.35 && r() < (city.valley || 0) * 0.9;
      anomaly += 1.5 - winter * 1.5;
      wind = { dir: r() < 0.5 ? 0 : 1, speed: 8 + r() * 10 };
      break;
    case 'atlantic': {
      const front = -0.25 + t * 0.42 + rand('front', ep.index) * 0.1;
      const d = u - front;
      const band = Math.exp(-((d / 0.16) ** 2));
      rain = band * (0.55 + 0.45 * north) + (d < -0.15 ? 0.3 * Math.exp(d * 2) : 0);
      cloud = d > 0.45 ? 0.3 : d > 0.1 ? 0.75 : d > -0.15 ? 0.95 : 0.55;
      if (city.south) rain *= 0.25;
      peak = Math.round(12 - d * 60);
      anomaly += d > 0 ? 1.5 : -1;
      wind = { dir: d > 0 ? 5 : 6, speed: 20 + band * 25 + r() * 10 };
      break;
    }
    case 'unsettled':
      cloud = 0.55 + r() * 0.3;
      rain = (0.25 + r() * 0.45) * (0.4 + 0.7 * north) * (city.south ? 0.3 : 1);
      peak = 14 + Math.round(r() * 4);
      anomaly -= 2.5;
      wind = { dir: 7, speed: 25 + r() * 15 };
      break;
    case 'southerly': {
      const line = 0.1 + t * 0.35;
      const d = u - line + (0.5 - north) * 0.4;
      storm = Math.abs(d) < 0.13 && r() < 0.75;
      rain = storm ? 0.55 + r() * 0.35 : d < -0.2 ? 0.2 * r() : 0;
      cloud = storm ? 0.8 : d < 0 ? 0.5 : 0.2;
      peak = 17 + Math.round(r() * 5);
      anomaly += 4.5 - (d < -0.2 ? 3 : 0);
      wind = { dir: 4, speed: 10 + r() * 10 };
      break;
    }
    case 'mediterranean': {
      const south = city.south || ['rhone', 'massif', 'midi'].includes(city.region) ? 1 : 0;
      const east = city.lon > 2.5 ? 1 : 0.4;
      rain = south * east * (0.5 + r() * 0.4) * (t === 3 ? 0.4 : 1);
      storm = rain > 0.55 && r() < 0.6;
      cloud = south ? 0.9 : 0.35 + (city.lon > 3 ? 0.3 : 0);
      peak = 6 + Math.round(r() * 12);
      anomaly += 1;
      wind = { dir: 3, speed: 15 + south * 25 };
      break;
    }
    case 'coldwave': {
      const east = smoothstep(-1, 7, city.lon) * (city.south ? 0.4 : 1);
      anomaly -= (4 + east * 3) * (city.south ? 0.6 : 1);
      cloud = 0.15 + east * 0.5 * r();
      rain = east > 0.5 && r() < 0.35 ? 0.4 + r() * 0.3 : 0;
      peak = 10 + Math.round(r() * 6);
      wind = { dir: 1, speed: 15 + r() * 15 };
      break;
    }
    default:
      break;
  }
  if (city.alt) anomaly -= 0.5;
  rain = Math.max(0, Math.min(1, rain + (r() - 0.5) * 0.08));
  cloud = Math.max(0, Math.min(1, cloud + (r() - 0.5) * 0.1));

  // Temperatures: clouds keep the night mild and the afternoon cool.
  let max = n.max + anomaly - cloud * 2.5 - rain * 2 + (r() - 0.5) * 1.5;
  let min = n.min + anomaly * 0.7 + cloud * 1.5 - (fog ? 1 : 0) + (r() - 0.5) * 1.5;
  if (min > max - 2) min = max - 2 - r() * 2;
  max = Math.round(max);
  min = Math.round(min);

  let type;
  if (rain > 0.5) type = storm ? 'storm' : max <= 2 ? 'snow' : 'rain';
  else if (rain > 0.25) type = max <= 2 ? 'snow' : storm ? 'storm' : 'showers';
  else if (fog) type = 'fog';
  else if (cloud > 0.72) type = 'cloudy';
  else if (cloud > 0.38) type = 'partly';
  else type = 'sun';

  // Rain probability through the day, in 3-hour slots.
  const chance = Math.round(Math.min(95, rain * 100 + cloud * 12));
  const hourly = Array.from({ length: 8 }, (_, i) => {
    const h = i * 3 + 1.5;
    const spread = type === 'rain' ? 7 : 4;
    const shape = Math.exp(-(((h - peak) / spread) ** 2));
    return Math.max(0, Math.min(100, Math.round(chance * (0.25 + 0.75 * shape) + (r() - 0.5) * 8)));
  });

  // Wind: exposure and local winds.
  let speed = wind.speed * (1 + (city.coast || 0) * 0.5);
  let name = null;
  const dir = wind.dir;
  if (city.mistral && (dir === 7 || dir === 0 || dir === 6) && ep.type !== 'anticyclone') {
    speed = 40 + r() * 25 * city.mistral;
    name = city.name === 'Marseille' ? 'mistral' : 'tramontane';
  } else if (city.autan && (dir === 3 || dir === 4)) {
    speed = 35 + r() * 20;
    name = "vent d'autan";
  } else if (city.bise && (dir === 0 || dir === 1) && speed > 12) {
    name = 'bise';
  }
  speed = Math.round(speed / 5) * 5;
  const gust = Math.round((speed * (storm ? 2.1 : 1.5)) / 5) * 5;
  return {
    city, day, type, min, max, rain: chance, hourly, fog, storm,
    wind: { dir, speed: Math.max(5, speed), gust, name, label: COMPASS[dir] },
    episode: ep,
  };
}

/** Forecast for every city on a day. */
export function nationalForecast(day) {
  return CITIES.map((c) => forecast(c, day));
}

/* ---------------------------------------------------------------------- */
/* Sun                                                                     */
/* ---------------------------------------------------------------------- */

/** Last Sunday of a month (UTC day number). */
function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return Math.floor(last.getTime() / 864e5) - last.getUTCDay();
}

/** Legal time offset in France, in minutes (summer time since 1976). */
export function utcOffset(day) {
  const year = dayDate(day).getUTCFullYear();
  return day >= lastSunday(year, 2) && day < lastSunday(year, 9) ? 120 : 60;
}

const hm = (minutes) => {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

/** Sunrise and sunset, local legal time: { rise: '7h41', set: '19h32', length } */
export function sunTimes(day, lat, lon) {
  const g = ((2 * Math.PI) / 365) * (dayOfYear(day) - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const phi = (lat * Math.PI) / 180;
  const cosH = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
  const H = (Math.acos(Math.max(-1, Math.min(1, cosH))) * 180) / Math.PI;
  const offset = utcOffset(day);
  const rise = 720 - 4 * (lon + H) - eq + offset;
  const set = 720 - 4 * (lon - H) - eq + offset;
  return { rise: hm(rise), set: hm(set), length: hm(set - rise), minutes: set - rise };
}

/* ---------------------------------------------------------------------- */
/* Bulletin                                                                */
/* ---------------------------------------------------------------------- */

const join = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const SITUATION = {
  anticyclone: [
    "L'anticyclone des Açores étend son influence sur la France et maintient un temps sec et calme.",
    "Des hautes pressions s'installent durablement sur le pays : le temps reste stable.",
  ],
  atlantic: [
    'Une perturbation atlantique aborde les côtes bretonnes. Elle gagnera le Nord-Est demain.',
    "La perturbation atlantique traverse le pays d'ouest en est, suivie d'un ciel de traîne.",
    "La perturbation s'évacue vers l'Alsace et la Suisse ; un temps de traîne lui succède.",
    "Un faible regain de hautes pressions précède une nouvelle perturbation, attendue sur l'Atlantique.",
  ],
  unsettled: [
    "Un flux de nord-ouest frais et instable s'établit sur le pays, à l'arrière d'une dépression centrée sur la mer du Nord.",
  ],
  southerly: [
    "Une remontée d'air chaud et lourd d'origine saharienne concerne la France ; le temps devient orageux.",
  ],
  mediterranean: [
    'Une dépression sur le golfe du Lion dirige un flux de sud très humide vers le Languedoc et la vallée du Rhône : épisode cévenol.',
  ],
  coldwave: [
    "Un anticyclone centré sur la Scandinavie dirige de l'air froid continental vers la France.",
  ],
};

const SKY = {
  storm: (w) => `Orages parfois violents sur ${w}, avec grêle et fortes pluies.`,
  rain: (w) => `Temps pluvieux sur ${w}.`,
  snow: (w) => `Neige sur ${w}, parfois jusqu'en plaine.`,
  showers: (w) => `Averses et éclaircies sur ${w}.`,
  fog: (w) => `Brouillards tenaces sur ${w}.`,
  cloudy: (w) => `Ciel gris et chargé sur ${w}.`,
  partly: (w) => `Nuages et éclaircies sur ${w}.`,
  sun: (w) => `Grand soleil sur ${w}.`,
};
/** The most widespread weather, said of the rest of the country. */
const ELSEWHERE = {
  storm: 'le temps sera orageux.',
  rain: 'la pluie sera au rendez-vous.',
  snow: 'la neige tombera par moments.',
  showers: 'averses et éclaircies alterneront.',
  fog: 'brouillards et grisaille domineront.',
  cloudy: 'le ciel restera souvent gris.',
  partly: 'nuages et éclaircies se partageront le ciel.',
  sun: 'le soleil brillera généreusement.',
};
const ORDER = ['storm', 'rain', 'snow', 'showers', 'fog', 'cloudy', 'partly', 'sun'];

/**
 * Sky sentences for a day: areas grouped by their dominant weather, the
 * most severe first, at most three groups before "ailleurs".
 */
function skyText(list) {
  const byRegion = {};
  for (const f of list) {
    const k = f.city.region;
    if (!byRegion[k] || ORDER.indexOf(f.type) < ORDER.indexOf(byRegion[k])) byRegion[k] = f.type;
  }
  const groups = {};
  for (const [region, type] of Object.entries(byRegion)) (groups[type] ||= []).push(region);
  const types = ORDER.filter((t) => groups[t]);
  const widest = types.reduce((a, t) => (groups[t].length > groups[a].length ? t : a), types[0]);
  const named = types.filter((t) => t !== widest).slice(0, 3);
  const sentences = named.map((t) => SKY[t](join(Object.keys(REGIONS).filter((k) => groups[t].includes(k)).map((k) => REGIONS[k]))));
  sentences.push(named.length ? `Ailleurs, ${ELSEWHERE[widest]}` : `Sur l'ensemble du pays, ${ELSEWHERE[widest]}`);
  return sentences.join(' ');
}

/** "d'ouest", "de nord-est" */
const from = (label) => (/^[aeiou]/.test(label) ? `d'${label}` : `de ${label}`);

function temperatureText(list, day) {
  const mins = list.map((f) => f.min);
  const maxs = list.map((f) => f.max);
  const gap = list.reduce((a, f) => a + f.max - normal(f.city, day).max, 0) / list.length;
  const trend = gap > 2 ? 'au-dessus des normales saisonnières' : gap < -2 ? 'en dessous des normales saisonnières' : 'proches des normales saisonnières';
  return `Températures minimales de ${Math.min(...mins)} à ${Math.max(...mins)} degrés, maximales de ${Math.min(...maxs)} à ${Math.max(...maxs)} degrés, ${trend}.`;
}

function windText(list) {
  const named = list.filter((f) => f.wind.name && f.wind.speed >= 30);
  const strong = list.filter((f) => f.wind.gust >= 60).sort((a, b) => b.wind.gust - a.wind.gust);
  if (named.length) {
    const f = named[0];
    return `${cap(f.wind.name)} soufflant jusqu'à ${f.wind.gust} km/h en rafales sur ${REGIONS[f.city.region]}.`;
  }
  if (strong.length) return `Vent ${from(strong[0].wind.label)} assez fort, rafales à ${strong[0].wind.gust} km/h sur ${REGIONS[strong[0].city.region]}.`;
  const avg = list.reduce((a, f) => a + f.wind.speed, 0) / list.length;
  return avg < 15 ? "Vent faible sur l'ensemble du pays." : `Vent ${from(list[0].wind.label)} modéré.`;
}

const TREND = {
  anticyclone: 'temps sec et bien ensoleillé, après dissipation des brumes matinales.',
  atlantic: "passage d'une perturbation, suivie d'un temps plus frais et variable.",
  unsettled: 'temps frais et instable, averses fréquentes près de la Manche.',
  southerly: 'chaleur lourde et orages en fin de journée.',
  mediterranean: 'pluies abondantes sur le pourtour méditerranéen, temps doux ailleurs.',
  coldwave: 'froid sec, fortes gelées au lever du jour.',
};

/** Sea state and mountain texts. */
function seaText(list) {
  const brest = list.find((f) => f.city.name === 'Brest');
  const nice = list.find((f) => f.city.name === 'Nice');
  const lille = list.find((f) => f.city.name === 'Lille');
  const beaufort = (kmh) => Math.max(1, Math.min(10, Math.round(Math.cbrt((kmh / 3.01) ** 2)))); // km/h -> Beaufort
  const state = (b) => (b >= 7 ? 'forte' : b >= 5 ? 'agitée' : b >= 3 ? 'peu agitée' : 'belle');
  const abbr = (label) => label.split('-').map((w) => (w === 'ouest' ? 'O' : w[0].toUpperCase())).join('');
  const line = (name, f) => {
    const b = beaufort(f.wind.speed);
    return `${name} : ${abbr(f.wind.label)} ${b}, mer ${state(b)}.`;
  };
  return [line('Manche', lille), line('Atlantique', brest), line('Méditerranée', nice)];
}

function mountainText(list) {
  const lyon = list.find((f) => f.city.name === 'Lyon');
  const toulouse = list.find((f) => f.city.name === 'Toulouse');
  const iso = (f) => Math.max(500, Math.round((f.max * 120 + 600) / 100) * 100);
  const snow = (f) => (['rain', 'showers', 'storm', 'snow'].includes(f.type) ? `, neige dès ${Math.max(300, iso(f) - 300)} m` : '');
  return [
    `Alpes : isotherme 0° à ${iso(lyon)} m${snow(lyon)}.`,
    `Pyrénées : isotherme 0° à ${iso(toulouse)} m${snow(toulouse)}.`,
  ];
}

/**
 * National bulletin: [[heading, text], ...] sections, in reading order.
 */
export function bulletin(day) {
  const today = nationalForecast(day);
  const tomorrow = nationalForecast(day + 1);
  const ep = episode(day);
  const ep1 = episode(day + 2);
  const situation = SITUATION[ep.type][ep.type === 'atlantic' ? ep.phase : ep.index % SITUATION[ep.type].length];
  const paris = CITIES[0];
  const sun = sunTimes(day, paris.lat, paris.lon);
  const delta = Math.round(sun.minutes - sunTimes(day - 1, paris.lat, paris.lon).minutes);
  return [
    ['SITUATION GENERALE', situation],
    [`AUJOURD'HUI ${weekday(day).toUpperCase()}`, `${skyText(today)} ${windText(today)}`],
    ['TEMPERATURES', temperatureText(today, day)],
    [`DEMAIN ${weekday(day + 1).toUpperCase()}`, `${skyText(tomorrow)} ${temperatureText(tomorrow, day + 1)}`],
    [`TENDANCE ${weekday(day + 2).toUpperCase()} ET ${weekday(day + 3).toUpperCase()}`, cap(TREND[ep1.type])],
    ['BULLETIN COTIER', seaText(today).join('\n')],
    ['MONTAGNE', mountainText(today).join('\n')],
    ['EPHEMERIDE', `Paris : soleil levé à ${sun.rise}, couché à ${sun.set}. Durée du jour ${sun.length} (${delta >= 0 ? '+' : ''}${delta} min).`],
  ];
}
