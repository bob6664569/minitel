/**
 * 3615 DIALOGUE — a live chat room ("messagerie") in the spirit of 1990.
 *
 * Pick a pseudonym and a room; the regulars (bots, see dialogue-data.js)
 * chat among themselves and answer you. Messages arrive while you type:
 * the room runs on timers, and every write ends by putting the cursor back
 * into your input line.
 *
 * The message area sits below the input line, so scrolling it is a single
 * "delete row" (CSI n M) at its top row: the rows below move up, fresh rows
 * open at the bottom of the screen, and nothing above ever moves. A new
 * message costs its own text plus about ten bytes.
 */
import { Page, wrap } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import { ROOMS, REGULARS, CHATTER, SCENES, REPLIES, SMALL_TALK, CALLED } from './dialogue-data.js';

/* Chat screen layout. */
const INPUT_ROW = 3;
const SEPARATOR_ROW = 5;
const FIRST_ROW = 6;
const LAST_ROW = 24;
const AREA = LAST_ROW - FIRST_ROW + 1;
const MAX_MESSAGE = 70;
const BADGES = ['cyan', 'magenta', 'green', 'white', 'red'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const GREETINGS = REPLIES.find(([pattern]) => pattern.test('bonjour'))[1];
const between = (min, max) => min + Math.random() * (max - min);
const norm = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const regular = (pseudo) => REGULARS.find((r) => r.pseudo === pseudo);

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Pixel art                                                               */
/* ---------------------------------------------------------------------- */

/** Portrait template: B backdrop, H hair, F face, K features, S shirt. */
const FACE = [
  'BBBBBHHHHHHBBBBB',
  'BBBHHHHHHHHHHBBB',
  'BBHHHHHHHHHHHHBB',
  'BHHHFFFFFFFFHHHB',
  'BHHFFFFFFFFFFHHB',
  'BHHFFFFFFFFFFHHB',
  'BHHFFFFFFFFFFHHB',
  'BHHFKFFFFFFKFHHB',
  'BHHFFFFFFFFFFHHB',
  'BBBFFFFFFFFFFBBB',
  'BBBFFFFFFFFFFBBB',
  'BBBFFKFFFFKFFBBB',
  'BBBFFFKKKKFFFBBB',
  'BBBBFFFFFFFFBBBB',
  'BBBBBFFFFFFBBBBB',
  'BBBSSSSFFSSSSBBB',
  'BSSSSSSSSSSSSSSB',
  'SSSSSSSSSSSSSSSS',
];
const GLASSES = 'BHHFKKKFFKKKFHHB';
const LONG_HAIR = 'BHHFFFFFFFFFFHHB';
const LETTER = { black: 'k', red: 'r', green: 'g', yellow: 'y', blue: 'b', magenta: 'm', cyan: 'c', white: 'w' };

/** Pixel art portrait of a regular (8 columns x 6 rows). */
function portrait({ face, glasses, long }) {
  const rows = FACE.map((line, y) => {
    if (glasses && y === 6) return GLASSES;
    if (long && y >= 9 && y <= 11) return y === 11 ? 'BHHFFKFFFFKFFHHB' : LONG_HAIR;
    return line;
  });
  const map = { B: LETTER[face.back], H: LETTER[face.hair], F: LETTER[face.skin], K: 'k', S: LETTER[face.shirt] };
  return rows.map((line) => line.replace(/[BHFKS]/g, (c) => map[c]));
}

const BUBBLES = [
  '..wwwwwwwwwwwwwwww......................',
  '.wwwwwwwwwwwwwwwwww.....................',
  'wwwwwwwwwwwwwwwwwwww....................',
  'wwwwkkwwwkkwwwkkwwww....................',
  'wwwwkkwwwkkwwwkkwwww....................',
  'wwwwwwwwwwwwwwwwwwww....................',
  '.wwwwwwwwwwwwwwwwww.....................',
  '..wwwwwwwwwwwwwwww......................',
  '..wwww..................................',
  '..www.................cccccccccccccccc..',
  '..ww.................cccccccccccccccccc.',
  '..w..................cccccccccccccccccc.',
  '.....................cccckkcccccckkcccc.',
  '.....................cccckkcccccckkcccc.',
  '.....................cccccccccccccccccc.',
  '.....................cccckcccccccckcccc.',
  '.....................ccccckkkkkkkkccccc.',
  '.....................cccccccccccccccccc.',
  '......................cccccccccccccccc..',
  '...................................cccc.',
  '....................................ccc.',
  '.....................................cc.',
];

/** Room icons, 5 columns x 3 rows. */
const ICONS = {
  general: [
    '.wwwwwwww.',
    'wwwwwwwwww',
    'wwwwwwwwww',
    'wwkwkwkwww',
    'wwkwkwkwww',
    'wwwwwwwwww',
    '.wwwwwwww.',
    '.ww.......',
    '.w........',
  ],
  cinema: [
    '...wwww...',
    '.wwwwwwww.',
    '.wkkwwkkw.',
    'wwkkwwkkww',
    'wwwwkkwwww',
    'wwkkwwkkww',
    '.wkkwwkkw.',
    '.wwwwwwww.',
    '...wwww...',
  ],
  info: [
    'wwwwwwwwww',
    'wccccccccw',
    'wccccccccw',
    'wccccccccw',
    'wccccccccw',
    'wwwwwwwwww',
    '...wwww...',
    '..wwwwww..',
    '..........',
  ],
  voyages: [
    '....w.....',
    '....ww....',
    '..w.www...',
    '.ww.wwww..',
    'www.wwwww.',
    '....w.....',
    'crrrrrrrrc',
    'ccrrrrrrcc',
    'cccccccccc',
  ],
};

/* ---------------------------------------------------------------------- */
/* Page furniture                                                          */
/* ---------------------------------------------------------------------- */

/** Key cap in inverse video that keeps the zone colour around it. */
function cap(p, row, col, name, { bg = 'black', color = 'white' } = {}) {
  return p.moveTo(row, col).bg(bg).color(color).invert(true).text(` ${name} `).invert(false);
}

/** Compact key hints on a coloured band: KEY label  KEY label... */
function keys(p, row, col, pairs, { bg = 'black', color = 'cyan' } = {}) {
  p.moveTo(row, col).bg(bg);
  pairs.forEach(([key, label], i) => {
    if (i) p.text('  ');
    p.color('white').invert(true).text(key).invert(false).color(color).text(` ${label}`);
  });
  return p;
}

/** Title band: rows 1..3 with a double-size title, edge on row 4. */
function band(p, title, { bg = 'blue', color = 'yellow', right, rightColor = 'white' } = {}) {
  p.band(1, { bg, rows: 3 });
  p.print(3, 2, title, { color, bg, size: 'double' });
  if (right) p.right(1, 39, right, { color: rightColor, bg });
  p.hline(4, { color: bg, style: 'top' });
  return p;
}

function welcomePage(online, error) {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: 'blue', rows: 4 });
  p.bigText(2, 9, 'DIALOGUE', { color: 'yellow', background: 'blue' });
  p.hline(5, { color: 'blue', style: 'top' });
  p.center(6, 'La messagerie conviviale du Minitel', { color: 'cyan' });

  p.art(8, 2, BUBBLES);
  p.print(9, 25, String(online), { color: 'yellow', size: 'double' });
  p.print(10, 25, 'minitellistes', { color: 'white' });
  p.print(11, 25, 'en ligne', { color: 'white' });
  p.print(13, 25, '4 salons', { color: 'cyan' });
  p.print(14, 25, '24 h sur 24', { color: 'cyan' });

  p.print(17, 3, 'Votre pseudo', { color: 'yellow' });
  p.box(16, 16, 18, 31, { color: 'yellow' });
  cap(p, 17, 32, 'ENVOI');
  if (error) p.center(19, error, { color: 'red', flash: true });
  p.paragraph(20, 3, 'Restez courtois, et ne donnez jamais votre adresse ni votre téléphone.', { width: 36, color: 'white' });
  p.hints(24, [['GUIDE', 'aide'], ['SOMMAIRE', 'quitter']], { col: 3 });
  return p;
}

