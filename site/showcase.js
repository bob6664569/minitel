/**
 * 3615 MINITEL — the attract-mode service of the landing page.
 * Pages cycle on their own until the user touches the keyboard; then
 * SUITE / RETOUR or a page number (1-6) navigate.
 */
import { Page } from '../src/js/service/page.js';

const BAUD_CPS = 120;

function frame(title, n, total) {
  const p = new Page().clear().cursor(false);
  p.status(' 3615 MINITEL');
  p.band(1, { bg: 'blue', rows: 3 });
  p.print(3, 2, title, { color: 'yellow', bg: 'blue', size: 'double' });
  p.right(1, 39, `${n}/${total}`, { color: 'cyan', bg: 'blue' });
  p.hline(4, { color: 'blue', style: 'top' });
  return p;
}

function footer(p) {
  return p.moveTo(24, 2).color('white').invert(true).text(' SUITE ').invert(false)
    .color('cyan').text(' page suivante  ')
    .color('white').invert(true).text(' 1-6 ').invert(false)
    .color('cyan').text(' pages');
}

const PAGES = [
  // 1. Welcome
  (n, total) => {
    const p = new Page().clear().cursor(false);
    p.status(' 3615 MINITEL');
    p.band(1, { bg: 'blue', rows: 6 });
    p.bigText(2, 3, '3615', { color: 'yellow', background: 'blue' });
    p.print(3, 18, 'MINITEL', { color: 'white', bg: 'blue', size: 'double' });
    p.print(5, 18, 'design system', { color: 'cyan', bg: 'blue' });
    p.right(1, 39, `${n}/${total}`, { color: 'cyan', bg: 'blue' });
    p.hline(7, { color: 'blue', style: 'top' });
    p.paragraph(9, 3, 'La police, les couleurs, les mosaïques et le protocole Vidéotex du Minitel, pour le web.', { width: 35, color: 'white' });
    p.panel(13, 4, 18, 36, { bg: 'magenta', shadow: 'blue' });
    p.print(14, 6, '40 colonnes  x  25 rangées', { color: 'white', bg: 'magenta' });
    p.print(15, 6, '8 couleurs, 64 mosaïques', { color: 'white', bg: 'magenta' });
    p.print(16, 6, 'police bitmap 8 x 10', { color: 'yellow', bg: 'magenta' });
    p.print(17, 6, 'modem 1200 bauds', { color: 'white', bg: 'magenta' });
    p.art(20, 30, [
      '..cccccc..',
      '.cwwwwwwc.',
      '.cwkkkkwc.',
      '.cwkwkkwc.',
      '.cwwwwwwc.',
      '..cccccc..',
    ]);
    p.print(21, 3, 'Tapez sur le clavier', { color: 'green' });
    p.print(22, 3, 'pour prendre la main.', { color: 'green' });
    return footer(p);
  },

  // 2. Colours
  (n, total) => {
    const p = frame('8 COULEURS', n, total);
    const colors = [['white', 'Blanc', '100'], ['yellow', 'Jaune', '90'], ['cyan', 'Cyan', '80'], ['green', 'Vert', '70'], ['magenta', 'Magenta', '60'], ['red', 'Rouge', '50'], ['blue', 'Bleu', '40'], ['black', 'Noir', '0']];
    colors.forEach(([color, name, grey], i) => {
      const row = 6 + i * 2;
      p.moveTo(row, 3).color(color).mosaic(new Array(8).fill(63));
      p.moveTo(row + 1, 3).color(color).mosaic(new Array(8).fill(0b000011));
      p.print(row, 13, name.padEnd(9), { color: color === 'black' ? 'white' : color });
      p.print(row, 23, `ESC 4/${[7, 3, 6, 2, 5, 1, 4, 0][i]}`, { color: 'white' });
      p.right(row, 38, `${grey} %`, { color: 'white' });
    });
    return footer(p);
  },

  // 3. Mosaics
  (n, total) => {
    const p = frame('MOSAIQUES', n, total);
    p.print(6, 3, 'Chaque case se divise en 2 x 3 pavés :', { color: 'white' });
    p.print(7, 3, '64 caractères semi-graphiques.', { color: 'white' });
    for (let bits = 0; bits < 64; bits++) {
      const row = 9 + Math.floor(bits / 16) * 2;
      const col = 4 + (bits % 16) * 2;
      p.moveTo(row, col).color(['yellow', 'cyan', 'green', 'magenta'][Math.floor(bits / 16)]).mosaic(bits);
    }
    p.art(17, 4, [
      '....yy........................yy....',
      '...yyyy.......bbbbbbbb.......yyyy...',
      '..yyyyyy....bbbbbbbbbbbb....yyyyyy..',
      '...yyyy...bbbbbbbbbbbbbbbb...yyyy...',
      'gggggggggggggggggggggggggggggggggggg',
      'gggggggggggggggggggggggggggggggggggg',
      '.g.g.g.g.g.g.g.g.g.g.g.g.g.g.g.g.g.g',
    ]);
    return footer(p);
  },

  // 4. Sizes
  (n, total) => {
    const p = frame('4 TAILLES', n, total);
    p.print(6, 3, 'Normale', { color: 'white' });
    p.print(9, 3, 'Double hauteur', { color: 'cyan', size: 'tall' });
    p.print(11, 3, 'Double largeur', { color: 'green', size: 'wide' });
    p.print(15, 3, 'Double taille', { color: 'yellow', size: 'double' });
    p.print(18, 3, 'Et des attributs :', { color: 'white' });
    p.moveTo(20, 3).color('red').flash(true).text('clignotant').flash(false).text(' ')
      .color('white').invert(true).text(' inversé ').invert(false).text(' ')
      .color('magenta').underline(true).text(' souligné').underline(false).text(' ');
    return footer(p);
  },

  // 5. Speed
  (n, total) => {
    const p = frame('1200 BAUDS', n, total);
    p.paragraph(6, 3, 'Le modem du Minitel reçoit 1200 bits par seconde : 120 caractères. Une page pleine met plusieurs secondes à se dessiner, ligne après ligne.', { width: 35, color: 'white' });
    p.print(12, 3, 'Chargement', { color: 'cyan' });
    [0.2, 0.4, 0.6, 0.8, 1].forEach((ratio, i) => p.progress(14 + i, 3, 34, ratio, { color: ['blue', 'magenta', 'red', 'green', 'yellow'][i], track: 'black' }));
    p.print(20, 3, 'Le design system reproduit', { color: 'white' });
    p.print(21, 3, 'ce rythme, octet par octet.', { color: 'white' });
    return footer(p);
  },

  // 6. Components
  (n, total) => {
    const p = frame('COMPOSANTS', n, total);
    p.menu(['Menus numérotés', 'Champs pointillés', 'Touches inversées', 'Pavés et cadres'], { row: 6, gap: 2 });
    p.print(15, 3, 'Nom :', { color: 'cyan' });
    p.moveTo(15, 9).color('white').text('DUPONT').fill('.', 14);
    p.box(17, 3, 21, 37, { color: 'green' });
    p.print(19, 6, 'Service ouvert 24h/24', { color: 'yellow' });
    return footer(p);
  },
];

export default {
  code: 'MINITEL',
  name: 'Minitel design system',
  description: 'Présentation du design system',
  async run(session) {
    let index = 0;
    let auto = true;
    for (;;) {
      const page = PAGES[index](index + 1, PAGES.length);
      session.write(page);
      const drawing = (page.length / BAUD_CPS) * 1000;
      const event = await session.next({ timeout: auto ? drawing + 6500 : undefined });
      if (!event) {
        index = (index + 1) % PAGES.length;
        continue;
      }
      auto = false;
      if (event.type === 'char' && /[1-6]/.test(event.char)) index = Number(event.char) - 1;
      else if (event.key === 'SUITE' || event.key === 'ENVOI' || event.key === 'DOWN' || event.key === 'RIGHT') index = (index + 1) % PAGES.length;
      else if (event.key === 'RETOUR' || event.key === 'UP' || event.key === 'LEFT') index = (index - 1 + PAGES.length) % PAGES.length;
      else if (event.key === 'SOMMAIRE') index = 0;
    }
  },
};
