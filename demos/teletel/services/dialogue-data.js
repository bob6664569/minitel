/**
 * 3615 DIALOGUE — the cast: fictional regulars of the four rooms, what they
 * talk about (anno 1990) and how they answer. Everything here is invented.
 *
 * In lines, {P} stands for the pseudonym of the person talking to them.
 */

/** Rooms: key, title, blurb, topic of the day. */
export const ROOMS = [
  {
    key: 'general', name: 'Salon général', short: 'GENERAL',
    blurb: 'On parle de tout, sans se prendre la tête', topic: 'Présentez-vous !',
  },
  {
    key: 'cinema', name: 'Cinéma', short: 'CINEMA',
    blurb: 'Les films de 1990 et les cassettes VHS', topic: 'Cyrano ou Retour vers le futur 3 ?',
  },
  {
    key: 'info', name: 'Informatique', short: 'INFORMATIQUE',
    blurb: 'Micros, jeux vidéo et bidouille en BASIC', topic: 'Atari ST contre Amiga',
  },
  {
    key: 'voyages', name: 'Voyages', short: 'VOYAGES',
    blurb: 'Idées de vacances, trains et cartes postales', topic: 'Où partez-vous cet été ?',
  },
];

/**
 * Regulars. `face` picks the avatar colours: hair, skin, shirt, backdrop.
 */
export const REGULARS = [
  {
    pseudo: 'CINEPHILE75', rooms: ['cinema', 'general'],
    city: 'Paris 11e', age: 34, machine: 'Minitel 1B', likes: 'cinéma, VHS, pop-corn',
    motto: 'Moteur... action !', face: { hair: 'black', skin: 'white', shirt: 'red', back: 'blue' },
  },
  {
    pseudo: 'MARIE_LYON', rooms: ['general', 'cinema', 'voyages'],
    city: 'Lyon', age: 28, machine: 'Minitel 1B', likes: 'cuisine, randonnée',
    motto: 'Un bon bouchon et ça repart !', face: { hair: 'red', skin: 'white', shirt: 'green', back: 'cyan' },
  },
  {
    pseudo: 'GEEK_3615', rooms: ['info', 'general'],
    city: 'Toulouse', age: 19, machine: 'Amstrad CPC 6128', likes: 'BASIC, jeux vidéo',
    motto: '10 PRINT "SALUT" : GOTO 10', face: { hair: 'black', skin: 'yellow', shirt: 'blue', back: 'green' },
  },
  {
    pseudo: 'BRETON29', rooms: ['voyages', 'general'],
    city: 'Brest', age: 45, machine: 'Minitel 1', likes: 'voile, crêpes, pluie',
    motto: 'Ici il fait beau plusieurs fois par jour', face: { hair: 'yellow', skin: 'white', shirt: 'blue', back: 'cyan' },
  },
  {
    pseudo: 'SOLEIL13', rooms: ['general', 'voyages'],
    city: 'Marseille', age: 31, machine: 'Minitel 1B', likes: 'pétanque, football',
    motto: 'Le soleil, ça se partage !', face: { hair: 'black', skin: 'yellow', shirt: 'white', back: 'red' },
  },
  {
    pseudo: 'MAMIE_ROSE', rooms: ['general', 'cinema'],
    city: 'Limoges', age: 72, machine: 'Minitel 1B', likes: 'tricot, mots croisés',
    motto: "Mon petit-fils m'a tout appris", face: { hair: 'white', skin: 'yellow', shirt: 'magenta', back: 'blue' },
  },
  {
    pseudo: 'AMIGA_FAN', rooms: ['info'],
    city: 'Lille', age: 23, machine: 'Amiga 500', likes: 'démos, musique MOD',
    motto: '4096 couleurs, qui dit mieux ?', face: { hair: 'yellow', skin: 'white', shirt: 'red', back: 'magenta' },
  },
  {
    pseudo: 'ROUTARD', rooms: ['voyages'],
    city: 'Grenoble', age: 27, machine: 'Minitel 1B', likes: 'Interrail, montagne',
    motto: 'Le monde est un livre', face: { hair: 'red', skin: 'yellow', shirt: 'green', back: 'blue' },
  },
  {
    pseudo: 'TONTON_JO', rooms: ['general'],
    city: 'Nantes', age: 52, machine: 'Minitel 1', likes: 'blagues, pêche à la ligne',
    motto: 'Une blague par jour !', face: { hair: 'white', skin: 'yellow', shirt: 'blue', back: 'green' },
  },
  {
    pseudo: 'ZAZOU', rooms: ['general', 'cinema'],
    city: 'Bordeaux', age: 16, machine: 'Minitel 1B', likes: 'Walkman, rollers, Top 50',
    motto: 'Monte le son !', face: { hair: 'magenta', skin: 'yellow', shirt: 'cyan', back: 'red' },
  },
  {
    pseudo: 'PROF_MATHS', rooms: ['info'],
    city: 'Strasbourg', age: 41, machine: 'Thomson TO8', likes: 'échecs, Turbo Pascal',
    motto: 'Tout est logique !', face: { hair: 'black', skin: 'white', shirt: 'yellow', back: 'blue' },
  },
  {
    pseudo: 'VALISE_BLEUE', rooms: ['voyages'],
    city: 'Nice', age: 29, machine: 'Minitel 1B', likes: 'langues, cartes postales',
    motto: 'Toujours une valise prête', face: { hair: 'yellow', skin: 'white', shirt: 'blue', back: 'magenta' },
  },
];

