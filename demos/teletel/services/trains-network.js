/**
 * 3615 TRAINS — a small, plausible French rail network (early 1990s):
 * stations with coordinates, station name matching, and a deterministic
 * timetable generator (TGV, Rapide, Express, TER and night trains) with
 * stops, running times and fares in francs.
 */

/* ---------------------------------------------------------------------- */
/* Seeded helpers                                                          */
/* ---------------------------------------------------------------------- */

/** FNV-1a hash of a string. */
export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG: returns a function giving floats in [0, 1). */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------------- */
/* Stations                                                                */
/* ---------------------------------------------------------------------- */

/*
 * [name, lat, lon, rank, tgv, Paris terminus, full station name]
 * rank 1: regional capital, 2: large town, 3: intermediate stop.
 */
const DATA = [
  ['Paris', 48.853, 2.349, 1, true],
  ['Lille', 50.637, 3.063, 1, true, 'Nord', 'Lille Flandres'],
  ['Arras', 50.291, 2.777, 2, true, 'Nord'],
  ['Amiens', 49.894, 2.296, 2, false, 'Nord'],
  ['Creil', 49.263, 2.475, 3, false, 'Nord'],
  ['Rouen', 49.443, 1.099, 1, false, 'St-Lazare', 'Rouen Rive-Droite'],
  ['Le Havre', 49.494, 0.108, 2, false, 'St-Lazare'],
  ['Mantes-la-Jolie', 48.990, 1.717, 3, false, 'St-Lazare'],
  ['Evreux', 49.025, 1.151, 3, false, 'St-Lazare'],
  ['Lisieux', 49.146, 0.225, 3, false, 'St-Lazare'],
  ['Caen', 49.183, -0.370, 1, false, 'St-Lazare'],
  ['Cherbourg', 49.640, -1.616, 2, false, 'St-Lazare'],
  ['Chartres', 48.447, 1.488, 3, false, 'Montparnasse'],
  ['Le Mans', 48.008, 0.199, 2, true, 'Montparnasse'],
  ['Laval', 48.073, -0.770, 3, true, 'Montparnasse'],
  ['Rennes', 48.117, -1.678, 1, true, 'Montparnasse'],
  ['St-Brieuc', 48.514, -2.765, 3, true, 'Montparnasse'],
  ['Brest', 48.390, -4.486, 2, true, 'Montparnasse'],
  ['Vannes', 47.658, -2.760, 3, true, 'Montparnasse'],
  ['Quimper', 47.996, -4.102, 2, true, 'Montparnasse'],
  ['Angers', 47.471, -0.551, 2, true, 'Montparnasse', 'Angers St-Laud'],
  ['Nantes', 47.218, -1.554, 1, true, 'Montparnasse'],
  ['Tours', 47.394, 0.685, 2, true, 'Montparnasse', 'St-Pierre-des-Corps'],
  ['Orléans', 47.903, 1.909, 2, false, 'Austerlitz', 'Les Aubrais-Orléans'],
  ['Poitiers', 46.580, 0.340, 2, true, 'Montparnasse'],
  ['Niort', 46.323, -0.465, 3, true, 'Montparnasse'],
  ['La Rochelle', 46.160, -1.151, 2, true, 'Montparnasse', 'La Rochelle-Ville'],
  ['Angoulême', 45.650, 0.160, 3, true, 'Montparnasse'],
  ['Bordeaux', 44.838, -0.579, 1, true, 'Montparnasse', 'Bordeaux St-Jean'],
  ['Dax', 43.708, -1.052, 3, true, 'Montparnasse'],
  ['Biarritz', 43.459, -1.545, 2, true, 'Montparnasse'],
  ['Agen', 44.203, 0.616, 3, false, 'Montparnasse'],
  ['Montauban', 44.018, 1.355, 3, false, 'Austerlitz'],
  ['Toulouse', 43.605, 1.444, 1, true, 'Montparnasse', 'Toulouse Matabiau'],
  ['Vierzon', 47.222, 2.069, 3, false, 'Austerlitz'],
  ['Châteauroux', 46.810, 1.691, 3, false, 'Austerlitz'],
  ['Limoges', 45.834, 1.262, 1, false, 'Austerlitz', 'Limoges Bénédictins'],
  ['Brive', 45.159, 1.533, 3, false, 'Austerlitz', 'Brive-la-Gaillarde'],
  ['Cahors', 44.448, 1.441, 3, false, 'Austerlitz'],
  ['Nevers', 46.990, 3.159, 3, false, 'Lyon'],
  ['Moulins', 46.566, 3.333, 3, false, 'Lyon'],
  ['Clermont-Ferrand', 45.778, 3.087, 1, false, 'Lyon'],
  ['Dijon', 47.323, 5.027, 1, true, 'Lyon', 'Dijon-Ville'],
  ['Besançon', 47.247, 6.022, 2, true, 'Lyon', 'Besançon Viotte'],
  ['Mâcon', 46.307, 4.828, 3, true, 'Lyon'],
  ['Lyon', 45.760, 4.859, 1, true, 'Lyon', 'Lyon Part-Dieu'],
  ['St-Etienne', 45.434, 4.390, 2, true, 'Lyon', 'St-Etienne Châteaucreux'],
  ['Grenoble', 45.191, 5.715, 1, true, 'Lyon'],
  ['Chambéry', 45.566, 5.921, 2, true, 'Lyon'],
  ['Annecy', 45.899, 6.129, 2, true, 'Lyon'],
  ['Valence', 44.933, 4.892, 2, true, 'Lyon'],
  ['Avignon', 43.942, 4.806, 2, true, 'Lyon'],
  ['Nîmes', 43.833, 4.360, 2, true, 'Lyon'],
  ['Montpellier', 43.605, 3.881, 1, true, 'Lyon'],
  ['Béziers', 43.344, 3.216, 3, true, 'Lyon'],
  ['Narbonne', 43.184, 3.004, 3, true, 'Lyon'],
  ['Perpignan', 42.696, 2.879, 2, true, 'Lyon'],
  ['Marseille', 43.303, 5.380, 1, true, 'Lyon', 'Marseille St-Charles'],
  ['Toulon', 43.128, 5.930, 2, true, 'Lyon'],
  ['St-Raphaël', 43.425, 6.769, 3, true, 'Lyon'],
  ['Cannes', 43.553, 7.017, 2, true, 'Lyon'],
  ['Nice', 43.704, 7.262, 1, true, 'Lyon', 'Nice-Ville'],
  ['Reims', 49.258, 4.031, 1, false, 'Est'],
  ['Epernay', 49.040, 3.960, 3, false, 'Est'],
  ['Châlons', 48.957, 4.365, 3, false, 'Est', 'Châlons-sur-Marne'],
  ['Bar-le-Duc', 48.772, 5.160, 3, false, 'Est'],
  ['Metz', 49.110, 6.176, 1, false, 'Est', 'Metz-Ville'],
  ['Nancy', 48.690, 6.175, 1, false, 'Est', 'Nancy-Ville'],
  ['Saverne', 48.741, 7.362, 3, false, 'Est'],
  ['Strasbourg', 48.585, 7.735, 1, false, 'Est'],
  ['Troyes', 48.297, 4.074, 3, false, 'Est'],
  ['Belfort', 47.638, 6.863, 3, false, 'Est'],
  ['Mulhouse', 47.742, 7.342, 2, false, 'Est', 'Mulhouse-Ville'],
  ['Colmar', 48.079, 7.358, 3, false, 'Est'],
];

