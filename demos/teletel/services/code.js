/**
 * 3615 CODE — placeholder, replaced by the real service.
 */
import { Page } from '../../../src/js/service/page.js';

export default {
  code: 'CODE',
  name: 'CODE',
  description: 'Service en construction',
  async run(session) {
    session.write(new Page().clear().cursor(false)
      .header({ title: 'CODE', code: 'CODE' })
      .center(12, 'Service en construction', { color: 'yellow' })
      .hints(23, [['SOMMAIRE', 'retour au kiosque']]));
    await session.waitKey(['SOMMAIRE']);
  },
};
