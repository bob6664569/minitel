/**
 * <mt-terminal> — a Minitel screen: Videotex decoder, 1200-baud modem and
 * WebGL CRT, in one element.
 *
 *   <mt-terminal theme="mono" baud="1200" effects="on"></mt-terminal>
 *
 * Attributes
 *   theme     mono | color | amber | green        (default mono)
 *   phosphor  #rrggbb tint of the mono phosphor
 *   baud      300 | 1200 | 4800 | 9600 | 0 (instant) (default 1200)
 *   effects   on | off                            (default on)
 *   power     on | off                            (default on)
 *   keyboard  on | off — capture the PC keyboard when focused (default on)
 *
 * Methods: write(data), writeNow(data), key(name), type(text), connect(lineEnd),
 *          disconnect(), powerOn(), powerOff(), drain(), text()
 * Events (bubbling): mt-key {key|text}, mt-data Uint8Array, mt-bell, mt-idle
 */
import { Terminal } from '../terminal/terminal.js';
import { CRT } from '../terminal/crt.js';
import { translateKeyEvent } from '../terminal/keyboard.js';

const STYLE = `
:host {
  display: block;
  position: relative;
  aspect-ratio: 4 / 3;
  background: #050606;
  border-radius: var(--mt-tube-radius, 6% / 8%);
  overflow: hidden;
  outline: none;
  contain: layout paint;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
:host(:focus-visible) {
  box-shadow: 0 0 0 3px var(--mt-focus-ring, rgba(120, 180, 255, 0.55));
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.proxy {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  border: 0;
  padding: 0;
  resize: none;
  font-size: 16px;
  caret-color: transparent;
}
.text {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: pre;
}
`;

export class MinitelTerminalElement extends HTMLElement {
  static observedAttributes = ['theme', 'phosphor', 'baud', 'effects', 'power'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open', delegatesFocus: false });
    root.innerHTML = `<style>${STYLE}</style><canvas part="screen"></canvas><textarea class="proxy" aria-hidden="true" tabindex="-1" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false"></textarea><pre class="text" part="text"></pre>`;
    this.canvas = root.querySelector('canvas');
    this.proxy = root.querySelector('.proxy');
    this.textMirror = root.querySelector('.text');
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (!this.hasAttribute('role')) this.setAttribute('role', 'application');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Écran Minitel');
    if (!this.terminal) this.createTerminal();
    this.addEventListener('keydown', this.onKeyDown);
    this.addEventListener('paste', this.onPaste);
    this.addEventListener('pointerdown', this.onPointerDown);
    this.proxy.addEventListener('input', this.onProxyInput);
    this.observer = new IntersectionObserver(([entry]) => {
      if (this.terminal) this.terminal.visible = entry.isIntersecting;
    });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.onKeyDown);
    this.removeEventListener('paste', this.onPaste);
    this.removeEventListener('pointerdown', this.onPointerDown);
    this.proxy.removeEventListener('input', this.onProxyInput);
    this.observer?.disconnect();
    // Keep the terminal alive when the element is only moved in the DOM.
    queueMicrotask(() => {
      if (!this.isConnected && this.terminal) {
        this.disconnect();
        this.terminal.destroy();
        this.terminal = null;
      }
    });
  }

  createTerminal() {
    const t = new Terminal({
      canvas: this.canvas,
      baud: this.baudRate,
      theme: this.getAttribute('theme') || 'mono',
      phosphor: this.getAttribute('phosphor') || undefined,
      effects: this.getAttribute('effects') !== 'off',
      power: this.getAttribute('power') !== 'off',
    });
    this.terminal = t;
    const relay = (type, detail) => this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    t.addEventListener('key', (e) => relay('mt-key', e.detail));
    t.addEventListener('data', (e) => relay('mt-data', e.detail));
    t.addEventListener('bell', () => relay('mt-bell'));
    t.addEventListener('idle', () => {
      relay('mt-idle');
      this.updateMirror();
    });
  }

  attributeChangedCallback(name, oldValue, value) {
    const t = this.terminal;
    if (!t || oldValue === value) return;
    if (name === 'theme' || name === 'phosphor') t.setTheme(this.getAttribute('theme') || 'mono', this.getAttribute('phosphor') || undefined);
    if (name === 'baud') t.baud = this.baudRate;
    if (name === 'effects') {
      // Switching between WebGL and 2D needs a fresh canvas.
      const canvas = document.createElement('canvas');
      canvas.setAttribute('part', 'screen');
      this.canvas.replaceWith(canvas);
      this.canvas = canvas;
      const { power } = t.crt;
      t.crt.destroy();
      t.crt = new CRT(canvas, { effects: value !== 'off', power });
      t.renderer.invalidate();
    }
    if (name === 'power') {
      if (value === 'off') t.powerOff();
      else t.powerOn();
    }
  }

  get baudRate() {
    const value = this.getAttribute('baud');
    return value === null ? 1200 : Number(value) || 0;
  }

  /* ---------------------------------------------------------------- */
  /* Public API                                                        */
  /* ---------------------------------------------------------------- */

  write(data) { this.terminal.write(data); }
  writeNow(data) { this.terminal.writeNow(data); }
  key(name) { this.terminal.key(name); }
  type(text) { this.terminal.type(text); }
  drain() { return this.terminal.drain(); }
  text() { return this.terminal.text(); }
  get screen() { return this.terminal.screen; }

  powerOn() {
    this.setAttribute('power', 'on');
    return this.terminal.powerOn();
  }

  powerOff() {
    this.setAttribute('power', 'off');
    return this.terminal.powerOff();
  }

  /** Attach a line end (see net/line.js): received bytes are displayed, keys are sent. */
  connect(line) {
    this.disconnect();
    const t = this.terminal;
    const onData = (e) => t.write(e.detail);
    const onSend = (e) => line.send(e.detail);
    const onClose = () => this.disconnect();
    line.addEventListener('data', onData);
    line.addEventListener('close', onClose);
    t.addEventListener('data', onSend);
    this.line = line;
    this.unlink = () => {
      line.removeEventListener('data', onData);
      line.removeEventListener('close', onClose);
      t.removeEventListener('data', onSend);
    };
    return line;
  }

  disconnect() {
    if (!this.line) return;
    const { line } = this;
    this.unlink();
    this.line = null;
    this.unlink = null;
    line.close();
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  onKeyDown(event) {
    if (this.getAttribute('keyboard') === 'off' || !this.terminal) return;
    const action = translateKeyEvent(event);
    if (!action) return;
    event.preventDefault();
    if (action.key) this.terminal.key(action.key);
    else this.terminal.type(action.text);
  }

  onPaste = (event) => {
    if (this.getAttribute('keyboard') === 'off') return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    this.terminal.type(text.replace(/\r?\n/g, ' '));
  };

  onPointerDown = (event) => {
    // On touch screens, focus a hidden textarea to bring up the soft keyboard.
    if (event.pointerType === 'touch' && this.getAttribute('keyboard') !== 'off' && this.hasAttribute('soft-keyboard')) {
      this.proxy.focus({ preventScroll: true });
    } else {
      this.focus({ preventScroll: true });
    }
  };

  onProxyInput = () => {
    const value = this.proxy.value;
    this.proxy.value = '';
    if (value) this.terminal.type(value);
  };

  updateMirror() {
    clearTimeout(this.mirrorTimer);
    this.mirrorTimer = setTimeout(() => {
      if (this.terminal) this.textMirror.textContent = this.terminal.text();
    }, 300);
  }
}

if (!customElements.get('mt-terminal')) customElements.define('mt-terminal', MinitelTerminalElement);
