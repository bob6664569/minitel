import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Screen } from '../src/js/videotex/screen.js';
import { Decoder } from '../src/js/videotex/decoder.js';
import { Videotex, sextant } from '../src/js/videotex/writer.js';
import { encodeText, toMinitelText, g1Byte, g1Bits } from '../src/js/videotex/charset.js';
import { sextantChar } from '../src/js/font/glyphs.js';

function run(build) {
  const screen = new Screen();
  const responses = [];
  const decoder = new Decoder(screen, { onResponse: (bytes) => responses.push(bytes) });
  const vt = build(new Videotex());
  decoder.write(vt.bytes());
  return { screen, decoder, responses };
}

test('text is written at the cursor and wraps at column 40', () => {
  const { screen } = run((v) => v.clear().moveTo(2, 38).text('ABCDE'));
  assert.equal(screen.rowText(2).slice(37), 'ABC');
  assert.equal(screen.rowText(3).slice(0, 2), 'DE');
  assert.deepEqual(screen.cursor, { row: 3, col: 3 });
});

test('page mode wraps from row 24 to row 1, rouleau mode scrolls', () => {
  const page = run((v) => v.clear().moveTo(24, 1).text('BOTTOM').newline().text('TOP'));
  assert.equal(page.screen.rowText(1).trim(), 'TOP');
  const roll = run((v) => v.clear().scroll(true).moveTo(1, 1).text('FIRST').moveTo(24, 1).text('LAST').newline().text('NEW'));
  assert.equal(roll.screen.rowText(23).trim(), 'LAST');
  assert.equal(roll.screen.rowText(24).trim(), 'NEW');
  assert.equal(roll.screen.rowText(1).trim(), '');
});

test('background is a zone attribute validated by a space', () => {
  const { screen } = run((v) => v.clear().moveTo(5, 1).bg('blue').text('AB CD').bg('red').text('EF GH'));
  const row = screen.resolveRow(5);
  // "AB" precedes any delimiter: default black background
  assert.equal(row[0].bg, 0);
  assert.equal(row[1].bg, 0);
  // the space validates blue for itself and "CDEF"
  assert.equal(row[2].bg, 4);
  assert.equal(row[3].bg, 4);
  assert.equal(row[5].bg, 4);
  // red only after the next space
  assert.equal(row[7].bg, 1);
  assert.equal(row[8].bg, 1);
  // end of row: the zone persists to column 40
  assert.equal(row[39].bg, 1);
});

test('a later delimiter re-colours following characters', () => {
  const { screen } = run((v) => v.clear().moveTo(3, 1).bg('blue').text(' HELLO WORLD').moveTo(3, 7).text(' '));
  const row = screen.resolveRow(3);
  assert.equal(row[2].bg, 4); // "E" still blue
  assert.equal(row[6].bg, 0); // re-written space: attributes were reset by US
  assert.equal(row[8].bg, 0); // "O" of WORLD follows the new black zone
});

test('mosaic characters carry their own background and act as delimiters', () => {
  const { screen } = run((v) => v.clear().moveTo(1, 1).bg('green').color('red').mosaic(63, 1).alpha().text('X'));
  const row = screen.resolveRow(1);
  assert.equal(row[0].mosaic, true);
  assert.equal(row[0].char, '█');
  assert.equal(row[0].bg, 2);
  assert.equal(row[1].char, sextantChar(1));
  assert.equal(row[2].bg, 2); // G0 char after mosaic inherits the zone
});

test('separated mosaics use the underline attribute', () => {
  const { screen } = run((v) => v.clear().moveTo(1, 1).separated(true).mosaic(sextant('##', '##', '##')));
  assert.equal(screen.resolveRow(1)[0].separated, true);
});

test('inversion swaps foreground and zone background', () => {
  const { screen } = run((v) => v.clear().moveTo(1, 1).color('yellow').bg('blue').text(' ').invert(true).text('X'));
  const [, x] = screen.resolveRow(1);
  assert.equal(x.fg, 4);
  assert.equal(x.bg, 3);
});

test('double size writes four cells, double height uses the row above', () => {
  const { screen } = run((v) => v.clear().moveTo(5, 10).size('double').text('A').size('tall').text('B'));
  const top = screen.grid[4];
  const bottom = screen.grid[5];
  assert.equal(top[9].char, 'A');
  assert.equal(top[10].char, 'A');
  assert.equal(bottom[9].char, 'A');
  assert.deepEqual([bottom[10].partX, bottom[10].partY, bottom[10].width, bottom[10].height], [1, 1, 2, 2]);
  assert.equal(top[11].char, 'B');
  assert.equal(bottom[11].char, 'B');
  assert.equal(bottom[11].width, 1);
  assert.deepEqual(screen.cursor, { row: 5, col: 13 });
});

test('double height is ignored on row 1', () => {
  const { screen } = run((v) => v.clear().moveTo(1, 1).size('tall').text('A'));
  assert.equal(screen.grid[1][0].height, 1);
});

