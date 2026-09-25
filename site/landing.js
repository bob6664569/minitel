import '../src/js/elements/index.js';
import { Teletel } from '../src/js/service/teletel.js';
import { Page, francs } from '../src/js/service/page.js';
import { getGlyph } from '../src/js/font/glyphs.js';
import showcase from './showcase.js';

const store = {
  get(key) {
    try { return localStorage.getItem(`minitel:${key}`); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(`minitel:${key}`, value); } catch { /* private mode */ }
  },
};

/* ---------------------------------------------------------------------- */
/* Hero device: attract mode                                               */
/* ---------------------------------------------------------------------- */

const device = document.getElementById('hero-minitel');
device.network = new Teletel({ services: [{ ...showcase, number: '3615', direct: true }] });
device.audio.muted = true; // no autoplay sound; the Télétel demo has the full experience

let started = false;
new IntersectionObserver(async ([entry], observer) => {
  if (!entry.isIntersecting || started) return;
  started = true;
  observer.disconnect();
  await device.powerOn();
  await device.dial('3615', { fast: true });
}, { threshold: 0.3 }).observe(device);

// Hanging up is allowed; the device then shows its local screen and can redial 3615.

/* ---------------------------------------------------------------------- */
/* Themes                                                                  */
/* ---------------------------------------------------------------------- */

const SCREEN_THEME = { color: 'color', mono: 'mono', amber: 'amber', green: 'green', paper: 'mono' };
const radios = [...document.querySelectorAll('.lp-themes [data-theme]')];
const demoTerminal = document.getElementById('demo-terminal');

function setTheme(theme) {
  document.documentElement.dataset.mtTheme = theme;
  radios.forEach((r) => r.setAttribute('aria-checked', String(r.dataset.theme === theme)));
  device.setAttribute('theme', SCREEN_THEME[theme]);
  demoTerminal.setAttribute('theme', SCREEN_THEME[theme]);
  store.set('theme', theme);
}

radios.forEach((radio) => radio.addEventListener('click', () => setTheme(radio.dataset.theme)));
const saved = store.get('theme');
if (saved && SCREEN_THEME[saved]) setTheme(saved);

/* ---------------------------------------------------------------------- */
/* A magnified glyph: the 8x10 cell                                        */
/* ---------------------------------------------------------------------- */

const cells = document.querySelector('.lp-grid-demo__cells');
const letters = ['M', 'é', '3', 'g', '▶'];
let letter = 0;
function drawGlyph() {
  const rows = getGlyph(letters[letter]);
  cells.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 8; x++) {
      const i = document.createElement('i');
      if (rows[y] & (0x80 >> x)) i.className = 'on';
      cells.append(i);
    }
  }
  letter = (letter + 1) % letters.length;
}
drawGlyph();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(drawGlyph, 1800);

/* ---------------------------------------------------------------------- */
/* Terminal demo: the page from the code sample                            */
/* ---------------------------------------------------------------------- */

function samplePage() {
  return new Page()
    .clear()
    .cursor(false)
    .header({ title: 'Météo', code: 'METEO' })
    .menu(["Aujourd'hui", 'Demain', 'Carte de France'], { row: 7 })
    .bigText(16, 24, '19°', { color: 'green' })
    .print(17, 3, 'Nice', { color: 'white' })
    .print(18, 3, 'Vent fort', { color: 'red', flash: true })
    .prompt();
}

const replayBytes = document.getElementById('replay-bytes');
function replay() {
  const t = demoTerminal.terminal;
  const page = samplePage();
  t.discard();
  t.baud = Number(document.getElementById('replay-baud').value);
  t.write(page);
  replayBytes.textContent = `${page.length} octets`;
}
document.getElementById('replay').addEventListener('click', replay);
document.getElementById('replay-baud').addEventListener('change', replay);

let played = false;
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting && !played) {
    played = true;
    replay();
  }
}, { threshold: 0.4 }).observe(demoTerminal);

/* ---------------------------------------------------------------------- */
/* The bill                                                                */
/* ---------------------------------------------------------------------- */

const start = Date.now();
const bill = document.getElementById('bill');
const billText = document.getElementById('bill-text');
setInterval(() => {
  const minutes = (Date.now() - start) / 60000;
  const cost = francs(minutes * 1.29);
  bill.textContent = cost;
  billText.textContent = `This visit cost you ${cost} at 1,29 F/min.`;
}, 1000);
