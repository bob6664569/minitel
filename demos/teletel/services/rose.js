/**
 * 3615 ROSE — "dialogue et rencontres" on the Minitel of the late 1980s:
 * a pseudo, the list of the people online with their CV, private
 * conversations, a mailbox, and messages flashing on row 0 wherever you
 * are in the service.
 *
 * The home page reproduces the one of 3615 ULLA (see rose-art.js); the
 * people are fictional (rose-data.js). Conversations reuse the input line
 * and the message layout of 3615 DIALOGUE.
 */
import { Page, pad, wrap } from '../../../src/js/service/page.js';
import { Videotex } from '../../../src/js/videotex/writer.js';
import { drawPicture } from './rose-art.js';
import { Composer, renderMessage } from './dialogue.js';
import { DEPARTMENTS } from './annuaire-data.js';
import { REGULARS, RULES, SMALL_TALK, NUDGES, GOODBYES } from './rose-data.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.random() * (max - min);
const norm = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* Conversations are laid out like DIALOGUE: input rows 3-4, messages 6-24. */
const FIRST_ROW = 6;
const LAST_ROW = 24;
const AREA = LAST_ROW - FIRST_ROW + 1;
const PER_PAGE = 8;
const BAND = 'magenta';

const SEX_WORDS = { F: 'Une femme', H: 'Un homme', '?': 'Qui sait' };
const SEX_NAMES = { F: 'femme', H: 'homme', '?': 'mystère' };

/** "Femme, 29 ans, Paris (75)" */
function identity(bot) {
  const parts = [bot.sex === 'F' ? 'Femme' : bot.sex === 'H' ? 'Homme' : '?'];
  if (bot.age) parts.push(`${bot.age} ans`);
  if (bot.dept) parts.push(`${DEPARTMENTS[bot.dept][0]} (${bot.dept})`);
  return parts.join(', ');
}

function status(p, text = '') {
  return p.status(` 3615 ROSE${pad(text, 28, 'right')}`, { color: 'white' });
}

/** A magenta band across rows 1-2 with a title and a right-hand note. */
function band(p, title, right = '') {
  p.band(1, { bg: BAND, rows: 2 });
  p.print(2, 2, title, { color: 'white', bg: BAND, size: 'tall' });
  if (right) p.right(2, 39, right, { color: 'yellow', bg: BAND });
  return p;
}

/* ---------------------------------------------------------------------- */
/* Home and conditions                                                     */
/* ---------------------------------------------------------------------- */

const PSEUDO_FIELD = { row: 16, col: 2, length: 31, color: 'white', placeholder: '.', uppercase: true, accept: /[^ ]/ };

function homePage(message) {
  const p = new Page().clear().cursor(false);
  status(p, '1,29 F/mn');
  drawPicture(p);
  p.print(1, 10, 'DIALOGUE ET RENCONTRES', { color: 'magenta' });
  p.print(2, 10, 'EN LIBERTE', { color: 'magenta' });
  // The magenta band. Spaces are delimiters: every text in it carries the background.
  p.band(13, { bg: BAND, rows: 12 });
  const say = (row, col, text, color = 'white') => p.print(row, col, text, { color, bg: BAND });
  say(14, 2, 'Pour vous présenter, tapez votre prénom');
  say(15, 2, 'ou un pseudo sympa, 4 à 31 caractères');
  p.moveTo(16, 34).color('white').text('+');
  p.moveTo(16, 36).invert(true).text('ENVOI').invert(false);
  if (message) say(17, 2, message, 'yellow');
  say(18, 2, 'Si vous etes inscrit,tapez votre pseudo');
  say(19, 2, '(nom utilisateur), puis une virgule,');
  say(20, 2, 'puis votre mot de passe. Ex: GIRL,1234');
  say(22, 2, '_'.repeat(39), 'black');
  say(23, 6, "Voir les conditions d'accès");
  p.moveTo(23, 34).color('white').text('→');
  p.moveTo(23, 36).invert(true).text('GUIDE').invert(false);
  return p;
}

