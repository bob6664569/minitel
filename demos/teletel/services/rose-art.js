/**
 * 3615 ROSE — the picture of the home page.
 *
 * Third-party material: this picture reproduces the home page of the
 * 3615 ULLA messaging service (late 1980s), redrawn from a screenshot,
 * with its logo replaced by "rose". It is not original work and is not
 * covered by the MIT license of this repository.
 *
 * It is drawn the Minitel way: the hairlines are the '/', '\' and '_'
 * characters of the G0 set, some in double width or double height, and
 * the dotted masses are separated mosaics.
 */
import { colorIndex } from '../../../src/js/videotex/writer.js';
import { encodeCells } from '../../../src/js/mosaic/mosaic.js';
import { sextantBits } from '../../../src/js/font/glyphs.js';

const INKS = { k: 'black', r: 'red', g: 'green', y: 'yellow', b: 'blue', m: 'magenta', c: 'cyan', w: 'white' };

/* Separated mosaics from row 3 down, 40 cells a row, with their colours. */
const MOSAICS = [
  ['                            🬞           ', '............................w...........'], // 3
  ['                                        ', '........................................'], // 4
  ['                                        ', '........................................'], // 5
  ['                     🬭🬭🬭🬭🬏              ', '.....................cwwww..............'], // 6
  ['                🬵    🬊██🬝         🬓  🬞🬻█', '................y....yyyy.........y..yyy'], // 7
  ['              🬞🬻█🬲    🬁🬂🬀     🬞🬻  █🬹🬻███', '..............cccc....ccc.....cc..cccccc'], // 8
  ['                            🬵🬻█🬝  ██████', '............................gggg..gggggg'], // 9
  ['                                  ██████', '..................................gggggg'], // 10
  ['████🬺🬭  🬭🬭🬵🬹🬹🬹🬹🬱🬭🬭🬭🬭🬏      🬂🬂    🬞██████', 'mmmmmm..mmmmmmmmmmmmm......mm....mmmmmmm'], // 11
  ['█████████████████████🬹🬭🬭🬭🬵🬹🬹🬹🬹🬹🬹🬹███████', 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm'], // 12
];
const MOSAIC_TOP = 3;

/* Hairlines: [row, col, characters, colour, size]. */
const LINES = [
  // The raised knee, its white crest drawn in double width.
  [6, 14, '/', 'green'],
  [5, 15, '/', 'green'],
  [4, 16, '/', 'white', 'wide'],
  [4, 18, '\\', 'white', 'wide'],
  [5, 20, '\\', 'green'],
  [6, 21, '\\', 'green'],
  [9, 19, '\\', 'magenta'],
  // Shoulder, head and hair.
  [5, 27, '/', 'green'],
  [4, 28, '/', 'white', 'wide'],
  [3, 30, '__', 'white'],
  [3, 32, '_', 'magenta'],
  [3, 33, '/', 'white', 'wide'],
  [2, 34, '|', 'white'],
  [1, 34, '___', 'white'],
  [2, 37, '\\', 'green', 'wide'],
  [3, 39, '\\', 'magenta'],
  [5, 40, '\\', 'red', 'tall'],
  [4, 33, '_', 'white'],
  [5, 34, '\\', 'magenta'],
  // The arm.
  [10, 28, '____', 'green'],
];

/*
 * The "rose" logo, in the same hairlines: [row, col, characters]. Letters
 * run from row 4 (the top stroke) to row 9, a column apart.
 */
const LOGO = [
  // r
  [4, 2, '_'], [5, 1, '/'], [6, 1, '|'], [7, 1, '|'], [8, 1, '|'], [9, 1, '|'],
  // o
  [4, 4, '_'], [5, 3, '/'], [5, 5, '\\'], [6, 3, '|'], [6, 5, '|'], [7, 3, '|'], [7, 5, '|'], [8, 3, '|'], [8, 5, '|'],
  [9, 3, '\\_/'],
  // s
  [4, 8, '_'], [5, 7, '/'], [6, 7, '\\'], [7, 8, '\\'], [8, 9, '\\'], [9, 7, '\\_/'],
  // e: a closed eye on a stem
  [4, 12, '_'], [5, 11, '/'], [5, 13, '\\'], [6, 11, '\\_/'], [7, 11, '|'], [8, 11, '|'], [9, 11, '\\__'],
];

/** Draw the picture (rows 1 to 12) on a writer or a Page. */
export function drawPicture(v) {
  const cells = [];
  for (const [marks, inks] of MOSAICS) {
    const chars = [...marks];
    for (let col = 0; col < 40; col++) {
      const bits = chars[col] === ' ' ? 0 : sextantBits(chars[col]);
      cells.push(bits ? { bits, fg: colorIndex(INKS[inks[col]]), bg: 0 } : { bits: 0, fg: 7, bg: 0, transparent: true });
    }
  }
  encodeCells(v, { cols: 40, rows: MOSAICS.length, cells }, { row: MOSAIC_TOP, col: 1, separated: true });
  for (const [row, col, text, color, size = 'normal'] of LINES) v.moveTo(row, col).color(color).size(size).text(text);
  for (const [row, col, text] of LOGO) v.moveTo(row, col).color('white').size('normal').text(text);
  return v;
}
