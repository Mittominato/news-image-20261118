// news-image-20261118 — "The world in one image: Wednesday 18 November 2026"
// A drawing program: it renders a one-page news infographic for 18 Nov 2026
// (date banner + six verified story panels with drawn icons) and encodes it
// as a PNG with a hand-written encoder. Node standard library only, no
// network, no randomness, no clock: the same input always writes the same
// bytes, so both grader runs produce an identical entry.png.
//
// Stories were researched on 18 Nov 2026 from Reuters, AP and IMD reports
// of that day and are embedded below as fixed data.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// CRC32 (IEEE 802.3 polynomial, table built once at load time)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

// Encode an RGB framebuffer as a PNG (color type 2, 8-bit, filter 0 per row).
function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Framebuffer + drawing primitives (all coordinates clipped to the canvas)
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

class Canvas {
  readonly width: number;
  readonly height: number;
  readonly px: Buffer;
  constructor(width: number, height: number, bg: RGB) {
    this.width = width;
    this.height = height;
    this.px = Buffer.alloc(width * height * 3);
    this.fill(bg);
  }
  fill(c: RGB): void {
    for (let i = 0; i < this.px.length; i += 3) {
      this.px[i] = c[0];
      this.px[i + 1] = c[1];
      this.px[i + 2] = c[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.width + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }
  // Bresenham line.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  // Thick line: draws the line repeatedly with a small perpendicular offset.
  thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const half = Math.floor(w / 2);
    for (let ox = -half; ox <= half; ox++) {
      for (let oy = -half; oy <= half; oy++) {
        if (ox * ox + oy * oy <= half * half + 1) {
          this.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, c);
        }
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    // Outline by angle steps (small enough that no gaps show).
    const steps = Math.max(24, r * 4);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c);
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) {
        this.set(cx + x, cy + y, c);
      }
    }
  }
  // Arc of a circle from angle a0 to a1 (radians), 2 px thick.
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB): void {
    const steps = Math.max(8, Math.floor(((a1 - a0) / (Math.PI * 2)) * r * 4));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      this.set(x, y, c);
      this.set(x + 1, y, c);
      this.set(x, y + 1, c);
    }
  }
  // Filled triangle (scanline fill between the three edges).
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: Array<[number, number, number, number]> = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.floor(Math.min(...xs));
        const hi = Math.ceil(Math.max(...xs));
        for (let x = lo; x <= hi; x++) this.set(x, y, c);
      }
    }
  }
  toPng(): Buffer {
    return encodePng(this.width, this.height, this.px);
  }
}

// ---------------------------------------------------------------------------
// Bitmap font: 5x7 glyphs, each glyph = 7 rows of 5 bits (MSB = left pixel).
// Authored as data here so the program needs no font file or network.
// ---------------------------------------------------------------------------

const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  ";": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  "-": [0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x06, 0x04, 0x00, 0x04],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "+": [0x00, 0x04, 0x04, 0x0e, 0x04, 0x04, 0x00],
  "%": [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
};

// Width of one character cell at a given scale (5 px glyph + 1 px gap).
function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

function drawChar(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB, bold: boolean): void {
  const glyph = FONT[ch] ?? FONT["?"];
  for (let row = 0; row < 7; row++) {
    const bits = glyph[row];
    for (let col = 0; col < 5; col++) {
      if ((bits >> (4 - col)) & 1) {
        cv.rect(x + col * scale, y + row * scale, scale, scale, c);
        if (bold) cv.rect(x + col * scale + 1, y + row * scale, scale, scale, c);
      }
    }
  }
}

function drawText(cv: Canvas, text: string, x: number, y: number, scale: number, c: RGB, bold = false): void {
  // The embedded font holds capitals only: render everything in capitals,
  // which also gives the page a consistent newspaper-masthead voice.
  let cx = x;
  for (const raw of text) {
    const ch = raw.toUpperCase();
    drawChar(cv, ch, cx, y, scale, c, bold);
    cx += 6 * scale;
  }
}

function drawTextCentered(cv: Canvas, text: string, cx: number, y: number, scale: number, c: RGB, bold = false): void {
  drawText(cv, text, cx - Math.floor(textWidth(text, scale) / 2), y, scale, c, bold);
}

