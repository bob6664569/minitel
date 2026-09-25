/**
 * 3615 TRAINS — placeholder, replaced by the real service.
 */
import { Page } from '../../../src/js/service/page.js';

export default {
  code: 'TRAINS',
  name: 'TRAINS',
  description: 'Service en construction',
  async run(session) {
    session.write(new Page().clear().cursor(false)
      .header({ title: 'TRAINS', code: 'TRAINS' })
      .center(12, 'Service en construction', { color: 'yellow' })
      .hints(23, [['SOMMAIRE', 'retour au kiosque']]));
    await session.waitKey(['SOMMAIRE']);
  },
};
