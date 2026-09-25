/**
 * 3615 ANNUAIRE — placeholder, replaced by the real service.
 */
import { Page } from '../../../src/js/service/page.js';

export default {
  code: 'ANNUAIRE',
  name: 'ANNUAIRE',
  description: 'Service en construction',
  async run(session) {
    session.write(new Page().clear().cursor(false)
      .header({ title: 'ANNUAIRE', code: 'ANNUAIRE' })
      .center(12, 'Service en construction', { color: 'yellow' })
      .hints(23, [['SOMMAIRE', 'retour au kiosque']]));
    await session.waitKey(['SOMMAIRE']);
  },
};