function helpPage({ inRoom = false } = {}) {
  const p = new Page().clear().cursor(false);
  band(p, 'AIDE', { right: '3615 DIALOGUE' });
  const rows = [
    ['ENVOI', 'envoyer votre message'],
    ['CORRECTION', 'effacer une lettre'],
    ['ANNULATION', 'effacer la ligne'],
    ['SUITE', 'qui est connecté ?'],
    ['REPETITION', "réafficher l'écran"],
    ['SOMMAIRE', 'changer de salon'],
  ];
  rows.forEach(([key, text], i) => {
    cap(p, 6 + i * 2, 3, key.padEnd(10));
    p.color('white').text(` ${text}`);
  });
  p.print(18, 3, 'Astuce', { color: 'yellow' });
  p.paragraph(18, 11, 'appelez un habitué par son pseudo : il vous répondra.', { width: 29, color: 'cyan' });
  p.print(21, 3, 'Charte', { color: 'yellow' });
  p.paragraph(21, 11, 'bonne humeur de rigueur, et jamais de coordonnées.', { width: 29, color: 'cyan' });
  p.hints(24, inRoom ? [['RETOUR', 'au salon'], ['SOMMAIRE', 'autres salons']] : [['RETOUR', 'revenir']], { col: 3 });
  return p;
}