test('accents are sent through G2 and composed back', () => {
  const bytes = encodeText('é');
  assert.deepEqual(bytes, [0x19, 0x42, 0x65]);
  const { screen } = run((v) => v.clear().moveTo(1, 1).text('Météo à Noël, ça gèle ! £ ° ½ œ'));
  assert.equal(screen.rowText(1).trim(), 'Météo à Noël, ça gèle ! £ ° ½ œ');
});

test('unsupported characters are transliterated like a Minitel would show them', () => {
  assert.equal(toMinitelText('ÉTÉ — « Déjà » 10 €'), 'ETE - " Déjà " 10 E');
});

test('REP repeats the previous character and text() compresses runs', () => {
  const vt = new Videotex().text('Nom : ..........');
  assert.ok(vt.bytes().includes(0x12));
  const { screen } = run((v) => v.clear().moveTo(1, 1).text('Nom : ..........'));
  assert.equal(screen.rowText(1).trim(), 'Nom : ..........');
});

test('US accepts the decimal form', () => {
  const screen = new Screen();
  new Decoder(screen).write([0x0c, 0x1f, 0x31, 0x32, 0x30, 0x35, 0x41]);
  assert.equal(screen.grid[12][4].char, 'A');
});

test('row 0 keeps its content across FF and LF returns to the page', () => {
  const { screen } = run((v) => v.clear().moveTo(10, 5).text('X').status('3615 CODE').text('Y').clear());
  assert.equal(screen.rowText(0).trim(), '3615 CODE');
  const s2 = run((v) => v.clear().moveTo(10, 5).text('X').status('HELLO').text('Y')).screen;
  assert.equal(s2.grid[10][5].char, 'Y');
});

test('CAN clears to the end of the row with current attributes', () => {
  const { screen } = run((v) => v.clear().moveTo(2, 1).text('HELLO WORLD').moveTo(2, 6).bg('blue').clearEOL());
  assert.equal(screen.rowText(2).trim(), 'HELLO');
  assert.equal(screen.resolveRow(2)[10].bg, 4);
});

test('CSI erase and cursor functions', () => {
  const { screen } = run((v) => v.clear().moveTo(3, 1).text('0123456789').raw(0x1b, 0x5b, 0x35, 0x44).eraseLine(0));
  assert.equal(screen.rowText(3).trim(), '01234');
});

test('ENQROM and cursor position requests are answered', () => {
  const { responses } = run((v) => v.clear().moveTo(7, 9).raw(0x1b, 0x39, 0x7b).raw(0x1b, 0x61));
  assert.deepEqual(responses[0], [0x01, 0x43, 0x75, 0x3b, 0x04]);
  assert.deepEqual(responses[1], [0x1f, 0x47, 0x49]);
});

test('G1 byte mapping round-trips all 64 sextants', () => {
  for (let bits = 0; bits < 64; bits++) assert.equal(g1Bits(g1Byte(bits)), bits);
  assert.equal(g1Byte(63), 0x7f);
  assert.equal(g1Byte(0), 0x20);
});

test('flash, conceal and reveal', () => {
  const { screen } = run((v) => v.clear().moveTo(1, 1).flash().text('A').conceal().text(' B'));
  const row = screen.resolveRow(1);
  assert.equal(row[0].flash, true);
  assert.equal(row[2].conceal, true);
  screen.revealed = true;
  assert.equal(screen.resolveRow(1)[2].conceal, false);
});

test('an empty mosaic cell is blank, not a full block', async () => {
  const { sextantBits, sextantRows } = await import('../src/js/font/glyphs.js');
  assert.equal(sextantBits(' '), 0);
  assert.ok(sextantRows(sextantBits(' ')).every((row) => row === 0));
  for (let bits = 0; bits < 64; bits++) assert.equal(sextantBits(sextantChar(bits)), bits);
});

test('mosaic art closes its background zone at gaps and edges', async () => {
  const { pixelArt, indicesToCells, encodeCells } = await import('../src/js/mosaic/mosaic.js');
  // green/yellow body, a transparent gap, then a red cell
  const art = pixelArt(['gygy..rr', 'gygy..rr', 'gygy..rr']);
  const v = new Videotex().clear();
  encodeCells(v, indicesToCells(art), { row: 2, col: 1 });
  const screen = new Screen();
  new Decoder(screen).write(v.bytes());
  const row = screen.resolveRow(2);
  // colour shown by a cell: full blocks show fg, empty cells show bg
  const shown = (c) => (c.char === '\u2588' ? c.fg : c.bg);
  assert.equal(shown(row[2]), 0, 'the gap stays black');
  assert.equal(shown(row[3]), 1, 'the red cell after the gap');
  assert.equal(shown(row[5]), 0, 'nothing leaks after the art');
  // on a band, the zone is the band colour
  const band = new Videotex().clear().moveTo(5, 1).bg('blue').fill(' ', 40);
  encodeCells(band, indicesToCells(pixelArt(['yy', 'yy', 'yy']), { background: 4 }), { row: 5, col: 3, zone: 4 });
  const s2 = new Screen();
  new Decoder(s2).write(band.bytes());
  assert.equal(s2.resolveRow(5)[4].bg, 4, 'band continues after the art');
});