function conditionsPage() {
  const p = new Page().clear().cursor(false);
  status(p, '1,29 F/mn');
  band(p, "CONDITIONS D'ACCES");
  const lines = [
    [5, 'Ce service est réservé aux personnes', 'white'],
    [6, 'majeures.', 'white'],
    [8, '3615 ROSE : 1,29 F la minute,', 'yellow'],
    [9, "soit 77,40 F de l'heure.", 'yellow'],
    [11, 'Restez courtois : les propos grossiers', 'white'],
    [12, 'vous feront déconnecter.', 'white'],
    [14, 'Ne donnez jamais votre adresse ni votre', 'white'],
    [15, 'numéro de téléphone.', 'white'],
    [17, 'Nos animatrices sont là pour animer', 'cyan'],
    [18, 'vos soirées.', 'cyan'],
  ];
  for (const [row, text, color] of lines) p.print(row, 2, text, { color });
  p.hints(22, [['ENVOI', 'retour'], ['CONNEXION FIN', 'quitter']]);
  return p;
}

/* ---------------------------------------------------------------------- */
/* The network: who is online, who writes to you                           */
/* ---------------------------------------------------------------------- */

class Network {
  constructor(session, me) {
    this.session = session;
    this.me = me;
    const everyone = shuffle(REGULARS);
    this.online = everyone.slice(0, 11);
    this.reserve = everyone.slice(11);
    const now = Date.now();
    this.since = new Map(this.online.map((bot) => [bot.pseudo, now - between(2, 70) * 60000]));
    this.lurkers = 90 + Math.floor(Math.random() * 60);
    this.threads = new Map();
    this.timers = new Set();
    this.view = null; // the conversation on screen: { bot, composer }
    this.alive = false;
    this.contacts = 0;
  }

  get count() {
    return this.online.length + this.lurkers + 1;
  }

  get unread() {
    let n = 0;
    for (const thread of this.threads.values()) n += thread.unread;
    return n;
  }

  thread(bot) {
    if (!this.threads.has(bot.pseudo)) this.threads.set(bot.pseudo, { bot, messages: [], unread: 0, recent: [], nudged: false });
    return this.threads.get(bot.pseudo);
  }

