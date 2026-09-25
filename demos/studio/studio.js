import '../../src/js/elements/index.js';
import { imageToMosaic, sampleImage, encodeCells, cellsToHTML } from '../../src/js/mosaic/mosaic.js';
import { Videotex } from '../../src/js/videotex/writer.js';
import { Page } from '../../src/js/service/page.js';
import { Screen } from '../../src/js/videotex/screen.js';
import { Decoder } from '../../src/js/videotex/decoder.js';
import { Renderer } from '../../src/js/terminal/renderer.js';
import { SAMPLES } from './samples.js';

const $ = (id) => document.getElementById(id);
const term = $('term');
const stats = $('stats');
const controls = ['palette', 'dither', 'fit', 'rows', 'brightness', 'contrast', 'saturate', 'separated', 'caption'].map($);

let source = null; // image, canvas or video
let current = null; // { bytes, cells }
let webcam = null;

/* ---------------------------------------------------------------------- */
/* Conversion                                                              */
/* ---------------------------------------------------------------------- */

function settings() {
  return {
    palette: $('palette').value,
    dither: $('dither').value,
    fit: $('fit').value,
    rows: Number($('rows').value),
    adjust: `brightness(${$('brightness').value}%) contrast(${$('contrast').value}%) saturate(${$('saturate').value}%)`,
    separated: $('separated').checked,
    caption: $('caption').value.trim(),
  };
}

/** Build the Videotex page for the current source. */
function compose(options = settings()) {
  if (!source) return null;
  const pixels = sampleImage(source, 40, options.rows, { fit: options.fit, adjust: options.adjust, mirror: source === webcam?.video });
  const cells = imageToMosaic(pixels, { palette: options.palette, dither: options.dither });
  const page = new Page().clear().cursor(false);
  encodeCells(page, cells, { row: 1, col: 1, separated: options.separated });
  if (options.caption) {
    if (options.rows <= 20) page.center(options.rows + 3, options.caption, { color: 'yellow', size: 'double' });
    else page.center(24, options.caption, { color: 'white', bg: 'blue' });
  }
  return { page, cells, bytes: page.bytes() };
}

function describe(bytes) {
  const seconds = (n, baud) => (n * 10) / baud;
  const fmt = (s) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
  return `${bytes.length} octets  ·  ${fmt(seconds(bytes.length, 1200))} à 1200 bauds  ·  ${fmt(seconds(bytes.length, 9600))} à 9600 bauds`;
}

function render({ transmit = false } = {}) {
  const result = compose();
  if (!result) return;
  current = result;
  const baud = transmit ? Number($('baud').value) : 0;
  const t = term.terminal;
  t.discard();
  t.baud = baud;
  if (baud) t.write(result.bytes);
  else t.writeNow(result.bytes);
  stats.textContent = describe(result.bytes);
}

let pending = 0;
function schedule() {
  if (webcam) return; // the live loop picks up changes
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => render());
}

for (const control of controls) {
  control.addEventListener('input', schedule);
  control.addEventListener('change', schedule);
}

$('palette').addEventListener('change', () => term.setAttribute('theme', $('palette').value));
$('send').addEventListener('click', () => render({ transmit: true }));

/* ---------------------------------------------------------------------- */
/* Sources                                                                 */
/* ---------------------------------------------------------------------- */

function stopWebcam() {
  if (!webcam) return;
  cancelAnimationFrame(webcam.frame);
  webcam.stream.getTracks().forEach((track) => track.stop());
  webcam = null;
  $('webcam').textContent = 'Webcam';
}

function useSource(next) {
  stopWebcam();
  source = next;
  render({ transmit: true });
}

const sampleBar = $('samples');
sampleBar.innerHTML = SAMPLES.map((s) => `<button type="button" class="mt-button mt-button--ghost" data-sample="${s.id}">${s.label}</button>`).join('');
sampleBar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sample]');
  if (!button) return;
  useSource(SAMPLES.find((s) => s.id === button.dataset.sample).make());
});

async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    useSource(image);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

$('file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) loadImageFile(file);
});

$('webcam').addEventListener('click', async () => {
  if (webcam) {
    stopWebcam();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    const video = $('video');
    video.srcObject = stream;
    await video.play();
    source = video;
    webcam = { stream, video, frame: 0, last: 0 };
    $('webcam').textContent = 'Arrêter';
    const loop = (now) => {
      if (!webcam) return;
      webcam.frame = requestAnimationFrame(loop);
      if (now - webcam.last < 90) return;
      webcam.last = now;
      const result = compose();
      if (!result) return;
      current = result;
      term.terminal.discard();
      term.terminal.writeNow(result.bytes);
      stats.textContent = `EN DIRECT  ·  ${describe(result.bytes)}`;
    };
    webcam.frame = requestAnimationFrame(loop);
  } catch (error) {
    stats.textContent = `Webcam indisponible : ${error.message}`;
  }
});

/* Drag and drop: images go to the studio, other files to the player. */
const drop = $('drop');
let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth++;
  drop.hidden = false;
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) drop.hidden = true;
});
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  drop.hidden = true;
  const [file] = event.dataTransfer.files;
  if (!file) return;
  if (file.type.startsWith('image/')) {
    selectTab('studio');
    loadImageFile(file);
  } else {
    selectTab('player');
    loadVdt(file);
  }
});

