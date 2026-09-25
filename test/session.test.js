import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLine } from '../src/js/net/line.js';
import { Session, InputParser, runService, Disconnected } from '../src/js/service/session.js';
import { Page, wrap, pad } from '../src/js/service/page.js';
import { Screen } from '../src/js/videotex/screen.js';
import { Decoder } from '../src/js/videotex/decoder.js';
import { keyBytes } from '../src/js/terminal/keyboard.js';
import { Teletel } from '../src/js/service/teletel.js';
import { sextantBits as sextantBitsOf } from '../src/js/font/glyphs.js';

/** A terminal end that decodes what it receives into a Screen. */
function terminal() {
  const [end, server] = createLine();
  const screen = new Screen();
  const decoder = new Decoder(screen);
  end.addEventListener('data', (e) => decoder.write(e.detail));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    end,
    server,
    screen,
    async key(name) { end.send(keyBytes(name)); await tick(); },
    async type(text) { for (const ch of text) { end.send(keyBytes(ch)); await tick(); } },
    tick,
  };
}

test('the input parser decodes characters, accents, function keys and arrows', () => {
  const parser = new InputParser();
  const events = parser.feed([0x41, 0x19, 0x42, 0x65, 0x13, 0x41, 0x1b, 0x5b, 0x41, 0x13, 0x47]);
  assert.deepEqual(events, [
    { type: 'char', char: 'A' },
    { type: 'char', char: 'é' },
    { type: 'key', key: 'ENVOI' },
    { type: 'key', key: 'UP' },
    { type: 'key', key: 'CORRECTION' },
  ]);
});

test('input() echoes, corrects and returns on ENVOI', async () => {
  const t = terminal();
  const session = new Session(t.server);
  const pending = session.input({ row: 10, col: 5, length: 8 });
  await t.tick();
  await t.type('ABCX');
  await t.key('CORRECTION');
  await t.type('D');
  await t.key('ENVOI');
  const { key, value } = await pending;
  assert.equal(key, 'ENVOI');
  assert.equal(value, 'ABCD');
  assert.equal(t.screen.rowText(10).slice(4, 12), 'ABCD....');
});

test('ANNULATION clears the field', async () => {
  const t = terminal();
  const session = new Session(t.server);
  const pending = session.input({ row: 3, col: 1, length: 5 });
  await t.tick();
  await t.type('HELLO');
  await t.key('ANNULATION');
  await t.type('OK');
  await t.key('ENVOI');
  assert.equal((await pending).value, 'OK');
});

test('form() moves between fields with SUITE and submits with ENVOI', async () => {
  const t = terminal();
  const session = new Session(t.server);
  const pending = session.form([
    { name: 'from', row: 5, col: 10, length: 10 },
    { name: 'to', row: 6, col: 10, length: 10 },
  ]);
  await t.tick();
  await t.type('PARIS');
  await t.key('SUITE');
  await t.type('LYON');
  await t.key('ENVOI');
  const { key, values } = await pending;
  assert.equal(key, 'ENVOI');
  assert.deepEqual(values, { from: 'PARIS', to: 'LYON' });
});

test('awaits reject with Disconnected when the line hangs up', async () => {
  const t = terminal();
  const session = new Session(t.server);
  const pending = session.next();
  t.end.close();
  await assert.rejects(pending, Disconnected);
});

test('runService hangs up when the service returns', async () => {
  const t = terminal();
  let closed = false;
  t.end.addEventListener('close', () => { closed = true; });
  await runService({ code: 'X', async run(s) { s.write(new Page().clear().print(1, 1, 'BYE')); } }, t.server);
  await t.tick();
  assert.equal(t.screen.rowText(1).trim(), 'BYE');
  assert.equal(closed, true);
});

test('print() with a background opens the zone with a delimiter', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().print(4, 10, 'HELLO WORLD', { color: 'yellow', bg: 'blue' }).bytes());
  const row = screen.resolveRow(4);
  assert.equal(row[8].bg, 4, 'delimiter cell');
  assert.equal(row[9].bg, 4, 'first letter');
  assert.equal(row[15].bg, 4, 'after the inner space');
});

test('label() closes its zone', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().label(2, 5, 'NEW', { bg: 'red' }).bytes());
  const row = screen.resolveRow(2);
  assert.equal(row[5].bg, 1);
  assert.equal(row[9].bg, 0);
  assert.equal(row[20].bg, 0);
});