/* ---------------------------------------------------------------------- */
/* Input line                                                              */
/* ---------------------------------------------------------------------- */

/**
 * A two-row input field with server-side echo (rows 3-4), which can hand
 * out the cursor position at any time so that other writes put it back.
 */
class Composer {
  constructor(pseudo) {
    this.col = pseudo.length + 2; // after the pseudo tag and a space
    this.first = 41 - this.col; // characters on the first row
    this.capacity = Math.min(MAX_MESSAGE, this.first + 40);
    this.value = '';
    this.synced = false; // is the terminal cursor right after the text?
  }

  position(i) {
    return i < this.first ? [INPUT_ROW, this.col + i] : [INPUT_ROW + 1, 1 + i - this.first];
  }

  /** Put the cursor back into the field (attributes reset: white text). */
  cursor(v = new Videotex()) {
    const [row, col] = this.position(Math.min(this.value.length, this.capacity - 1));
    this.synced = this.value.length < this.capacity;
    return v.moveTo(row, col).cursor(true);
  }

  /** The field with its dotted placeholder. */
  draw(v = new Videotex()) {
    const shown = this.value;
    const rest = (from) => this.capacity - from;
    v.moveTo(INPUT_ROW, this.col).color('white').text(shown.slice(0, this.first));
    if (shown.length < this.first) v.color('blue').fill('.', Math.min(this.first, this.capacity) - shown.length);
    if (this.capacity > this.first) {
      const second = shown.slice(this.first);
      v.moveTo(INPUT_ROW + 1, 1).color('white').text(second);
      v.color('blue').fill('.', rest(this.first) - second.length);
    }
    return v;
  }

  /** Handle an input event: returns 'send', a function key name, or null. */
  handle(event, session) {
    if (event.type === 'char') {
      if (this.value.length >= this.capacity) {
        session.write(new Videotex().bell());
        return null;
      }
      this.value += event.char;
      // The first row ends on column 40 and the second starts on column 1:
      // once in place, the terminal's own cursor follows the text.
      const v = new Videotex();
      if (!this.synced) v.moveTo(...this.position(this.value.length - 1));
      v.text(event.char);
      this.synced = true;
      if (this.value.length === this.capacity) this.cursor(v);
      session.write(v);
      return null;
    }
    if (event.type !== 'key') return null;
    if (event.key === 'CORRECTION' || event.key === 'LEFT') {
      if (!this.value) return null;
      this.value = this.value.slice(0, -1);
      const [row, col] = this.position(this.value.length);
      session.write(new Videotex().moveTo(row, col).color('blue').text('.').moveTo(row, col));
      this.synced = true;
      return null;
    }
    if (event.key === 'ANNULATION') {
      this.value = '';
      session.write(this.cursor(this.draw()));
      return null;
    }
    if (event.key === 'ENVOI') return 'send';
    return event.key;
  }

  take() {
    const value = this.value.trim();
    this.value = '';
    return value;
  }
}

/* ---------------------------------------------------------------------- */
/* Channel                                                                 */
/* ---------------------------------------------------------------------- */

/**
 * Word-wrap with a shorter first line. French punctuation (" ?", " !",
 * " :") stays with the word before it.
 */
