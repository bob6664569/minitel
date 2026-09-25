import '../src/js/elements/index.js';
import { Page } from '../src/js/service/page.js';

/* Examples: render each <template> and show its source. */
function escape(html) {
  return html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dedent(text) {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** Minimal HTML highlighting: tags, attributes, strings. */
function highlightHTML(source) {
  return escape(source).replace(/(&lt;\/?)([\w-]+)([^&]*?)(\/?&gt;)/g, (m, open, tag, attrs, close) => {
    const a = attrs.replace(/([\w-]+)(=)("[^"]*")/g, '<span class="a">$1</span>$2<span class="s">$3</span>');
    return `${open}<span class="t">${tag}</span>${a}${close}`;
  });
}

/** Minimal JS highlighting: comments, strings, keywords, numbers. */
function highlightJS(source) {
  const tokens = /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|const|let|new|await|async|return|if|else|for|of|function|class|extends)\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = '';
  let last = 0;
  for (const m of source.matchAll(tokens)) {
    out += escape(source.slice(last, m.index));
    const [text, comment, string, keyword, number] = m;
    const cls = comment ? 'c' : string ? 's' : keyword ? 'k' : number ? 'n' : '';
    out += `<span class="${cls}">${escape(text)}</span>`;
    last = m.index + text.length;
  }
  return out + escape(source.slice(last));
}

function copyButton(pre, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'doc-copy';
  button.textContent = 'Copier';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copié';
    } catch {
      button.textContent = 'Erreur';
    }
    setTimeout(() => { button.textContent = 'Copier'; }, 1200);
  });
  pre.append(button);
}

for (const example of document.querySelectorAll('.doc-example')) {
  const template = example.querySelector('template');
  const source = dedent(template.innerHTML);
  const preview = document.createElement('div');
  preview.className = `doc-example__preview${example.dataset.screen !== undefined ? ' doc-example__preview--screen' : ''}`;
  preview.append(template.content.cloneNode(true));
  const pre = document.createElement('pre');
  pre.className = 'doc-code';
  pre.innerHTML = `<code>${highlightHTML(source)}</code>`;
  copyButton(pre, source);
  example.append(preview, pre);
}

for (const pre of document.querySelectorAll('pre.doc-code[data-lang]')) {
  const source = dedent(pre.textContent);
  pre.innerHTML = `<code>${pre.dataset.lang === 'js' ? highlightJS(source) : highlightHTML(source)}</code>`;
  copyButton(pre, source);
}

/* Terminal examples */
const terminal = document.getElementById('doc-terminal');
if (terminal) {
  const page = new Page()
    .clear()
    .cursor(false)
    .header({ title: 'Bonjour', code: 'HELLO' })
    .paragraph(6, 3, 'Ce texte arrive à 1200 bauds, soit 120 caractères par seconde.', { width: 34 })
    .panel(10, 3, 13, 36, { bg: 'magenta', shadow: 'blue' })
    .print(11, 5, 'Un pavé avec une ombre', { color: 'white', bg: 'magenta' })
    .print(12, 5, 'en mosaïque.', { color: 'yellow', bg: 'magenta' })
    .bigText(16, 4, '3615', { color: 'cyan' })
    .prompt();
  const play = () => {
    terminal.terminal.discard();
    terminal.write(page);
  };
  document.getElementById('doc-terminal-play')?.addEventListener('click', play);
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    play();
  }).observe(terminal);
}

/* Theme switcher */
const buttons = [...document.querySelectorAll('.doc-top__themes [data-theme]')];
function setTheme(theme) {
  document.documentElement.dataset.mtTheme = theme;
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === theme)));
  try { localStorage.setItem('minitel:theme', theme); } catch { /* private mode */ }
}
buttons.forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));
try {
  const saved = localStorage.getItem('minitel:theme');
  if (saved) setTheme(saved);
} catch { /* private mode */ }

/* Current section in the sidebar */
const links = new Map([...document.querySelectorAll('.doc-nav a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    links.forEach((a) => a.classList.remove('is-current'));
    links.get(entry.target.id)?.classList.add('is-current');
  }
}, { rootMargin: '-20% 0px -70% 0px' });
links.forEach((_, id) => {
  const target = document.getElementById(id);
  if (target) observer.observe(target);
});
