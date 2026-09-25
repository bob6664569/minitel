/**
 * 3611 ANNUAIRE — embedded tables for the electronic directory: French
 * departments (prefecture, postcode, 1985-1996 telephone prefix), towns,
 * common surnames and first names, street names and professions, and a
 * deterministic generator of fictional subscribers.
 */

/* ---------------------------------------------------------------------- */
/* Seeded helpers                                                          */
/* ---------------------------------------------------------------------- */

/** FNV-1a hash of a string. */
export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG: returns a function giving floats in [0, 1). */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uppercase letters and digits only: 'Saint-Étienne' -> 'SAINTETIENNE'. */
export function key(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bST(E?)\b/g, 'SAINT$1')
    .replace(/[^A-Z0-9]/g, '');
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/* ---------------------------------------------------------------------- */
/* Departments and towns                                                   */
/* ---------------------------------------------------------------------- */

/*
 * code: [department, prefecture, telephone prefix]. Paris and its region
 * use the '(1)' prefix followed by an 8-digit number.
 */
export const DEPARTMENTS = {
  '01': ['Ain', 'Bourg-en-Bresse', '74'], '02': ['Aisne', 'Laon', '23'], '03': ['Allier', 'Moulins', '70'],
  '04': ['Alpes-de-Haute-Provence', 'Digne', '92'], '05': ['Hautes-Alpes', 'Gap', '92'], '06': ['Alpes-Maritimes', 'Nice', '93'],
  '07': ['Ardèche', 'Privas', '75'], '08': ['Ardennes', 'Charleville-Mézières', '24'], '09': ['Ariège', 'Foix', '61'],
  '10': ['Aube', 'Troyes', '25'], '11': ['Aude', 'Carcassonne', '68'], '12': ['Aveyron', 'Rodez', '65'],
  '13': ['Bouches-du-Rhône', 'Marseille', '91'], '14': ['Calvados', 'Caen', '31'], '15': ['Cantal', 'Aurillac', '71'],
  '16': ['Charente', 'Angoulême', '45'], '17': ['Charente-Maritime', 'La Rochelle', '46'], '18': ['Cher', 'Bourges', '48'],
  '19': ['Corrèze', 'Tulle', '55'], '2A': ['Corse-du-Sud', 'Ajaccio', '95'], '2B': ['Haute-Corse', 'Bastia', '95'],
  '21': ["Côte-d'Or", 'Dijon', '80'], '22': ["Côtes-d'Armor", 'Saint-Brieuc', '96'], '23': ['Creuse', 'Guéret', '55'],
  '24': ['Dordogne', 'Périgueux', '53'], '25': ['Doubs', 'Besançon', '81'], '26': ['Drôme', 'Valence', '75'],
  '27': ['Eure', 'Evreux', '32'], '28': ['Eure-et-Loir', 'Chartres', '37'], '29': ['Finistère', 'Quimper', '98'],
  '30': ['Gard', 'Nîmes', '66'], '31': ['Haute-Garonne', 'Toulouse', '61'], '32': ['Gers', 'Auch', '62'],
  '33': ['Gironde', 'Bordeaux', '56'], '34': ['Hérault', 'Montpellier', '67'], '35': ['Ille-et-Vilaine', 'Rennes', '99'],
  '36': ['Indre', 'Châteauroux', '54'], '37': ['Indre-et-Loire', 'Tours', '47'], '38': ['Isère', 'Grenoble', '76'],
  '39': ['Jura', 'Lons-le-Saunier', '84'], '40': ['Landes', 'Mont-de-Marsan', '58'], '41': ['Loir-et-Cher', 'Blois', '54'],
  '42': ['Loire', 'Saint-Etienne', '77'], '43': ['Haute-Loire', 'Le Puy', '71'], '44': ['Loire-Atlantique', 'Nantes', '40'],
  '45': ['Loiret', 'Orléans', '38'], '46': ['Lot', 'Cahors', '65'], '47': ['Lot-et-Garonne', 'Agen', '53'],
  '48': ['Lozère', 'Mende', '66'], '49': ['Maine-et-Loire', 'Angers', '41'], '50': ['Manche', 'Saint-Lô', '33'],
  '51': ['Marne', 'Châlons-sur-Marne', '26'], '52': ['Haute-Marne', 'Chaumont', '25'], '53': ['Mayenne', 'Laval', '43'],
  '54': ['Meurthe-et-Moselle', 'Nancy', '83'], '55': ['Meuse', 'Bar-le-Duc', '29'], '56': ['Morbihan', 'Vannes', '97'],
  '57': ['Moselle', 'Metz', '87'], '58': ['Nièvre', 'Nevers', '86'], '59': ['Nord', 'Lille', '20'],
  '60': ['Oise', 'Beauvais', '44'], '61': ['Orne', 'Alençon', '33'], '62': ['Pas-de-Calais', 'Arras', '21'],
  '63': ['Puy-de-Dôme', 'Clermont-Ferrand', '73'], '64': ['Pyrénées-Atlantiques', 'Pau', '59'], '65': ['Hautes-Pyrénées', 'Tarbes', '62'],
  '66': ['Pyrénées-Orientales', 'Perpignan', '68'], '67': ['Bas-Rhin', 'Strasbourg', '88'], '68': ['Haut-Rhin', 'Colmar', '89'],
  '69': ['Rhône', 'Lyon', '78'], '70': ['Haute-Saône', 'Vesoul', '84'], '71': ['Saône-et-Loire', 'Mâcon', '85'],
  '72': ['Sarthe', 'Le Mans', '43'], '73': ['Savoie', 'Chambéry', '79'], '74': ['Haute-Savoie', 'Annecy', '50'],
  '75': ['Paris', 'Paris', '(1) 4'], '76': ['Seine-Maritime', 'Rouen', '35'], '77': ['Seine-et-Marne', 'Melun', '(1) 6'],
  '78': ['Yvelines', 'Versailles', '(1) 3'], '79': ['Deux-Sèvres', 'Niort', '49'], '80': ['Somme', 'Amiens', '22'],
  '81': ['Tarn', 'Albi', '63'], '82': ['Tarn-et-Garonne', 'Montauban', '63'], '83': ['Var', 'Toulon', '94'],
  '84': ['Vaucluse', 'Avignon', '90'], '85': ['Vendée', 'La Roche-sur-Yon', '51'], '86': ['Vienne', 'Poitiers', '49'],
  '87': ['Haute-Vienne', 'Limoges', '55'], '88': ['Vosges', 'Epinal', '29'], '89': ['Yonne', 'Auxerre', '86'],
  '90': ['Territoire de Belfort', 'Belfort', '84'], '91': ['Essonne', 'Evry', '(1) 6'], '92': ['Hauts-de-Seine', 'Nanterre', '(1) 4'],
  '93': ['Seine-Saint-Denis', 'Bobigny', '(1) 4'], '94': ['Val-de-Marne', 'Créteil', '(1) 4'], '95': ["Val-d'Oise", 'Pontoise', '(1) 3'],
};