  later(ms, fn) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.alive && this.session.connected) fn();
    }, ms);
    this.timers.add(timer);
  }

  start() {
    this.alive = true;
    this.later(between(7000, 12000), () => this.contact());
    this.later(between(60000, 90000), () => this.comeAndGo());
  }

  stop() {
    this.alive = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  /** Someone who never wrote to you starts a conversation. */
  contact() {
    const quiet = this.online.filter((bot) => !this.threads.has(bot.pseudo));
    if (quiet.length && this.contacts < 5) {
      this.contacts++;
      const bot = pick(quiet);
      this.say(bot, this.fill(bot, bot.first), true);
    }
    this.later(between(25000, 50000), () => this.contact());
  }

  /** People log off, others log on. */
  comeAndGo() {
    const busy = this.view?.bot;
    const leaving = this.online.filter((bot) => bot !== busy && !this.threads.get(bot.pseudo)?.unread);
    if (leaving.length > 7 && Math.random() < 0.6) {
      const bot = pick(leaving);
      this.online.splice(this.online.indexOf(bot), 1);
      this.reserve.push(bot);
      if (this.threads.has(bot.pseudo)) this.post(bot, { kind: 'event', text: `${bot.pseudo} s'est déconnecté${bot.sex === 'F' ? 'e' : ''}` });
    }
    if (this.reserve.length && Math.random() < 0.6) {
      const bot = this.reserve.shift();
      this.online.push(bot);
      this.since.set(bot.pseudo, Date.now());
    }
    this.lurkers = Math.max(60, this.lurkers + Math.floor(between(-6, 7)));
    this.later(between(45000, 80000), () => this.comeAndGo());
  }

  /** A message from a regular: shown if their conversation is open, flashed on row 0 otherwise. */
  say(bot, text, first = false) {
    if (!this.online.includes(bot)) return;
    const thread = this.thread(bot);
    if (first && thread.messages.length) return;
    this.post(bot, { kind: 'bot', pseudo: bot.pseudo, color: 'magenta', text });
    if (this.view?.bot !== bot) {
      thread.unread++;
      const v = new Videotex();
      status(v, `Message de ${bot.pseudo}`);
      this.session.write(v.bell());
    }
  }

  /** Add a message to a conversation; draw it when that conversation is on screen. */
  post(bot, message) {
    const thread = this.thread(bot);
    thread.messages.push(message);
    if (thread.messages.length > 40) thread.messages.shift();
    if (this.view?.bot !== bot || !this.session.connected) return;
    const rows = renderMessage(message).slice(0, 3);
    // Delete rows at the top of the area: the rest moves up, room opens below.
    const v = new Videotex().cursor(false).moveTo(FIRST_ROW, 1).deleteLines(rows.length);
    rows.forEach((draw, i) => draw(v, LAST_ROW - rows.length + 1 + i));
    this.session.write(this.view.composer.cursor(v));
  }

  /** You write to a regular; they answer after typing their reply. */
  send(bot, text) {
    this.post(bot, { kind: 'me', pseudo: this.me.slice(0, 12), text });
    if (!this.online.includes(bot)) {
      this.post(bot, { kind: 'info', text: `Message non distribué : ${bot.pseudo} n'est plus connecté.` });
      return;
    }
    const thread = this.thread(bot);
    thread.nudged = false;
    const reply = this.answer(bot, text, thread);
    const delay = between(1500, 2500) + reply.length * 55;
    this.later(delay, () => {
      this.say(bot, reply);
      // Now and then a second line, or a goodbye for good.
      if (Math.random() < 0.25) this.later(between(2500, 4500), () => this.say(bot, this.fill(bot, pick(bot.lines))));
      else if (thread.messages.length > 24 && bot.pseudo !== 'CAROLINE' && Math.random() < 0.15) this.leave(bot);
    });
    // Silence afterwards: a nudge, once.
    this.later(delay + 45000, () => {
      const last = thread.messages[thread.messages.length - 1];
      if (!thread.nudged && last?.kind === 'bot') {
        thread.nudged = true;
        this.say(bot, this.fill(bot, pick(NUDGES)));
      }
    });
  }

  leave(bot) {
    this.later(between(3000, 5000), () => {
      this.say(bot, this.fill(bot, pick(GOODBYES)));
      this.later(1500, () => {
        const i = this.online.indexOf(bot);
        if (i < 0) return;
        this.online.splice(i, 1);
        this.reserve.push(bot);
        this.post(bot, { kind: 'event', text: `${bot.pseudo} s'est déconnecté${bot.sex === 'F' ? 'e' : ''}` });
      });
    });
  }

  answer(bot, text, thread) {
    const n = norm(text);
    const rule = (bot.rules || []).find(([pattern]) => pattern.test(n)) || RULES.find(([pattern]) => pattern.test(n));
    const lines = rule ? rule[1] : Math.random() < 0.5 ? bot.lines : SMALL_TALK;
    const fresh = lines.filter((line) => !thread.recent.includes(line));
    const line = pick(fresh.length ? fresh : lines);
    thread.recent = [line, ...thread.recent].slice(0, 6);
    return this.fill(bot, line);
  }

  fill(bot, line) {
    return line
      .replaceAll('{P}', this.me)
      .replaceAll('{AGE}', bot.age ? String(bot.age) : 'Aucune importance')
      .replaceAll('{SEXWORD}', SEX_WORDS[bot.sex])
      .replaceAll('{SEX}', SEX_NAMES[bot.sex])
      .replaceAll('{DEPT}', bot.dept || 'quelque part');
  }
}

/* ---------------------------------------------------------------------- */
/* Pages                                                                   */
/* ---------------------------------------------------------------------- */

const CV_FIELDS = [
  { name: 'sex', row: 7, col: 20, length: 1, accept: /[HFhf]/, uppercase: true },
  { name: 'age', row: 9, col: 20, length: 2, accept: /\d/ },
  { name: 'dept', row: 11, col: 20, length: 2, accept: /[0-9ABab]/, uppercase: true },
  { name: 'text', row: 15, col: 2, length: 76, width: 38 },
];