function wrapFirst(text, first, rest) {
  const words = text.replace(/ ([?!:;])/g, '\u00a0$1').split(/ +/).filter(Boolean);
  const lines = [];
  let line = '';
  let width = first;
  for (const word of words) {
    const w = word.slice(0, rest);
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
      width = rest;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Rows of a message, each a function drawing it on a given screen row.
 * kind: 'bot' | 'me' | 'info' | 'event'.
 */
function renderMessage({ kind, pseudo, text, color = 'cyan' }) {
  if (kind === 'info' || kind === 'event') {
    return wrap(`${kind === 'info' ? '>>' : '*'} ${text}`, 38).map((line) => (v, row) => v.moveTo(row, 2).color('green').text(line));
  }
  // The pseudo is a badge in inverse video, in the person's colour.
  const ink = kind === 'me' ? 'yellow' : 'white';
  const badge = kind === 'me' ? 'yellow' : color;
  const lines = wrapFirst(text, 39 - pseudo.length, 37);
  return lines.map((line, i) => (v, row) => {
    if (i === 0) v.moveTo(row, 1).color(badge).invert(true).text(pseudo).invert(false).color(ink).text(` ${line}`);
    else v.moveTo(row, 4).color(ink).text(line);
    return v;
  });
}

class Channel {
  constructor(session, room, me, lurkers) {
    this.session = session;
    this.room = room;
    this.me = me;
    this.composer = new Composer(me);
    this.history = [];
    this.timers = new Set();
    this.visible = false;
    this.alive = false;
    const regulars = shuffle(REGULARS.filter((r) => r.rooms.includes(room.key)));
    // Badge colours, as distinct as possible within the room.
    this.colors = new Map(regulars.map((r, i) => [r.pseudo, BADGES[i % BADGES.length]]));
    // One of them turns up later.
    this.away = regulars.length > 3 ? [regulars.pop()] : [];
    this.present = regulars;
    this.lurkers = lurkers; // connected, reading, never writing
    const now = Date.now();
    this.since = new Map(regulars.map((r) => [r.pseudo, now - between(2, 55) * 60000]));
    this.chatter = [];
    this.scenes = shuffle(SCENES[room.key] || []);
    this.recent = []; // replies said lately, not to be repeated
    this.spoke = false;
  }

  /** A reply from `lines`, avoiding what was said lately. */
  choose(lines) {
    const fresh = lines.filter((line) => !this.recent.includes(line));
    const line = pick(fresh.length ? fresh : lines);
    this.recent = [line, ...this.recent].slice(0, 8);
    return line;
  }

  get count() {
    return this.present.length + 1 + this.lurkers;
  }

  /* ---- timers ---- */

  later(ms, fn) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.alive && this.session.connected) fn();
    }, ms);
    this.timers.add(timer);
  }

  start() {
    this.alive = true;
    this.later(between(1800, 3000), () => this.greet());
    this.schedule(between(6000, 9000));
  }

  stop() {
    this.alive = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  schedule(ms) {
    this.later(ms, () => {
      this.ambient();
      this.schedule(between(5000, 9500));
    });
  }

  /* ---- what happens in the room ---- */

  greet() {
    const [first, second] = shuffle(this.present);
    if (first) this.say(first, this.choose(GREETINGS));
    if (second) {
      this.later(between(2500, 4500), () => {
        if (!this.spoke) this.say(second, this.choose(['Salut {P} !', 'Bienvenue {P} :-)', 'Hello {P}, installe-toi !']));
      });
    }
  }

  ambient() {
    const roll = Math.random();
    if (roll < 0.12 && (this.away.length || this.present.length > 3)) {
      this.comeAndGo();
    } else if (roll < 0.35 && this.scenes.length) {
      const scene = this.scenes.shift();
      this.scenes.push(scene);
      let delay = 0;
      scene.forEach(([pseudo, text]) => {
        this.later(delay, () => this.say(regular(pseudo), text, true));
        delay += between(3200, 5200);
      });
    } else {
      if (!this.chatter.length) this.chatter = shuffle(CHATTER[this.room.key] || []);
      const i = this.chatter.findIndex(([pseudo]) => this.present.includes(regular(pseudo)));
      if (i >= 0) {
        const [[pseudo, text]] = this.chatter.splice(i, 1);
        this.say(regular(pseudo), text, true);
      }
    }
  }

  /** Someone arrives or leaves. */
  comeAndGo() {
    if (this.away.length && (Math.random() < 0.6 || this.present.length <= 3)) {
      const who = this.away.shift();
      this.present.push(who);
      this.since.set(who.pseudo, Date.now());
      this.post({ kind: 'event', text: `${who.pseudo} arrive dans le salon` }, true);
      const hello = pick(['Bonsoir tout le monde !', 'Salut la compagnie :-)', 'Coucou, me revoilà !']);
      this.later(between(2000, 3500), () => this.say(who, hello));
    } else {
      const who = this.present.splice(Math.floor(Math.random() * this.present.length), 1)[0];
      this.away.push(who);
      this.post({ kind: 'event', text: `${who.pseudo} a quitté le salon` }, true);
    }
  }

  /** A regular speaks; `ambient` lines are skipped if the regular left. */
  say(bot, text, ambient = false) {
    if (!bot || (ambient && !this.present.includes(bot))) return;
    this.post({ kind: 'bot', pseudo: bot.pseudo, color: this.colorOf(bot), text: text.replaceAll('{P}', this.me) });
  }

  /** You speak; some regulars answer, one topic each. */
  hear(text) {
    this.post({ kind: 'me', pseudo: this.me, text });
    this.spoke = true;
    const n = norm(text);
    const named = this.present.filter((bot) => {
      const full = norm(bot.pseudo);
      const stem = full.split(/[_0-9]/)[0];
      return n.includes(full) || (stem.length >= 4 && new RegExp(`(^|\\W)${stem}`).test(n));
    });
    const rules = REPLIES.filter(([pattern]) => pattern.test(n)).slice(0, 2);
    const others = shuffle(this.present.filter((bot) => !named.includes(bot)));
    const plan = [];
    named.slice(0, 2).forEach((bot) => plan.push([bot, rules[0] ? rules[0][1] : CALLED]));
    rules.slice(named.length ? 1 : 0).forEach((rule) => {
      if (others.length) plan.push([others.shift(), rule[1]]);
    });
    if (!plan.length && others.length && Math.random() < 0.45) plan.push([others.shift(), SMALL_TALK]);
    let delay = between(1600, 2800);
    plan.forEach(([bot, lines]) => {
      const line = this.choose(lines);
      this.later(delay, () => this.say(bot, line));
      delay += between(1800, 3200);
    });
  }

  /* ---- display ---- */

  /** Add a message to the room; draws it when the room is on screen. */
  post(message, updateCount = false) {
    const rows = renderMessage(message).slice(0, 3);
    this.history.push(...rows);
    if (this.history.length > AREA) this.history.splice(0, this.history.length - AREA);
    if (!this.visible || !this.session.connected) return;
    // Delete rows at the top of the area: the rest moves up, room opens below.
    const v = new Videotex().cursor(false).moveTo(FIRST_ROW, 1);
    v.raw(0x1b, 0x5b, ...String(rows.length).split('').map((c) => c.charCodeAt(0)), 0x4d);
    rows.forEach((draw, i) => draw(v, LAST_ROW - rows.length + 1 + i));
    if (updateCount) this.drawCount(v);
    this.session.write(this.composer.cursor(v));
  }

  drawCount(v) {
    return v.moveTo(1, 29).bg('blue').color('cyan').text(`${String(this.count).padStart(2)} en ligne`);
  }

  /** Badge colour of a regular in this room. */
  colorOf(bot) {
    return this.colors.get(bot.pseudo) || 'cyan';
  }

  page() {
    const p = new Page().clear().cursor(false);
    p.band(1, { bg: 'blue', rows: 2 });
    p.print(1, 2, 'DIALOGUE', { color: 'yellow', bg: 'blue' });
    p.print(1, 11, this.room.short, { color: 'white', bg: 'blue' });
    this.drawCount(p);
    keys(p, 2, 1, [['SUITE', 'qui ?'], ['GUIDE', 'aide'], ['SOMMAIRE', 'sortir']], { bg: 'blue' });
    p.moveTo(INPUT_ROW, 1).color('yellow').invert(true).text(this.me).invert(false);
    this.composer.draw(p);
    p.hline(SEPARATOR_ROW, { color: 'blue', style: 'top' });
    const rows = this.history.slice(-AREA);
    rows.forEach((draw, i) => draw(p, LAST_ROW - rows.length + 1 + i));
    return this.composer.cursor(p);
  }

  show() {
    this.visible = true;
    this.session.write(this.page());
  }

  hide() {
    this.visible = false;
  }
}

