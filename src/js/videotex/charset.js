/**
 * Character set helpers: Unicode <-> Videotex G0/G1/G2.
 */
import { SS2, G2_ACCENTS, G2_CHARS } from './constants.js';
import { sextantChar } from '../font/glyphs.js';

/** Unicode character displayed for a G0 byte. */
export function g0Char(byte) {
  if (byte === 0x7f) return '█';
  return String.fromCharCode(byte);
}

/** Sextant bits (0..63) of a G1 byte (0x20..0x3f, 0x60..0x7f). */
export function g1Bits(byte) {
  return (byte & 0x1f) | (byte & 0x40 ? 0x20 : 0);
}

/** G1 byte for sextant bits (0..63). */
export function g1Byte(bits) {
  bits &= 63;
  return 0x20 | (bits & 0x1f) | (bits & 0x20 ? 0x40 : 0);
}

/** Unicode character displayed for a G1 byte. */
export function g1Char(byte) {
  return sextantChar(g1Bits(byte));
}

/** Compose a G2 diacritic with a base letter, e.g. (0x42, 'e') -> 'é'. */
export function composeAccent(accentCode, base) {
  const mark = G2_ACCENTS[accentCode];
  if (!mark) return base;
  const composed = (base + mark).normalize('NFC');
  return composed.length === 1 ? composed : base;
}

/* Reverse tables for encoding. */
const G2_REVERSE = new Map(Object.entries(G2_CHARS).map(([code, ch]) => [ch, Number(code)]));
G2_REVERSE.delete('$');
G2_REVERSE.delete('#');

const ACCENT_REVERSE = new Map(Object.entries(G2_ACCENTS).map(([code, mark]) => [mark, Number(code)]));

/** Accented lowercase letters a Minitel can compose. */
const COMPOSABLE = new Set([...'àâäçéèêëîïôöùûüÿ']);

const TRANSLIT = {
  '’': "'", '‘': "'", 'ʼ': "'", '´': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-', '…': '...', '•': '*', '·': '.', '×': 'x',
  '€': 'E', '©': '(c)', '®': '(r)', '™': 'TM', 'æ': 'ae', 'Æ': 'AE', 'ø': 'o', 'Ø': 'O',
  ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ',
};

/**
 * Encode one Unicode character into G0/G2 bytes.
 * Returns an array of bytes (empty for characters that cannot be shown).
 */
export function encodeChar(ch) {
  const code = ch.charCodeAt(0);
  if (ch.length === 1 && code >= 0x20 && code < 0x7f) return [code];
  if (G2_REVERSE.has(ch)) return [SS2, G2_REVERSE.get(ch)];
  if (COMPOSABLE.has(ch)) {
    const [base, mark] = ch.normalize('NFD');
    return [SS2, ACCENT_REVERSE.get(mark), base.charCodeAt(0)];
  }
  if (TRANSLIT[ch] !== undefined) return [...TRANSLIT[ch]].flatMap(encodeChar);
  if (ch === '█') return [0x7f];
  const stripped = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (stripped !== ch && stripped.length) return [...stripped].flatMap(encodeChar);
  return [0x3f]; // '?'
}

/** Encode a string into G0/G2 bytes (no control characters). */
export function encodeText(text) {
  const out = [];
  for (const ch of text) out.push(...encodeChar(ch));
  return out;
}

/**
 * Width, in cells, of a string once encoded — accents and G2 characters
 * take one cell, transliterations may take several.
 */
export function textWidth(text) {
  let width = 0;
  for (const ch of text) {
    const bytes = encodeChar(ch);
    width += bytes[0] === SS2 ? 1 : bytes.length;
  }
  return width;
}

/** Normalize a string to what a Minitel can actually display. */
export function toMinitelText(text) {
  let out = '';
  for (const ch of text) {
    const bytes = encodeChar(ch);
    if (bytes[0] === SS2) {
      out += bytes.length === 3 ? composeAccent(bytes[1], String.fromCharCode(bytes[2])) : G2_CHARS[bytes[1]];
    } else {
      out += bytes.map((b) => g0Char(b)).join('');
    }
  }
  return out;
}