function cvPage(state) {
  const p = new Page().clear().cursor(false);
  status(p, state.pseudo);
  band(p, 'VOTRE CV', state.returning ? 'Bon retour !' : 'Bienvenue !');
  p.print(4, 2, 'On le lira avant de vous écrire.', { color: 'cyan' });
  p.print(7, 2, 'Vous êtes (H/F)', { color: 'white' });
  p.print(9, 2, 'Votre âge', { color: 'white' });
  p.print(11, 2, 'Département', { color: 'white' });
  p.print(13, 2, 'Quelques mots sur vous :', { color: 'white' });
  p.hints(19, [['SUITE', 'champ suivant'], ['RETOUR', 'précédent']]);
  p.print(21, 2, 'Rien à dire ? Tapez directement ENVOI.', { color: 'cyan' });
  p.print(24, 2, 'Valider votre CV', { color: 'white' });
  p.key(24, 33, 'ENVOI');
  return p;
}

async function editCv(session, state) {
  session.write(cvPage(state));
  const fields = CV_FIELDS.map((f) => ({ ...f, color: 'yellow', value: state.cv?.[f.name] || '' }));
  const { key, values } = await session.form(fields);
  if (key === 'ENVOI') state.cv = values;
}

function menuPage(state, net) {
  const p = new Page().clear().cursor(false);
  status(p, state.pseudo);
  band(p, 'ROSE', `Bonsoir ${state.pseudo.slice(0, 22)}`);
  p.print(4, 2, 'Dialogue et rencontres en liberté', { color: 'magenta' });
  const unread = net.unread;
  const items = [
    ['Les connectés', `${net.count} en ligne`],
    ['Votre boîte aux lettres', unread ? `${unread} nouveau${unread > 1 ? 'x' : ''}` : 'vide'],
    ['Votre CV', state.cv?.text ? 'à jour' : 'à remplir'],
  ];
  items.forEach(([label, note], i) => {
    const row = 7 + i * 3;
    p.moveTo(row, 3).color(BAND).invert(true).text(` ${i + 1} `).invert(false);
    p.print(row, 8, label, { color: 'white' });
    p.right(row, 39, note, { color: i === 1 && unread ? 'yellow' : 'cyan', flash: i === 1 && unread > 0 });
  });
  p.hints(21, [['GUIDE', 'conditions'], ['CONNEXION FIN', 'quitter']]);
  p.prompt({ label: 'Votre choix', length: 1, fieldColor: 'yellow' });
  return p;
}

function listPage(state, net, list, start) {
  const p = new Page().clear().cursor(false);
  status(p, state.pseudo);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  band(p, 'LES CONNECTES', `${Math.floor(start / PER_PAGE) + 1}/${pages}`);
  list.slice(start, start + PER_PAGE).forEach((bot, i) => {
    const row = 4 + i * 2;
    const thread = net.threads.get(bot.pseudo);
    p.print(row, 1, pad(String(start + i + 1), 2, 'right'), { color: 'yellow' });
    if (thread?.unread) p.moveTo(row, 3).color('yellow').flash(true).text('*').flash(false);
    p.print(row, 5, bot.pseudo, { color: 'white' });
    p.right(row, 39, `${bot.sex} ${bot.age ? pad(String(bot.age), 2, 'right') : '--'} ${pad(bot.dept || '--', 2)}`, { color: bot.sex === 'F' ? 'magenta' : bot.sex === 'H' ? 'cyan' : 'green' });
    p.print(row + 1, 5, bot.cv.length > 35 ? `${bot.cv.slice(0, 34)}.` : bot.cv, { color: 'blue' });
  });
  const hints = [];
  if (start + PER_PAGE < list.length) hints.push(['SUITE', 'suivants']);
  if (start) hints.push(['RETOUR', 'précédents']);
  hints.push(['SOMMAIRE', 'menu']);
  p.hints(21, hints);
  p.print(22, 2, `et ${net.lurkers} autres qui ne disent rien...`, { color: 'blue' });
  p.prompt({ label: 'N° de la personne', length: 2, fieldColor: 'yellow' });
  return p;
}

