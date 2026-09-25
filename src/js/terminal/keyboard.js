/**
 * Keyboard: DOM key events -> Minitel keys, and Minitel keys -> bytes.
 */
import { KEYS, SEP, ESC, CSI } from '../videotex/constants.js';
import { encodeText } from '../videotex/charset.js';

/**
 * Default PC keyboard mapping for the Minitel function keys.
 * Arrows are sent as CSI sequences, like on the Minitel 2.
 */
export const KEYMAP = Object.freeze({
  Enter: 'ENVOI',
  NumpadEnter: 'ENVOI',
  Backspace: 'CORRECTION',
  Escape: 'ANNULATION',
  Delete: 'ANNULATION',
  PageDown: 'SUITE',
  PageUp: 'RETOUR',
  Home: 'SOMMAIRE',
  F1: 'GUIDE',
  F2: 'REPETITION',
  End: 'CONNEXION_FIN',
  F10: 'CONNEXION_FIN',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowRight: 'RIGHT',
  ArrowLeft: 'LEFT',
});

/** Shift + key alternatives, so every function key is reachable on a laptop. */
export const SHIFT_KEYMAP = Object.freeze({
  Enter: 'SUITE',
  Backspace: 'RETOUR',
  Escape: 'SOMMAIRE',
});

/** Short help for UIs: [Minitel key, PC key]. */
export const KEY_HELP = Object.freeze([
  ['ENVOI', 'Entrée'],
  ['SUITE', 'Page ↓ · Maj+Entrée'],
  ['RETOUR', 'Page ↑ · Maj+⌫'],
  ['CORRECTION', '⌫'],
  ['ANNULATION', 'Échap · Suppr'],
  ['SOMMAIRE', 'Début · Maj+Échap'],
  ['GUIDE', 'F1'],
  ['REPETITION', 'F2'],
  ['CONNEXION_FIN', 'Fin · F10'],
]);

const ARROWS = { UP: 0x41, DOWN: 0x42, RIGHT: 0x43, LEFT: 0x44 };

/** Bytes a Minitel sends for a key name or typed text. */
export function keyBytes(key) {
  if (KEYS[key]) return [SEP, KEYS[key]];
  if (ARROWS[key]) return [ESC, CSI, ARROWS[key]];
  return encodeText(key);
}

/**
 * Translate a DOM KeyboardEvent into { key } (function key or arrow),
 * { text } (printable character) or null.
 */
export function translateKeyEvent(event) {
  if (event.isComposing || event.metaKey || (event.ctrlKey && !event.altKey)) return null;
  if (event.shiftKey && SHIFT_KEYMAP[event.key]) return { key: SHIFT_KEYMAP[event.key] };
  if (KEYMAP[event.key]) return { key: KEYMAP[event.key] };
  if (event.key.length === 1 || /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(event.key)) return { text: event.key };
  return null;
}
