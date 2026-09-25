/**
 * <mt-minitel> — the complete device: case, CRT, keyboard, power switch.
 *
 *   <mt-minitel model="1b" theme="mono"></mt-minitel>
 *   <script type="module">
 *     const device = document.querySelector('mt-minitel');
 *     device.network = new Teletel({ services: [...] });
 *     await device.powerOn();
 *     device.dial('3615', { code: 'METEO' });
 *   </script>
 *
 * Attributes
 *   model     1b | 2                      case skin (default 1b)
 *   theme     mono | color | amber | green  screen palette
 *   baud      modem speed (default 1200)
 *   effects   on | off                    CRT shader
 *   keyboard  on | off                    show the keyboard (default on)
 *
 * Needs the design-system stylesheet (src/css/minitel.css or device.css).
 */
import './mt-terminal.js';
import './mt-keyboard.js';
import { Minitel } from '../minitel.js';
import { MinitelAudio } from '../audio/audio.js';

export class MinitelDeviceElement extends HTMLElement {
  static observedAttributes = ['theme', 'baud', 'effects', 'model', 'keyboard'];

  connectedCallback() {
    if (this.built) return;
    // A value set before the element was upgraded shadows the setter.
    if (Object.prototype.hasOwnProperty.call(this, 'network')) {
      this.pendingNetwork = this.network;
      delete this.network;
    }
    this.built = true;
    const theme = this.getAttribute('theme') || 'mono';
    const baud = this.getAttribute('baud') ?? '1200';
    const effects = this.getAttribute('effects') || 'on';
    this.classList.add('mt-device');
    this.innerHTML = `
      <div class="mt-device__monitor">
        <div class="mt-device__vents" aria-hidden="true"></div>
        <div class="mt-device__bezel">
          <mt-terminal power="off" theme="${theme}" baud="${baud}" effects="${effects}"></mt-terminal>
          <div class="mt-device__glass" aria-hidden="true"></div>
        </div>
        <div class="mt-device__panel">
          <span class="mt-device__logo" aria-hidden="true">minitel</span>
          <span class="mt-device__model" aria-hidden="true"></span>
          <span class="mt-device__spacer"></span>
          <span class="mt-device__led" aria-hidden="true"></span>
          <button type="button" class="mt-device__power" aria-pressed="false" aria-label="Marche / arrêt"><span></span></button>
        </div>
      </div>
      <div class="mt-device__hinge" aria-hidden="true"></div>
      <mt-keyboard class="mt-device__keyboard"></mt-keyboard>`;
    this.terminalElement = this.querySelector('mt-terminal');
    this.powerButton = this.querySelector('.mt-device__power');
    this.updateModel();
    this.powerButton.addEventListener('click', () => this.togglePower());
    this.audio = this.audio || new MinitelAudio();
    // Any interaction unlocks audio (autoplay policies): a mouse press, the
    // end of a touch, a key.
    const unlock = () => this.audio.unlock();
    this.addEventListener('pointerdown', unlock);
    this.addEventListener('pointerup', unlock);
    this.addEventListener('keydown', unlock);
    if (this.pendingNetwork) this.network = this.pendingNetwork;
  }

  attributeChangedCallback(name, oldValue, value) {
    if (!this.built || oldValue === value) return;
    if (name === 'theme' || name === 'baud' || name === 'effects') this.terminalElement.setAttribute(name, value);
    if (name === 'model') this.updateModel();
  }

  updateModel() {
    const model = this.getAttribute('model') || '1b';
    this.dataset.model = model;
    const label = this.querySelector('.mt-device__model');
    if (label) label.textContent = model === '2' ? '2' : '1B';
    if (this.minitel) this.minitel.model = model === '2' ? 'Minitel 2' : 'Minitel 1B';
  }

  get terminal() {
    return this.terminalElement;
  }

  /** Attach a Télétel network; creates the device controller. */
  set network(network) {
    if (!this.built) {
      this.pendingNetwork = network;
      return;
    }
    this.minitel?.destroy();
    this.minitel = new Minitel({
      terminal: this.terminalElement,
      network,
      audio: this.audio,
      model: this.getAttribute('model') === '2' ? 'Minitel 2' : 'Minitel 1B',
    });
    this.minitel.addEventListener('state', (e) => {
      const on = e.detail !== 'off';
      this.classList.toggle('is-on', on);
      this.classList.toggle('is-online', e.detail === 'connected');
      this.powerButton.setAttribute('aria-pressed', String(on));
      this.dispatchEvent(new CustomEvent('mt-state', { detail: e.detail, bubbles: true }));
    });
    for (const type of ['tick', 'service', 'hangup']) {
      this.minitel.addEventListener(type, (e) => this.dispatchEvent(new CustomEvent(`mt-${type}`, { detail: e.detail, bubbles: true })));
    }
  }

  get network() {
    return this.minitel?.network;
  }

  powerOn() {
    this.audio.unlock();
    return this.minitel?.powerOn();
  }

  powerOff() {
    return this.minitel?.powerOff();
  }

  togglePower() {
    if (!this.minitel) return undefined;
    this.audio.unlock();
    this.audio.click();
    return this.minitel.state === 'off' ? this.powerOn() : this.powerOff();
  }

  /** Dial a number; `code` is typed at the kiosk once connected. */
  dial(number, options) {
    this.audio.unlock();
    return this.minitel?.dial(number, options);
  }

  hangup() {
    this.minitel?.hangup();
  }

  focus(options) {
    this.terminalElement?.focus(options);
  }
}

if (!customElements.get('mt-minitel')) customElements.define('mt-minitel', MinitelDeviceElement);
