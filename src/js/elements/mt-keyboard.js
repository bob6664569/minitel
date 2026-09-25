/**
 * <mt-keyboard> — an on-screen Minitel keyboard (AZERTY block, arrows and
 * the eight function keys plus Connexion Fin).
 *
 *   <mt-keyboard for="my-terminal"></mt-keyboard>
 *
 * Keys are sent to the <mt-terminal> named by `for`, or to the terminal of
 * the enclosing <mt-minitel>. A cancellable `mt-press` event is dispatched
 * first (detail: { key } or { text }).
 *
 * Like on the Minitel, letters are capitals by default; "Maj" switches to
 * lowercase.
 */
import { KEY_LABELS } from '../videotex/constants.js';

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'],
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '-', "'"],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', '.', ','],
  [{ toggle: 'shift', label: 'Maj', w: 1.5 }, 'W', 'X', 'C', 'V', 'B', 'N', '?', '!', ':', { t: '/', w: 1.5 }],
  [{ label: 'Fnct', w: 1.5, inert: true }, { label: 'Ctrl', w: 1.5, inert: true }, { t: ' ', label: '', w: 6, cls: 'space' }, { key: 'LEFT', label: '◀' }, { key: 'UP', label: '▲' }, { key: 'DOWN', label: '▼' }, { key: 'RIGHT', label: '▶' }],
];

const FUNCTIONS = [
  ['SOMMAIRE', 'ANNULATION'],
  ['RETOUR', 'REPETITION'],
  ['GUIDE', 'CORRECTION'],
  ['SUITE', 'ENVOI'],
];

function keyHTML(spec) {
  const k = typeof spec === 'string' ? { t: spec } : spec;
  const w = k.w ? ` style="--w:${k.w}"` : '';
  const cls = ['mt-kbd__key', k.cls ? `mt-kbd__key--${k.cls}` : '', k.key ? 'mt-kbd__key--arrow' : '', k.toggle ? 'mt-kbd__key--toggle' : '', k.inert ? 'mt-kbd__key--inert' : ''].filter(Boolean).join(' ');
  const data = k.key ? `data-key="${k.key}"` : k.toggle ? `data-toggle="${k.toggle}"` : k.inert ? 'data-inert' : `data-text="${k.t.replace(/"/g, '&quot;')}"`;
  const label = k.label ?? k.t;
  const aria = k.key ? ` aria-label="${{ LEFT: 'Gauche', UP: 'Haut', DOWN: 'Bas', RIGHT: 'Droite' }[k.key]}"` : k.t === ' ' ? ' aria-label="Espace"' : '';
  return `<button type="button" class="${cls}" ${data}${w}${aria}><span>${label}</span></button>`;
}

export class MinitelKeyboardElement extends HTMLElement {
  connectedCallback() {
    if (!this.built) this.build();
    this.addEventListener('pointerdown', this.onPointerDown);
    this.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('pointerdown', this.onPointerDown);
    this.removeEventListener('click', this.onClick);
  }

  build() {
    this.built = true;
    this.classList.add('mt-kbd');
    this.setAttribute('role', 'group');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Clavier Minitel');
    const main = ROWS.map((row) => `<div class="mt-kbd__row">${row.map(keyHTML).join('')}</div>`).join('');
    const fn = FUNCTIONS.map((pair) => pair.map((key) => `<button type="button" class="mt-kbd__fn mt-kbd__fn--${key.toLowerCase()}" data-key="${key}"><span>${KEY_LABELS[key]}</span></button>`).join('')).join('');
    this.innerHTML = `
      <div class="mt-kbd__main">${main}</div>
      <div class="mt-kbd__side">
        <button type="button" class="mt-kbd__fn mt-kbd__fn--connexion" data-key="CONNEXION_FIN"><span>Connexion<br>Fin</span></button>
        <div class="mt-kbd__fns">${fn}</div>
      </div>`;
  }

  get target() {
    const id = this.getAttribute('for');
    if (id) return document.getElementById(id);
    return this.closest('mt-minitel')?.querySelector('mt-terminal') || null;
  }

  onPointerDown = (event) => {
    // Keep the focus on the terminal while clicking keys.
    if (event.target.closest('button')) event.preventDefault();
  };

  onClick = (event) => {
    const button = event.target.closest('button');
    if (!button || !this.contains(button) || button.hasAttribute('data-inert')) return;
    if (button.dataset.toggle === 'shift') {
      this.lower = !this.lower;
      button.setAttribute('aria-pressed', String(this.lower));
      this.classList.toggle('mt-kbd--lower', this.lower);
      return;
    }
    let detail;
    if (button.dataset.key) detail = { key: button.dataset.key };
    else {
      const text = button.dataset.text;
      detail = { text: this.lower ? text.toLowerCase() : text };
    }
    button.classList.add('is-pressed');
    setTimeout(() => button.classList.remove('is-pressed'), 120);
    const ok = this.dispatchEvent(new CustomEvent('mt-press', { detail, bubbles: true, cancelable: true }));
    if (!ok) return;
    const terminal = this.target;
    if (!terminal) return;
    if (detail.key) terminal.key(detail.key);
    else terminal.type(detail.text);
  };
}

if (!customElements.get('mt-keyboard')) customElements.define('mt-keyboard', MinitelKeyboardElement);
