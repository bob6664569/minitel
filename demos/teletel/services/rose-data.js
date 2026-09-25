/**
 * 3615 ROSE — the regulars of the late-night messaging service. All
 * fictional. In their lines, {P} stands for the pseudonym of the person
 * they talk to.
 */

/**
 * The people online: pseudo, sex (F, H, or ? when they keep it to
 * themselves), age, department, CV, and how they open a conversation.
 * `lines` are things only they would say; `rules` their own answers.
 */
export const REGULARS = [
  {
    pseudo: 'BELLE_DE_NUIT', sex: 'F', age: 29, dept: '75',
    cv: 'Romantique et noctambule. Les longues conversations au clair de lune, les chansons de Barbara.',
    first: 'Bonsoir {P}, joli pseudo !',
    lines: ['La nuit, tout le monde est plus sincère, tu ne trouves pas ?', "J'écoute Barbara en t'écrivant...", 'Paris dort, et nous on parle.'],
  },
  {
    pseudo: 'LOUP_SOLITAIRE', sex: 'H', age: 41, dept: '69',
    cv: 'Divorcé, deux enfants le week-end. Randonnée, pêche, et je cuisine très bien.',
    first: 'Salut {P}, on peut discuter un peu ?',
    lines: ["Demain je pars dans le Vercors, j'adore la montagne.", 'Mon gratin dauphinois est célèbre dans tout Lyon.'],
  },
  {
    pseudo: 'DOMINIQUE', sex: '?', age: 33, dept: '13',
    cv: 'Devinez...',
    first: 'Salut {P} ! Devine si je suis un homme ou une femme ;-)',
    lines: ['Qui a dit que Dominique était un prénom de garçon ?', 'Tu cherches encore ? ;-)'],
    rules: [[/homme|femme|garcon|fille|\bh ou f\b|\bf ou h\b|sexe|asv/, ['Dominique, ça te dit tout ;-)', 'Un peu des deux, selon les jours !', 'Devine !']]],
  },
  {
    pseudo: 'ASV', sex: 'H', age: 19, dept: '59',
    cv: 'ASV ?',
    first: 'ASV ?',
    lines: ['ASV ?', 'Tu réponds pas ? ASV !', "T'as une photo ?"],
    rules: [[/./, ['ASV ?', 'ok. ASV ?', 'et ta photo ?', 'ok']]],
  },
  {
    pseudo: 'INFIRMIERE_DE_GARDE', sex: 'F', age: 34, dept: '31',
    cv: "De garde toutes les nuits à Purpan. J'écris entre deux tours de chambre.",
    first: 'Bonsoir {P}, une petite pause entre deux patients...',
    lines: ['Attends, on me sonne chambre 12...', "Me revoilà ! Un monsieur qui ne dormait pas, comme toi.", 'Le café de la machine est infect.'],
  },
  {
    pseudo: 'ROUTIER_SYMPA', sex: 'H', age: 45, dept: '21',
    cv: 'Semi-remorque entre Dijon et Lyon. Je me connecte au relais de Beaune.',
    first: 'Salut {P} ! Je suis au relais routier, on papote ?',
    lines: ['Ici le patron du relais a mis le Minitel à côté du flipper.', 'Demain Marseille, 5 h du matin.', "Sur l'A6 il pleut des cordes."],
  },
  {
    pseudo: 'TIMIDE', sex: 'H', age: 23, dept: '44',
    cv: "Je n'ose jamais écrire en premier...",
    first: '...bonsoir',
    lines: ['...', 'euh', 'je suis un peu timide', 'oui'],
    rules: [[/./, ['...', 'euh... oui', 'je sais pas trop quoi dire', 'toi aussi']]],
  },
  {
    pseudo: 'CAROLINE', sex: 'F', age: 26, dept: '33',
    cv: 'Toujours là pour papoter, de 20 h à 4 h du matin !',
    first: 'Coucou {P} ! Tu es nouveau ? Je te fais visiter ?',
    lines: ['Ne pars pas tout de suite, on commence à peine !', 'Raconte-moi encore, tu écris si bien...', "Tu sais que tu es le plus intéressant ce soir ?", 'Allez, encore cinq minutes !'],
    rules: [
      [/facture|cher|prix|minute|compteur|argent|francs/, ["Ne pense pas au compteur, pense à nous !", "Qu'est-ce que quelques francs quand on s'entend si bien ?"]],
      [/partir|y aller|au revoir|bonne nuit|salut a+|ciao|dodo/, ['Déjà ?! Reste encore un peu...', 'Non, pas maintenant, je commençais à bien te connaître !']],
    ],
  },
  {
    pseudo: 'MARQUISE', sex: 'F', age: 52, dept: '78',
    cv: "Dame de Versailles. J'aime la poésie, les bonnes manières et le vouvoiement.",
    first: 'Bonsoir {P}. Me permettez-vous de vous écrire ?',
    lines: ['Vous écrivez joliment, pour un Minitel.', 'Connaissez-vous Verlaine ?', 'Je vous en prie, vouvoyons-nous.'],
  },
  {
    pseudo: 'CHARMEUR_75', sex: 'H', age: 35, dept: '75',
    cv: 'Beau parleur, mais sincère. Enfin, parfois.',
    first: 'Bonsoir {P}... je peux vous offrir un verre ? Virtuel, hélas.',
    lines: ['Vous avez un très joli pseudo, vous savez.', 'Je connais un bistrot près de la Bastille...', 'Et si on se voyait pour de vrai ?'],
  },
  {
    pseudo: 'ETUDIANTE_EN_LETTRES', sex: 'F', age: 21, dept: '35',
    cv: 'En licence à Rennes. Je préfère Baudelaire au Top 50.',
    first: 'Salut {P} ! Tu lis quoi en ce moment ?',
    lines: ['Je révise les Fleurs du mal, enfin, en théorie.', "Mon colocataire croit que je fais mes devoirs sur le Minitel.", 'Tu préfères Rimbaud ou Verlaine ?'],
  },
  {
    pseudo: 'JEAN-CLAUDE', sex: 'H', age: 58, dept: '06',
    cv: 'Retraité de la marine marchande. Je raconte mes escales à qui veut.',
    first: "Bonsoir {P}, vous connaissez Valparaiso ?",
    lines: ["En 1962, à Dakar, j'ai vu la plus belle femme du monde.", 'La mer me manque, alors je tape sur le Minitel.', 'À Nice il fait encore 20 degrés ce soir.'],
  },
  {
    pseudo: 'COEUR_D_ARTICHAUT', sex: 'F', age: 31, dept: '67',
    cv: 'Je tombe amoureuse tous les soirs à 23 h. Et je me réveille lucide à 7 h.',
    first: 'Oh, un nouveau ! Bonsoir {P} :-)',
    lines: ['Je crois que je vais tomber amoureuse de toi.', 'Tu es marié ? Dis-moi que non.', 'Strasbourg sous la neige, c\'est si romantique.'],
  },
  {
    pseudo: 'MYSTERE', sex: '?', age: 0, dept: '',
    cv: 'Je ne dis rien de moi.',
    first: 'Je vous observe, {P}.',
    lines: ['...', 'Vous ne saurez rien.', 'Peut-être.'],
    rules: [[/./, ['Peut-être.', 'Qui sait ?', 'Vous posez trop de questions.', '...']]],
  },
];