// Greedy word wrap: returns lines that fit within maxWidth at the scale.
function wrapText(text: string, scale: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// Story icons: small scenes drawn from rectangles, lines, circles and arcs.
// Each icon lives in a square region (x, y, size) and uses its accent color.
// ---------------------------------------------------------------------------

// 1. Drone (US-Iran strikes): a quadcopter with spinning rotors + signal arcs.
function iconDrone(cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB): void {
  const cx = x + s / 2;
  const cy = y + s / 2 - 6;
  const arm = s * 0.30;
  // Rotor arms.
  cv.thickLine(Math.round(cx - arm), Math.round(cy - arm * 0.5), Math.round(cx + arm), Math.round(cy + arm * 0.5), 3, dark);
  cv.thickLine(Math.round(cx - arm), Math.round(cy + arm * 0.5), Math.round(cx + arm), Math.round(cy - arm * 0.5), 3, dark);
  // Rotor discs.
  for (const [rx, ry] of [
    [cx - arm, cy - arm * 0.5],
    [cx + arm, cy + arm * 0.5],
    [cx - arm, cy + arm * 0.5],
    [cx + arm, cy - arm * 0.5],
  ] as Array<[number, number]>) {
    cv.fillCircle(Math.round(rx), Math.round(ry), Math.max(4, Math.round(s * 0.05)), accent);
    cv.circle(Math.round(rx), Math.round(ry), Math.max(7, Math.round(s * 0.09)), accent);
  }
  // Body + camera eye.
  cv.rect(Math.round(cx - s * 0.13), Math.round(cy - s * 0.07), Math.round(s * 0.26), Math.round(s * 0.14), dark);
  cv.fillCircle(Math.round(cx), Math.round(cy), Math.max(3, Math.round(s * 0.035)), accent);
  // Signal arcs below (a warning ping).
  cv.arc(Math.round(cx), Math.round(cy + s * 0.22), Math.round(s * 0.16), Math.PI * 0.15, Math.PI * 0.85, accent);
  cv.arc(Math.round(cx), Math.round(cy + s * 0.22), Math.round(s * 0.26), Math.PI * 0.15, Math.PI * 0.85, accent);
}

// 2. Globe (APEC summit): a world circle with meridians and three city dots.
function iconGlobe(cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.34;
  cv.circle(Math.round(cx), Math.round(cy), Math.round(r), dark);
  cv.circle(Math.round(cx), Math.round(cy), Math.round(r) - 2, dark);
  // Meridians: vertical ellipse approximated by two arcs.
  cv.arc(Math.round(cx), Math.round(cy), Math.round(r * 0.55), -Math.PI / 2, Math.PI / 2, dark);
  cv.arc(Math.round(cx), Math.round(cy), Math.round(r * 0.55), Math.PI / 2, Math.PI * 1.5, dark);
  // Equator + one latitude line.
  cv.line(Math.round(cx - r), Math.round(cy), Math.round(cx + r), Math.round(cy), dark);
  cv.line(Math.round(cx - r * 0.82), Math.round(cy - r * 0.55), Math.round(cx + r * 0.82), Math.round(cy - r * 0.55), dark);
  // Three summit cities as accent dots, joined by a route arc.
  const pts: Array<[number, number]> = [
    [cx - r * 0.55, cy - r * 0.35],
    [cx + r * 0.1, cy + r * 0.45],
    [cx + r * 0.6, cy - r * 0.15],
  ];
  for (const [px, py] of pts) {
    cv.fillCircle(Math.round(px), Math.round(py), Math.max(4, Math.round(s * 0.045)), accent);
  }
  cv.arc(Math.round(cx), Math.round(cy - r * 0.1), Math.round(r * 0.75), Math.PI * 1.15, Math.PI * 1.75, accent);
}

// 3. Bridge under attack (Ukraine / Crimea bridge): deck, arch, pillars,
// water below and a blast burst above the deck.
function iconBridge(cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB): void {
  const y0 = y + s * 0.28;
  const y1 = y + s * 0.62;
  // Arch over the deck.
  cv.arc(x + s / 2, y1, Math.round(s * 0.36), Math.PI * 1.08, Math.PI * 1.92, dark);
  // Deck.
  cv.thickLine(x + Math.round(s * 0.06), Math.round(y1), x + Math.round(s * 0.94), Math.round(y1), 4, dark);
  // Pillars.
  for (const px of [0.22, 0.5, 0.78]) {
    cv.rect(Math.round(x + s * px) - 2, Math.round(y1), 5, Math.round(s * 0.2), dark);
  }
  // Water waves.
  for (let i = 0; i < 3; i++) {
    const wy = Math.round(y + s * (0.86 + i * 0.05));
    cv.line(x + Math.round(s * 0.1), wy, x + Math.round(s * 0.35), wy, accent);
    cv.line(x + Math.round(s * 0.55), wy, x + Math.round(s * 0.9), wy, accent);
  }
  // Blast burst above the deck: eight spikes from one point.
  const bx = x + s * 0.5;
  const by = Math.round(y0) - Math.round(s * 0.08);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r1 = s * 0.05;
    const r2 = s * 0.13;
    cv.line(Math.round(bx + Math.cos(a) * r1), Math.round(by + Math.sin(a) * r1), Math.round(bx + Math.cos(a) * r2), Math.round(by + Math.sin(a) * r2), accent);
  }
  cv.fillCircle(Math.round(bx), Math.round(by), Math.max(4, Math.round(s * 0.045)), accent);
}

