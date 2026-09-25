#!/usr/bin/env node
/**
 * Builds the Minitel web fonts from the bitmap glyphs in src/js/font/glyphs.js.
 *
 * Zero dependencies: a minimal TrueType writer (glyf outlines traced from the
 * pixel grid) and a WOFF2 wrapper using Node's built-in Brotli encoder.
 *
 * Output (src/fonts/):
 *   minitel.{ttf,woff2}            normal cell, 8x10 pixels
 *   minitel-wide.{ttf,woff2}       double width (font-stretch: 200%)
 *   minitel-tall.{ttf,woff2}       double height, used at font-size: 2em (font-stretch: 50%)
 *   minitel-separated.{ttf,woff2}  disjoint mosaics only (Videotex "mosaïque disjointe")
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import {
  glyphMap, sextantRows, sextantChar, NOTDEF, CELL_WIDTH, CELL_HEIGHT, ASCENT, DESCENT,
} from '../src/js/font/glyphs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/fonts');
const UNITS_PER_EM = 1000;
const ROW_UNITS = UNITS_PER_EM / CELL_HEIGHT; // 100 units per pixel row
const VERSION = '1.000';
// Fixed timestamp keeps builds reproducible (seconds since 1904-01-01).
const TIMESTAMP = Math.floor(Date.UTC(2026, 8, 25) / 1000) + 2082844800;

/* ------------------------------------------------------------------------ */
/* Binary helpers                                                            */
/* ------------------------------------------------------------------------ */

class Bytes {
  constructor() { this.data = []; }
  get length() { return this.data.length; }
  u8(v) { this.data.push(v & 0xff); return this; }
  u16(v) { return this.u8(v >> 8).u8(v); }
  i16(v) { return this.u16(v & 0xffff); }
  u32(v) { return this.u16(v >>> 16).u16(v & 0xffff); }
  i32(v) { return this.u32(v >>> 0); }
  u64(v) { return this.u32(Math.floor(v / 2 ** 32)).u32(v % 2 ** 32); }
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  raw(arr) { for (const b of arr) this.u8(b); return this; }
  pad4() { while (this.data.length % 4) this.u8(0); return this; }
  toBuffer() { return Buffer.from(this.data); }
}

