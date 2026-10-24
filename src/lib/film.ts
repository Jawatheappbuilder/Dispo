// DISPO film engine — all processing happens locally on a canvas.

export type PresetId = "disposable800" | "golden200" | "nightflash800";

export interface FilmSettings {
  preset: PresetId;
  intensity: number; // 0..100
  grain: number; // 0..100
  warmth: number; // -50..50
  exposure: number; // -100..100 (=> -1..+1 stop)
  dateStamp: boolean;
  lightLeak: boolean;
  frame: boolean;
}

export const DEFAULT_SETTINGS: FilmSettings = {
  preset: "disposable800",
  intensity: 85,
  grain: 34,
  warmth: 0,
  exposure: 0,
  dateStamp: false,
  lightLeak: false,
  frame: false,
};

interface Channel {
  lift: number; // film black
  gain: number; // paper white
  gamma: number;
  contrast: number; // >1 denser midtones
  shoulder: number; // highlight roll-off strength
}

interface PresetDef {
  id: PresetId;
  name: string;
  iso: string;
  blurb: string;
  r: Channel;
  g: Channel;
  b: Channel;
  saturation: number;
  shadowCyan: number;
  highlightWarm: number;
  grain: number;
  vignette: number;
  soft: number;
  halation: number;
  fringe: number;
  flash: number; // simulated on-camera flash look
}