/* ---------------------------------------------------------------------- */
/* Pages                                                                   */
/* ---------------------------------------------------------------------- */

function roomsPage(pseudo, counts) {
  const p = new Page().clear().cursor(false);
  band(p, 'LES SALONS', { right: `Bonjour ${pseudo} !`, rightColor: 'cyan' });
  ROOMS.forEach((room, i) => {
    const row = 6 + i * 4;
    p.art(row, 2, ICONS[room.key]);
    cap(p, row, 8, String(i + 1), { color: 'yellow' });
    p.print(row, 12, room.name.toUpperCase(), { color: 'white' });
    p.right(row, 39, `${counts[i]} en ligne`, { color: 'green' });
    p.paragraph(row + 1, 12, room.blurb, { width: 28, color: 'cyan', maxRows: row + 2 });
  });
  p.print(23, 3, 'Votre choix', { color: 'white' });
  p.moveTo(23, 15).color('yellow').text('.');
  p.moveTo(23, 17).color('white').text('puis');
  cap(p, 23, 22, 'ENVOI');
  p.hints(24, [['GUIDE', 'aide'], ['SOMMAIRE', 'quitter']], { col: 3 });
  return p;
}

function usersPage(channel) {
  const p = new Page().clear().cursor(false);
  band(p, 'QUI EST LA ?', { right: channel.room.short, rightColor: 'cyan' });
  p.print(6, 2, 'N°', { color: 'yellow' });
  p.print(6, 6, 'PSEUDO', { color: 'yellow' });
  p.print(6, 19, 'VILLE', { color: 'yellow' });
  p.print(6, 31, 'DEPUIS', { color: 'yellow' });
  p.hline(7, { col: 2, width: 38, color: 'blue', style: 'top' });
  const gap = channel.present.length <= 6 ? 2 : 1;
  channel.present.forEach((bot, i) => {
    const row = 8 + i * gap;
    const minutes = Math.max(1, Math.round((Date.now() - channel.since.get(bot.pseudo)) / 60000));
    p.moveTo(row, 2).color('white').invert(true).text(` ${i + 1} `).invert(false);
    p.moveTo(row, 6).color(channel.colorOf(bot)).invert(true).text(bot.pseudo);
    p.print(row, 19, bot.city.slice(0, 11), { color: 'white' });
    p.print(row, 31, `${minutes} min`, { color: 'cyan' });
  });
  const row = 8 + channel.present.length * gap;
  p.moveTo(row, 6).color('yellow').invert(true).text(channel.me).invert(false).color('yellow').text(' (vous)');
  p.print(row, 31, 'maintenant', { color: 'cyan' });
  p.print(row + gap, 6, `+ ${channel.lurkers} lecteurs discrets`, { color: 'green' });
  p.hline(row + gap + 1, { col: 2, width: 38, color: 'blue', style: 'top' });
  p.print(21, 3, 'Voir le profil numéro', { color: 'white' });
  p.moveTo(21, 25).color('yellow').text('.');
  cap(p, 21, 28, 'ENVOI');
  p.hints(23, [['SOMMAIRE', 'retour au salon']], { col: 3 });
  return p;
}