function profilePage(state, net, bot) {
  const p = new Page().clear().cursor(false);
  status(p, state.pseudo);
  band(p, 'CV', net.online.includes(bot) ? 'en ligne' : 'déconnecté');
  p.print(5, 2, bot.pseudo, { color: 'white', size: 'tall' });
  p.print(7, 2, identity(bot), { color: bot.sex === 'F' ? 'magenta' : bot.sex === 'H' ? 'cyan' : 'green' });
  p.panel(9, 2, 14, 39, { bg: 'blue', shadow: BAND });
  wrap(bot.cv, 34).slice(0, 5).forEach((line, i) => p.print(10 + i, 4, line, { color: 'white', bg: 'blue' }));
  const since = Math.max(1, Math.round((Date.now() - (net.since.get(bot.pseudo) || Date.now())) / 60000));
  if (net.online.includes(bot)) p.print(17, 2, `Connecté${bot.sex === 'F' ? 'e' : ''} depuis ${since} mn`, { color: 'cyan' });
  p.hints(20, [['ENVOI', 'lui écrire'], ['SUITE', 'suivant']]);
  p.hints(21, [['RETOUR', 'liste'], ['SOMMAIRE', 'menu']]);
  return p;
}

function mailboxPage(state, net, threads) {
  const p = new Page().clear().cursor(false);
  status(p, state.pseudo);
  band(p, 'BOITE AUX LETTRES', `${net.unread} nouveau${net.unread > 1 ? 'x' : ''}`);
  if (!threads.length) {
    p.print(8, 2, 'Aucun message pour le moment.', { color: 'white' });
    p.print(10, 2, 'Patience : ici, on vous écrit vite.', { color: 'cyan' });
  }
  threads.slice(0, PER_PAGE).forEach((thread, i) => {
    const row = 4 + i * 2;
    const last = [...thread.messages].reverse().find((m) => m.kind === 'bot' || m.kind === 'me');
    p.print(row, 1, pad(String(i + 1), 2, 'right'), { color: 'yellow' });
    if (thread.unread) p.moveTo(row, 3).color('yellow').flash(true).text('*').flash(false);
    p.print(row, 5, thread.bot.pseudo, { color: 'white' });
    if (thread.unread) p.right(row, 39, `${thread.unread} nouveau${thread.unread > 1 ? 'x' : ''}`, { color: 'yellow' });
    if (last) {
      const text = `${last.kind === 'me' ? 'Vous : ' : ''}${last.text}`;
      p.print(row + 1, 5, text.length > 35 ? `${text.slice(0, 34)}.` : text, { color: 'blue' });
    }
  });
  p.hints(21, [['SOMMAIRE', 'menu']]);
  p.prompt({ label: 'N° du message', length: 1, fieldColor: 'yellow' });
  return p;
}

function talkPage(state, net, bot, composer) {
  const p = new Page().clear().cursor(false);
  p.band(1, { bg: BAND, rows: 2 });
  p.print(1, 2, 'TETE-A-TETE', { color: 'yellow', bg: BAND });
  p.print(1, 14, bot.pseudo, { color: 'white', bg: BAND });
  const keys = [['SUITE', 'CV'], ['RETOUR', 'liste'], ['SOMMAIRE', 'menu']];
  let col = 1;
  for (const [key, label] of keys) {
    p.moveTo(2, col).bg(BAND).color('white').text(' ').invert(true).text(key).invert(false).color('yellow').text(` ${label} `);
    col += key.length + label.length + 3;
  }
  p.moveTo(3, 1).color('yellow').invert(true).text(state.pseudo.slice(0, 12)).invert(false);
  composer.draw(p);
  p.hline(5, { color: BAND, style: 'top' });
  const rows = net.thread(bot).messages.flatMap((m) => renderMessage(m).slice(0, 3)).slice(-AREA);
  rows.forEach((draw, i) => draw(p, LAST_ROW - rows.length + 1 + i));
  return composer.cursor(p);
}

/* ---------------------------------------------------------------------- */
/* Flows                                                                   */
/* ---------------------------------------------------------------------- */

/** A private conversation. Returns 'menu', 'profile' or 'back'. */
async function talk(session, state, net, bot) {
  const composer = new Composer(state.pseudo.slice(0, 12));
  const thread = net.thread(bot);
  thread.unread = 0;
  net.view = { bot, composer };
  session.write(talkPage(state, net, bot, composer));
  try {
    for (;;) {
      const action = composer.handle(await session.next(), session);
      if (action === 'send') {
        const text = composer.take();
        session.write(composer.cursor(composer.draw(new Videotex().cursor(false))));
        if (text) net.send(bot, text);
      } else if (action === 'SOMMAIRE') return 'menu';
      else if (action === 'SUITE') return 'profile';
      else if (action === 'RETOUR') return 'back';
      else if (action === 'REPETITION' || action === 'GUIDE') session.write(talkPage(state, net, bot, composer));
    }
  } finally {
    net.view = null;
    thread.unread = 0;
  }
}