/* ---------------------------------------------------------------------- */
/* Exports                                                                 */
/* ---------------------------------------------------------------------- */

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('download-vdt').addEventListener('click', () => {
  if (current) download(new Blob([current.bytes], { type: 'application/octet-stream' }), 'mosaique.vdt');
});

$('download-png').addEventListener('click', () => {
  if (!current) return;
  // Render the page off-screen at native resolution, then scale x3.
  const screen = new Screen();
  new Decoder(screen).write(current.bytes);
  const renderer = new Renderer({ theme: $('palette').value });
  renderer.render(screen);
  const out = document.createElement('canvas');
  out.width = renderer.width * 3;
  out.height = renderer.height * 3;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(renderer.canvas, 0, 0, out.width, out.height);
  out.toBlob((blob) => download(blob, 'mosaique.png'));
});

$('copy-html').addEventListener('click', async () => {
  if (!current) return;
  const html = `<pre class="mt-mosaic">${cellsToHTML(current.cells)}</pre>`;
  try {
    await navigator.clipboard.writeText(html);
    stats.textContent = 'HTML copié : collez-le dans une page qui charge minitel.css.';
  } catch {
    stats.textContent = 'Copie impossible dans ce navigateur.';
  }
});

/* ---------------------------------------------------------------------- */
/* VDT player                                                              */
/* ---------------------------------------------------------------------- */

let vdt = null;
let progressFrame = 0;

function play() {
  if (!vdt) return;
  stopWebcam();
  const t = term.terminal;
  t.discard();
  t.baud = Number($('vdt-baud').value);
  t.writeNow(new Videotex().clear().cursor(false).moveTo(0, 1).clearEOL().lf());
  t.write(vdt.bytes);
  const total = vdt.bytes.length;
  cancelAnimationFrame(progressFrame);
  const tick = () => {
    const done = total - t.pending;
    $('vdt-progress').style.setProperty('--value', String(done / total));
    $('vdt-info').textContent = `${vdt.name}  ·  ${done}/${total} octets`;
    if (t.pending) progressFrame = requestAnimationFrame(tick);
  };
  tick();
}

async function loadVdt(file) {
  vdt = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  $('vdt-play').disabled = false;
  $('vdt-skip').disabled = false;
  play();
}

$('vdt-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) loadVdt(file);
});
$('vdt-play').addEventListener('click', play);
$('vdt-skip').addEventListener('click', () => term.terminal.flushQueue());
$('vdt-baud').addEventListener('change', () => { term.terminal.baud = Number($('vdt-baud').value); });

/** Sample page: what a 1990 service home page looked like. */
function samplePage() {
  const p = new Page().clear().cursor(false);
  p.status(' 3615 MINITEL');
  p.band(1, { bg: 'blue', rows: 4 });
  p.bigText(2, 3, 'VDT', { color: 'yellow', background: 'blue' });
  p.print(2, 15, 'LECTEUR', { color: 'white', bg: 'blue', size: 'double' });
  p.print(4, 15, 'de pages Vidéotex', { color: 'cyan', bg: 'blue' });
  p.hline(5, { color: 'blue', style: 'top' });
  p.paragraph(7, 3, "Un fichier .vdt contient les octets exacts qu'un serveur envoyait au Minitel : codes de positionnement, attributs, caractères et mosaïques.", { width: 35 });
  p.panel(13, 3, 17, 37, { bg: 'magenta', shadow: 'blue' });
  p.print(14, 5, 'A 1200 bauds, le Minitel', { color: 'white', bg: 'magenta' });
  p.print(15, 5, 'affiche 120 caractères', { color: 'white', bg: 'magenta' });
  p.print(16, 5, 'par seconde.', { color: 'yellow', bg: 'magenta' });
  p.art(19, 3, [
    '..rr....yy....gg....cc....bb....mm....ww..',
    '.rrrr..yyyy..gggg..cccc..bbbb..mmmm..wwww.',
    'rrrrrryyyyyyggggggccccccbbbbbbmmmmmmwwwwww',
    'rrrrrryyyyyyggggggccccccbbbbbbmmmmmmwwwwww',
    '.rrrr..yyyy..gggg..cccc..bbbb..mmmm..wwww.',
    '..rr....yy....gg....cc....bb....mm....ww..',
  ]);
  p.hints(24, [['SUITE', 'page suivante'], ['SOMMAIRE', 'accueil']]);
  return p.bytes();
}

$('vdt-sample').addEventListener('click', () => {
  vdt = { name: 'exemple.vdt', bytes: samplePage() };
  $('vdt-play').disabled = false;
  $('vdt-skip').disabled = false;
  play();
});

/* ---------------------------------------------------------------------- */
/* Tabs                                                                    */
/* ---------------------------------------------------------------------- */

function selectTab(name) {
  for (const tab of ['studio', 'player']) {
    $(`tab-${tab}`).setAttribute('aria-selected', String(tab === name));
    $(`panel-${tab}`).hidden = tab !== name;
  }
  if (name === 'player') {
    stopWebcam();
    stats.textContent = '';
  } else if (current) {
    stats.textContent = describe(current.bytes);
  }
}
$('tab-studio').addEventListener('click', () => selectTab('studio'));
$('tab-player').addEventListener('click', () => selectTab('player'));

/* First picture */
useSource(SAMPLES[0].make());
