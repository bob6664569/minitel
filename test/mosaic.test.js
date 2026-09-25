import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageToMosaic, indicesToCells, pixelArt, cellsToHTML, encodeCells } from '../src/js/mosaic/mosaic.js';
import { Videotex } from '../src/js/videotex/writer.js';
import { Screen } from '../src/js/videotex/screen.js';
import { Decoder } from '../src/js/videotex/decoder.js';
import { sextantBits } from '../src/js/font/glyphs.js';
import { COLOR_PALETTE } from '../src/js/terminal/palettes.js';

function solidImage(width, height, [r, g, b]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4);
  return { width, height, data };
}

test('pixelArt reads colour letters, ink and transparency', () => {
  const art = pixelArt(['r#.', 'bgw']);
  assert.equal(art.width, 3);
  assert.equal(art.height, 2);
  assert.deepEqual([...art.data], [1, 7, -1, 4, 2, 7]);
});

test('a flat colour converts to solid cells of that colour', () => {
  for (const [index, rgb] of COLOR_PALETTE.entries()) {
    const { cells } = imageToMosaic(solidImage(4, 6, rgb), { dither: 'none' });
    for (const cell of cells) {
      const shown = cell.bits === 63 ? cell.fg : cell.bits === 0 ? cell.bg : -1;
      assert.equal(shown, index);
    }
  }
});

test('two-colour cells keep their pattern', () => {
  const { cells } = indicesToCells(pixelArt(['ry', 'yr', 'ry']));
  const [cell] = cells;
  const colours = new Set([cell.fg, cell.bg]);
  assert.ok(colours.has(1) && colours.has(3));
  const redBits = cell.fg === 1 ? cell.bits : ~cell.bits & 63;
  assert.equal(redBits, 0b011001);
});

test('encoded mosaics decode back to the same picture', () => {
  const art = pixelArt([
    'rrggbbyy..',
    'rrggbbyy..',
    'rrggbbyy..',
    'wwwwkkkkcc',
    'wwwwkkkkcc',
    'wwwwkkkkcc',
  ]);
  const cells = indicesToCells(art);
  const v = new Videotex().clear();
  encodeCells(v, cells, { row: 3, col: 5 });
  const screen = new Screen();
  new Decoder(screen).write(v.bytes());
  const shown = (row, col) => {
    const c = screen.resolveRow(row)[col - 1];
    const bits = sextantBits(c.char);
    return bits === 63 ? c.fg : bits === 0 ? c.bg : null;
  };
  assert.deepEqual([shown(3, 5), shown(3, 6), shown(3, 7), shown(3, 8)], [1, 2, 4, 3]);
  assert.deepEqual([shown(4, 5), shown(4, 6), shown(4, 7), shown(4, 8), shown(4, 9)], [7, 7, 0, 0, 6]);
});

test('cellsToHTML emits sextants with colour classes', () => {
  const html = cellsToHTML(indicesToCells(pixelArt(['yy', 'yy', 'yy'])));
  assert.match(html, /mt-fg-yellow/);
  assert.ok(html.includes('█'));
});
