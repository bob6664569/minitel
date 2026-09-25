/**
 * Server-side view of a Minitel connection.
 *
 * A service is an async function that talks to one Session:
 *
 *   export default {
 *     code: 'HELLO',
 *     async run(session) {
 *       session.write(new Page().clear().title('Bonjour'));
 *       const { key, value } = await session.input({ row: 20, col: 10, length: 12 });
 *     },
 *   };
 *
 * Like a real Télétel server, the session echoes what the user types into
 * input fields; the terminal itself never echoes.
 */
import { Videotex } from '../videotex/writer.js';
import { KEY_NAMES, SEP, SS2, ESC, SOH, EOT, US, G2_CHARS, G2_ACCENTS } from '../videotex/constants.js';
import { composeAccent } from '../videotex/charset.js';

/** Thrown inside a service when the line is hung up. */
export class Disconnected extends Error {
  constructor() {
    super('Minitel disconnected');
    this.name = 'Disconnected';
  }
}

/**
 * Parses what a Minitel keyboard sends: characters (with G2 accents),
 * function keys (SEP x), arrows (CSI A..D) and protocol answers.
 */
export class InputParser {
  constructor() {
    this.state = 0;
    this.buffer = [];
  }

  /** Returns the events decoded from `bytes`. */
  feed(bytes) {
    const events = [];
    for (const raw of bytes) {
      const b = raw & 0x7f;
      switch (this.state) {
        case 1: // SEP
          this.state = 0;
          if (KEY_NAMES[b]) events.push({ type: 'key', key: KEY_NAMES[b] });
          break;
        case 2: // SS2
          if (G2_ACCENTS[b]) {
            this.accent = b;
            this.state = 3;
          } else {
            this.state = 0;
            if (G2_CHARS[b]) events.push({ type: 'char', char: G2_CHARS[b] });
          }
          break;
        case 3: // accent + base
          this.state = 0;
          events.push({ type: 'char', char: composeAccent(this.accent, String.fromCharCode(b)) });
          break;
        case 4: // ESC
          this.state = b === 0x5b ? 5 : 0;
          break;
        case 5: // CSI
          if (b >= 0x40) {
            this.state = 0;
            const dir = { 0x41: 'UP', 0x42: 'DOWN', 0x43: 'RIGHT', 0x44: 'LEFT' }[b];
            if (dir) events.push({ type: 'key', key: dir });
          }
          break;
        case 6: // SOH ... EOT
          if (b === EOT) {
            this.state = 0;
            events.push({ type: 'response', kind: 'identity', value: String.fromCharCode(...this.buffer) });
          } else {
            this.buffer.push(b);
          }
          break;
        case 7: // US row col (cursor position answer)
          this.buffer.push(b);
          if (this.buffer.length === 2) {
            this.state = 0;
            events.push({ type: 'response', kind: 'cursor', row: this.buffer[0] - 0x40, col: this.buffer[1] - 0x40 });
          }
          break;
        default:
          if (b === SEP) this.state = 1;
          else if (b === SS2) this.state = 2;
          else if (b === ESC) this.state = 4;
          else if (b === SOH) { this.state = 6; this.buffer = []; }
          else if (b === US) { this.state = 7; this.buffer = []; }
          else if (b === 0x0d) events.push({ type: 'key', key: 'ENVOI' });
          else if (b >= 0x20 && b < 0x7f) events.push({ type: 'char', char: String.fromCharCode(b) });
      }
    }
    return events;
  }
}

const isIdentity = (event) => event.type === 'response' && event.kind === 'identity';

/** Keys that end an input field by default. */
const FIELD_EXIT_KEYS = new Set(['ENVOI', 'SUITE', 'RETOUR', 'SOMMAIRE', 'GUIDE', 'REPETITION', 'CONNEXION_FIN']);

export class Session extends EventTarget {
  /**
   * @param {import('../net/line.js').LineEnd} line server end of the line
   */
  constructor(line) {
    super();
    this.line = line;
    this.parser = new InputParser();
    this.events = [];
    this.waiters = [];
    this.connected = true;
    this.startedAt = Date.now();
    this.data = {};
    this.onData = (e) => this.receive(e.detail);
    this.onClose = () => this.close();
    line.addEventListener('data', this.onData);
    line.addEventListener('close', this.onClose);
  }

  /* ---------------------------------------------------------------- */
  /* Output                                                            */
  /* ---------------------------------------------------------------- */

