/**
 * 3615 BOURSE — a small simulated stock market: twelve fictional French
 * companies quoted in francs, a random walk in real time (one step every
 * 2.5 s, shared by every connection), intraday history at 5-minute
 * resolution and the "INDICE 36" index.
 */

export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* [code, board name (12), full name, sector, reference price, millions of shares, daily volatility] */
const COMPANIES = [
  ['ACN', 'ACIERS NORD', 'Aciers du Nord', 'Sidérurgie', 312.5, 18, 0.019],
  ['BQL', 'BANQUE LEMAN', 'Banque du Léman', 'Banque', 845, 12, 0.012],
  ['CMJ', 'CIMENTS JURA', 'Ciments du Jura', 'Matériaux', 1480, 4, 0.011],
  ['TLM', 'TELEMATIQUE', 'Télématique de France', 'Electronique', 2950, 3, 0.024],
  ['PSU', 'PETROLES SUD', 'Pétroles du Sud', 'Pétrole', 486.2, 25, 0.015],
  ['AMI', 'AUTO MISTRAL', 'Automobiles Mistral', 'Automobile', 1125, 9, 0.017],
  ['EVE', 'EAUX VERNAY', 'Eaux minérales de Vernay', 'Boissons', 689, 6, 0.009],
  ['ADR', 'AERO ADOUR', "Aéronautique de l'Adour", 'Aéronautique', 564.3, 7, 0.014],
  ['ASR', 'ASSUR RHONE', 'Assurances du Rhône', 'Assurances', 1032, 8, 0.011],
  ['CHE', 'CHIMIE EST', "Chimie de l'Est", 'Chimie', 247.8, 15, 0.016],
  ['CSU', 'COMPTOIR SUD', 'Comptoirs du Sud', 'Distribution', 1860, 5, 0.012],
  ['CBA', 'CABLES ARMOR', "Câbleries d'Armor", 'Télécoms', 398.4, 10, 0.018],
];

export const STEP_MS = 2500;
export const POINT_MS = 5 * 60 * 1000;
export const POINTS = 76;
const INDEX_BASE = 1836.15;

/** Price tick of the Paris market: 10 centimes below 500 F, 1 franc above. */
export function tickSize(price) {
  return price < 500 ? 0.1 : 1;
}

const round = (price) => {
  const t = tickSize(price);
  return Math.round(price / t) * t;
};

function gauss(rand) {
  return (rand() + rand() + rand() + rand() - 2) * 1.2;
}

