/**
 * HTML-side mosaic helpers for the CSS design system.
 *
 *   <mt-bigtext color="yellow">3615</mt-bigtext>
 *       giant lettering made of sextant characters (3x3 cells per letter)
 *
 *   <mt-mosaic src="photo.jpg" cols="40" rows="12" palette="color"></mt-mosaic>
 *       an image converted to Videotex mosaics, as selectable text
 *
 *   <mt-typewriter baud="1200">Any <b>markup</b>...</mt-typewriter>
 *       reveals its content at modem speed (10 bits per character)
 */
import { getGlyph } from '../font/glyphs.js';
import { imageToMosaic, sampleImage, cellsToHTML, indicesToCells, pixelArt } from '../mosaic/mosaic.js';
import { COLOR_INDEX } from '../videotex/constants.js';
import { toMinitelText } from '../videotex/charset.js';

/* ---------------------------------------------------------------------- */

export class MinitelBigTextElement extends HTMLElement {
  static observedAttributes = ['color', 'text', 'spacing'];

  connectedCallback() {
    if (this.source === undefined) this.source = this.getAttribute('text') ?? this.textContent;
    this.classList.add('mt-mosaic');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.render();
  }

  attributeChangedCallback(name) {
    if (name === 'text') this.source = this.getAttribute('text');
    // Attributes are reported before connectedCallback on upgrade: wait for the text.
    if (this.isConnected && this.source !== undefined) this.render();
  }

  get text() {
    return this.source;
  }

  set text(value) {
    this.source = String(value);
    this.render();
  }

  render() {
    const text = toMinitelText((this.source || '').replace(/\s+/g, ' ').trim());
    this.setAttribute('aria-label', text);
    const spacing = Number(this.getAttribute('spacing') ?? 1);
    const advance = 5 + spacing;
    const chars = [...text];
    const width = Math.max(1, chars.length * advance - spacing);
    const height = 9;
    const ink = COLOR_INDEX[this.getAttribute('color')] ?? 7;
    const data = new Int8Array(width * height).fill(-1);
    chars.forEach((ch, i) => {
      const glyph = getGlyph(ch);
      if (!glyph) return;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < 5; x++) {
          if (glyph[y + 1] & (0x80 >> (x + 1))) data[y * width + i * advance + x] = ink;
        }
      }
    });
    const cells = indicesToCells({ width, height, data });
    // Transparent background: keep the ink colour, drop the cell backgrounds.
    this.innerHTML = cellsToHTML(cells).replace(/ mt-bg-\w+/g, '');
  }
}

/* ---------------------------------------------------------------------- */

export class MinitelMosaicElement extends HTMLElement {
  static observedAttributes = ['src', 'cols', 'rows', 'palette', 'dither', 'art'];

  connectedCallback() {
    this.classList.add('mt-mosaic');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  async render() {
    const cols = Number(this.getAttribute('cols') || 40);
    const rows = Number(this.getAttribute('rows') || 12);
    const art = this.getAttribute('art');
    if (art !== null) {
      const cells = indicesToCells(pixelArt(art.split('|')));
      this.innerHTML = cellsToHTML(cells);
      return;
    }
    const src = this.getAttribute('src');
    if (!src) return;
    const token = (this.token = Symbol('render'));
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    try {
      await image.decode();
    } catch {
      return;
    }
    if (token !== this.token) return;
    const pixels = sampleImage(image, cols, rows, { fit: this.getAttribute('fit') || 'cover' });
    const cells = imageToMosaic(pixels, {
      palette: this.getAttribute('palette') || 'color',
      dither: this.getAttribute('dither') || 'floyd-steinberg',
    });
    this.innerHTML = cellsToHTML(cells);
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', this.getAttribute('alt') || 'Image en mosaïque');
  }
}

/* ---------------------------------------------------------------------- */

/**
 * Reveal the text of `root` progressively, `baud / 10` characters per
 * second, keeping the markup. Returns a promise and a cancel function.
 */
export function revealAtBaud(root, { baud = 1200, onDone } = {}) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
  nodes.forEach((n) => { n.node.nodeValue = ''; });
  const total = nodes.reduce((sum, n) => sum + n.text.length, 0);
  const cps = baud / 10;
  let shown = 0;
  let index = 0;
  let cancelled = false;
  let frame;
  const start = performance.now();
  const promise = new Promise((resolve) => {
    const step = (now) => {
      if (cancelled) return resolve(false);
      const target = baud ? Math.min(total, Math.floor(((now - start) / 1000) * cps)) : total;
      while (shown < target && index < nodes.length) {
        const n = nodes[index];
        const visible = n.node.nodeValue.length;
        const take = Math.min(n.text.length - visible, target - shown);
        n.node.nodeValue = n.text.slice(0, visible + take);
        shown += take;
        if (n.node.nodeValue.length >= n.text.length) index++;
      }
      if (shown >= total) {
        onDone?.();
        resolve(true);
      } else {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
  });
  const cancel = () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    nodes.forEach((n) => { n.node.nodeValue = n.text; });
  };
  return { promise, cancel };
}

export class MinitelTypewriterElement extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || this.getAttribute('baud') === '0') return;
    const run = () => {
      const { promise, cancel } = revealAtBaud(this, { baud: Number(this.getAttribute('baud') || 1200) });
      this.cancel = cancel;
      promise.then((done) => done && this.dispatchEvent(new Event('mt-done', { bubbles: true })));
    };
    if (this.hasAttribute('on-visible')) {
      this.style.visibility = 'hidden';
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        this.style.visibility = '';
        run();
      });
      observer.observe(this);
    } else {
      run();
    }
  }

  /** Show everything immediately. */
  finish() {
    this.cancel?.();
  }
}

if (!customElements.get('mt-bigtext')) customElements.define('mt-bigtext', MinitelBigTextElement);
if (!customElements.get('mt-mosaic')) customElements.define('mt-mosaic', MinitelMosaicElement);
if (!customElements.get('mt-typewriter')) customElements.define('mt-typewriter', MinitelTypewriterElement);
