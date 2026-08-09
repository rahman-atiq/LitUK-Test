#!/usr/bin/env node
/**
 * Generates the PWA icon set: a Union Flag roundel on a deep-navy squircle plate,
 * ringed in the app's gold. No dependencies — renders by hand and writes PNGs
 * with the built-in zlib.
 *
 *   node tools/make-icons.mjs
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");

/* ---------- palette ---------- */
const BLUE  = [0x01, 0x21, 0x69];   // Union Flag blue
const RED   = [0xC8, 0x10, 0x2E];   // Union Flag red
const WHITE = [0xFF, 0xFF, 0xFF];
const GOLD  = [0xD4, 0xA9, 0x4E];   // --gold from the app
const PLATE_TOP = [0x1A, 0x1F, 0x2B];
const PLATE_BOT = [0x0A, 0x0C, 0x11];

/* ---------- Union Flag geometry, on a square, coords in [-1,1] ----------
 * Proportions follow the official 6:4:2 counterchange of the saltire and the
 * 2:6:2 fimbriation of St George's cross, scaled to a 1:1 field.
 * The red saltire is offset per-arm so the broad white band sits above the red
 * in the top-left quadrant — i.e. the flag is the right way up.
 */
const Wd = 0.31;        // half-width of the whole diagonal band
const Rd = Wd / 3;      // half-width of the red saltire
const Od = Wd / 3;      // perpendicular offset of the red saltire
const Wc = 1 / 3;       // half-width of the white cross (red + fimbriation)
const Rc = 0.2;         // half-width of the red cross
const SQ2 = Math.SQRT2;

function flagColor(u, v) {
  const s = (v - u) / SQ2;   // signed distance from the "\" diagonal
  const t = (v + u) / SQ2;   // signed distance from the "/" diagonal
  let c = BLUE;
  if (Math.abs(s) < Wd || Math.abs(t) < Wd) c = WHITE;
  const oA = t < 0 ? Od : -Od;
  const oB = s < 0 ? -Od : Od;
  if (Math.abs(s) < Wd && Math.abs(s - oA) < Rd) c = RED;
  if (Math.abs(t) < Wd && Math.abs(t - oB) < Rd) c = RED;
  if (Math.abs(u) < Wc || Math.abs(v) < Wc) c = WHITE;
  if (Math.abs(u) < Rc || Math.abs(v) < Rc) c = RED;
  return c;
}

/* ---------- one supersample ---------- */
const PLATE_N = 4.6;    // squircle exponent
const PLATE_A = 0.995;

function sample(x, y, o, out) {
  // plate coverage
  let alpha = 1;
  if (!o.bleed) {
    const k = Math.pow(Math.abs(x / PLATE_A), PLATE_N) + Math.pow(Math.abs(y / PLATE_A), PLATE_N);
    alpha = k <= 1 ? 1 : 0;
  }
  if (!alpha) { out[3] = 0; return; }

  const r = Math.hypot(x, y) / o.disc;
  let c;
  if (r <= 1) {
    c = flagColor(x / o.disc, y / o.disc);
  } else if (r <= 1 + o.ring) {
    c = GOLD;
  } else {
    const g = (y + 1) / 2;                       // vertical plate gradient
    c = [
      PLATE_TOP[0] + (PLATE_BOT[0] - PLATE_TOP[0]) * g,
      PLATE_TOP[1] + (PLATE_BOT[1] - PLATE_TOP[1]) * g,
      PLATE_TOP[2] + (PLATE_BOT[2] - PLATE_TOP[2]) * g,
    ];
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = 255;
}

/* ---------- render with 4x supersampling ---------- */
function render(size, opts) {
  const o = Object.assign({ disc: 0.70, ring: 0.038, bleed: false }, opts);
  const SS = 4, N = SS * SS;
  const buf = Buffer.alloc(size * size * 4);
  const s = [0, 0, 0, 0];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let aR = 0, aG = 0, aB = 0, aA = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          s[3] = 0;
          sample(x, y, o, s);
          const a = s[3] / 255;
          if (a) { aR += s[0] * a; aG += s[1] * a; aB += s[2] * a; aA += a; }
        }
      }
      const i = (py * size + px) * 4;
      if (aA > 0) {
        buf[i]     = Math.round(aR / aA);
        buf[i + 1] = Math.round(aG / aA);
        buf[i + 2] = Math.round(aB / aA);
        buf[i + 3] = Math.round((aA / N) * 255);
      }
    }
  }
  return buf;
}

/* ---------- minimal PNG writer ---------- */
function png(size, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                                   // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- outputs ---------- */
const targets = [
  ["icon-32.png",           32,  { disc: 0.80, ring: 0.05 }],
  ["icon-192.png",         192,  {}],
  ["icon-512.png",         512,  {}],
  // iOS applies its own mask and paints black behind transparency — full bleed.
  ["apple-touch-icon.png", 180,  { bleed: true, disc: 0.66 }],
  // Android maskable: everything meaningful inside the middle 80%.
  ["icon-maskable-512.png",512,  { bleed: true, disc: 0.56, ring: 0.045 }],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, opts] of targets) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, png(size, render(size, opts)));
  console.log(`${name.padEnd(24)} ${size}×${size}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
}
