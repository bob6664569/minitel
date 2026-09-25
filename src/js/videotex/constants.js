/**
 * Videotex (Minitel / STUM1B) protocol constants.
 */

/* C0 control set */
export const NUL = 0x00;
export const SOH = 0x01;
export const EOT = 0x04;
export const ENQ = 0x05;
export const BEL = 0x07;
export const BS = 0x08;
export const HT = 0x09;
export const LF = 0x0a;
export const VT = 0x0b;
export const FF = 0x0c;
export const CR = 0x0d;
export const SO = 0x0e;
export const SI = 0x0f;
export const DLE = 0x10;
export const CON = 0x11;
export const REP = 0x12;
export const SEP = 0x13;
export const COFF = 0x14;
export const NAK = 0x15;
export const SYN = 0x16;
export const CAN = 0x18;
export const SS2 = 0x19;
export const SUB = 0x1a;
export const ESC = 0x1b;
export const SS3 = 0x1d;
export const RS = 0x1e;
export const US = 0x1f;
export const SP = 0x20;
export const DEL = 0x7f;

/* Protocol sequences (ESC + PRO1/PRO2/PRO3) */
export const PRO1 = 0x39;
export const PRO2 = 0x3a;
export const PRO3 = 0x3b;
export const CSI = 0x5b;

/** Colour order used by the attribute codes (ESC 0x40+n / ESC 0x50+n). */
export const COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
export const COLOR_INDEX = Object.freeze(Object.fromEntries(COLORS.map((name, i) => [name, i])));

/**
 * Luminance of each colour on monochrome Minitels (STUM1B):
 * black 0 %, blue 40 %, red 50 %, magenta 60 %, green 70 %, cyan 80 %, yellow 90 %, white 100 %.
 */
export const GREY_LEVELS = Object.freeze([0, 0.5, 0.7, 0.9, 0.4, 0.6, 0.8, 1]);

/** Colours sorted from darkest to lightest on a monochrome screen. */
export const GREY_ORDER = Object.freeze(['black', 'blue', 'red', 'magenta', 'green', 'cyan', 'yellow', 'white']);

/* Attribute codes, sent after ESC */
export const ATTR = Object.freeze({
  FG: 0x40,
  FLASH: 0x48,
  STEADY: 0x49,
  NORMAL_SIZE: 0x4c,
  DOUBLE_HEIGHT: 0x4d,
  DOUBLE_WIDTH: 0x4e,
  DOUBLE_SIZE: 0x4f,
  BG: 0x50,
  CONCEAL: 0x58,
  UNDERLINE_OFF: 0x59,
  UNDERLINE_ON: 0x5a,
  INVERT_OFF: 0x5c,
  INVERT_ON: 0x5d,
  TRANSPARENT: 0x5e,
  REVEAL: 0x5f,
});

/** Function keys: the keyboard sends SEP followed by one of these bytes. */
export const KEYS = Object.freeze({
  ENVOI: 0x41,
  RETOUR: 0x42,
  REPETITION: 0x43,
  GUIDE: 0x44,
  ANNULATION: 0x45,
  SOMMAIRE: 0x46,
  CORRECTION: 0x47,
  SUITE: 0x48,
  CONNEXION_FIN: 0x49,
});
export const KEY_NAMES = Object.freeze(Object.fromEntries(Object.entries(KEYS).map(([name, code]) => [code, name])));

/** Human labels of the function keys, as printed on the keyboard. */
export const KEY_LABELS = Object.freeze({
  ENVOI: 'Envoi',
  RETOUR: 'Retour',
  REPETITION: 'Répétition',
  GUIDE: 'Guide',
  ANNULATION: 'Annulation',
  SOMMAIRE: 'Sommaire',
  CORRECTION: 'Correction',
  SUITE: 'Suite',
  CONNEXION_FIN: 'Connexion Fin',
});

/* PRO2 / PRO3 parameters */
export const PRO_START = 0x69;
export const PRO_STOP = 0x6a;
export const MODE_ROULEAU = 0x43;
export const MODE_PROCEDURE = 0x44;
export const MODE_MINUSCULES = 0x45;
export const ENQROM = 0x7b;
export const PRO1_RESET = 0x7f;
export const AIGUILLAGE_OFF = 0x60;
export const AIGUILLAGE_ON = 0x61;
export const RECEIVER_SCREEN = 0x58;
export const EMITTER_KEYBOARD = 0x51;

/** G2 diacritics (after SS2), combined with the following letter. */
export const G2_ACCENTS = Object.freeze({
  0x41: '̀', // grave
  0x42: '́', // acute
  0x43: '̂', // circumflex
  0x48: '̈', // diaeresis
  0x4b: '̧', // cedilla
});

/** G2 stand-alone characters (after SS2). */
export const G2_CHARS = Object.freeze({
  0x23: '£',
  0x24: '$',
  0x26: '#',
  0x27: '§',
  0x2c: '←',
  0x2d: '↑',
  0x2e: '→',
  0x2f: '↓',
  0x30: '°',
  0x31: '±',
  0x38: '÷',
  0x3c: '¼',
  0x3d: '½',
  0x3e: '¾',
  0x6a: 'Œ',
  0x7a: 'œ',
  0x7b: 'ß',
});

/** Screen geometry of the Minitel in Videotex mode. */
export const COLS = 40;
export const ROWS = 24; // rows 1..24, plus the status row 0