/** A CV, then maybe a conversation. Returns 'menu' or 'back'. */
async function profile(session, state, net, list, index) {
  for (;;) {
    const bot = list[index];
    session.write(profilePage(state, net, bot));
    const key = await session.waitKey(['ENVOI', 'SUITE', 'RETOUR', 'SOMMAIRE', 'REPETITION', 'GUIDE']);
    if (key === 'SOMMAIRE') return 'menu';
    if (key === 'RETOUR') return 'back';
    if (key === 'SUITE') index = (index + 1) % list.length;
    if (key === 'ENVOI') {
      const next = await talk(session, state, net, bot);
      if (next === 'menu') return 'menu';
      if (next === 'back') return 'back';
    }
  }
}

async function browse(session, state, net) {
  let start = 0;
  for (;;) {
    const list = [...net.online];
    if (start >= list.length) start = 0;
    const page = listPage(state, net, list, start);
    session.write(page);
    const { key, value } = await session.input({ ...page.field, color: 'yellow', accept: /\d/ });
    if (key === 'SOMMAIRE') return;
    if (key === 'SUITE' && start + PER_PAGE < list.length) start += PER_PAGE;
    else if (key === 'RETOUR' && start) start -= PER_PAGE;
    else if (key === 'RETOUR') return;
    else if (key === 'ENVOI' && list[Number(value) - 1]) {
      if (await profile(session, state, net, list, Number(value) - 1) === 'menu') return;
    } else if (key === 'ENVOI') session.write(new Videotex().bell());
  }
}

async function mailbox(session, state, net) {
  for (;;) {
    const threads = [...net.threads.values()]
      .filter((t) => t.messages.some((m) => m.kind === 'bot'))
      .sort((a, b) => b.unread - a.unread);
    const page = mailboxPage(state, net, threads);
    session.write(page);
    const { key, value } = await session.input({ ...page.field, color: 'yellow', accept: /\d/ });
    if (key === 'SOMMAIRE' || key === 'RETOUR') return;
    const thread = threads[Number(value) - 1];
    if (key === 'ENVOI' && thread) {
      const next = await talk(session, state, net, thread.bot);
      if (next === 'menu') return;
      if (next === 'profile' && await profile(session, state, net, [thread.bot], 0) === 'menu') return;
    } else if (key === 'ENVOI') session.write(new Videotex().bell());
  }
}

/** Inside the service, from the menu. */
async function club(session, state) {
  const net = new Network(session, state.pseudo);
  net.start();
  try {
    if (!state.cv) await editCv(session, state);
    for (;;) {
      const page = menuPage(state, net);
      session.write(page);
      const { key, value } = await session.input({ ...page.field, color: 'yellow', accept: /[1-3]/ });
      if (key === 'GUIDE') {
        session.write(conditionsPage());
        await session.waitKey();
      } else if (key === 'ENVOI' && value === '1') await browse(session, state, net);
      else if (key === 'ENVOI' && value === '2') await mailbox(session, state, net);
      else if (key === 'ENVOI' && value === '3') await editCv(session, state);
      else if (key === 'ENVOI') session.write(new Videotex().bell());
    }
  } finally {
    net.stop();
  }
}

export default {
  code: 'ROSE',
  name: 'Rose',
  description: 'Dialogue et rencontres en liberté',
  async run(session) {
    const state = session.data.rose || (session.data.rose = {});
    let message = null;
    for (;;) {
      session.write(homePage(message));
      const { key, value } = await session.input(PSEUDO_FIELD);
      message = null;
      if (key === 'GUIDE') {
        session.write(conditionsPage());
        await session.waitKey();
        continue;
      }
      if (key !== 'ENVOI') continue;
      const [name, password] = value.split(',');
      const pseudo = name.trim();
      if (pseudo.length < 4) {
        message = pseudo ? 'Trop court : 4 caractères minimum.' : 'Tapez votre pseudo, puis ENVOI.';
        session.write(new Videotex().bell());
        continue;
      }
      state.pseudo = pseudo;
      state.returning = password !== undefined;
      await club(session, state);
    }
  },
};