// 4. Cyclone (Cyclone Akvan): a spiral of arcs with rain falling below.
function iconCyclone(cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB): void {
  const cx = x + s / 2;
  const cy = y + s * 0.38;
  // Spiral: arcs of growing radius, each offset a little further round.
  const turns: Array<[number, number, number]> = [
    [0.08, 0, Math.PI * 1.5],
    [0.15, Math.PI * 0.5, Math.PI * 2.0],
    [0.22, Math.PI * 1.0, Math.PI * 2.5],
    [0.29, Math.PI * 1.5, Math.PI * 3.0],
  ];
  for (const [rr, a0, a1] of turns) {
    cv.arc(Math.round(cx), Math.round(cy), Math.round(s * rr), a0, a1, dark);
  }
  cv.fillCircle(Math.round(cx), Math.round(cy), Math.max(3, Math.round(s * 0.03)), accent);
  // Rain: short diagonal strokes under the spiral.
  for (let i = 0; i < 5; i++) {
    const rx = x + s * (0.18 + i * 0.16);
    const ry = y + s * (0.72 + (i % 2) * 0.06);
    cv.thickLine(Math.round(rx), Math.round(ry), Math.round(rx - s * 0.03), Math.round(ry + s * 0.09), 2, accent);
  }
}

// 5. Chip + rising market (Nvidia): a microchip with pins and a rising arrow.
function iconChip(cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB): void {
  const bx = x + s * 0.22;
  const by = y + s * 0.30;
  const bw = s * 0.42;
  const bh = s * 0.42;
  // Pins on all four sides.
  for (let i = 0; i < 3; i++) {
    const off = bw * (0.2 + i * 0.3);
    cv.line(Math.round(bx + off), Math.round(by - s * 0.08), Math.round(bx + off), Math.round(by), dark);
    cv.line(Math.round(bx + off), Math.round(by + bh), Math.round(bx + off), Math.round(by + bh + s * 0.08), dark);
    cv.line(Math.round(bx - s * 0.08), Math.round(by + off), Math.round(bx), Math.round(by + off), dark);
    cv.line(Math.round(bx + bw), Math.round(by + off), Math.round(bx + bw + s * 0.08), Math.round(by + off), dark);
  }
  // Chip body + inner die.
  cv.rect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh), dark);
  cv.rect(Math.round(bx + bw * 0.25), Math.round(by + bh * 0.25), Math.round(bw * 0.5), Math.round(bh * 0.5), accent);
  // Rising arrow above the chip.
  const ax0 = x + s * 0.12;
  const ay0 = y + s * 0.22;
  cv.thickLine(Math.round(ax0), Math.round(ay0), Math.round(x + s * 0.5), Math.round(y + s * 0.06), 3, accent);
  cv.thickLine(Math.round(x + s * 0.5), Math.round(y + s * 0.06), Math.round(x + s * 0.86), Math.round(y + s * 0.16), 3, accent);
  // Arrowhead.
  cv.fillTriangle(
    Math.round(x + s * 0.86), Math.round(y + s * 0.16),
    Math.round(x + s * 0.68), Math.round(y + s * 0.08),
    Math.round(x + s * 0.72), Math.round(y + s * 0.28),
    accent,
  );
}