export class Market {
  constructor(seed = Date.now()) {
    const day = new Date(seed);
    this.rand = random(hash(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`));
    const now = seed;
    this.trend = gauss(this.rand) * 0.5;
    this.lastStep = now;
    this.lastPoint = now - (now % POINT_MS);
    this.stocks = COMPANIES.map(([code, short, name, sector, ref, shares, vol], index) => {
      const prev = round(ref * (1 + gauss(this.rand) * 0.02));
      const open = round(prev * (1 + gauss(this.rand) * vol * 0.4));
      const s = { index, code, short, name, sector, shares, vol, prev, open, price: open, high: open, low: open, volume: 0, history: [], trend: gauss(this.rand) * 1.1 };
      return s;
    });
    // Backfill the session so far: POINTS - 1 five-minute points.
    this.start = now - (POINTS - 1) * POINT_MS;
    for (let p = 0; p < POINTS - 1; p++) {
      for (const s of this.stocks) {
        s.history.push(s.price);
        this.walk(s, 7, p / (POINTS - 1));
        s.volume += Math.round(((30 + this.rand() * 400) * s.shares) / 100) * 10;
      }
    }
    this.indexHistory = [];
    for (let p = 0; p < POINTS - 1; p++) this.indexHistory.push(this.indexAt(p));
    this.indexOpen = this.indexHistory[0];
    this.indexHigh = Math.max(...this.indexHistory, this.index);
    this.indexLow = Math.min(...this.indexHistory, this.index);
  }

  /**
   * One random-walk move of a stock, `scale` times the size of a live step.
   * The walk is pulled towards the day's trend, reached gradually as the
   * session progresses (0 at the first chart point, 1 when the page opens).
   */
  walk(s, scale = 1, progress = this.progress()) {
    const sigma = s.vol * 0.034 * Math.sqrt(scale);
    const target = s.open * (1 + (s.trend + this.trend) * s.vol * Math.min(1.4, progress));
    const pull = (target / s.price - 1) * 0.006 * scale;
    let next = round(s.price * (1 + gauss(this.rand) * sigma + pull));
    // Daily limit of the Paris market: +/- 10 %.
    next = Math.max(round(s.prev * 0.9), Math.min(round(s.prev * 1.1), next));
    if (next === s.price) next = round(s.price + tickSize(s.price) * (this.rand() < 0.5 ? -1 : 1));
    s.price = next;
    s.high = Math.max(s.high, next);
    s.low = Math.min(s.low, next);
  }

  /** How far into the day's trend the market is. */
  progress(now = Date.now()) {
    return (now - this.start) / ((POINTS - 1) * POINT_MS);
  }

  indexOf(prices) {
    let total = 0;
    let base = 0;
    this.stocks.forEach((s, i) => {
      total += prices[i] * s.shares;
      base += s.prev * s.shares;
    });
    return (INDEX_BASE * total) / base;
  }

  indexAt(point) {
    return this.indexOf(this.stocks.map((s) => s.history[point]));
  }

  /** Current value of the INDICE 36. */
  get index() {
    return this.indexOf(this.stocks.map((s) => s.price));
  }

  get indexPrev() {
    return INDEX_BASE;
  }

  /** Advance the market to `now`; returns the number of live steps taken. */
  update(now = Date.now()) {
    let steps = Math.floor((now - this.lastStep) / STEP_MS);
    if (steps <= 0) return 0;
    this.lastStep += steps * STEP_MS;
    steps = Math.min(steps, 40);
    for (let i = 0; i < steps; i++) {
      // A few trades on a few stocks at every step.
      const count = 1 + Math.floor(this.rand() * 3);
      const progress = this.progress(this.lastStep);
      for (let k = 0; k < count; k++) {
        const s = this.stocks[Math.floor(this.rand() * this.stocks.length)];
        this.walk(s, 1, progress);
        s.volume += Math.round(((10 + this.rand() * 300) * s.shares) / 100) * 10;
      }
    }
    const value = this.index;
    this.indexHigh = Math.max(this.indexHigh, value);
    this.indexLow = Math.min(this.indexLow, value);
    // A new chart point every five minutes.
    while (now - this.lastPoint >= POINT_MS) {
      this.lastPoint += POINT_MS;
      for (const s of this.stocks) {
        s.history.push(s.price);
        if (s.history.length > POINTS - 1) s.history.shift();
      }
      this.indexHistory.push(value);
      if (this.indexHistory.length > POINTS - 1) this.indexHistory.shift();
    }
    return steps;
  }

  /** Time of the first chart point (ms). */
  get chartStart() {
    return this.lastPoint - (POINTS - 1) * POINT_MS;
  }

  /** Execute an order at the market price; the trade shows in the volume. */
  trade(s, quantity) {
    s.volume += Math.abs(quantity);
    return s.price;
  }
}

let shared = null;

/** The market every connection sees. */
export function market() {
  if (!shared) shared = new Market();
  shared.update();
  return shared;
}

/** French number: 12345.6 -> '12 345,60'. */
export function fr(value, digits = 2) {
  const [int, dec] = Math.abs(value).toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '-' : ''}${grouped}${digits ? `,${dec}` : ''}`;
}

/** Signed variation in percent: '+1,25', '-0,48', '+12,3'. */
export function variation(value, reference) {
  const pct = (value / reference - 1) * 100;
  const text = fr(Math.abs(pct), Math.abs(pct) >= 10 ? 1 : 2);
  if (Math.abs(pct) < 0.005) return '=0,00';
  return `${pct > 0 ? '+' : '-'}${text}`;
}

/* News flashes, at most 29 characters. */
export const HEADLINES = [
  'Le franc solide face au mark',
  'Télématique : succès européen',
  'OPA en vue sur Ciments Jura',
  'Le baril sous les 20 dollars',
  'Auto Mistral : ventes record',
  'Aciers du Nord restructure',
  "L'INDICE 36 près des sommets",
  'Taux : statu quo attendu',
  'Privatisations en vue',
  'Vernay relève son dividende',
  'Aéro Adour : contrat export',
  'Assur. Rhône : bénéfice +12%',
];