/* Other towns: [name, department, postcode, size 1..5]. Prefectures are added below. */
const TOWNS = [
  ['Aix-en-Provence', '13', '13100', 4], ['Arles', '13', '13200', 3], ['Aubagne', '13', '13400', 3],
  ['Cannes', '06', '06400', 4], ['Antibes', '06', '06600', 3], ['Grasse', '06', '06130', 3], ['Menton', '06', '06500', 2],
  ['Le Havre', '76', '76600', 4], ['Dieppe', '76', '76200', 2], ['Brest', '29', '29200', 4], ['Morlaix', '29', '29600', 2],
  ['Reims', '51', '51100', 4], ['Epernay', '51', '51200', 2], ['Mulhouse', '68', '68100', 4],
  ['Roubaix', '59', '59100', 4], ['Tourcoing', '59', '59200', 4], ['Dunkerque', '59', '59140', 3], ['Valenciennes', '59', '59300', 3], ['Douai', '59', '59500', 3],
  ['Calais', '62', '62100', 3], ['Boulogne-sur-Mer', '62', '62200', 3], ['Lens', '62', '62300', 3],
  ['Villeurbanne', '69', '69100', 4], ['Villefranche-sur-Saône', '69', '69400', 2], ['Vénissieux', '69', '69200', 3],
  ['Boulogne-Billancourt', '92', '92100', 4], ['Neuilly-sur-Seine', '92', '92200', 3], ['Colombes', '92', '92700', 3], ['Rueil-Malmaison', '92', '92500', 3],
  ['Montreuil', '93', '93100', 4], ['Saint-Denis', '93', '93200', 4], ['Aubervilliers', '93', '93300', 3],
  ['Vitry-sur-Seine', '94', '94400', 3], ['Vincennes', '94', '94300', 3], ['Saint-Maur', '94', '94100', 3],
  ['Argenteuil', '95', '95100', 4], ['Sarcelles', '95', '95200', 3], ['Saint-Germain-en-Laye', '78', '78100', 3], ['Mantes-la-Jolie', '78', '78200', 3],
  ['Meaux', '77', '77100', 3], ['Fontainebleau', '77', '77300', 2], ['Corbeil-Essonnes', '91', '91100', 3], ['Massy', '91', '91300', 3],
  ['Saint-Nazaire', '44', '44600', 3], ['Saint-Malo', '35', '35400', 3], ['Cholet', '49', '49300', 3], ['Saumur', '49', '49400', 2],
  ['Lorient', '56', '56100', 3], ['Bayonne', '64', '64100', 3], ['Biarritz', '64', '64200', 3], ['Béziers', '34', '34500', 3], ['Sète', '34', '34200', 3],
  ['Cherbourg', '50', '50100', 3], ['Narbonne', '11', '11100', 3], ['Montluçon', '03', '03100', 3], ['Vichy', '03', '03200', 3],
  ['Roanne', '42', '42300', 3], ['Chalon-sur-Saône', '71', '71100', 3], ['Saint-Quentin', '02', '02100', 3], ['Soissons', '02', '02200', 2],
  ['Annemasse', '74', '74100', 2], ['Thonon-les-Bains', '74', '74200', 2], ['Chamonix', '74', '74400', 2], ['Aix-les-Bains', '73', '73100', 2],
  ['Fréjus', '83', '83600', 3], ['Hyères', '83', '83400', 3], ['Saint-Tropez', '83', '83990', 1], ['Arcachon', '33', '33120', 2], ['Libourne', '33', '33500', 2],
  ['Mérignac', '33', '33700', 3], ['Pessac', '33', '33600', 3], ['Blagnac', '31', '31700', 2], ['Castres', '81', '81100', 2],
  ['Compiègne', '60', '60200', 3], ['Chantilly', '60', '60500', 2], ['Deauville', '14', '14800', 1], ['Lisieux', '14', '14100', 2], ['Bayeux', '14', '14400', 2],
  ['Saint-Etienne-du-Rouvray', '76', '76800', 2], ['Elbeuf', '76', '76500', 2], ['Vienne', '38', '38200', 2], ['Voiron', '38', '38500', 2],
  ['Montélimar', '26', '26200', 2], ['Romans-sur-Isère', '26', '26100', 2], ['Carpentras', '84', '84200', 2], ['Orange', '84', '84100', 2],
  ['Alès', '30', '30100', 3], ['Bergerac', '24', '24100', 2], ['Sarlat', '24', '24200', 1], ['Brive-la-Gaillarde', '19', '19100', 3],
  ['Thionville', '57', '57100', 3], ['Forbach', '57', '57600', 2], ['Lunéville', '54', '54300', 2], ['Saint-Dié', '88', '88100', 2],
  ['Sedan', '08', '08200', 2], ['Vierzon', '18', '18100', 2], ['Dole', '39', '39100', 2], ['Montbéliard', '25', '25200', 3], ['Pontarlier', '25', '25300', 2],
  ['Haguenau', '67', '67500', 2], ['Sélestat', '67', '67600', 2], ['Saverne', '67', '67700', 2], ['Rochefort', '17', '17300', 2], ['Royan', '17', '17200', 2],
  ['Cognac', '16', '16100', 2], ['Dax', '40', '40100', 2], ['Lourdes', '65', '65100', 2], ['Millau', '12', '12100', 2], ['Figeac', '46', '46100', 1],
];

