/**
 * Télétel: a tiny network of Minitel services reachable by number
 * (3611, 3614, 3615, 3617...) and, behind a kiosk ("point d'accès
 * vidéotex"), by service code.
 *
 *   const network = new Teletel({ services: [meteo, trains, annuaire] });
 *   network.answer('3615')   // -> the kiosk service asking for a code
 *   network.answer('3611')   // -> a service registered with `number: '3611'`
 */
import { Page, wrap, francs } from './page.js';
import { Videotex } from '../videotex/writer.js';
import { Disconnected } from './session.js';

/** Indicative tariffs, in francs per minute (early 1990s). */
export const TARIFFS = Object.freeze({
  3611: { perMinute: 0.12, freeMinutes: 3, label: 'Annuaire électronique' },
  3613: { perMinute: 0.12, label: 'Kiosque grand public' },
  3614: { perMinute: 0.37, label: 'Kiosque professionnel' },
  3615: { perMinute: 1.29, label: 'Kiosque grand public' },
  3616: { perMinute: 1.29, label: 'Kiosque' },
  3617: { perMinute: 2.23, label: 'Kiosque professionnel' },
});

export class Teletel {
  constructor({ services = [] } = {}) {
    this.services = [];
    services.forEach((s) => this.register(s));
  }

  /**
   * Register a service: { code, name, description, number = '3615', direct, run(session) }.
   * `direct: true` makes the service answer the number itself (like 3611).
   */
  register(service) {
    this.services.push({ number: '3615', ...service, code: service.code.toUpperCase() });
    return this;
  }

  /** Services reachable from a number's kiosk. */
  list(number = '3615') {
    return this.services.filter((s) => s.number === number && !s.hidden && !s.direct);
  }

  find(code, number = '3615') {
    const wanted = String(code).trim().toUpperCase().replace(/\s+/g, '');
    return this.services.find((s) => s.number === number && s.code.replace(/\s+/g, '') === wanted && !s.direct)
      || this.services.find((s) => s.code.replace(/\s+/g, '') === wanted && !s.direct);
  }

  tariff(number) {
    return TARIFFS[number] || { perMinute: 1.29 };
  }

  /** Service answering a number, or null when nobody picks up. */
  answer(number) {
    const n = String(number).replace(/\s/g, '');
    const direct = this.services.find((s) => s.direct && s.number === n);
    if (direct) return direct;
    if (this.services.some((s) => s.number === n) || TARIFFS[n]) return kiosk(this, n);
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* Kiosk                                                                   */
/* ---------------------------------------------------------------------- */

function kioskPage(network, number, { error } = {}) {
  const tariff = network.tariff(number);
  const p = new Page().clear().cursor(false);
  p.status(` TELETEL ${number}`, { color: 'white' });
  p.band(1, { bg: 'blue', rows: 5 });
  p.bigText(2, 3, number, { color: 'yellow', background: 'blue' });
  p.print(2, 21, 'TELETEL', { color: 'white', bg: 'blue', size: 'double' });
  p.print(4, 21, 'Le kiosque Minitel', { color: 'cyan', bg: 'blue' });
  p.hline(6, { color: 'blue', style: 'top' });

  p.print(8, 3, 'Tapez le code du service', { color: 'white' });
  p.print(9, 3, 'puis appuyez sur', { color: 'white' });
  p.key(9, 20, 'ENVOI');

  p.print(12, 3, 'Code', { color: 'cyan' });
  p.moveTo(12, 8).color('cyan').text(':');
  p.box(11, 10, 13, 38, { color: 'blue' });

  const picks = network.list(number).slice(0, 5);
  if (picks.length) {
    p.print(15, 3, 'A la une', { color: 'yellow', underline: false });
    picks.forEach((s, i) => {
      p.print(16 + i, 3, s.code.padEnd(10), { color: 'white' });
      p.print(16 + i, 14, (s.name || '').slice(0, 26), { color: 'cyan' });
    });
  }
  if (error) p.center(21, error, { color: 'red', flash: true });
  p.hints(22, [['GUIDE', 'tous les services']], { color: 'cyan' });
  p.moveTo(23, 2).color('green').text(`Tarif : ${francs(tariff.perMinute)}/min`);
  if (tariff.freeMinutes) p.text(` (${tariff.freeMinutes} min offertes)`);
  p.moveTo(24, 2).color('white').invert(true).text(' CONNEXION FIN ').invert(false).color('white').text(' pour terminer');
  return p;
}

async function guide(session, network, number) {
  const services = network.list(number);
  const perPage = 8;
  const pages = Math.max(1, Math.ceil(services.length / perPage));
  let index = 0;
  for (;;) {
    const p = new Page().clear().cursor(false);
    p.header({ title: 'Guide', code: '', bg: 'cyan', color: 'black', accent: 'black' });
    p.print(1, 30, `${number}`, { color: 'black', bg: 'cyan' });
    p.pager(index + 1, pages, { row: 3, color: 'black', bg: 'cyan' });
    services.slice(index * perPage, index * perPage + perPage).forEach((s, i) => {
      const row = 6 + i * 2;
      p.print(row, 2, s.code, { color: 'yellow' });
      const lines = wrap(s.description || s.name || '', 26);
      p.print(row, 14, lines[0] || '', { color: 'white' });
      if (lines[1]) p.print(row + 1, 14, lines[1], { color: 'white' });
    });
    const hints = [];
    if (index < pages - 1) hints.push(['SUITE', 'suite']);
    if (index > 0) hints.push(['RETOUR', 'retour']);
    hints.push(['SOMMAIRE', 'kiosque']);
    p.hints(22, hints);
    p.print(24, 2, 'Code du service :', { color: 'cyan' });
    session.write(p);
    const { key, value } = await session.input({ row: 24, col: 20, length: 12, uppercase: true, color: 'white' });
    if (key === 'SUITE' && index < pages - 1) index++;
    else if (key === 'RETOUR' && index > 0) index--;
    else if (key === 'ENVOI' && value.trim()) return value;
    else if (key === 'SOMMAIRE' || key === 'RETOUR') return null;
  }
}

/**
 * The kiosk: asks for a service code, runs the service, comes back when the
 * service returns.
 */
export function kiosk(network, number = '3615') {
  return {
    code: number,
    name: `Kiosque ${number}`,
    async run(session, context = {}) {
      let error = null;
      let code = null;
      for (;;) {
        if (!code) {
          session.write(kioskPage(network, number, { error }));
          error = null;
          const result = await session.input({ row: 12, col: 12, length: 24, uppercase: true, color: 'white', placeholder: '.' });
          if (result.key === 'GUIDE') {
            code = await guide(session, network, number);
            continue;
          }
          if (result.key !== 'ENVOI') continue;
          code = result.value.trim();
          if (!code) continue;
        }
        const service = network.find(code, number);
        if (!service) {
          error = `Service ${code} inconnu`;
          session.write(new Videotex().bell());
          code = null;
          continue;
        }
        code = null;
        session.write(new Videotex().status(` ${number} ${service.code}`, { color: 'white' }));
        context.onService?.(service);
        try {
          await service.run(session, { ...context, network, number });
        } catch (failure) {
          if (failure instanceof Disconnected) throw failure;
          console.error(`[${service.code}]`, failure);
          error = `${service.code} : service indisponible`;
        }
        session.flush();
        context.onService?.(null);
      }
    },
  };
}