/** Uppercase letters only: 'St-Étienne' -> 'STETIENNE'. */
export function stationKey(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\bSAINTE?\b/g, (m) => (m === 'SAINTE' ? 'STE' : 'ST'))
    .replace(/[^A-Z]/g, '');
}

export const STATIONS = DATA.map(([name, lat, lon, rank, tgv, paris, full], index) => ({
  index,
  name,
  lat,
  lon,
  rank,
  tgv,
  paris,
  full: full || name,
  key: stationKey(name),
}));

const PARIS = STATIONS[0];

/** Name of the station for a trip: Paris has one terminus per direction. */
export function stationName(station, other) {
  if (station !== PARIS) return station.full;
  const terminus = (other || PARIS).paris;
  if (terminus === 'Lyon') return 'Paris Gare de Lyon';
  if (terminus === 'Est' || terminus === 'Nord') return `Paris-${terminus}`;
  return terminus ? `Paris ${terminus}` : 'Paris';
}

/** Short name for tight columns. */
export function shortName(station, other, width = 18) {
  const name = stationName(station, other);
  if (name.length <= width) return name;
  return station.name.length <= width ? station.name : station.name.slice(0, width);
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Match a typed station name (case and accent insensitive, prefixes allowed).
 * Returns { station } or { suggestions: [station...] }.
 */
export function findStation(text) {
  const key = stationKey(text);
  if (!key) return { suggestions: [] };
  const exact = STATIONS.find((s) => s.key === key || stationKey(s.full) === key);
  if (exact) return { station: exact };
  const prefix = STATIONS.filter((s) => s.key.startsWith(key));
  if (prefix.length === 1) return { station: prefix[0] };
  if (prefix.length > 1) return { suggestions: prefix.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key)).slice(0, 6) };
  const scored = STATIONS.map((s) => {
    const head = s.key.slice(0, Math.max(key.length, 3));
    return { s, d: Math.min(levenshtein(key, s.key), levenshtein(key, head) + 1) };
  }).sort((a, b) => a.d - b.d || a.s.rank - b.s.rank);
  const limit = Math.max(2, Math.ceil(key.length / 2));
  return { suggestions: scored.filter((x) => x.d <= limit).slice(0, 6).map((x) => x.s) };
}

