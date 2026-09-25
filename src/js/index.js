/**
 * minitel — Videotex design system, JavaScript entry point.
 *
 *   import { Videotex, Page, Teletel, Minitel } from './src/js/index.js';
 *   import './src/js/elements/index.js'; // custom elements
 */

// Videotex protocol
export * as codes from './videotex/constants.js';
export { COLORS, GREY_LEVELS, KEYS, KEY_LABELS } from './videotex/constants.js';
export { Videotex, vdt, sextant, colorIndex } from './videotex/writer.js';
export { Decoder } from './videotex/decoder.js';
export { Screen, Cell } from './videotex/screen.js';
export { encodeText, encodeChar, toMinitelText, textWidth, g1Byte, g1Bits } from './videotex/charset.js';

// Font
export { getGlyph, glyphMap, sextantChar, sextantBits, sextantRows, CELL_WIDTH, CELL_HEIGHT } from './font/glyphs.js';

// Terminal
export { Terminal } from './terminal/terminal.js';
export { Renderer } from './terminal/renderer.js';
export { CRT } from './terminal/crt.js';
export { COLOR_PALETTE, PHOSPHORS, monoPalette, resolvePalette } from './terminal/palettes.js';
export { KEYMAP, KEY_HELP, keyBytes, translateKeyEvent } from './terminal/keyboard.js';

// Services
export { Session, runService, Disconnected, InputParser } from './service/session.js';
export { Page, page, wrap, pad, centerCol, francs, LINE } from './service/page.js';
export { Teletel, kiosk, TARIFFS } from './service/teletel.js';
export { Minitel } from './minitel.js';

// Lines
export { createLine, LineEnd, websocketLine, serialLine } from './net/line.js';

// Mosaic imaging
export { pixelArt, indicesToCells, imageToMosaic, encodeCells, cellsToHTML, sampleImage, ART_COLORS } from './mosaic/mosaic.js';

// Sound
export { MinitelAudio } from './audio/audio.js';
