import '../../src/js/elements/index.js';
import { Teletel } from '../../src/js/service/teletel.js';
import { KEY_HELP } from '../../src/js/terminal/keyboard.js';
import { KEY_LABELS } from '../../src/js/videotex/constants.js';
import { francs } from '../../src/js/service/page.js';
import { services } from './services/index.js';

const device = document.getElementById('minitel');
const hint = document.getElementById('power-hint');
const network = new Teletel({ services });
device.network = network;

const params = new URLSearchParams(location.search);
const store = {
  get(key, fallback) {
    try { return localStorage.getItem(`teletel:${key}`) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`teletel:${key}`, value); } catch { /* private mode */ }
  },
};

/* ---------------------------------------------------------------------- */
/* Directory                                                               */
/* ---------------------------------------------------------------------- */

const directory = document.getElementById('directory');
const entries = [
  ...network.services.filter((s) => s.direct).map((s) => ({ number: s.number, code: '', name: s.name, description: s.description })),
  ...network.list('3615').map((s) => ({ number: '3615', code: s.code, name: s.name, description: s.description })),
];
directory.innerHTML = entries.map((e) => `
  <li>
    <button type="button" class="tt-directory__item" data-number="${e.number}" data-code="${e.code}">
      <span class="tt-directory__number">${e.number}</span>
      <span class="tt-directory__code">${e.code || e.name.toUpperCase()}</span>
      <span class="tt-directory__desc">${e.description || e.name}</span>
    </button>
  </li>`).join('');

directory.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-number]');
  if (!button) return;
  hint.hidden = true;
  device.focus({ preventScroll: true });
  if (device.minitel.state === 'connected') device.hangup();
  await device.dial(button.dataset.number, { code: button.dataset.code || undefined, fast: !sound.checked });
});

/* ---------------------------------------------------------------------- */
/* Settings                                                                */
/* ---------------------------------------------------------------------- */

const model = document.getElementById('set-model');
const theme = document.getElementById('set-theme');
const baud = document.getElementById('set-baud');
const sound = document.getElementById('set-sound');
const crt = document.getElementById('set-crt');

model.value = params.get('model') || store.get('model', '1b');
theme.value = params.get('theme') || store.get('theme', 'mono');
baud.value = params.get('baud') || store.get('baud', '1200');
sound.checked = store.get('sound', 'on') === 'on';
crt.checked = store.get('crt', 'on') === 'on';

function apply() {
  device.setAttribute('model', model.value);
  device.setAttribute('theme', theme.value);
  device.setAttribute('baud', baud.value);
  device.setAttribute('effects', crt.checked ? 'on' : 'off');
  device.audio.muted = !sound.checked;
  device.audio.unlock();
  store.set('model', model.value);
  store.set('theme', theme.value);
  store.set('baud', baud.value);
  store.set('sound', sound.checked ? 'on' : 'off');
  store.set('crt', crt.checked ? 'on' : 'off');
}
for (const input of [model, theme, baud, sound, crt]) input.addEventListener('change', apply);
apply();

/* ---------------------------------------------------------------------- */
/* Keys help                                                               */
/* ---------------------------------------------------------------------- */

document.getElementById('keys').innerHTML = KEY_HELP
  .map(([key, pc]) => `<li><span>${KEY_LABELS[key]}</span><span>${pc}</span></li>`)
  .join('');

/* ---------------------------------------------------------------------- */
/* Power and meter                                                         */
/* ---------------------------------------------------------------------- */

async function powerOn() {
  hint.hidden = true;
  await device.powerOn();
  device.focus({ preventScroll: true });
}

hint.addEventListener('click', powerOn);
device.addEventListener('mt-state', (event) => {
  hint.hidden = event.detail !== 'off';
  document.body.dataset.state = event.detail;
});

const meterTime = document.getElementById('meter-time');
const meterCost = document.getElementById('meter-cost');
function showMeter({ seconds = 0, cost = 0 } = {}) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  meterTime.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  meterCost.textContent = francs(cost);
}
device.addEventListener('mt-tick', (event) => showMeter(event.detail));

const title = document.querySelector('.tt-top__title');
device.addEventListener('mt-service', (event) => {
  title.textContent = event.detail ? `${device.minitel.number} ${event.detail.code}` : 'TELETEL';
});
device.addEventListener('mt-state', (event) => {
  if (event.detail === 'connected' && device.minitel.number === '3611') title.textContent = '3611 ANNUAIRE';
  else if (event.detail !== 'connected') title.textContent = 'TELETEL';
});
device.addEventListener('mt-hangup', (event) => showMeter(event.detail));

/* Deep links: ?number=3615&code=METEO (&autostart to skip the power button) */
if (params.has('autostart') || params.has('code') || params.has('number')) {
  const go = async () => {
    await powerOn();
    if (params.has('code') || params.has('number')) {
      await device.dial(params.get('number') || '3615', { code: params.get('code') || undefined, fast: params.has('fast') || !sound.checked });
    }
  };
  if (params.has('autostart')) go();
  else hint.addEventListener('click', go, { once: true });
}

window.teletel = { device, network };