const PREFECTURE_SIZE = { Paris: 5, Marseille: 5, Lyon: 5, Toulouse: 5, Nice: 5, Nantes: 4, Strasbourg: 4, Montpellier: 4, Bordeaux: 5, Lille: 5, Rennes: 4 };

function prefecturePostcode(code) {
  if (code === '2A') return '20000';
  if (code === '2B') return '20200';
  return `${code}000`;
}

export const LOCALITIES = [
  ...Object.entries(DEPARTMENTS).map(([code, [, town]]) => ({
    name: town,
    dept: code,
    postcode: prefecturePostcode(code),
    size: PREFECTURE_SIZE[town] || (['75', '92', '93', '94'].includes(code) ? 4 : 3),
  })),
  ...TOWNS.map(([name, dept, postcode, size]) => ({ name, dept, postcode, size })),
].map((town) => ({ ...town, key: key(town.name) }));

/** Towns of a department, largest first. */
export function townsOf(dept) {
  return LOCALITIES.filter((t) => t.dept === dept).sort((a, b) => b.size - a.size);
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Closest entries of `list` (objects with a `key`) to a typed text. */
function closest(text, list, count = 5) {
  const k = key(text);
  return list
    .map((item) => ({ item, d: Math.min(levenshtein(k, item.key), levenshtein(k, item.key.slice(0, k.length)) + 1) }))
    .filter((x) => x.d <= Math.max(2, Math.ceil(k.length / 3)))
    .sort((a, b) => a.d - b.d || (b.item.size || 0) - (a.item.size || 0))
    .slice(0, count)
    .map((x) => x.item);
}

/**
 * Match a locality: exact name, unique prefix, or suggestions.
 * Returns { town } or { suggestions }.
 */
export function findLocality(text) {
  const k = key(text);
  if (!k) return { suggestions: [] };
  const exact = LOCALITIES.find((t) => t.key === k);
  if (exact) return { town: exact };
  const prefix = LOCALITIES.filter((t) => t.key.startsWith(k));
  if (prefix.length === 1) return { town: prefix[0] };
  if (prefix.length > 1) return { suggestions: prefix.sort((a, b) => b.size - a.size).slice(0, 5) };
  return { suggestions: closest(text, LOCALITIES) };
}

/** Normalise a typed department: '6' -> '06', '2a' -> '2A'. */
export function findDepartment(text) {
  let code = String(text).trim().toUpperCase();
  if (/^\d$/.test(code)) code = `0${code}`;
  if (code === '20') code = '2A';
  return DEPARTMENTS[code] ? code : null;
}

/* ---------------------------------------------------------------------- */
/* People                                                                  */
/* ---------------------------------------------------------------------- */

/* The most common French surnames, most frequent first. */
export const SURNAMES = [
  'MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'RICHARD', 'PETIT', 'DURAND', 'LEROY', 'MOREAU',
  'SIMON', 'LAURENT', 'LEFEBVRE', 'MICHEL', 'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER',
  'MOREL', 'GIRARD', 'ANDRE', 'LEFEVRE', 'MERCIER', 'DUPONT', 'LAMBERT', 'BONNET', 'FRANCOIS', 'MARTINEZ',
  'LEGRAND', 'GARNIER', 'FAURE', 'ROUSSEAU', 'BLANC', 'GUERIN', 'MULLER', 'HENRY', 'ROUSSEL', 'NICOLAS',
  'PERRIN', 'MORIN', 'MATHIEU', 'CLEMENT', 'GAUTHIER', 'DUMONT', 'LOPEZ', 'FONTAINE', 'CHEVALIER', 'ROBIN',
  'MASSON', 'SANCHEZ', 'GERARD', 'NGUYEN', 'BOYER', 'DENIS', 'LEMAIRE', 'DUVAL', 'JOLY', 'GAUTIER',
  'ROGER', 'ROCHE', 'ROY', 'NOEL', 'MEYER', 'LUCAS', 'MEUNIER', 'JEAN', 'PEREZ', 'MARCHAND',
  'DUFOUR', 'BLANCHARD', 'MARIE', 'BARBIER', 'BRUN', 'DUMAS', 'BRUNET', 'SCHMITT', 'LEROUX', 'COLIN',
  'FERNANDEZ', 'PIERRE', 'RENARD', 'ARNAUD', 'ROLLAND', 'CARON', 'AUBERT', 'GIRAUD', 'LECLERC', 'VIDAL',
  'BOURGEOIS', 'RENAUD', 'LEMOINE', 'PICARD', 'GAILLARD', 'PHILIPPE', 'LECLERCQ', 'LACROIX', 'FABRE', 'DUPUIS',
];

const MEN = ['Jean', 'Pierre', 'Michel', 'André', 'Philippe', 'Alain', 'Bernard', 'Jacques', 'Daniel', 'Claude',
  'Christian', 'Gérard', 'Patrick', 'Robert', 'René', 'Marcel', 'Roger', 'Louis', 'Henri', 'Georges', 'Paul',
  'François', 'Christophe', 'Laurent', 'Thierry', 'Pascal', 'Eric', 'Didier', 'Serge', 'Guy', 'Yves', 'Jean-Pierre',
  'Jean-Claude', 'Jean-Luc', 'Jean-Marc', 'Jean-Paul', 'Gilles', 'Joël', 'Bruno', 'Denis', 'Maurice', 'Raymond', 'Lucien'];

const WOMEN = ['Marie', 'Jeanne', 'Françoise', 'Monique', 'Catherine', 'Nathalie', 'Isabelle', 'Sylvie', 'Martine',
  'Nicole', 'Christine', 'Brigitte', 'Danielle', 'Anne', 'Chantal', 'Jacqueline', 'Michèle', 'Hélène', 'Véronique',
  'Colette', 'Simone', 'Suzanne', 'Denise', 'Madeleine', 'Odette', 'Paulette', 'Yvette', 'Josette', 'Ginette',
  'Marie-Claude', 'Marie-Thérèse', 'Annie', 'Evelyne', 'Dominique', 'Corinne', 'Valérie', 'Agnès', 'Béatrice', 'Claudine'];

/* Streets, abbreviated the way the directory printed them. */
const STREETS = [
  'r Victor Hugo', 'r de la République', 'av Jean Jaurès', 'r Pasteur', 'bd Gambetta', 'r du Gal de Gaulle',
  'pl de la Mairie', 'r des Ecoles', 'r de la Gare', 'av de la Libération', 'r Jules Ferry', 'r Voltaire',
  'r du Moulin', 'all des Tilleuls', 'imp des Lilas', 'r des Acacias', 'ch des Vignes', 'r Emile Zola',
  'r Carnot', 'r Nationale', 'r du Château', "r de l'Eglise", 'av Foch', 'r Anatole France', 'r Jean Moulin',
  'r Paul Bert', 'r Lamartine', 'r de Verdun', 'r du 8 Mai 1945', 'r des Roses', 'sq Montaigne', 'bd Jean Jaurès',
  'r Aristide Briand', 'r du Marché', 'quai de la Loire', 'av des Peupliers', 'r des Jardins', 'r Saint-Martin',
  'r du Stade', 'cours Mirabeau', 'r Gustave Eiffel', 'r Denis Papin', 'av Clemenceau', 'r Louis Pasteur',
];

/* ---------------------------------------------------------------------- */
/* Professions (rubriques)                                                 */
/* ---------------------------------------------------------------------- */

/* Places used in shop names: "Pharmacie du Marché". */
const PLACES = ['Marché', 'Centre', 'Port', 'Château', 'Moulin', 'Parc', 'Pont', 'Midi', 'Commerce', 'Théâtre', 'Canal', 'Lac', 'Beffroi', 'Vieux Port'];

/*
 * [rubrique, activity shown on the card, name patterns]. In patterns,
 * N = surname, F = first name, S = street word, T = town.
 */
const RUBRIQUES = [
  ['PLOMBIERS', 'Plomberie, chauffage', ['Plomberie N', 'N et Fils', 'Ets N Chauffage', 'N F']],
  ['MEDECINS', 'Médecine générale', ['Dr N F', 'Dr N F', 'Cabinet médical du S']],
  ['BOULANGERIES', 'Boulangerie, pâtisserie', ['Boulangerie N', 'Au Fournil du S', 'Aux Délices de T', 'Boulangerie du Marché']],
  ['RESTAURANTS', 'Restaurant', ['Restaurant Le Relais', 'Chez F', 'La Table de F', 'Brasserie du S', 'Le Bistrot de T', 'Auberge N']],
  ['GARAGES', 'Garage, réparations', ['Garage N', 'Garage de la Gare', 'Garage du Centre', 'Auto Service T']],
  ['PHARMACIES', 'Pharmacie', ['Pharmacie N', 'Pharmacie du Marché', 'Pharmacie Centrale', 'Pharmacie du S']],
  ['COIFFEURS', 'Coiffure hommes, dames', ['F Coiffure', 'Salon N', "Coiff'F", 'N Coiffure']],
  ['AVOCATS', 'Avocat au barreau', ['Me N F', 'Me N F', 'Cabinet N']],
  ['NOTAIRES', 'Notaire', ['Me N F', 'Etude N', 'Mes N et N2']],
  ['TAXIS', 'Taxi, transport', ['Taxi F', 'Taxis de T', 'Taxi N', 'Radio Taxi T']],
  ['DENTISTES', 'Chirurgien-dentiste', ['Dr N F', 'Dr N F']],
  ['ELECTRICIENS', 'Electricité générale', ['Electricité N', 'N Elec', 'Ets N']],
  ['HOTELS', 'Hôtel', ['Hôtel de la Gare', 'Hôtel du Commerce', 'Hôtel N', 'Hôtel de France', 'Grand Hôtel de T']],
  ['FLEURISTES', 'Fleuriste', ['Au Jardin de F', 'Fleurs N', 'La Rose de T']],
  ['LIBRAIRIES', 'Librairie, papeterie', ['Librairie du S', 'Librairie N', 'Librairie de T']],
  ['VETERINAIRES', 'Vétérinaire', ['Dr N F', 'Clinique vétérinaire du S']],
  ['OPTICIENS', 'Opticien', ['Optique N', 'N Optique', 'Optique du S']],
  ['SERRURIERS', 'Serrurerie', ['Serrurerie N', 'N Dépannage']],
  ['AUTO-ECOLES', 'Auto-école', ['Auto-école N', 'Auto-école du S', 'Auto-école de T']],
  ['BOUCHERIES', 'Boucherie, charcuterie', ['Boucherie N', 'Boucherie du Marché']],
];

export const PROFESSIONS = RUBRIQUES.map(([name, activity, patterns]) => ({ name, activity, patterns, key: key(name) }));

const ALIASES = {
  RESTO: 'RESTAURANTS', DOCTEUR: 'MEDECINS', GENERALISTE: 'MEDECINS', MECANICIEN: 'GARAGES', CHAUFFAGISTE: 'PLOMBIERS',
  PAIN: 'BOULANGERIES', PATISSIER: 'BOULANGERIES', LUNETTES: 'OPTICIENS', COIFFURE: 'COIFFEURS', BRASSERIE: 'RESTAURANTS',
  FLEURS: 'FLEURISTES', LIVRES: 'LIBRAIRIES', BOUCHER: 'BOUCHERIES', CHARCUTIER: 'BOUCHERIES',
};

/** Match a profession: 'plombier', 'Boulanger', 'médecin' -> rubrique, or suggestions. */
export function findRubrique(text) {
  let k = key(text);
  if (!k) return { suggestions: [] };
  const alias = Object.keys(ALIASES).find((a) => k.startsWith(a) || (k.length >= 4 && a.startsWith(k)));
  if (alias) k = ALIASES[alias];
  const hit = PROFESSIONS.find((r) => r.key.startsWith(k) || k.startsWith(r.key.slice(0, Math.max(5, r.key.length - 3))));
  if (hit) return { rubrique: hit };
  return { suggestions: closest(text, PROFESSIONS, 4) };
}

/* ---------------------------------------------------------------------- */
/* Subscribers                                                             */
/* ---------------------------------------------------------------------- */

function phoneNumber(rand, dept) {
  const prefix = DEPARTMENTS[dept][2];
  const digits = () => String(Math.floor(rand() * 100)).padStart(2, '0');
  if (prefix.startsWith('(1)')) {
    // (1) 4x xx xx xx in Paris and the inner suburbs.
    const lead = prefix.slice(-1);
    const second = lead === '4' ? pick(rand, ['2', '3', '5', '6', '7', '8']) : String(Math.floor(rand() * 10));
    return `(1) ${lead}${second} ${digits()} ${digits()} ${digits()}`;
  }
  return `${prefix} ${digits()} ${digits()} ${digits()}`;
}

function postcodeFor(rand, town) {
  if (town.name === 'Paris') return `750${String(1 + Math.floor(rand() * 20)).padStart(2, '0')}`;
  if (town.name === 'Lyon') return `6900${1 + Math.floor(rand() * 9)}`;
  if (town.name === 'Marseille') return `130${String(1 + Math.floor(rand() * 16)).padStart(2, '0')}`;
  return town.postcode;
}

/** Does this look like a French surname? (vowels, few rare letters, no triples) */
function plausible(k) {
  if (k.length < 3 || /[^A-Z]/.test(k) || !/[AEIOUY]/.test(k) || /(.)\1\1/.test(k) || /[^AEIOUY]{5}/.test(k)) return false;
  return (k.match(/[KWXZQ]/g) || []).length <= 1;
}

/**
 * Subscribers named `name` in the given towns, sorted like a directory.
 * Frequent surnames give many entries, rare ones a few or none.
 */
export function searchName(name, towns) {
  const k = key(name);
  const display = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const rank = SURNAMES.indexOf(k);
  const people = [];
  for (const town of towns) {
    const rand = random(hash(`${k}|${town.key}`));
    let count;
    if (rank >= 0) count = Math.round(((110 - rank) / 110) * town.size * town.size * 1.6 * (0.6 + rand() * 0.8));
    else if (!plausible(k)) count = 0;
    else count = Math.floor(rand() * 4 * (town.size / 3)) - (k.length < 4 ? 1 : 0);
    if (towns.length > 1) count = Math.min(count, 12);
    for (let i = 0; i < count; i++) {
      const woman = rand() < 0.35;
      const first = pick(rand, woman ? WOMEN : MEN);
      people.push({
        name: display,
        first: rand() < 0.12 ? `${first.charAt(0)}.` : first,
        street: `${1 + Math.floor(rand() * 120)}${rand() < 0.06 ? ' bis' : ''} ${pick(rand, STREETS)}`,
        postcode: postcodeFor(rand, town),
        town: town.name,
        dept: town.dept,
        phone: phoneNumber(rand, town.dept),
        activity: rand() < 0.05 ? pick(rand, ['Médecin', 'Kinésithérapeute', 'Architecte', 'Infirmière', 'Artisan']) : null,
      });
    }
  }
  return people.sort((a, b) => a.first.localeCompare(b.first, 'fr') || a.town.localeCompare(b.town, 'fr'));
}

/** Businesses of a rubrique in the given towns. */
export function searchRubrique(rubrique, towns) {
  const list = [];
  for (const town of towns) {
    const rand = random(hash(`${rubrique.key}|${town.key}`));
    let count = Math.round(town.size * town.size * 0.9 * (0.6 + rand() * 0.8)) + 1;
    if (towns.length > 1) count = Math.min(count, 8);
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const surname = pick(rand, SURNAMES);
      const first = pick(rand, rand() < 0.3 ? WOMEN : MEN);
      const street = pick(rand, STREETS);
      const label = pick(rand, rubrique.patterns)
        .replace('N2', pick(rand, SURNAMES))
        .replace(/\bN\b/g, surname)
        .replace(/\bF\b/g, first)
        .replace(/\bS\b/, pick(rand, PLACES))
        .replace(/\bT\b/, town.name)
        .replace(/\bde ([AEIOUYÉH])/g, "d'$1");
      if (seen.has(label)) continue;
      seen.add(label);
      list.push({
        name: label,
        first: '',
        business: true,
        street: `${1 + Math.floor(rand() * 90)} ${street}`,
        postcode: postcodeFor(rand, town),
        town: town.name,
        dept: town.dept,
        phone: phoneNumber(rand, town.dept),
        activity: rubrique.activity,
      });
    }
  }
  // Directory order: generic words ("Hôtel", "Dr"...) do not count.
  const sortKey = (name) => name.replace(/^(Auberge|Restaurant|Brasserie|Hôtel|Grand|Ets|Dr|Mes?|Pharmacie|Boulangerie|Garage|Salon|Taxis?|Radio|Plomberie|Electricité|Librairie|Optique|Boucherie|Serrurerie|Auto-école|Fleurs|Cabinet|Etude|Clinique|Chez|La|Le|Au|Aux|Auto)\s+((de la|du|de|des|médical du|vétérinaire du|Table de|Rose de|Jardin de|Délices de|Fournil du|Bistrot de|Service)\s+)?/i, '');
  return list.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), 'fr'));
}