  /** Send Videotex: writers, byte arrays or binary strings. */
  write(...parts) {
    if (!this.connected) throw new Disconnected();
    for (const part of parts) {
      if (part === undefined || part === null) continue;
      const bytes = part instanceof Videotex ? part.bytes() : new Videotex().raw(part).bytes();
      if (bytes.length) this.line.send(bytes);
    }
    return this;
  }

  /** Ask the terminal for its identification (ENQROM). */
  async identify(timeout = 1500) {
    this.write(new Videotex().requestIdentity());
    const event = await this.next({ timeout, filter: isIdentity });
    return event ? event.value : null;
  }

  /**
   * Resolves once the terminal has displayed everything sent so far: it
   * answers an identity request only after the bytes queued before it, so
   * animations and live pages go at the pace of the line, whatever its
   * speed. Other input stays queued. Resolves false after `timeout` ms
   * without an answer.
   */
  async sync(timeout = 8000) {
    this.write(new Videotex().requestIdentity());
    return (await this.next({ timeout, filter: isIdentity })) !== null;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  receive(bytes) {
    for (const event of this.parser.feed(bytes)) {
      const index = this.waiters.findIndex((w) => !w.filter || w.filter(event));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(event);
      } else {
        this.events.push(event);
      }
      this.dispatchEvent(new CustomEvent('input', { detail: event }));
    }
  }