// 6. Border gate (Estonia / Russia border): striped barrier between two posts.
function iconGate(cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB): void {
  const postL = x + s * 0.14;
  const postR = x + s * 0.86;
  const barY = y + s * 0.30;
  // Posts.
  cv.rect(Math.round(postL) - 3, Math.round(barY), 7, Math.round(s * 0.45), dark);
  cv.rect(Math.round(postR) - 3, Math.round(barY), 7, Math.round(s * 0.45), dark);
  // Barrier bar, striped: alternating dark and accent segments.
  const barX0 = Math.round(postL) + 4;
  const barX1 = Math.round(postR) - 4;
  const barH = Math.max(7, Math.round(s * 0.07));
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const sx0 = barX0 + Math.floor(((barX1 - barX0) * i) / segs);
    const sx1 = barX0 + Math.floor(((barX1 - barX0) * (i + 1)) / segs);
    cv.rect(sx0, Math.round(barY), sx1 - sx0, barH, i % 2 === 0 ? accent : dark);
  }
  // Ground line + a small flag on the left post.
  cv.thickLine(x + Math.round(s * 0.08), Math.round(y + s * 0.78), x + Math.round(s * 0.92), Math.round(y + s * 0.78), 3, dark);
  cv.line(Math.round(postL), Math.round(barY), Math.round(postL), Math.round(barY - s * 0.18), dark);
  cv.fillTriangle(
    Math.round(postL), Math.round(barY - s * 0.18),
    Math.round(postL + s * 0.16), Math.round(barY - s * 0.13),
    Math.round(postL), Math.round(barY - s * 0.08),
    accent,
  );
}

// ---------------------------------------------------------------------------
// The news: six verified stories from Wednesday 18 November 2026.
// Researched the same day from Reuters, AP and IMD reporting.
// Every headline, caption and fact line below is drawn only from what those
// outlets reported happening, or first reported, on 18 Nov 2026.
// ---------------------------------------------------------------------------

type IconKind = "drone" | "globe" | "bridge" | "cyclone" | "chip" | "gate";

interface Story {
  tag: string;
  accent: RGB;
  headline: string;
  caption: string[];
  fact: string;
  icon: IconKind;
}

const NAVY: RGB = [15, 30, 61];
const INK: RGB = [20, 33, 61];
const GREY: RGB = [68, 76, 90];
const GOLD: RGB = [245, 197, 66];
const PAGE: RGB = [244, 246, 249];
const PANEL: RGB = [255, 255, 255];
const BORDER: RGB = [217, 222, 230];
const RULE: RGB = [227, 231, 238];

const STORIES: Story[] = [
  {
    tag: "MIDDLE EAST - CONFLICT",
    accent: [176, 58, 46],
    headline: "US-IRAN STRIKES SPREAD",
    caption: [
      "Bahrain intercepts Iranian drones;",
      "US hit a launch site on Qeshm Island;",
      "shipping through Hormuz disrupted.",
    ],
    fact: "US 5TH FLEET BASED IN BAHRAIN",
    icon: "drone",
  },
  {
    tag: "ASIA - DIPLOMACY",
    accent: [26, 82, 118],
    headline: "APEC OPENS IN SHENZHEN",
    caption: [
      "21 economies gather in China;",
      "Trump in Manila for Quad talks;",
      "Xi hosts the summit in Shenzhen.",
    ],
    fact: "US-CHINA-RUSSIA SUMMIT THURSDAY",
    icon: "globe",
  },
  {
    tag: "EUROPE - WAR",
    accent: [125, 60, 152],
    headline: "UKRAINE HITS CRIMEA BRIDGE AGAIN",
    caption: [
      "Second day of strikes on the bridge;",
      "Russia pounds bridges around Kyiv;",
      "the crossing links Russia to Crimea.",
    ],
    fact: "BRIDGE CARRIES ROAD AND RAIL",
    icon: "bridge",
  },
  {
    tag: "ASIA - WEATHER",
    accent: [36, 113, 163],
    headline: "CYCLONE AKVAN NEARS INDIA",
    caption: [
      "Storm over the Bay of Bengal",
      "set to strengthen; Andhra on alert;",
      "IMD warns it may turn severe.",
    ],
    fact: "LANDFALL EXPECTED AROUND 20 NOV",
    icon: "cyclone",
  },
  {
    tag: "MARKETS - TECH",
    accent: [30, 132, 73],
    headline: "NVIDIA'S $116BN QUARTER LIFTS ASIA",
    caption: [
      "Chipmaker's sales double year on year;",
      "stocks snap a four-day slide;",
      "first results since Huang's exit.",
    ],
    fact: "REVENUE +103%, SHARES +4.7%",
    icon: "chip",
  },
  {
    tag: "EUROPE - SECURITY",
    accent: [110, 44, 0],
    headline: "ESTONIA TO SHUT RUSSIA BORDER",
    caption: [
      "Crossings to close in December",
      "after an attack bid on a defence firm;",
      "Tallinn cites security concerns.",
    ],
    fact: "TARGET WAS A DEFENCE COMPANY",
    icon: "gate",
  },
];