/* ---------------------------------------------------------------------- */
/* Geometry                                                                */
/* ---------------------------------------------------------------------- */

/** Great-circle distance in km. */
export function distance(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/* ---------------------------------------------------------------------- */
/* Lines                                                                   */
/* ---------------------------------------------------------------------- */

/* Classic lines, as ordered station sequences. */
const LINES = [
  'Paris Creil Amiens Arras Lille',
  'Amiens Rouen',
  'Paris Mantes-la-Jolie Rouen Le_Havre',
  'Mantes-la-Jolie Evreux Lisieux Caen Cherbourg',
  'Rouen Lisieux',
  'Caen Rennes',
  'Caen Le_Mans',
  'Paris Chartres Le_Mans Laval Rennes St-Brieuc Brest',
  'Le_Mans Angers Nantes',
  'Tours Angers',
  'Nantes Vannes Quimper',
  'Rennes Vannes',
  'Paris Orléans Tours Poitiers Angoulême Bordeaux',
  'Poitiers Niort La_Rochelle',
  'Nantes La_Rochelle Bordeaux',
  'Bordeaux Dax Biarritz',
  'Bordeaux Agen Montauban Toulouse',
  'Toulouse Narbonne Béziers Montpellier Nîmes Avignon',
  'Narbonne Perpignan',
  'Nîmes Marseille',
  'Orléans Vierzon Châteauroux Limoges Brive Cahors Montauban',
  'Paris Nevers Moulins Clermont-Ferrand Lyon St-Etienne',
  'Paris Dijon Mâcon Lyon Valence Avignon Marseille Toulon St-Raphaël Cannes Nice',
  'Dijon Besançon Belfort Mulhouse',
  'Besançon Lyon',
  'Lyon Chambéry Annecy',
  'Lyon Grenoble',
  'Valence Grenoble Chambéry',
  'Paris Epernay Châlons Bar-le-Duc Nancy Saverne Strasbourg',
  'Epernay Reims Metz Nancy',
  'Metz Strasbourg Colmar Mulhouse',
  'Paris Troyes Belfort',
];

/* High-speed lines (LGV Sud-Est, Atlantique and Nord): TGV only. */
const LGV_LINES = ['Paris Mâcon Lyon', 'Paris Le_Mans', 'Paris Tours', 'Paris Dijon', 'Paris Arras Lille'];

const byName = new Map(STATIONS.map((s) => [s.name, s]));
const graph = new Map(STATIONS.map((s) => [s, []]));

function link(names, lgv) {
  const list = names.split(' ').map((n) => {
    const station = byName.get(n.replace(/_/g, ' '));
    if (!station) throw new Error(`Unknown station ${n}`);
    return station;
  });
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]];
    const km = Math.round(distance(a, b) * 1.15);
    graph.get(a).push({ to: b, km, lgv });
    graph.get(b).push({ to: a, km, lgv });
  }
}
LINES.forEach((l) => link(l, false));
LGV_LINES.forEach((l) => link(l, true));