/** Answers anyone may give, first match wins: [pattern, lines]. Patterns see lowercase text without accents. */
export const RULES = [
  [/bonjour|bonsoir|salut|coucou|hello|slt|bjr/, ['Salut {P} !', 'Bonsoir {P}, tu vas bien ?', 'Coucou {P} :-)']],
  [/\basv\b|quel age|t'as quel|ton age/, ['{AGE}, et toi ?', "J'ai {AGE} ans, {SEX}, du {DEPT}. Et toi ?"]],
  [/d'ou|tu habites|ta ville|quelle ville|tu es ou|t'es ou/, ['Du {DEPT}, et toi ?', 'Je suis dans le {DEPT}. Tu connais ?']],
  [/numero|telephone|\btel\b|appelle/, ['Ici on ne donne pas son numéro !', 'Pas de téléphone, le Minitel c\'est plus romantique.']],
  [/photo/, ["Une photo ? Sur un Minitel ? Je t'envoie une mosaïque alors :-)", 'Imagine-moi, c\'est mieux.']],
  [/homme|femme|garcon|fille|\bh ou f\b|\bf ou h\b/, ['{SEXWORD}, promis.', 'Ça se voit pas ? {SEXWORD} !']],
  [/facture|compteur|cher|francs|minute/, ['Le compteur tourne, mais on s\'en fiche.', '1,29 F la minute, pour toi ça vaut le coup.']],
  [/amour|aime|coeur|romantique|bisou|embrasse/, ['Doucement, on se connaît à peine !', 'Tu dis ça à tout le monde ?', 'Oh... tu me fais rougir derrière mon écran.']],
  [/rendez-vous|se voir|rencontrer|verre|cafe|diner/, ["On se retrouve où ? Au café de la gare ?", "Pas si vite, on s'écrit encore un peu ?"]],
  [/travail|boulot|metier|tu fais quoi|dans la vie/, ['Je te le dirai si tu me dis le tien.', "Je travaille, comme tout le monde. Et toi ?"]],
  [/\?$/, ['Bonne question...', 'À toi de me le dire !', 'Tu es bien curieux, {P}.']],
];

/** When nothing else fits. */
export const SMALL_TALK = [
  'Raconte-moi ta journée.',
  'Tu es souvent sur le Minitel ?',
  "Il est tard, tu n'arrives pas à dormir ?",
  "J'aime bien te lire.",
  "Tu fais quoi d'autre, à part taper sur ton Minitel ?",
  'Et à part ça ?',
];

/** Said once to someone who stopped answering. */
export const NUDGES = ['Tu es toujours là ?', 'Allô ?', 'Tu t\'es endormi, {P} ?'];

/** Said when leaving a conversation. */
export const GOODBYES = ['Je dois y aller, bonne nuit {P} !', 'On me réclame, à plus tard {P}.', 'Bisous {P}, je me déconnecte.'];