/** Things regulars say out of the blue, by room. [pseudo, text] */
export const CHATTER = {
  general: [
    ['BRETON29', 'Quel temps chez vous ? Ici il pleut des cordes'],
    ['SOLEIL13', 'Grand soleil sur Marseille, 24 degrés !'],
    ['MAMIE_ROSE', "Mon petit-fils m'a branché le Minitel, c'est formidable"],
    ['TONTON_JO', 'Attention à la facture : le 3615, ça chiffre vite ;-)'],
    ['ZAZOU', 'Qui a écouté le Top 50 hier soir ?'],
    ['ZAZOU', "J'ai eu un Walkman autoreverse, le grand luxe !"],
    ['GEEK_3615', 'Quelqu\'un joue à Tetris sur Game Boy ?'],
    ['ZAZOU', 'Ma soeur râle, je bloque la ligne du téléphone :-)'],
    ['SOLEIL13', "Vivement la Coupe du monde en Italie cet été !"],
    ['MARIE_LYON', 'Bonne soirée à tous les minitellistes !'],
    ['MAMIE_ROSE', 'Je tricote une écharpe en regardant la télé'],
    ['TONTON_JO', "Mon record au 3615 : 10 minutes sans une faute de frappe"],
    ['CINEPHILE75', 'Ce soir, film à la télé et crêpes. Le bonheur'],
    ['BRETON29', 'Kenavo, je reviens, je vais chercher le pain'],
  ],
  cinema: [
    ['CINEPHILE75', 'Cyrano de Bergerac : quel panache, Depardieu !'],
    ['ZAZOU', 'Retour vers le futur 3 sort cet été, trop hâte'],
    ['MARIE_LYON', "J'ai vu Le Grand Bleu six fois, je plonge encore"],
    ['CINEPHILE75', 'La Gloire de mon père : on sent la garrigue'],
    ['MAMIE_ROSE', 'Les films de Pagnol, comme au bon vieux temps'],
    ['ZAZOU', 'Les Tortues Ninja au cinéma, mon frère est fan'],
    ['CINEPHILE75', 'Chérie, j\'ai rétréci les gosses : trop drôle'],
    ['MARIE_LYON', 'Le Cercle des poètes disparus m\'a fait pleurer'],
    ['CINEPHILE75', 'Ce soir je loue une cassette au vidéoclub'],
    ['ZAZOU', "L'hoverboard de Marty, j'en veux un !"],
    ['MAMIE_ROSE', 'Au cinéma de mon quartier, la séance est à 5 F le lundi'],
    ['CINEPHILE75', 'Batman et Jack Nicholson : quel méchant génial'],
  ],
  info: [
    ['GEEK_3615', 'Mon Amstrad CPC 6128 fait des merveilles en BASIC'],
    ['AMIGA_FAN', "L'Amiga 500 : 4096 couleurs, qui dit mieux ?"],
    ['PROF_MATHS', 'Turbo Pascal 5.5, un régal pour mes élèves'],
    ['GEEK_3615', "J'ai fini Prince of Persia en moins d'une heure !"],
    ['AMIGA_FAN', 'Une disquette 3 pouces 1/2 : 880 Ko, énorme'],
    ['PROF_MATHS', 'Le Minitel reçoit à 1200 bauds et émet à 75'],
    ['GEEK_3615', 'Ma ville dans SimCity a 10 000 habitants !'],
    ['PROF_MATHS', 'Un 286 à 12 MHz avec 640 Ko, le grand confort'],
    ['AMIGA_FAN', 'Je compose de la musique MOD sur 4 voies'],
    ['GEEK_3615', 'Windows 3.0 vient de sortir, ça vaut le coup ?'],
    ['PROF_MATHS', 'Mes élèves programment une tortue en LOGO'],
  ],
  voyages: [
    ['ROUTARD', 'Pass Interrail en poche : Rome, Vienne, Prague !'],
    ['VALISE_BLEUE', 'Le TGV Atlantique met Nantes à 2 h de Paris'],
    ['BRETON29', 'Venez en Bretagne : il fait beau plusieurs fois par jour'],
    ['SOLEIL13', 'Les calanques de Cassis, un vrai paradis'],
    ['MARIE_LYON', 'Week-end à Annecy, le lac est magnifique'],
    ['ROUTARD', 'Le tunnel sous la Manche avance : Londres en train !'],
    ['VALISE_BLEUE', 'Un aller-retour en Concorde, j\'en rêve...'],
    ['ROUTARD', 'Mon guide de voyage est plein de notes au crayon'],
    ['MARIE_LYON', 'Qui connaît un bon camping en Ardèche ?'],
    ['VALISE_BLEUE', 'La carte postale reste le meilleur des souvenirs'],
  ],
};

