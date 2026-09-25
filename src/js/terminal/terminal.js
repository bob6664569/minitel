/**
 * Terminal: a complete Minitel display.
 *
 *   bytes -> modem (baud-rate throttle) -> Decoder -> Screen -> Renderer -> CRT
 *
 * Emits:
 *   'data'   { detail: Uint8Array }  bytes the terminal sends on the line
 *                                    (keyboard, protocol answers)
 *   'key'    { detail: { key?, text? } } keyboard activity, before encoding
 *   'bell'   BEL received
 *   'idle'   the receive queue is empty
 *   'receive' { detail: { bytes, baud } } bytes queued at modem speed
 *   'mode'   { detail: { mode, value } } lowercase / echo switches
 */
import { Screen } from '../videotex/screen.js';
import { Decoder } from '../videotex/decoder.js';
import { Videotex } from '../videotex/writer.js';
import { Renderer } from './renderer.js';
import { CRT } from './crt.js';
import { keyBytes } from './keyboard.js';

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof Videotex) return data.bytes();
  if (typeof data === 'string') {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
    return out;
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return Uint8Array.from(data);
}

export class Terminal extends EventTarget {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas output canvas
   * @param {number} [options.baud=1200] 0 = instant
   * @param {string|Array} [options.theme='mono'] 'mono' | 'color' | 'amber' | 'green' | palette
   * @param {string} [options.phosphor] mono phosphor tint (#rrggbb)
   * @param {boolean|object} [options.effects=true] CRT effects (false = crisp pixels)
   * @param {boolean} [options.power=true] start powered on
   */
  constructor({ canvas, baud = 1200, theme = 'mono', phosphor, effects = true, power = true } = {}) {
    super();
    this.screen = new Screen();
    this.decoder = new Decoder(this.screen, {
      onBell: () => this.dispatchEvent(new Event('bell')),
      onResponse: (bytes) => this.send(bytes),
      onMode: (mode, value) => {
        if (mode === 'echo') this.localEcho = value;
        if (mode === 'lowercase') this.lowercase = value;
        this.dispatchEvent(new CustomEvent('mode', { detail: { mode, value } }));
      },
    });
    this.renderer = new Renderer({ theme, phosphor });
    this.crt = new CRT(canvas, { ...(typeof effects === 'object' ? effects : {}), effects: effects !== false, power: power ? 1 : 0 });
    this.baud = baud;
    this.localEcho = false;
    this.lowercase = false;
    this.queue = [];
    this.queueOffset = 0;
    this.budget = 0;
    this.powered = power;
    this.visible = true;
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reducedMotion) this.crt.set({ noise: 0, flicker: 0, roll: 0, persistence: 0 });
    this.lastFrame = performance.now();
    this.loop = this.loop.bind(this);
    this.frameRequest = requestAnimationFrame(this.loop);
  }

  /* ---------------------------------------------------------------- */
  /* Receiving                                                         */
  /* ---------------------------------------------------------------- */

  /** Queue bytes as if they arrived from the modem (throttled at `baud`). */
  write(data) {
    const bytes = toBytes(data);
    if (!bytes.length) return;
    if (!this.baud || !this.powered) {
      this.flushQueue();
      if (this.powered) this.decoder.write(bytes);
      return;
    }
    this.queue.push(bytes);
    this.dispatchEvent(new CustomEvent('receive', { detail: { bytes, baud: this.baud } }));
  }

  /** Decode bytes immediately, bypassing the modem speed. */
  writeNow(data) {
    this.flushQueue();
    this.decoder.write(toBytes(data));
  }

  /** Number of bytes waiting in the modem buffer. */
  get pending() {
    let n = -this.queueOffset;
    for (const chunk of this.queue) n += chunk.length;
    return Math.max(0, n);
  }

  /** Resolves when every queued byte has been displayed. */
  drain() {
    if (!this.pending) return Promise.resolve();
    return new Promise((resolve) => this.addEventListener('idle', () => resolve(), { once: true }));
  }

  /** Display everything still queued, instantly. */
  flushQueue() {
    while (this.queue.length) {
      const chunk = this.queue.shift();
      this.decoder.write(this.queueOffset ? chunk.subarray(this.queueOffset) : chunk);
      this.queueOffset = 0;
    }
  }

  /** Drop queued bytes (e.g. on disconnection). */
  discard() {
    this.queue = [];
    this.queueOffset = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Sending                                                           */
  /* ---------------------------------------------------------------- */

  send(bytes) {
    this.dispatchEvent(new CustomEvent('data', { detail: Uint8Array.from(bytes) }));
  }

  /** Press a function key: 'ENVOI', 'SUITE', ... or an arrow 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'. */
  key(name) {
    if (!this.powered) return;
    this.dispatchEvent(new CustomEvent('key', { detail: { key: name } }));
    this.send(keyBytes(name));
  }

  /** Type text on the keyboard. */
  type(text) {
    if (!this.powered) return;
    for (const ch of text) {
      this.dispatchEvent(new CustomEvent('key', { detail: { text: ch } }));
      const bytes = keyBytes(ch);
      if (this.localEcho) this.decoder.write(bytes);
      this.send(bytes);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Display                                                           */
  /* ---------------------------------------------------------------- */

  setTheme(theme, phosphor) {
    this.renderer.setTheme(theme, phosphor);
  }

  setEffects(options) {
    this.crt.set(options);
  }

  async powerOn() {
    if (this.powered && !this.crt.animation) return;
    this.powered = true;
    this.screen.reset();
    this.decoder.reset();
    this.renderer.invalidate();
    await this.crt.powerOn();
  }

  async powerOff() {
    if (!this.powered) return;
    this.powered = false;
    this.discard();
    await this.crt.powerOff();
    this.screen.reset();
    this.renderer.invalidate();
  }

  /** Brief horizontal sync jitter, like a line picking up the carrier. */
  glitch(duration = 600, amount = 0.012) {
    this.crt.jitter = amount;
    clearTimeout(this.glitchTimer);
    this.glitchTimer = setTimeout(() => { this.crt.jitter = 0; }, duration);
  }

  loop(now) {
    this.frameRequest = requestAnimationFrame(this.loop);
    const elapsed = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    if (!this.visible) return;

    if (this.queue.length) {
      this.budget += (elapsed * this.baud) / 10000; // 10 bits per character (7E1 + start/stop)
      let count = Math.floor(this.budget);
      this.budget -= count;
      while (count > 0 && this.queue.length) {
        const chunk = this.queue[0];
        const available = chunk.length - this.queueOffset;
        const n = Math.min(count, available);
        this.decoder.write(chunk.subarray(this.queueOffset, this.queueOffset + n));
        this.queueOffset += n;
        count -= n;
        if (this.queueOffset >= chunk.length) {
          this.queue.shift();
          this.queueOffset = 0;
        }
      }
      if (!this.queue.length) {
        this.budget = 0;
        this.dispatchEvent(new Event('idle'));
      }
    }

    this.renderer.tick(now);
    const changed = this.renderer.render(this.screen);
    this.crt.render(this.renderer.canvas, changed, now);
  }

  /** Current page as plain text (accessibility, tests). */
  text() {
    return this.screen.toText();
  }

  destroy() {
    cancelAnimationFrame(this.frameRequest);
    clearTimeout(this.glitchTimer);
    this.crt.destroy();
  }
}