  /**
   * Next input event: { type: 'char', char } | { type: 'key', key }.
   * Resolves to null after `timeout` ms. Rejects with Disconnected on hang-up.
   */
  next({ timeout, filter } = {}) {
    if (!this.connected) return Promise.reject(new Disconnected());
    const index = this.events.findIndex((e) => !filter || filter(e));
    if (index >= 0) return Promise.resolve(this.events.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, filter };
      if (timeout !== undefined) {
        waiter.timer = setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          resolve(null);
        }, timeout);
      }
      this.waiters.push(waiter);
    });
  }

  /** Non-blocking: the next queued event, or undefined. */
  poll() {
    if (!this.connected) throw new Disconnected();
    return this.events.shift();
  }

  /** Forget typed-ahead input. */
  flush() {
    this.events.length = 0;
  }

  /** Wait for one of the given function keys (any key when omitted). */
  async waitKey(keys) {
    for (;;) {
      const event = await this.next();
      if (event.type === 'key' && (!keys || keys.includes(event.key))) return event.key;
    }
  }

  sleep(ms) {
    if (!this.connected) return Promise.reject(new Disconnected());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeEventListener('close', onClose);
        resolve();
      }, ms);
      const onClose = () => {
        clearTimeout(timer);
        reject(new Disconnected());
      };
      this.addEventListener('close', onClose, { once: true });
    });
  }

  /**
   * Edit one field with server-side echo.
   *
   * @param {object} field
   * @param {number} field.row
   * @param {number} field.col
   * @param {number} field.length maximum characters
   * @param {number} [field.width=length] cells per row: a longer field wraps
   *   onto the following rows (a multi-line message box)
   * @param {string} [field.value=''] initial value
   * @param {string} [field.placeholder='.'] filler shown in empty positions
   * @param {string|number} [field.color='white']
   * @param {boolean} [field.uppercase=false]
   * @param {boolean} [field.secret=false] echo '*' instead of the characters
   * @param {RegExp} [field.accept] characters accepted
   * @param {string[]} [field.exitKeys] function keys that end the input
   * @returns {Promise<{key: string, value: string}>}
   */
  async input(field) {
    const f = { value: '', placeholder: '.', color: 'white', uppercase: false, secret: false, ...field };
    const width = f.width || f.length;
    const exitKeys = new Set(f.exitKeys || FIELD_EXIT_KEYS);
    let value = f.value.slice(0, f.length);
    const place = (i) => [f.row + Math.floor(i / width), f.col + (i % width)];
    const at = (i) => new Videotex().moveTo(...place(i)).color(f.color);
    const start = f.redraw === false ? new Videotex() : this.drawField(f, value);
    this.write(start.moveTo(...place(Math.min(value.length, f.length - 1))).cursor(true));
    let edited = false;
    try {
      for (;;) {
        const event = await this.next();
        if (event.type === 'char') {
          let ch = f.uppercase ? event.char.toUpperCase() : event.char;
          if (f.accept && !f.accept.test(ch)) {
            this.write(new Videotex().bell());
            continue;
          }
          // A full field starts over at the first character typed in it, so
          // a prefilled date or hour can be typed over.
          const echo = new Videotex();
          if (!edited && value.length >= f.length) {
            value = '';
            echo.append(this.drawField(f, value));
          }
          edited = true;
          if (value.length >= f.length) {
            this.write(new Videotex().bell());
            continue;
          }
          value += ch;
          if (f.secret) ch = '*';
          echo.append(at(value.length - 1).text(ch));
          // Keep the cursor inside the field: on the last cell once full, and
          // at the start of the next row when the echo ended a row.
          if (value.length >= f.length) echo.moveTo(...place(f.length - 1));
          else if (value.length % width === 0) echo.moveTo(...place(value.length));
          this.write(echo.cursor(true));
        } else if (event.type === 'key') {
          if (event.key === 'CORRECTION' || event.key === 'LEFT') {
            edited = true;
            if (!value.length) continue;
            value = value.slice(0, -1);
            this.write(at(value.length).text(f.placeholder || ' ').moveTo(...place(value.length)).cursor(true));
          } else if (event.key === 'ANNULATION') {
            edited = true;
            value = '';
            this.write(this.drawField(f, value).moveTo(f.row, f.col).cursor(true));
          } else if (exitKeys.has(event.key)) {
            return { key: event.key, value };
          }
        }
      }
    } finally {
      if (this.connected) this.write(new Videotex().cursor(false));
    }
  }

  /** Writer that draws a field with its current value and placeholders. */
  drawField(f, value) {
    const width = f.width || f.length;
    const shown = f.secret ? '*'.repeat(value.length) : value;
    const v = new Videotex();
    for (let i = 0; i < f.length; i += width) {
      const segment = [...shown].slice(i, i + width).join('');
      const cells = Math.min(width, f.length - i);
      v.moveTo(f.row + i / width, f.col).color(f.color).text(segment);
      const rest = cells - [...segment].length;
      if (rest > 0) v.fill(f.placeholder || ' ', rest);
    }
    return v;
  }

  /**
   * Multi-field form. SUITE / ↓ moves to the next field, RETOUR / ↑ to the
   * previous one, ENVOI submits. Other function keys end the form too.
   *
   * @param {Array<object>} fields see input(); each may have a `name`
   * @returns {Promise<{key: string, values: object, index: number}>}
   */
  async form(fields, { index = 0, submit = ['ENVOI'] } = {}) {
    const values = fields.map((f) => f.value || '');
    const draw = new Videotex();
    fields.forEach((f, i) => draw.append(this.drawField({ placeholder: '.', color: 'white', ...f }, values[i])));
    this.write(draw);
    for (;;) {
      const f = fields[index];
      const { key, value } = await this.input({
        placeholder: '.',
        color: 'white',
        ...f,
        value: values[index],
        redraw: false,
        exitKeys: [...FIELD_EXIT_KEYS, 'UP', 'DOWN'],
      });
      values[index] = value;
      const named = Object.fromEntries(fields.map((field, i) => [field.name ?? i, values[i]]));
      const forward = key === 'SUITE' || key === 'DOWN';
      const backward = key === 'RETOUR' || key === 'UP';
      if (fields.length > 1 && forward) index = (index + 1) % fields.length;
      else if (fields.length > 1 && backward) index = (index - 1 + fields.length) % fields.length;
      else if (key === 'UP' || key === 'DOWN') continue;
      else if (submit.includes(key) || FIELD_EXIT_KEYS.has(key)) return { key, values: named, index };
    }
  }

  /** Seconds since the connection started. */
  get elapsed() {
    return (Date.now() - this.startedAt) / 1000;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  /** Hang up from the server side. */
  disconnect() {
    this.line.close();
  }

  close() {
    if (!this.connected) return;
    this.connected = false;
    this.line.removeEventListener('data', this.onData);
    this.line.removeEventListener('close', this.onClose);
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Disconnected());
    }
    this.dispatchEvent(new Event('close'));
  }
}

/**
 * Run a service on a line end until it returns or the line closes.
 * @returns {Promise<Session>}
 */
export async function runService(service, line, context = {}) {
  const session = new Session(line);
  try {
    await (typeof service === 'function' ? service(session, context) : service.run(session, context));
  } catch (error) {
    if (!(error instanceof Disconnected)) console.error(`[${service.code || 'service'}]`, error);
  } finally {
    if (session.connected && context.hangUpOnReturn !== false) session.disconnect();
  }
  return session;
}