/** Little scripted exchanges between regulars, by room. */
export const SCENES = {
  general: [
    [
      ['BRETON29', 'Il pleut encore à Brest, et chez vous ?'],
      ['SOLEIL13', 'Grand ciel bleu à Marseille, 25 degrés !'],
      ['BRETON29', 'Pfff... je déménage :-)'],
    ],
    [
      ['TONTON_JO', 'Pourquoi les plongeurs plongent-ils en arrière ?'],
      ['ZAZOU', 'Je donne ma langue au chat'],
      ['TONTON_JO', 'Sinon ils tombent dans le bateau !'],
      ['MAMIE_ROSE', 'Hi hi hi, elle est bonne'],
    ],
    [
      ['MAMIE_ROSE', 'Comment on fait un smiley déjà ?'],
      ['ZAZOU', 'Deux points, tiret, parenthèse : :-)'],
      ['MAMIE_ROSE', 'Merci ! :-)'],
    ],
  ],
  cinema: [
    [
      ['CINEPHILE75', 'Vous avez vu Cyrano ? Depardieu est immense'],
      ['MAMIE_ROSE', "Oui ! J'ai pleuré à la fin"],
      ['ZAZOU', "Moi j'attends la cassette au vidéoclub"],
    ],
    [
      ['ZAZOU', 'Retour vers le futur 3, on y va ensemble ?'],
      ['CINEPHILE75', 'Doc et Marty au Far West, ça promet'],
      ['MARIE_LYON', 'Je réserve ma place pour la sortie !'],
    ],
  ],
  info: [
    [
      ['GEEK_3615', 'Atari ST ou Amiga, vous choisissez quoi ?'],
      ['AMIGA_FAN', 'Amiga, évidemment !'],
      ['PROF_MATHS', "Et le PC compatible, on l'oublie ?"],
    ],
    [
      ['PROF_MATHS', 'Mon disque dur fait 20 Mo'],
      ['GEEK_3615', '20 Mo ?! Tu ne le rempliras jamais'],
      ['AMIGA_FAN', 'Il faudrait 23 disquettes pour le remplir :-)'],
    ],
  ],
  voyages: [
    [
      ['ROUTARD', 'Qui a déjà fait Interrail ?'],
      ['MARIE_LYON', 'Moi ! Rome, Florence et Venise en 15 jours'],
      ['ROUTARD', 'Génial, je pars en juillet'],
    ],
    [
      ['VALISE_BLEUE', 'Le TGV Atlantique, vous avez testé ?'],
      ['BRETON29', 'Paris-Rennes en 2 h, un miracle !'],
      ['VALISE_BLEUE', "Et bientôt le TGV jusqu'à Brest ?"],
    ],
  ],
};