function checksum(buf) {
  let sum = 0;
  const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/* ------------------------------------------------------------------------ */
/* Outline tracing                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Trace the boundary of lit pixels into closed contours (font units, y up).
 * Outer contours come out clockwise and holes counter-clockwise, which is
 * the TrueType convention.
 */
function traceContours(rows, pixelWidth, pixelHeight) {
  const on = (x, y) => x >= 0 && x < CELL_WIDTH && y >= 0 && y < CELL_HEIGHT && (rows[y] & (0x80 >> x)) !== 0;
  const edges = new Map(); // "x,y" -> [{from, to, used}]
  const addEdge = (x1, y1, x2, y2) => {
    const key = `${x1},${y1}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ x1, y1, x2, y2, used: false });
  };
  for (let y = 0; y < CELL_HEIGHT; y++) {
    for (let x = 0; x < CELL_WIDTH; x++) {
      if (!on(x, y)) continue;
      // Grid coordinates in pixels, y up, baseline at 0.
      const top = ASCENT - y;
      const bottom = top - 1;
      if (!on(x - 1, y)) addEdge(x, bottom, x, top);
      if (!on(x, y - 1)) addEdge(x, top, x + 1, top);
      if (!on(x + 1, y)) addEdge(x + 1, top, x + 1, bottom);
      if (!on(x, y + 1)) addEdge(x + 1, bottom, x, bottom);
    }
  }

  const contours = [];
  for (const list of edges.values()) {
    for (const start of list) {
      if (start.used) continue;
      const points = [];
      let edge = start;
      for (;;) {
        edge.used = true;
        points.push([edge.x1, edge.y1]);
        if (edge.x2 === start.x1 && edge.y2 === start.y1) break;
        const dx = Math.sign(edge.x2 - edge.x1);
        const dy = Math.sign(edge.y2 - edge.y1);
        const candidates = (edges.get(`${edge.x2},${edge.y2}`) || []).filter((e) => !e.used);
        if (!candidates.length) throw new Error('Open contour while tracing glyph outline');
        // Diagonal touch: take the right-most turn so each region closes on itself.
        const right = [dy, -dx];
        edge = candidates.find((e) => Math.sign(e.x2 - e.x1) === right[0] && Math.sign(e.y2 - e.y1) === right[1])
          || candidates[0];
      }
      // Drop collinear vertices.
      const simplified = points.filter((p, i) => {
        const prev = points[(i - 1 + points.length) % points.length];
        const next = points[(i + 1) % points.length];
        return (p[0] - prev[0]) * (next[1] - p[1]) !== (p[1] - prev[1]) * (next[0] - p[0]);
      });
      contours.push(simplified.map(([x, y]) => [x * pixelWidth, y * pixelHeight]));
    }
  }
  return contours;
}

/* ------------------------------------------------------------------------ */
/* TrueType tables                                                           */
/* ------------------------------------------------------------------------ */

function buildGlyph(contours) {
  if (!contours.length) return { data: Buffer.alloc(0), bbox: null, points: 0 };
  const all = contours.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const b = new Bytes();
  b.i16(contours.length).i16(bbox[0]).i16(bbox[1]).i16(bbox[2]).i16(bbox[3]);
  let end = -1;
  for (const c of contours) { end += c.length; b.u16(end); }
  b.u16(0); // no instructions
  for (let i = 0; i < all.length; i++) b.u8(0x01); // on-curve, long coordinates
  let px = 0;
  for (const [x] of all) { b.i16(x - px); px = x; }
  let py = 0;
  for (const [, y] of all) { b.i16(y - py); py = y; }
  b.pad4();
  return { data: b.toBuffer(), bbox, points: all.length, contours: contours.length };
}

function buildCmap(codepoints) {
  // codepoints: sorted [cp, gid] pairs with consecutive gids for consecutive cps.
  const runs = [];
  for (const [cp, gid] of codepoints) {
    const last = runs[runs.length - 1];
    if (last && cp === last.end + 1 && gid === last.gid + (cp - last.start)) last.end = cp;
    else runs.push({ start: cp, end: cp, gid });
  }
  const bmp = runs.filter((r) => r.end <= 0xffff);

  // Format 4 (BMP).
  const segs = [...bmp.map((r) => ({ start: r.start, end: r.end, delta: (r.gid - r.start) & 0xffff })),
    { start: 0xffff, end: 0xffff, delta: 1 }];
  const segCount = segs.length;
  const pow = 2 ** Math.floor(Math.log2(segCount));
  const f4 = new Bytes();
  f4.u16(4).u16(16 + segCount * 8).u16(0);
  f4.u16(segCount * 2).u16(pow * 2).u16(Math.log2(pow)).u16(segCount * 2 - pow * 2);
  segs.forEach((s) => f4.u16(s.end));
  f4.u16(0);
  segs.forEach((s) => f4.u16(s.start));
  segs.forEach((s) => f4.u16(s.delta));
  segs.forEach(() => f4.u16(0));

  // Format 12 (full Unicode).
  const f12 = new Bytes();
  f12.u16(12).u16(0).u32(16 + runs.length * 12).u32(0).u32(runs.length);
  runs.forEach((r) => f12.u32(r.start).u32(r.end).u32(r.gid));

  const cmap = new Bytes();
  const headerSize = 4 + 2 * 8;
  cmap.u16(0).u16(2);
  cmap.u16(3).u16(1).u32(headerSize);
  cmap.u16(3).u16(10).u32(headerSize + f4.length);
  cmap.raw(f4.data).raw(f12.data);
  return cmap.toBuffer();
}

function buildName(family, style, psName) {
  const records = [
    [1, family], [2, style], [3, `${psName};${VERSION}`], [4, style === 'Regular' ? family : `${family} ${style}`],
    [5, `Version ${VERSION}`], [6, psName],
    [10, 'Videotex 8x10 bitmap font from the minitel design system.'],
  ];
  const strings = records.map(([id, text]) => {
    const buf = Buffer.alloc(text.length * 2);
    for (let i = 0; i < text.length; i++) buf.writeUInt16BE(text.charCodeAt(i), i * 2);
    return { id, buf };
  });
  const b = new Bytes();
  b.u16(0).u16(strings.length).u16(6 + strings.length * 12);
  let offset = 0;
  for (const { id, buf } of strings) {
    b.u16(3).u16(1).u16(0x409).u16(id).u16(buf.length).u16(offset);
    offset += buf.length;
  }
  for (const { buf } of strings) b.raw(buf);
  return b.toBuffer();
}

function buildFont({ family, psName, advance, pixelWidth, glyphs: entries, widthClass = 5 }) {
  // gid 0 is .notdef; the rest are sorted by codepoint so cmap runs stay contiguous.
  const sorted = [...entries].sort((a, b) => a[0] - b[0]);
  const list = [{ cp: null, rows: NOTDEF }, ...sorted.map(([cp, rows]) => ({ cp, rows }))];
  const glyphs = list.map(({ rows }) => buildGlyph(traceContours(rows, pixelWidth, ROW_UNITS)));

  // glyf + loca (long offsets).
  const glyf = Buffer.concat(glyphs.map((g) => g.data));
  const loca = new Bytes();
  let offset = 0;
  for (const g of glyphs) { loca.u32(offset); offset += g.data.length; }
  loca.u32(offset);

  const boxes = glyphs.map((g) => g.bbox).filter(Boolean);
  const bbox = [
    Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
  ];
  const ascender = ASCENT * ROW_UNITS;
  const descender = -DESCENT * ROW_UNITS;

  const head = new Bytes();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5);
  head.u16(0b1011).u16(UNITS_PER_EM).u64(TIMESTAMP).u64(TIMESTAMP);
  head.i16(bbox[0]).i16(bbox[1]).i16(bbox[2]).i16(bbox[3]);
  head.u16(0).u16(8).i16(2).i16(1).i16(0);

  const lsbs = glyphs.map((g) => (g.bbox ? g.bbox[0] : 0));
  const hhea = new Bytes();
  hhea.u32(0x00010000).i16(ascender).i16(descender).i16(0).u16(advance);
  hhea.i16(Math.min(...boxes.map((b) => b[0])));
  hhea.i16(Math.min(...boxes.map((b) => advance - b[2])));
  hhea.i16(Math.max(...boxes.map((b) => b[2])));
  hhea.i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length);

  const hmtx = new Bytes();
  lsbs.forEach((lsb) => hmtx.u16(advance).i16(lsb));

  const maxp = new Bytes();
  maxp.u32(0x00010000).u16(glyphs.length);
  maxp.u16(Math.max(...glyphs.map((g) => g.points))).u16(Math.max(...glyphs.map((g) => g.contours || 0)));
  maxp.u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  const cps = sorted.map(([cp]) => cp);
  const os2 = new Bytes();
  os2.u16(4).i16(advance).u16(400).u16(widthClass).u16(0);
  os2.i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350);
  os2.i16(ROW_UNITS).i16(3 * ROW_UNITS).i16(0);
  os2.raw([2, 0, 5, 9, 0, 0, 0, 0, 0, 0]); // PANOSE: Latin text, monospaced
  os2.u32(0x80000007).u32(0x0200f022).u32(0).u32(0); // unicode ranges (latin, punctuation, arrows, blocks...)
  os2.tag('MNTL').u16(0x00c0);
  os2.u16(Math.min(...cps)).u16(Math.min(Math.max(...cps), 0xffff));
  os2.i16(ascender).i16(descender).i16(0).u16(ascender).u16(-descender);
  os2.u32(1).u32(0);
  os2.i16(5 * ROW_UNITS).i16(7 * ROW_UNITS).u16(0).u16(32).u16(0);

  const post = new Bytes();
  post.u32(0x00030000).u32(0).i16(-ROW_UNITS).i16(ROW_UNITS).u32(1).u32(0).u32(0).u32(0).u32(0);

  const cmap = buildCmap(sorted.map(([cp], i) => [cp, i + 1]));
  const name = buildName(family, 'Regular', psName);

  const tables = {
    'OS/2': os2.toBuffer(), cmap, glyf, head: head.toBuffer(), hhea: hhea.toBuffer(),
    hmtx: hmtx.toBuffer(), loca: loca.toBuffer(), maxp: maxp.toBuffer(), name, post: post.toBuffer(),
  };
  return assembleSfnt(tables);
}

function assembleSfnt(tables) {
  const tags = Object.keys(tables).sort();
  const numTables = tags.length;
  const pow = 2 ** Math.floor(Math.log2(numTables));
  const header = new Bytes();
  header.u32(0x00010000).u16(numTables).u16(pow * 16).u16(Math.log2(pow)).u16(numTables * 16 - pow * 16);
  let offset = 12 + numTables * 16;
  const records = [];
  for (const tag of tags) {
    const data = tables[tag];
    records.push({ tag, checksum: checksum(data), offset, length: data.length });
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const r of records) header.tag(r.tag).u32(r.checksum).u32(r.offset).u32(r.length);
  const body = tags.map((tag) => {
    const data = tables[tag];
    return Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
  });
  const font = Buffer.concat([header.toBuffer(), ...body]);
  // head.checkSumAdjustment
  const headOffset = records.find((r) => r.tag === 'head').offset;
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8);
  // Slice tables back out of the final file so WOFF2 carries the adjusted head.
  return { font, tables: records.map((r) => ({ tag: r.tag, data: font.subarray(r.offset, r.offset + r.length) })) };
}

/* ------------------------------------------------------------------------ */
/* WOFF2 (null transforms, Brotli)                                           */
/* ------------------------------------------------------------------------ */

const WOFF2_KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];

function base128(n) {
  const out = [];
  do { out.unshift(n & 0x7f); n = Math.floor(n / 128); } while (n > 0);
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}

function toWoff2({ font, tables }) {
  const directory = new Bytes();
  for (const { tag, data } of tables) {
    const index = WOFF2_KNOWN_TAGS.indexOf(tag);
    // glyf/loca: transform version 3 is the null transform; others use version 0.
    const version = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    directory.u8((index < 0 ? 63 : index) | (version << 6));
    if (index < 0) directory.tag(tag);
    directory.raw(base128(data.length));
  }
  const stream = Buffer.concat(tables.map((t) => t.data));
  const compressed = brotliCompressSync(stream, {
    params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_FONT, [zlib.BROTLI_PARAM_SIZE_HINT]: stream.length },
  });
  const headerSize = 48;
  const unpadded = headerSize + directory.length + compressed.length;
  const total = Math.ceil(unpadded / 4) * 4;
  const header = new Bytes();
  header.tag('wOF2').u32(0x00010000).u32(total).u16(tables.length).u16(0);
  header.u32(font.length).u32(compressed.length).u16(1).u16(0);
  header.u32(0).u32(0).u32(0).u32(0).u32(0);
  return Buffer.concat([header.toBuffer(), directory.toBuffer(), compressed, Buffer.alloc(total - unpadded)]);
}

/* ------------------------------------------------------------------------ */
/* Variants                                                                  */
/* ------------------------------------------------------------------------ */

const normalGlyphs = [...glyphMap.entries()].map(([ch, rows]) => [ch.codePointAt(0), rows]);
const mosaicCodepoints = [];
for (let bits = 1; bits < 64; bits++) mosaicCodepoints.push([sextantChar(bits).codePointAt(0), sextantRows(bits, true)]);
mosaicCodepoints.push([0x20, new Uint8Array(CELL_HEIGHT)], [0xa0, new Uint8Array(CELL_HEIGHT)]);

const PIXEL = UNITS_PER_EM / CELL_HEIGHT;
const variants = [
  { file: 'minitel', family: 'Minitel', psName: 'Minitel-Regular', advance: CELL_WIDTH * PIXEL, pixelWidth: PIXEL, glyphs: normalGlyphs },
  { file: 'minitel-wide', family: 'Minitel Wide', psName: 'MinitelWide-Regular', advance: CELL_WIDTH * PIXEL * 2, pixelWidth: PIXEL * 2, glyphs: normalGlyphs, widthClass: 9 },
  { file: 'minitel-tall', family: 'Minitel Tall', psName: 'MinitelTall-Regular', advance: (CELL_WIDTH * PIXEL) / 2, pixelWidth: PIXEL / 2, glyphs: normalGlyphs, widthClass: 1 },
  { file: 'minitel-separated', family: 'Minitel Separated', psName: 'MinitelSeparated-Regular', advance: CELL_WIDTH * PIXEL, pixelWidth: PIXEL, glyphs: mosaicCodepoints },
];

mkdirSync(OUT, { recursive: true });
for (const v of variants) {
  const sfnt = buildFont(v);
  const woff2 = toWoff2(sfnt);
  writeFileSync(join(OUT, `${v.file}.ttf`), sfnt.font);
  writeFileSync(join(OUT, `${v.file}.woff2`), woff2);
  console.log(`${v.file}: ${v.glyphs.length + 1} glyphs, ttf ${sfnt.font.length} B, woff2 ${woff2.length} B`);
}
