/**
 * Minitel sounds, synthesised with Web Audio (no samples):
 * French dial tone, DTMF, ringback, the V.25/V.23 modem answer and data
 * chirps, the BEL beep and keyboard clicks.
 *
 * Browsers only start audio after a user gesture: call `unlock()` from a
 * click or key handler before the first sound.
 */

const DTMF = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477], A: [697, 1633],
  4: [770, 1209], 5: [770, 1336], 6: [770, 1477], B: [770, 1633],
  7: [852, 1209], 8: [852, 1336], 9: [852, 1477], C: [852, 1633],
  '*': [941, 1209], 0: [941, 1336], '#': [941, 1477], D: [941, 1633],
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True during a user gesture, or when the browser cannot tell. */
const activated = () => globalThis.navigator?.userActivation?.isActive ?? true;

export class MinitelAudio {
  constructor({ volume = 0.35, muted = false } = {}) {
    this.volumeValue = volume;
    this.mutedValue = muted;
    this.context = null;
    this.active = new Set();
  }

  get ctx() {
    if (!this.context) {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return null;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.mutedValue ? 0 : this.volumeValue;
      // Telephone band: the line only carries ~300-3400 Hz.
      this.line = this.context.createBiquadFilter();
      this.line.type = 'bandpass';
      this.line.frequency.value = 1100;
      this.line.Q.value = 0.35;
      this.line.connect(this.master);
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  /**
   * Resume the audio context. Call it from a user gesture; it never blocks
   * (browsers keep resume() pending until the page has been interacted with).
   */
  unlock() {
    if (this.mutedValue || !activated()) return;
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  /**
   * The context sounds can be scheduled on, or null. Nothing is queued on a
   * context the browser keeps suspended: it would all play at once later.
   */
  get live() {
    if (this.mutedValue || !this.context) return null;
    // A context started by the current gesture is still 'suspended' for a moment.
    return this.context.state === 'running' || activated() ? this.context : null;
  }

  get muted() { return this.mutedValue; }
  set muted(value) {
    this.mutedValue = value;
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : this.volumeValue, this.ctx.currentTime, 0.02);
    if (value) this.stop();
  }

  get volume() { return this.volumeValue; }
  set volume(value) {
    this.volumeValue = value;
    if (this.master && !this.mutedValue) this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  get ready() {
    return !this.mutedValue && this.context?.state === 'running';
  }

  /** Stop every sound in progress. */
  stop() {
    for (const node of this.active) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    this.active.clear();
  }

  track(node) {
    this.active.add(node);
    node.onended = () => this.active.delete(node);
    return node;
  }

  /**
   * Play a sum of sine tones.
   * @param {number[]} freqs
   * @param {number} duration seconds
   */
  tone(freqs, duration, { gain = 0.2, type = 'sine', when = 0, attack = 0.005, release = 0.01, phone = true } = {}) {
    const ctx = this.live;
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.setValueAtTime(gain, start + Math.max(attack, duration - release));
    env.gain.linearRampToValueAtTime(0, start + duration);
    env.connect(phone ? this.line : this.master);
    for (const f of freqs) {
      const osc = this.track(ctx.createOscillator());
      osc.type = type;
      osc.frequency.value = f;
      osc.connect(env);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }
  }

  /** Play a generated buffer of samples (mono, -1..1). */
  buffer(samples, { gain = 0.2, when = 0, phone = true } = {}) {
    const ctx = this.live;
    if (!ctx || !samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.track(ctx.createBufferSource());
    source.buffer = buffer;
    const env = ctx.createGain();
    env.gain.value = gain;
    source.connect(env).connect(phone ? this.line : this.master);
    source.start(ctx.currentTime + when);
  }

  /** French dial tone: continuous 440 Hz. */
  dialTone(seconds = 0.9) {
    this.tone([440], seconds, { gain: 0.16 });
    return wait(seconds * 1000);
  }

  dtmf(digit, seconds = 0.085) {
    const pair = DTMF[String(digit).toUpperCase()];
    if (pair) this.tone(pair, seconds, { gain: 0.14 });
  }

  /** Dial a number: dial tone, then DTMF digits. */
  async dial(number, { onDigit } = {}) {
    await this.dialTone(0.7);
    for (const digit of String(number).replace(/\s/g, '')) {
      onDigit?.(digit);
      this.dtmf(digit);
      await wait(150);
    }
  }

  /** French ringback: 440 Hz, 1.5 s on. */
  async ringback(count = 1) {
    for (let i = 0; i < count; i++) {
      this.tone([440], 1.5, { gain: 0.12 });
      await wait(i === count - 1 ? 1700 : 3500);
    }
  }

  /**
   * Frequency-shift keying at 1200 baud (V.23 forward channel: 1300 Hz mark,
   * 2100 Hz space), mixed with the 75-baud return channel (390/450 Hz).
   */
  fsk(bits, { baud = 1200, mark = 1300, space = 2100, back = true } = {}) {
    const ctx = this.live;
    if (!ctx) return new Float32Array(0);
    const rate = ctx.sampleRate;
    const perBit = rate / baud;
    const out = new Float32Array(Math.ceil(bits.length * perBit));
    let phase = 0;
    let backPhase = 0;
    for (let i = 0; i < out.length; i++) {
      const bit = bits[Math.floor(i / perBit)];
      phase += (2 * Math.PI * (bit ? mark : space)) / rate;
      let s = Math.sin(phase) * 0.8;
      if (back) {
        const b = Math.floor((i / rate) * 75) % 3 === 0 ? 450 : 390;
        backPhase += (2 * Math.PI * b) / rate;
        s += Math.sin(backPhase) * 0.35;
      }
      out[i] = s;
    }
    return out;
  }

  /**
   * The modem answer heard when the server picks up: V.25 answer tone
   * (2100 Hz), the 1300 Hz carrier, the Minitel's 390 Hz reply, then a few
   * data bursts. About 3 seconds.
   */
  async handshake() {
    this.tone([2100], 1.3, { gain: 0.1, attack: 0.02 });
    await wait(1350);
    this.tone([1300], 0.5, { gain: 0.1 });
    this.tone([390], 0.9, { gain: 0.05, when: 0.25 });
    await wait(600);
    const bits = [];
    for (let i = 0; i < 1200 * 0.55; i++) bits.push(Math.random() < 0.55 ? 1 : 0);
    this.buffer(this.fsk(bits), { gain: 0.1 });
    await wait(650);
  }

  /**
   * Data sound for bytes actually transmitted (7E1 framing), queued after
   * the data already playing so it follows the modem's pace.
   */
  data(bytes, baud = 1200) {
    const ctx = this.live;
    if (!ctx || !baud) return;
    const bits = [];
    for (const byte of bytes) {
      let parity = 0;
      bits.push(0);
      for (let i = 0; i < 7; i++) {
        const bit = (byte >> i) & 1;
        parity ^= bit;
        bits.push(bit);
      }
      bits.push(parity, 1);
    }
    const when = Math.max(0, (this.dataCursor || 0) - ctx.currentTime);
    this.buffer(this.fsk(bits, { baud, back: false }), { gain: 0.05, when });
    this.dataCursor = ctx.currentTime + when + bits.length / baud;
  }

  /** The Minitel BEL: a short buzz. */
  beep() {
    this.tone([1000], 0.12, { gain: 0.08, type: 'square', phone: false, release: 0.03 });
  }

  /** Mechanical key click. */
  click() {
    const ctx = this.live;
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * 0.012);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
    this.buffer(samples, { gain: 0.22, phone: false });
    this.tone([150], 0.02, { gain: 0.08, phone: false, attack: 0.001 });
  }

  /** Line released. */
  hangup() {
    this.click();
    this.tone([425], 0.18, { gain: 0.05, when: 0.05 });
  }
}