/**
 * Keyword replies: [regexp, replies]. Messages are lowercased and stripped
 * of accents before matching. Checked in order; the first match wins.
 */
export const REPLIES = [
  [
    /(^|\W)(au revoir|bye|ciao|a plus|a\+|bonne nuit|je vous laisse)(\W|$)/,
    ['Au revoir {P}, à bientôt sur le 3615 !', 'Bye {P} :-)', 'Bonne soirée {P} !'],
  ],
  [
    /(^|\W)(bonjour|salut|coucou|bonsoir|hello|yop|slt|bjr)(\W|$)/,
    ['Salut {P} ! Bienvenue parmi nous', 'Bonjour {P} :-)', 'Coucou {P}, ça va ?', 'Bonsoir {P}, installe-toi !'],
  ],
  [
    /(^|\W)(ca va|la forme|comment vas)/,
    ['Très bien merci {P}, et toi ?', 'Ça roule {P} !', 'La forme ! Il fait beau dans ma tête :-)'],
  ],
  [/(^|\W)merci/, ['De rien {P} !', 'Avec plaisir {P}']],
  [
    /minitel|3615|baud|modem/,
    ["Le Minitel, c'est magique... sauf la facture !", 'Tu as un Minitel 1 ou un 1B, {P} ?', 'Vive le 3615 !'],
  ],
  [
    /film|cine|cyrano|vhs|video|acteur|pagnol|futur/,
    [
      'Oui ! Cyrano, quel panache', "Pas encore {P}, j'attends la cassette",
      "Moi c'est Le Grand Bleu, encore et toujours", 'Bonne idée {P}, je note',
    ],
  ],
  [
    /ordi|amstrad|atari|amiga|(^|\W)pc(\W|$)|basic|pascal|jeu|tetris|disquette/,
    ['Tu programmes en BASIC, {P} ?', 'Amiga pour la vie !', "Moi j'ai un CPC 6128, et toi {P} ?"],
  ],
  [
    /temps|meteo|pluie|pleu|soleil|neige|chaud|froid/,
    ['Ici il fait beau, et chez toi {P} ?', "Il pleut à Brest, comme d'habitude", 'Prends ton parapluie {P} !'],
  ],
  [
    /voyage|vacance|train|tgv|avion|(^|\W)mer(\W|$)|montagne|plage/,
    ['Tu pars où cet été {P} ?', 'La Bretagne, je ne dis que ça !', 'Envoie-nous une carte postale {P}'],
  ],
  [
    /musique|walkman|chanson|top 50|disque|radio|cassette/,
    ["J'écoute le Top 50 sur mon Walkman", 'Tu aimes quelle chanson {P} ?', 'Monte le son {P} !'],
  ],
  [/blague|drole|rire|:-?\)|hihi|haha|mdr/, ['Hi hi hi !', 'Elle est bonne celle-là {P} :-)', 'Mort de rire :-D']],
  [/\?\s*$/, ['Bonne question {P}...', "Je ne sais pas, quelqu'un sait ?", 'Hmm, laisse-moi réfléchir {P}']],
];

/** When nothing matches (only sometimes). */
export const SMALL_TALK = ['Tout à fait d\'accord avec {P}', 'Ah bon {P} ?', 'Intéressant, raconte !', 'C\'est bien vrai ça', ':-)'];

/** When called by name without a keyword. */
export const CALLED = ['Oui {P} ? Tu m\'as appelé ?', 'Présent ! Salut {P}', 'Je suis là {P} :-)'];