/** Shortest path (Dijkstra). TGV may use high-speed lines, and prefers them. */
function route(from, to, tgv) {
  const cost = new Map([[from, 0]]);
  const prev = new Map();
  const open = new Set([from]);
  while (open.size) {
    let node = null;
    for (const n of open) if (!node || cost.get(n) < cost.get(node)) node = n;
    open.delete(node);
    if (node === to) break;
    for (const edge of graph.get(node)) {
      if (edge.lgv && !tgv) continue;
      const c = cost.get(node) + edge.km * (edge.lgv ? 0.6 : 1) + (edge.to === PARIS && !tgv ? 40 : 0);
      if (c < (cost.get(edge.to) ?? Infinity)) {
        cost.set(edge.to, c);
        prev.set(edge.to, { node, edge });
        open.add(edge.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const legs = [];
  for (let n = to; n !== from; n = prev.get(n).node) legs.unshift({ from: prev.get(n).node, ...prev.get(n).edge });
  return legs;
}

/** Rail distance between two stations along the classic network. */
export function railKm(a, b) {
  const legs = route(a, b, false);
  return legs ? legs.reduce((sum, l) => sum + l.km, 0) : Math.round(distance(a, b) * 1.2);
}

/* ---------------------------------------------------------------------- */
/* Trains                                                                  */
/* ---------------------------------------------------------------------- */

export const TYPES = Object.freeze({
  TGV: { label: 'TGV', color: 'yellow', speed: 175, lgv: 245, dwell: 3 },
  RAPIDE: { label: 'Rapide', color: 'cyan', speed: 125, dwell: 3 },
  EXPRESS: { label: 'Express', color: 'green', speed: 100, dwell: 3 },
  TER: { label: 'TER', color: 'white', speed: 82, dwell: 1 },
  NUIT: { label: 'Express', color: 'magenta', speed: 88, dwell: 5, night: true },
});

const pad2 = (n) => String(n).padStart(2, '0');

/** 452 -> '07h32' (minutes after midnight, wraps after 24 h). */
export function clock(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}h${pad2(m % 60)}`;
}

/** 124 -> '2h04' */
export function duration(minutes) {
  return `${Math.floor(minutes / 60)}h${pad2(Math.round(minutes) % 60)}`;
}

/** Fare period of a departure: bleue (off-peak), blanche, rouge (peak). */
export function period(dep, dow) {
  const h = (dep % 1440) / 60;
  if ((dow === 5 && h >= 15 && h < 20) || (dow === 0 && h >= 16 && h < 21) || (dow === 1 && h < 9)) return 'rouge';
  if ((h >= 6.5 && h < 9) || (h >= 16.5 && h < 19.5) || dow === 5 || dow === 0) return 'blanche';
  return 'bleue';
}


/* Trains crossing Paris use the interconnection station south of Paris. */
const MASSY = { name: 'Massy TGV', full: 'Massy TGV', rank: 2, tgv: true, key: 'MASSYTGV', lat: 48.726, lon: 2.260 };

const STOP_ODDS = {
  TGV: [0.95, 0.65, 0.35],
  RAPIDE: [0.95, 0.75, 0.12],
  EXPRESS: [1, 1, 0.8],
  TER: [1, 1, 1],
  NUIT: [0.9, 0.6, 0.25],
};

/**
 * The day's trains between two stations, sorted by departure time.
 * Each train: { number, type, label, color, dep, arr, minutes, km, stops: [{ station, name, time }],
 *               price1, price2, period, bar, couchettes, reservation, night }.
 * Times are minutes after midnight (arrivals may exceed 1440 for night trains).
 */
export function timetable(from, to, { dow = 2 } = {}) {
  if (!from || !to || from === to) return [];
  const classic = route(from, to, false);
  if (!classic) return [];
  const km = classic.reduce((sum, l) => sum + l.km, 0);
  const fast = from.tgv && to.tgv && km >= 140 ? route(from, to, true) : null;
  const rand = random(hash(`${from.key}>${to.key}`));
  const plan = [];
  const add = (type, dep) => plan.push({ type, dep: dep === null ? null : Math.round(dep / 5) * 5 });

  if (fast) {
    const count = km > 450 ? 8 : 10;
    const span = (21 - 6.25) * 60;
    for (let i = 0; i < count; i++) add('TGV', 6.25 * 60 + (span * i) / (count - 1) + (rand() - 0.5) * 36);
    add('RAPIDE', 10.5 * 60 + rand() * 120);
  } else if (km < 170) {
    const count = 9 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) add(i % 3 === 1 ? 'EXPRESS' : 'TER', 5.75 * 60 + ((22 - 5.75) * 60 * i) / (count - 1) + (rand() - 0.5) * 30);
  } else {
    const count = 6 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) add(i % 2 ? 'EXPRESS' : 'RAPIDE', 6.5 * 60 + ((19.5 - 6.5) * 60 * i) / (count - 1) + (rand() - 0.5) * 50);
  }
  if (km >= 480 && km <= 1150) add('NUIT', null);

  const outbound = distance(PARIS, to) >= distance(PARIS, from);
  let trains = plan
    .map((t, i) => build(from, to, t, t.type === 'TGV' ? fast : classic, km, i, rand, outbound, dow))
    .filter((t) => !(dow === 0 && t.dep < 8 * 60 && !t.night));
  // Day trains that would arrive after midnight are not run.
  const day = trains.filter((t) => t.night || t.arr <= 24.5 * 60);
  if (day.length >= 3) trains = day;
  trains.sort((a, b) => a.dep - b.dep);
  return trains;
}

function build(from, to, { type, dep }, legs, km, index, rand, outbound, dow) {
  const spec = TYPES[type];
  const odds = STOP_ODDS[type];
  const stops = [{ station: from, time: 0 }];
  let time = 0;
  legs.forEach((leg, i) => {
    time += (leg.km / (leg.lgv ? spec.lgv : spec.speed)) * 60;
    const last = i === legs.length - 1;
    let station = leg.to;
    if (!last) {
      if (station === PARIS) {
        if (type !== 'TGV') return; // classic trains take the Paris ring line
        station = MASSY;
      } else if (type === 'TGV' && !station.tgv) {
        return;
      }
      if (rand() >= odds[station.rank - 1]) return;
      time += 2;
      stops.push({ station, time: Math.round(time + spec.dwell) });
      time += spec.dwell;
    } else {
      stops.push({ station, time: Math.round(time + 2) });
    }
  });
  let total = stops[stops.length - 1].time;
  if (dep === null) {
    // Night train: leave in the evening, arrive in the morning.
    dep = Math.round((31.5 * 60 - total + (rand() - 0.5) * 60) / 5) * 5;
    dep = Math.max(19.5 * 60, Math.min(23.75 * 60, dep));
  }
  stops.forEach((s, i) => {
    s.time += dep;
    const neighbour = i === 0 ? stops[1].station : stops[i - 1].station;
    s.name = s.station.full ? stationName(s.station, s.station === PARIS ? neighbour : null) : s.station.name;
  });
  total = stops[stops.length - 1].time - dep;

  const sudEst = stops.some((s) => s.station.paris === 'Lyon');
  const viaParis = stops.some((s) => s.station === MASSY);
  const series = { TGV: viaParis ? 5000 : sudEst ? 6000 : 8000, RAPIDE: 1000, EXPRESS: 3000, TER: 7000, NUIT: 4000 }[type];
  let number = series + 100 + (hash(`${from.key}${to.key}${index}`) % 440) * 2 + (outbound ? 1 : 0);
  if (type === 'TER') number += 1000 * (hash(from.key) % 2);

  const fare = period(dep, dow);
  const base = km * 0.47 + 12;
  const supplement = type === 'TGV' ? { bleue: 18, blanche: 36, rouge: 58 }[fare] : 0;
  return {
    number: String(number),
    type,
    label: spec.label,
    color: spec.color,
    night: !!spec.night,
    dep,
    arr: dep + total,
    minutes: total,
    km,
    stops,
    price2: Math.round(base + supplement + (spec.night ? 85 : 0)),
    price1: Math.round(base * 1.5 + supplement * 1.5 + (spec.night ? 130 : 0)),
    period: fare,
    bar: type === 'TGV' || type === 'RAPIDE' || !!spec.night,
    couchettes: !!spec.night,
    reservation: type === 'TGV' || !!spec.night,
  };
}