export const PRESETS: Record<PresetId, PresetDef> = {
  disposable800: {
    id: "disposable800",
    name: "Disposable 800",
    iso: "800",
    blurb: "Signature consumer colour negative. Warm highlights, cool shadows, honest grain.",
    r: { lift: 0.012, gain: 0.995, gamma: 1.015, contrast: 1.21, shoulder: 0.4 },
    g: { lift: 0.011, gain: 0.99, gamma: 1.01, contrast: 1.2, shoulder: 0.39 },
    b: { lift: 0.014, gain: 0.985, gamma: 1.01, contrast: 1.19, shoulder: 0.38 },
    saturation: 0.89,
    shadowCyan: 0.002,
    highlightWarm: 0.003,
    grain: 1.34,
    vignette: 0.15,
    soft: 0.2,
    halation: 0.1,
    fringe: 0.3,
    flash: 0,
  },
  golden200: {
    id: "golden200",
    name: "Golden Hour 200",
    iso: "200",
    blurb: "Finer grain, honeyed light, gentle contrast for sun-drenched days.",
    r: { lift: 0.012, gain: 0.995, gamma: 1.005, contrast: 1.04, shoulder: 0.7 },
    g: { lift: 0.012, gain: 0.99, gamma: 1.01, contrast: 1.04, shoulder: 0.65 },
    b: { lift: 0.014, gain: 0.975, gamma: 1.015, contrast: 1.04, shoulder: 0.6 },
    saturation: 1.015,
    shadowCyan: 0.003,
    highlightWarm: 0.012,
    grain: 0.55,
    vignette: 0.11,
    soft: 0.16,
    halation: 0.12,
    fringe: 0.2,
    flash: 0,
  },
  nightflash800: {
    id: "nightflash800",
    name: "Night Flash 800",
    iso: "800",
    blurb: "Flash look (simulated in post): bright subject, deep falloff, cool backdrop.",
    r: { lift: 0.035, gain: 0.98, gamma: 1.0, contrast: 1.12, shoulder: 0.7 },
    g: { lift: 0.035, gain: 0.97, gamma: 1.0, contrast: 1.12, shoulder: 0.65 },
    b: { lift: 0.055, gain: 0.95, gamma: 1.0, contrast: 1.1, shoulder: 0.6 },
    saturation: 0.985,
    shadowCyan: 0.003,
    highlightWarm: 0.002,
    grain: 1.2,
    vignette: 0.17,
    soft: 0.23,
    halation: 0.1,
    fringe: 0.35,
    flash: 1,
  },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Builds a 256-entry tone LUT (0..1 floats) for one channel. */
export function buildChannelLut(c: Channel, exposureStops: number, gainMul: number): Float32Array {
  const lut = new Float32Array(256);
  const ev = Math.pow(2, exposureStops);
  const k = c.shoulder * 0.1;
  const shoulderNorm = 1 - Math.exp(-k);
  for (let i = 0; i < 256; i++) {
    let x = (i / 255) * ev;
    // soft highlight shoulder (handles overexposure gracefully)
    x = k > 0 ? (1 - Math.exp(-k * x)) / shoulderNorm : x;
    x = clamp01(x);
    x = Math.pow(x, c.gamma);
    // midtone density S-curve
    x = x < 0.5 ? 0.5 * Math.pow(2 * x, c.contrast) : 1 - 0.5 * Math.pow(2 * (1 - x), c.contrast);
    // lifted film blacks + paper white
    lut[i] = clamp01(c.lift + (c.gain * gainMul - c.lift) * x);
  }
  return lut;
}

/** Stable integer hash -> [-1, 1]. Same inputs always give the same grain. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0xffff) / 0x7fff) - 1;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function blurCopy(src: HTMLCanvasElement, w: number, h: number): Uint8ClampedArray {
  const a = makeCanvas(Math.max(2, Math.round(w / 6)), Math.max(2, Math.round(h / 6)));
  const actx = a.getContext("2d")!;
  actx.imageSmoothingQuality = "high";
  actx.drawImage(src, 0, 0, a.width, a.height);
  const b = makeCanvas(Math.max(2, Math.round(w / 18)), Math.max(2, Math.round(h / 18)));
  const bctx = b.getContext("2d")!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(a, 0, 0, b.width, b.height);
  const out = makeCanvas(w, h);
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(b, 0, 0, w, h);
  const data = octx.getImageData(0, 0, w, h).data;
  a.width = b.width = out.width = 0;
  return data;
}

export interface RenderOptions {
  maxEdge: number;
  seed: number;
  date: Date;
  bypass?: boolean; // original (only framing), for comparisons
}

/** Renders the film simulation into a new canvas. */
export function renderFilm(
  source: HTMLCanvasElement,
  s: FilmSettings,
  opts: RenderOptions,
): HTMLCanvasElement {
  const scale = Math.min(1, opts.maxEdge / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const work = makeCanvas(w, h);
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  // Kodak framing: slight centre crop, applied only to processed film.
  // Preserve output aspect ratio and keep the before comparison uncropped.
  if (!opts.bypass && s.preset === "disposable800") {
    const crop = 0.955;
    const sw = source.width * crop;
    const sh = source.height * crop;
    ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, w, h);
  } else {
    ctx.drawImage(source, 0, 0, w, h);
  }

  if (!opts.bypass) {
    const p = PRESETS[s.preset];
    const img = ctx.getImageData(0, 0, w, h);
    const src = img.data;
    const orig = new Uint8ClampedArray(src); // read-only copy
    const blur = blurCopy(work, w, h);
    // Sample a small, evenly spaced luminance grid to adapt the film response to the scene.
    let sceneLuma = 0;
    let sceneShadows = 0;
    let samples = 0;
    const step = Math.max(1, Math.floor(Math.max(w, h) / 64));
    for (let sy = 0; sy < h; sy += step) for (let sx = 0; sx < w; sx += step) {
      const si = (sy * w + sx) * 4;
      const lum = (0.2126 * orig[si] + 0.7152 * orig[si + 1] + 0.0722 * orig[si + 2]) / 255;
      sceneLuma += lum;
      if (lum < 0.22) sceneShadows++;
      samples++;
    }
    sceneLuma /= Math.max(1, samples);
    const shadowShare = sceneShadows / Math.max(1, samples);
    const lowLight = 1 - smooth(0.22, 0.55, sceneLuma);

    // Dazz-style Kodak reference: less iPhone HDR brightness, while preserving skin.
    const referenceEV = s.preset === "disposable800" ? -0.52 : 0;
    const ev = s.exposure / 100 + referenceEV;
    const warm = s.warmth / 50; // -1..1
    const lr = buildChannelLut(p.r, ev, 1 + warm * 0.06);
    const lg = buildChannelLut(p.g, ev, 1 + warm * 0.015);
    const lb = buildChannelLut(p.b, ev, 1 - warm * 0.09);
    const k = s.intensity / 100;
    const grainAmt = (s.grain / 100) * p.grain * 0.058 * k * (1 + lowLight * 0.5);
    const grainCell = Math.max(1, Math.round(Math.max(w, h) / 1500));
    const seed = opts.seed | 0;
    const cx = w / 2;
    const cy = h / 2;
    const invR = 1 / Math.sqrt(cx * cx + cy * cy);
    const fringePx = p.fringe * Math.max(w, h) * 0.0016;

    for (let y = 0; y < h; y++) {
      const dy = (y - cy) * invR;
      const gy = (y / grainCell) | 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dx = (x - cx) * invR;
        const d2 = dx * dx + dy * dy; // 0 center .. 1 corner

        // corner colour fringing: red sampled slightly outward, blue inward
        let r0 = orig[i];
        let b0 = orig[i + 2];
        const g0 = orig[i + 1];
        if (fringePx > 0.3 && d2 > 0.35) {
          const f = fringePx * smooth(0.35, 1, d2);
          const ox = Math.round(dx * f);
          const oy = Math.round(dy * f);
          const rx = Math.min(w - 1, Math.max(0, x + ox));
          const ry = Math.min(h - 1, Math.max(0, y + oy));
          const bx = Math.min(w - 1, Math.max(0, x - ox));
          const by = Math.min(h - 1, Math.max(0, y - oy));
          r0 = orig[(ry * w + rx) * 4];
          b0 = orig[(by * w + bx) * 4 + 2];
        }

        // soft focus toward the edges (cheap plastic lens)
        const soft = p.soft * (s.preset === "disposable800" ? 0.7 : 0.26) * (0.28 + 0.72 * smooth(0.32, 1, d2));
        let r = r0 + (blur[i] - r0) * soft;
        let g = g0 + (blur[i + 1] - g0) * soft;
        let b = b0 + (blur[i + 2] - b0) * soft;

        // per-channel film response
        r = lr[r | 0];
        g = lg[g | 0];
        b = lb[b | 0];

        // luminance
        let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // saturation with skin-tone preservation
        let skin = 0;
        if (r > g && g > b) {
          const t = (g - b) / (r - b + 1e-4);
          skin = smooth(0.15, 0.4, t) * (1 - smooth(0.6, 0.85, t)) * smooth(0.15, 0.35, L);
        }
        // Protect orange/red accents and skin from excessive desaturation.
        const warmChroma = smooth(0.015, 0.22, r - b) * smooth(0.005, 0.1, r - g);
        const sat = p.saturation + (1 - p.saturation) * Math.max(skin * 0.75, warmChroma * 0.85);
        r = L + (r - L) * sat;
        g = L + (g - L) * sat;
        b = L + (b - L) * sat;

        // split toning: cyan shadows, yellow highlights
        const sh = (1 - L) * (1 - L) * p.shadowCyan * (1 - lowLight * 0.5);
        const hi = L * L * p.highlightWarm * (1 - lowLight * 0.6);
        r += -sh + hi;
        g += sh * 0.25 + hi * 0.7;
        b += sh * 0.7 - hi * 0.9;

        // halation: red-orange glow bleeding from bright areas
        const bl = (0.2126 * blur[i] + 0.7152 * blur[i + 1] + 0.0722 * blur[i + 2]) / 255;
        const hal = Math.max(0, bl - 0.78) * 1.2 * p.halation;
        r += hal * 0.22;
        g += hal * 0.07;

        // flash look (simulated): hot centre, steep falloff, cool background
        if (p.flash > 0) {
          const fc = 1 - smooth(0, 0.75, d2);
          const fm = 0.92 + 0.16 * fc;
          r *= fm;
          g *= fm;
          b *= fm * (1 + 0.06 * (1 - fc));
        }

        // lens falloff
        const v = 1 - p.vignette * (0.45 + lowLight * 0.25) * smooth(0.25, 1.1, d2);
        r *= v;
        g *= v;
        b *= v;

        // intensity mix against original
        if (k < 1) {
          r = orig[i] / 255 + (r - orig[i] / 255) * k;
          g = orig[i + 1] / 255 + (g - orig[i + 1] / 255) * k;
          b = orig[i + 2] / 255 + (b - orig[i + 2] / 255) * k;
        }

        // luminance-dependent chroma grain (stable seeded)
        if (grainAmt > 0) {
          L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const amp = grainAmt * (0.42 + 0.7 * (1 - L) + shadowShare * 0.2);
          const gx = (x / grainCell) | 0;
          const n = hash2(gx, gy, seed);
          const nr = hash2(gx, gy, seed + 101);
          const nb = hash2(gx, gy, seed + 202);
          r += amp * (n * 0.93 + nr * 0.08);
          g += amp * n * 0.93;
          b += amp * (n * 0.93 + nb * 0.08);
        }

        src[i] = r * 255;
        src[i + 1] = g * 255;
        src[i + 2] = b * 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    if (s.lightLeak) drawLightLeak(ctx, w, h, seed);
    if (s.dateStamp) drawDateStamp(ctx, w, h, opts.date);
  }

  if (!s.frame) return work;
  const pad = Math.round(Math.max(w, h) * 0.035);
  const bottom = Math.round(pad * 1.0);
  const framed = makeCanvas(w + pad * 2, h + pad + bottom);
  const f = framed.getContext("2d")!;
  f.fillStyle = "#f1e9d8";
  f.fillRect(0, 0, framed.width, framed.height);
  // paper tooth
  const tooth = f.getImageData(0, 0, framed.width, framed.height);
  for (let i = 0; i < tooth.data.length; i += 4) {
    const n = hash2(i >> 2, 7, 3) * 5;
    tooth.data[i] += n;
    tooth.data[i + 1] += n;
    tooth.data[i + 2] += n;
  }
  f.putImageData(tooth, 0, 0);
  f.drawImage(work, pad, pad);
  f.strokeStyle = "rgba(40,25,10,0.18)";
  f.lineWidth = Math.max(1, pad * 0.04);
  f.strokeRect(pad, pad, w, h);
  work.width = 0;
  return framed;
}

function drawLightLeak(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const right = (Math.abs(hash2(1, 2, seed)) > 0.5) as boolean;
  const x = right ? w * 1.02 : -w * 0.02;
  const y = h * (0.25 + Math.abs(hash2(3, 4, seed)) * 0.5);
  const r = Math.max(w, h) * 0.55;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,120,40,0.55)");
  g.addColorStop(0.35, "rgba(255,70,30,0.25)");
  g.addColorStop(1, "rgba(255,60,20,0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Seven-segment digits: a b c d e f g
const SEG: Record<string, number[]> = {
  "0": [1, 1, 1, 1, 1, 1, 0],
  "1": [0, 1, 1, 0, 0, 0, 0],
  "2": [1, 1, 0, 1, 1, 0, 1],
  "3": [1, 1, 1, 1, 0, 0, 1],
  "4": [0, 1, 1, 0, 0, 1, 1],
  "5": [1, 0, 1, 1, 0, 1, 1],
  "6": [1, 0, 1, 1, 1, 1, 1],
  "7": [1, 1, 1, 0, 0, 0, 0],
  "8": [1, 1, 1, 1, 1, 1, 1],
  "9": [1, 1, 1, 1, 0, 1, 1],
};

export function formatStamp(d: Date): string {
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, " ");
  const dd = String(d.getDate()).padStart(2, " ");
  return `'${yy} ${mm} ${dd}`;
}

function drawDateStamp(ctx: CanvasRenderingContext2D, w: number, h: number, date: Date) {
  const text = formatStamp(date);
  const dh = Math.max(10, Math.round(Math.min(w, h) * 0.04)); // digit height
  const dw = dh * 0.55;
  const t = Math.max(1.2, dh * 0.12);
  const gap = dw * 0.45;
  const totalW = text.length * (dw + gap);
  let x = w - totalW - Math.min(w, h) * 0.05;
  const y = h - dh - Math.min(w, h) * 0.05;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255,138,36,0.92)";
  ctx.shadowColor = "rgba(255,90,20,0.9)";
  ctx.shadowBlur = dh * 0.35;
  const skew = dh * 0.12;
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    // skewed bar
    const s0 = skew * (1 - (y0 - y) / dh);
    const s1 = skew * (1 - (y1 - y) / dh);
    ctx.beginPath();
    ctx.moveTo(x0 + s0, y0);
    ctx.lineTo(x1 + s0, y0);
    ctx.lineTo(x1 + s1, y1);
    ctx.lineTo(x0 + s1, y1);
    ctx.closePath();
    ctx.fill();
  };
  for (const ch of text) {
    if (ch === "'") {
      seg(x + dw * 0.3, y, x + dw * 0.3 + t, y + dh * 0.28);
    } else if (SEG[ch]) {
      const [a, b, c, d, e, f, g] = SEG[ch];
      const half = dh / 2;
      if (a) seg(x + t, y, x + dw - t, y + t);
      if (b) seg(x + dw - t, y + t * 0.6, x + dw, y + half - t * 0.3);
      if (c) seg(x + dw - t, y + half + t * 0.3, x + dw, y + dh - t * 0.6);
      if (d) seg(x + t, y + dh - t, x + dw - t, y + dh);
      if (e) seg(x, y + half + t * 0.3, x + t, y + dh - t * 0.6);
      if (f) seg(x, y + t * 0.6, x + t, y + half - t * 0.3);
      if (g) seg(x + t, y + half - t / 2, x + dw - t, y + half + t / 2);
    }
    x += dw + gap;
  }
  ctx.restore();
}

