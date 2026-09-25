/**
 * Minitel — the whole device: screen, keyboard, modem and telephone line.
 *
 *   const minitel = new Minitel({ terminal: document.querySelector('mt-terminal'), network });
 *   await minitel.powerOn();       // local screen: "Composez le numéro"
 *   await minitel.dial('3615', { code: 'METEO' });
 *
 * States: off -> idle (local screen) -> dialing -> connected -> idle.
 * CONNEXION FIN dials from the local screen and hangs up when connected.
 *
 * Events: 'state' (detail: state), 'service' (detail: service|null),
 *         'tick' (detail: { seconds, cost }), 'hangup' (detail: summary)
 */
import { Page, francs } from './service/page.js';
import { Videotex } from './videotex/writer.js';
import { createLine } from './net/line.js';
import { runService } from './service/session.js';
import { MinitelAudio } from './audio/audio.js';
import { SEP, KEYS } from './videotex/constants.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class Minitel extends EventTarget {
  /**
   * @param {object} options
   * @param {HTMLElement|object} options.terminal <mt-terminal> element (or anything with .terminal)
   * @param {import('./service/teletel.js').Teletel} options.network
   * @param {MinitelAudio} [options.audio]
   * @param {string} [options.model='Minitel 1B']
   */
  constructor({ terminal, network, audio = new MinitelAudio(), model = 'Minitel 1B' }) {
    super();
    this.element = terminal;
    this.network = network;
    this.audio = audio;
    this.model = model;
    this.state = 'off';
    this.number = '';
    this.line = null;
    this.onKey = this.onKey.bind(this);
    this.onData = this.onData.bind(this);
    this.term.addEventListener('key', this.onKey);
    this.term.addEventListener('data', this.onData);
    this.term.addEventListener('bell', () => this.audio.beep());
    // Optional: hear the V.23 signal of every byte received ("dataSound").
    this.term.addEventListener('receive', (e) => {
      if (this.dataSound && this.state === 'connected') this.audio.data(e.detail.bytes, e.detail.baud);
    });
  }

  get term() {
    return this.element.terminal || this.element;
  }

  setState(state) {
    this.state = state;
    this.dispatchEvent(new CustomEvent('state', { detail: state }));
  }

  /* ---------------------------------------------------------------- */
  /* Power                                                             */
  /* ---------------------------------------------------------------- */

  powerOn() {
    if (this.state === 'booting') return this.booting;
    if (this.state !== 'off') return Promise.resolve();
    this.setState('booting');
    this.booting = (async () => {
      await this.term.powerOn();
      await wait(250);
      this.setState('idle');
      this.showLocal();
    })();
    return this.booting;
  }

  async powerOff() {
    if (this.state === 'off') return;
    this.hangup({ silent: true });
    this.setState('off');
    this.audio.stop();
    await this.term.powerOff();
  }

  /* ---------------------------------------------------------------- */
  /* Local screen (the Minitel's own display, no line)                 */
  /* ---------------------------------------------------------------- */

  indicator(connected) {
    this.term.screen.setIndicator(connected ? 'C' : 'F');
  }

  showLocal(summary = this.summary) {
    const p = new Page().clear().cursor(false);
    p.status('', {});
    this.indicator(false);
    p.bigText(2, 10, 'Minitel', { color: 'white' });
    p.center(6, this.model.toUpperCase(), { color: 'cyan' });
    p.hline(7, { col: 10, width: 21, color: 'blue', style: 'middle' });
    if (summary) {
      p.center(9, 'Fin de connexion', { color: 'yellow' });
      p.center(10, `${summary.number}  ${formatDuration(summary.seconds)}  ${francs(summary.cost)}`, { color: 'white' });
    }
    p.center(12, 'Composez le numéro', { color: 'white' });
    p.center(13, 'du service', { color: 'white' });
    p.moveTo(15, 13).color('cyan').size('double').fill('.', 8);
    p.center(18, 'puis appuyez sur', { color: 'white' });
    p.key(19, 13, 'CONNEXION FIN');
    p.moveTo(22, 2).color('blue').text('3611').color('white').text(' annuaire  ')
      .color('blue').text('3615').color('white').text(' kiosque');
    p.moveTo(23, 2).color('white').text('Correction : effacer    Envoi : 3615');
    this.term.writeNow(p);
    this.number = '';
    this.renderNumber();
  }

  renderNumber() {
    const digits = this.number.padEnd(8, '.').slice(0, 8);
    const v = new Videotex().moveTo(15, 13).color('cyan').size('double').text(digits);
    if (this.state === 'idle') v.moveTo(15, 13 + Math.min(this.number.length, 7) * 2).cursor(true);
    this.term.writeNow(v);
  }

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                          */
  /* ---------------------------------------------------------------- */

  onKey(event) {
    const { key, text } = event.detail;
    this.audio.click();
    if (this.state !== 'idle') {
      if (key === 'CONNEXION_FIN' && this.state === 'dialing') this.abort = true;
      return;
    }
    if (text && /[0-9*#]/.test(text) && this.number.length < 8) {
      this.number += text;
      this.audio.dtmf(text);
      this.renderNumber();
    } else if (key === 'CORRECTION' && this.number) {
      this.number = this.number.slice(0, -1);
      this.renderNumber();
    } else if (key === 'ANNULATION') {
      this.number = '';
      this.renderNumber();
    } else if (key === 'CONNEXION_FIN' || key === 'ENVOI') {
      this.dial(this.number || '3615');
    }
  }

  onData(event) {
    const bytes = event.detail;
    // CONNEXION FIN is handled by the modem, never sent to the server.
    if (bytes.length === 2 && bytes[0] === SEP && bytes[1] === KEYS.CONNEXION_FIN) {
      if (this.state === 'connected') this.hangup();
      return;
    }
    if (this.state === 'connected' && this.line) this.line.send(bytes);
  }

  /* ---------------------------------------------------------------- */
  /* Line                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Dial a number. With `code`, the code is typed at the kiosk once
   * connected, as a user would.
   */
  async dial(number, { code, fast = false } = {}) {
    if (this.state === 'off' || this.state === 'booting') await this.powerOn();
    if (this.state === 'connected') this.hangup({ silent: true });
    if (this.state !== 'idle') return false;
    number = String(number).replace(/\s/g, '');
    this.number = number;
    this.abort = false;
    this.setState('dialing');
    this.renderNumber();
    const status = (text) => this.term.writeNow(new Videotex().moveTo(0, 1).color('white').text(text).clearEOL().lf());
    const quick = fast || !this.audio.ready;

    // The user may hang up (or power off) while we wait: stop quietly then.
    const interrupted = () => {
      if (this.state !== 'dialing') return true;
      if (this.abort) {
        this.cancelDial();
        return true;
      }
      return false;
    };

    status(` Appel ${number}`);
    if (!quick) {
      await this.audio.dial(number);
      if (interrupted()) return false;
      status(` Appel ${number}  sonnerie...`);
      await this.audio.ringback(1);
    } else {
      await wait(500);
    }
    if (interrupted()) return false;

    const service = this.network.answer(number);
    if (!service) {
      status(` ${number} : pas de réponse`);
      this.audio.hangup();
      await wait(1800);
      if (this.state !== 'dialing') return false;
      this.setState('idle');
      this.showLocal(null);
      return false;
    }

    status(` ${number}  connexion...`);
    this.term.glitch(quick ? 500 : 2600, 0.01);
    if (!quick) await this.audio.handshake();
    else await wait(600);
    if (interrupted()) return false;

    this.connect(number, service);
    if (code) this.autoType(code);
    return true;
  }

  cancelDial() {
    this.audio.stop();
    this.audio.hangup();
    this.setState('idle');
    this.showLocal(null);
    return false;
  }

  connect(number, service) {
    const [terminalEnd, serverEnd] = createLine();
    this.line = terminalEnd;
    this.connectedAt = Date.now();
    this.tariff = this.network.tariff(number);
    this.term.discard();
    this.term.writeNow(new Videotex().clear().cursor(false).moveTo(0, 1).clearEOL().lf());
    this.indicator(true);
    terminalEnd.addEventListener('data', (e) => this.term.write(e.detail));
    terminalEnd.addEventListener('close', () => {
      if (this.line === terminalEnd) this.hangup();
    });
    this.setState('connected');
    this.ticker = setInterval(() => this.dispatchEvent(new CustomEvent('tick', { detail: this.bill() })), 1000);
    runService(service, serverEnd, {
      number,
      network: this.network,
      minitel: this,
      onService: (s) => this.dispatchEvent(new CustomEvent('service', { detail: s })),
    });
  }

  /** Type a code at the kiosk, then ENVOI — visibly, key by key. */
  async autoType(code) {
    await wait(400);
    await this.term.drain();
    await wait(500);
    for (const ch of code) {
      if (this.state !== 'connected') return;
      this.term.type(ch);
      this.audio.click();
      await wait(110 + Math.random() * 90);
    }
    await wait(250);
    if (this.state === 'connected') this.term.key('ENVOI');
  }

  /** Current connection time and cost. */
  bill() {
    if (!this.connectedAt) return { seconds: 0, cost: 0 };
    const seconds = (Date.now() - this.connectedAt) / 1000;
    const { perMinute = 0, freeMinutes = 0 } = this.tariff || {};
    const billable = Math.max(0, seconds / 60 - freeMinutes);
    return { seconds, cost: billable * perMinute, number: this.number };
  }

  hangup({ silent = false } = {}) {
    if (this.state !== 'connected' && this.state !== 'dialing') return;
    const summary = this.state === 'connected' ? { ...this.bill(), number: this.number } : null;
    clearInterval(this.ticker);
    const line = this.line;
    this.line = null;
    this.connectedAt = null;
    line?.close();
    this.term.discard();
    if (!silent) this.audio.hangup();
    this.setState('idle');
    this.summary = summary;
    this.dispatchEvent(new CustomEvent('hangup', { detail: summary || { seconds: 0, cost: 0, number: this.number } }));
    this.dispatchEvent(new CustomEvent('service', { detail: null }));
    this.showLocal(summary);
  }

  destroy() {
    this.hangup({ silent: true });
    this.term.removeEventListener('key', this.onKey);
    this.term.removeEventListener('data', this.onData);
  }
}