test('wrap() and pad()', () => {
  assert.deepEqual(wrap('Le Minitel est un terminal de consultation', 16), ['Le Minitel est', 'un terminal de', 'consultation']);
  assert.equal(pad('12', 5, 'right'), '   12');
  assert.equal(pad('Éte', 4), 'Ete ');
});

test('the kiosk finds services by code, case and spaces aside', () => {
  const network = new Teletel({ services: [{ code: 'METEO', run() {} }, { code: 'ANNUAIRE', number: '3611', direct: true, run() {} }] });
  assert.equal(network.find(' meteo ').code, 'METEO');
  assert.equal(network.answer('3611').code, 'ANNUAIRE');
  assert.equal(network.answer('3615').code, '3615');
  assert.equal(network.answer('0123'), null);
});

test('progress bars and charts do not leak their background', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().progress(5, 3, 10, 0.5, { track: 'blue' }).chart(8, 3, [1, 2, 3], { height: 1, bg: 'red' }).bytes());
  assert.equal(screen.resolveRow(5)[20].bg, 0);
  assert.equal(screen.resolveRow(8)[20].bg, 0);
});

test('hints never run past column 40', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().hints(23, [['SUITE', 'page suivante'], ['RETOUR', 'page précédente'], ['SOMMAIRE', 'accueil']]).bytes());
  assert.equal(screen.rowText(24).trim(), '');
});

test('double-width text reads once in the text mirror', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().print(5, 2, 'DEMAIN', { size: 'wide' }).bytes());
  assert.equal(screen.rowText(5).trim(), 'DEMAIN');
});

test('a multi-row field wraps its echo and its corrections', async () => {
  const t = terminal();
  const session = new Session(t.server);
  const pending = session.input({ row: 20, col: 3, length: 12, width: 6 });
  await t.tick();
  await t.type('BONJOUR');
  assert.equal(t.screen.rowText(20).slice(2, 8), 'BONJOU');
  assert.equal(t.screen.rowText(21).slice(2, 8), 'R.....');
  await t.key('CORRECTION');
  await t.key('CORRECTION');
  await t.key('ENVOI');
  assert.equal((await pending).value, 'BONJO');
  assert.equal(t.screen.rowText(20).slice(2, 8), 'BONJO.');
});

test('double-height text on a background opens the zone on both rows', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().print(6, 5, 'HAUT', { bg: 'blue', size: 'tall' }).bytes());
  assert.equal(screen.resolveRow(5)[5].bg, 4, 'upper half');
  assert.equal(screen.resolveRow(6)[5].bg, 4, 'lower half');
});

test('writer CSI helpers', () => {
  const bytes = [...new Page().insertLines(2).deleteChars(1).cursorBy(-1, 3).requestCursor().bytes()];
  assert.deepEqual(bytes, [0x1b, 0x5b, 0x32, 0x4c, 0x1b, 0x5b, 0x31, 0x50, 0x1b, 0x5b, 0x31, 0x41, 0x1b, 0x5b, 0x33, 0x43, 0x1b, 0x61]);
});

test('typing into a full prefilled field starts it over', async () => {
  const t = terminal();
  const session = new Session(t.server);
  const pending = session.input({ row: 8, col: 10, length: 2, value: '25', accept: /\d/ });
  await t.tick();
  await t.type('0');
  assert.equal(t.screen.rowText(8).slice(9, 11), '0.');
  await t.type('7');
  await t.key('ENVOI');
  assert.equal((await pending).value, '07');
});

test('sync() resolves once the terminal has answered, keeping typed keys', async () => {
  const t = terminal();
  const decoder = new Decoder(new Screen(), { onResponse: (bytes) => t.end.send(bytes) });
  t.end.addEventListener('data', (e) => decoder.write(e.detail));
  const session = new Session(t.server);
  await t.type('A');
  assert.equal(await session.sync(1000), true);
  assert.deepEqual(await session.next({ timeout: 10 }), { type: 'char', char: 'A' });
});

test('charts can start their scale above zero', () => {
  const screen = new Screen();
  new Decoder(screen).write(new Page().clear().chart(5, 3, [100, 110, 120], { height: 1, min: 100, max: 120 }).bytes());
  const row = screen.resolveRow(5);
  assert.equal(sextantBitsOf(row[2].char), 0, 'the minimum is an empty column');
  assert.equal(sextantBitsOf(row[4].char), 63, 'the maximum is a full column');
});