/** Export long-edge limit: conservative on phones to stay under canvas memory limits. */
export function exportMaxEdge(): number {
  if (typeof window === "undefined") return 3200;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return coarse ? 3200 : 4800;
}

export class DecodeError extends Error {}

/** Decodes a picked file into a canvas capped at maxEdge. */
export async function decodeImageFile(file: File, maxEdge: number): Promise<HTMLCanvasElement> {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  let bmp: ImageBitmap | HTMLImageElement | null = null;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      bmp = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error("decode"));
        im.src = url;
      });
    } catch {
      bmp = null;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  if (!bmp) {
    throw new DecodeError(
      isHeic
        ? "This browser can't read HEIC photos. Open DISPO in Safari on iPhone, or pick a JPG/PNG."
        : "That file couldn't be opened as a photo. Try a JPG, PNG or WebP.",
    );
  }
  const sw = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
  const sh = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const c = makeCanvas(Math.round(sw * scale), Math.round(sh * scale));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if ("close" in bmp) bmp.close();
  return c;
}

export function canvasToJpeg(c: HTMLCanvasElement, q = 0.92): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), "image/jpeg", q),
  );
}

export function sanitizeSettings(raw: unknown): FilmSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<FilmSettings>;
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const D = DEFAULT_SETTINGS;
  return {
    preset: o.preset && o.preset in PRESETS ? o.preset : D.preset,
    intensity: num(o.intensity, 0, 100, D.intensity),
    grain: num(o.grain, 0, 100, D.grain),
    warmth: num(o.warmth, -50, 50, D.warmth),
    exposure: num(o.exposure, -100, 100, D.exposure),
    dateStamp: bool(o.dateStamp, D.dateStamp),
    lightLeak: bool(o.lightLeak, D.lightLeak),
    frame: bool(o.frame, D.frame),
  };
}