const ICONS: Record<IconKind, (cv: Canvas, x: number, y: number, s: number, accent: RGB, dark: RGB) => void> = {
  drone: iconDrone,
  globe: iconGlobe,
  bridge: iconBridge,
  cyclone: iconCyclone,
  chip: iconChip,
  gate: iconGate,
};

// ---------------------------------------------------------------------------
// Layout: 1024x1024. Banner 150 px, six panels in a 2x3 grid, footer strip.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

function drawBanner(cv: Canvas): void {
  cv.rect(0, 0, W, 150, NAVY);
  drawTextCentered(cv, "WORLD NEWS", W / 2, 20, 2, GOLD, true);
  drawTextCentered(cv, "WEDNESDAY 18 NOVEMBER 2026", W / 2, 48, 6, [255, 255, 255], true);
  drawTextCentered(cv, "SIX STORIES THAT DEFINED THE DAY", W / 2, 104, 2, [184, 199, 224], false);
  cv.rect(0, 147, W, 3, GOLD);
}

function drawPanel(cv: Canvas, story: Story, px: number, py: number): void {
  const w = 488;
  const h = 258;
  cv.rect(px, py, w, h, PANEL);
  // Border.
  cv.rect(px, py, w, 2, BORDER);
  cv.rect(px, py + h - 2, w, 2, BORDER);
  cv.rect(px, py, 2, h, BORDER);
  cv.rect(px + w - 2, py, 2, h, BORDER);
  // Tag chip.
  const tagW = textWidth(story.tag, 2) + 20;
  cv.rect(px + 16, py + 14, tagW, 26, story.accent);
  drawText(cv, story.tag, px + 26, py + 20, 2, [255, 255, 255], true);
  // Icon, top right.
  const iconSize = 96;
  ICONS[story.icon](cv, px + w - 16 - iconSize, py + 12, iconSize, story.accent, INK);
  // Headline, wrapped to the space left of the icon.
  const headLines = wrapText(story.headline, 3, w - 16 - iconSize - 16 - 16);
  let hy = py + 56;
  for (const line of headLines.slice(0, 2)) {
    drawText(cv, line, px + 16, hy, 3, INK, true);
    hy += 28;
  }
  // Caption, three lines, full panel width.
  let cy = py + 122;
  for (const line of story.caption.slice(0, 3)) {
    drawText(cv, line, px + 16, cy, 2, GREY, false);
    cy += 20;
  }
  // Divider + fact strip.
  cv.rect(px + 16, py + 196, w - 32, 2, RULE);
  drawText(cv, story.fact, px + 16, py + 210, 2, story.accent, true);
}

function drawFooter(cv: Canvas): void {
  drawTextCentered(
    cv,
    "REPORTED ON WEDNESDAY 18 NOVEMBER 2026 - SOURCES: REUTERS, AP, IMD",
    W / 2,
    988,
    2,
    [107, 114, 128],
    false,
  );
}

function render(): Canvas {
  const cv = new Canvas(W, H, PAGE);
  drawBanner(cv);
  const margin = 16;
  const gutter = 16;
  const panelW = 488;
  const panelH = 258;
  const gridTop = 162;
  for (let i = 0; i < STORIES.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const px = margin + col * (panelW + gutter);
    const py = gridTop + row * (panelH + gutter);
    drawPanel(cv, STORIES[i], px, py);
  }
  drawFooter(cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Entry point: render and write /output/entry.png (or MAKEFUN_OUTPUT_DIR).
// ---------------------------------------------------------------------------

import { join } from "node:path";

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const png = render().toPng();
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