function profilePage(bot, color) {
  const p = new Page().clear().cursor(false);
  band(p, 'PROFIL', { right: bot.pseudo, rightColor: 'cyan' });
  p.art(6, 3, portrait(bot));
  p.print(7, 13, bot.pseudo, { color, size: 'double' });
  const field = (row, label, value) => {
    p.print(row, 13, label, { color: 'yellow' });
    p.print(row, 22, value, { color: 'white' });
  };
  field(9, 'Ville', bot.city);
  field(10, 'Age', `${bot.age} ans`);
  field(11, 'Machine', bot.machine);
  field(13, 'Passions', '');
  p.paragraph(13, 22, bot.likes, { width: 18, color: 'white' });
  p.hline(15, { col: 3, width: 36, color: 'blue', style: 'bottom' });
  p.paragraph(16, 3, `"${bot.motto}"`, { width: 36, align: 'center', color: 'cyan' });
  p.hline(18, { col: 3, width: 36, color: 'blue', style: 'top' });
  cap(p, 20, 3, 'ENVOI');
  p.color('white').text(' lui dire bonjour');
  p.hints(23, [['RETOUR', 'liste'], ['SOMMAIRE', 'salon']], { col: 3 });
  return p;
}

/* ---------------------------------------------------------------------- */
/* Service                                                                 */
/* ---------------------------------------------------------------------- */

/** Pseudonym form; resolves to the pseudo or null to leave. */
async function askPseudo(session, state) {
  let error = null;
  for (;;) {
    session.write(welcomePage(ROOMS.reduce((n, room, i) => n + headCount(room, state.lurkers[i]), 0), error));
    error = null;
    const { key, value } = await session.input({
      row: 17, col: 17, length: 12, value: state.pseudo || '', uppercase: true, color: 'white', placeholder: '.', accept: /[A-Z0-9_\-]/,
    });
    if (key === 'SOMMAIRE') return null;
    if (key === 'GUIDE') {
      session.write(helpPage());
      await session.waitKey(['RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE']);
      continue;
    }
    if (key !== 'ENVOI') continue;
    const pseudo = value.trim();
    if (pseudo.length < 3) error = 'Au moins 3 caractères';
    else if (REGULARS.some((r) => r.pseudo === pseudo)) error = 'Pseudo déjà pris, désolé';
    else return pseudo;
    session.write(new Videotex().bell());
  }
}

/** People in a room, you included once you are in: regulars and lurkers. */
function headCount(room, lurkers) {
  return REGULARS.filter((r) => r.rooms.includes(room.key)).length + lurkers;
}

/** Room choice; resolves to a room index or -1. */
async function chooseRoom(session, pseudo, state) {
  const counts = ROOMS.map((room, i) => headCount(room, state.lurkers[i]));
  for (;;) {
    session.write(roomsPage(pseudo, counts));
    const { key, value } = await session.input({ row: 23, col: 15, length: 1, color: 'yellow', placeholder: '.', accept: /[1-4]/ });
    if (key === 'SOMMAIRE' || key === 'RETOUR') return -1;
    if (key === 'GUIDE') {
      session.write(helpPage());
      await session.waitKey(['RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE']);
    } else if (key === 'ENVOI' && value) {
      return Number(value) - 1;
    }
  }
}

/** Who is here, and their profiles. */
async function browse(session, channel) {
  for (;;) {
    session.write(usersPage(channel));
    const { key, value } = await session.input({ row: 21, col: 25, length: 1, color: 'yellow', placeholder: '.', accept: /[0-9]/ });
    if (key === 'SOMMAIRE' || key === 'RETOUR') return;
    const bot = channel.present[Number(value) - 1];
    if (key !== 'ENVOI' || !bot) continue;
    session.write(profilePage(bot, channel.colorOf(bot)));
    const next = await session.waitKey(['ENVOI', 'RETOUR', 'SOMMAIRE', 'SUITE']);
    if (next === 'ENVOI') {
      channel.hear(`Bonjour ${bot.pseudo} !`);
      return;
    }
    if (next === 'SOMMAIRE') return;
  }
}

/** Inside a room until SOMMAIRE. */
async function chat(session, room, pseudo, lurkers) {
  const channel = new Channel(session, room, pseudo, lurkers);
  channel.post({ kind: 'info', text: `Vous entrez dans le salon ${room.name}. Sujet du jour : ${room.topic}` });
  channel.show();
  channel.start();
  try {
    for (;;) {
      const event = await session.next();
      const action = channel.composer.handle(event, session);
      if (action === 'send') {
        const text = channel.composer.take();
        session.write(channel.composer.cursor(channel.composer.draw(new Videotex().cursor(false))));
        if (text) channel.hear(text);
      } else if (action === 'SOMMAIRE') {
        return;
      } else if (action === 'SUITE' || action === 'GUIDE') {
        channel.hide();
        if (action === 'SUITE') await browse(session, channel);
        else {
          session.write(helpPage({ inRoom: true }));
          const key = await session.waitKey(['RETOUR', 'SOMMAIRE', 'ENVOI', 'GUIDE']);
          if (key === 'SOMMAIRE') return;
        }
        channel.show();
      } else if (action === 'REPETITION') {
        channel.show();
      }
    }
  } finally {
    channel.stop();
  }
}

export default {
  code: 'DIALOGUE',
  name: 'Dialogue',
  description: 'La messagerie conviviale : salons en direct',
  async run(session) {
    const state = session.data.dialogue || (session.data.dialogue = {});
    state.lurkers = state.lurkers || ROOMS.map(() => 3 + Math.floor(Math.random() * 8));
    for (;;) {
      const pseudo = await askPseudo(session, state);
      if (!pseudo) return;
      state.pseudo = pseudo;
      for (;;) {
        const index = await chooseRoom(session, pseudo, state);
        if (index < 0) break;
        await chat(session, ROOMS[index], pseudo, state.lurkers[index]);
      }
    }
  },
};
