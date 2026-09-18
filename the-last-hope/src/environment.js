import * as THREE from 'three';
import { makeCanvas, rand, randi, choice, clamp } from './util.js';

// ===========================================================================
// ENVIRONMENT ART MODULE — purely visual.
// Nothing in here registers colliders, interactables, objectives or save
// flags. It only adds meshes/lights/particles and richer materials so the
// existing world reads as a believable, cinematic, abandoned place.
// ===========================================================================

// --------------------------------------------------------------- PBR helpers

function drawToCanvas(w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  return c;
}

// Derive a tangent-space normal map from the luminance of a colour canvas.
function normalFromCanvas(src, strength = 2.2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1)) - (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

// Roughness map from luminance (dark/dirty = rougher, bright/polished = smoother).
function roughFromCanvas(src, lo = 0.55, hi = 1.0, invert = false) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    let l = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) / 255;
    if (!invert) l = 1 - l;
    const v = clamp(lo + (hi - lo) * l, 0, 1) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

function tex(canvas, repeat, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Build a full PBR set (colour + normal + roughness) from one draw call. */
export function pbrSet(w, h, draw, opts = {}) {
  const c = drawToCanvas(w, h, draw);
  const rep = opts.repeat || [1, 1];
  return {
    map: tex(c, rep, true),
    normalMap: tex(normalFromCanvas(c, opts.strength ?? 2.2), rep, false),
    roughnessMap: tex(roughFromCanvas(c, opts.roughLo ?? 0.55, opts.roughHi ?? 1, opts.roughInvert), rep, false),
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
  };
}

/** Standard material from a PBR set. */
export function pbrMat(set, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap,
    normalScale: set.normalScale.clone(),
    roughness: 1, metalness: 0, ...opts,
  });
}

/** Copy a PBR set with a different tiling rate (textures are shared otherwise). */
export function cloneSet(set, repeat) {
  const c = (t) => { const n = t.clone(); n.needsUpdate = true; if (repeat) n.repeat.set(repeat[0], repeat[1]); return n; };
  return { map: c(set.map), normalMap: c(set.normalMap), roughnessMap: c(set.roughnessMap), normalScale: set.normalScale.clone() };
}

/** Attach generated normal/roughness detail to an already-built material. */
export function upgradeMaterial(mat, set, opts = {}) {
  if (!mat || !set) return mat;
  const rep = opts.repeat;
  const pick = (t) => { if (!rep) return t; const n = t.clone(); n.needsUpdate = true; n.repeat.set(rep[0], rep[1]); return n; };
  mat.normalMap = pick(set.normalMap);
  mat.normalScale = new THREE.Vector2(opts.normalScale ?? 0.7, opts.normalScale ?? 0.7);
  if (opts.rough !== false) { mat.roughnessMap = pick(set.roughnessMap); mat.roughness = opts.roughness ?? 1; }
  if (opts.metalness !== undefined) mat.metalness = opts.metalness;
  if (opts.color !== undefined) mat.color.setHex(opts.color);
  mat.needsUpdate = true;
  return mat;
}

// --------------------------------------------------------------- noise paint

function grain(g, w, h, base, amp, cell = 2) {
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    const v = rand(-amp, amp);
    g.fillStyle = `rgb(${clamp(base[0] + v, 0, 255) | 0},${clamp(base[1] + v, 0, 255) | 0},${clamp(base[2] + v, 0, 255) | 0})`;
    g.fillRect(x, y, cell, cell);
  }
}

function blotches(g, w, h, n, col, aMax, rMin = 4, rMax = 34) {
  for (let i = 0; i < n; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(rMin, rMax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${rand(aMax * 0.4, aMax)})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}

function cracks(g, w, h, n, col = '18,17,16', aMax = 0.55, lw = [0.6, 2.2]) {
  for (let i = 0; i < n; i++) {
    let x = rand(0, w), y = rand(0, h), a = rand(0, 7);
    g.strokeStyle = `rgba(${col},${rand(0.15, aMax)})`;
    g.lineWidth = rand(lw[0], lw[1]);
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    const segs = randi(3, 8);
    for (let s = 0; s < segs; s++) {
      a += rand(-0.7, 0.7);
      x += Math.cos(a) * rand(6, 26); y += Math.sin(a) * rand(6, 26);
      g.lineTo(x, y);
      if (Math.random() < 0.3) { // branch
        const bx = x + Math.cos(a + 1.1) * rand(5, 16), by = y + Math.sin(a + 1.1) * rand(5, 16);
        g.lineTo(bx, by); g.moveTo(x, y);
      }
    }
    g.stroke();
  }
}

function mossSpecks(g, w, h, n, cols = [[58, 92, 44], [42, 74, 38], [86, 112, 52]], aMax = 0.5) {
  for (let i = 0; i < n; i++) {
    const c = choice(cols);
    const x = rand(0, w), y = rand(0, h), r = rand(3, 20);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${rand(0.12, aMax)})`);
    gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(${c[0] + randi(-14, 22)},${c[1] + randi(-14, 22)},${c[2] + randi(-10, 18)},${rand(0.1, 0.45)})`;
      g.fillRect(x + rand(-r, r), y + rand(-r, r), rand(1, 2.6), rand(1, 2.6));
    }
  }
}

function streaks(g, w, h, n, col = '0,0,0', aMax = 0.2) {
  for (let i = 0; i < n; i++) {
    const x = rand(0, w), y0 = rand(0, h * 0.6), len = rand(30, h * 0.6), ww = rand(1.5, 7);
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(${col},${rand(aMax * 0.5, aMax)})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x, y0, ww, len);
  }
}

// --------------------------------------------------------------- texture bank

export const ENV = {};
let built = false;

export function ensureEnv() {
  if (built) return ENV;
  built = true;

  // --- ground / surfaces -------------------------------------------------
  ENV.asphalt = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [48, 48, 51], 11, 2);
    blotches(g, w, h, 90, '30,30,33', 0.5);
    blotches(g, w, h, 40, '96,94,90', 0.18);
    cracks(g, w, h, 34, '20,20,22', 0.6, [0.8, 2.6]);
    // patched repairs
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(${randi(30, 44)},${randi(30, 44)},${randi(32, 46)},.55)`;
      g.fillRect(rand(0, w), rand(0, h), rand(40, 120), rand(30, 90));
    }
    mossSpecks(g, w, h, 26, [[46, 70, 38]], 0.32);
    streaks(g, w, h, 20, '18,18,20', 0.15);
  }, { repeat: [10, 34], strength: 2.4, roughLo: 0.62, roughHi: 1, normalScale: 1.1 });

  ENV.concrete = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [104, 101, 95], 12, 2);
    blotches(g, w, h, 110, '70,66,60', 0.35);
    blotches(g, w, h, 50, '150,146,138', 0.16);
    cracks(g, w, h, 30, '48,44,40', 0.45);
    streaks(g, w, h, 46, '34,30,26', 0.28);
    mossSpecks(g, w, h, 20, [[62, 86, 48], [80, 96, 54]], 0.3);
    // exposed aggregate / chipping
    for (let i = 0; i < 240; i++) {
      g.fillStyle = `rgba(${randi(120, 165)},${randi(116, 158)},${randi(108, 150)},${rand(0.15, 0.5)})`;
      g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
    }
  }, { repeat: [3, 3], strength: 2.0, roughLo: 0.6, roughHi: 1 });

  ENV.sidewalk = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [112, 108, 100], 10, 2);
    g.strokeStyle = 'rgba(38,35,31,.75)'; g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke();
    }
    cracks(g, w, h, 22, '46,42,38', 0.5);
    blotches(g, w, h, 70, '72,68,62', 0.3);
    mossSpecks(g, w, h, 34, [[54, 82, 42]], 0.45);
  }, { repeat: [2, 26], strength: 2.2, roughLo: 0.66, roughHi: 1 });

  ENV.dirt = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [96, 79, 58], 14, 2);
    blotches(g, w, h, 120, '62,49, 34', 0.4);
    blotches(g, w, h, 60, '128,108,80', 0.22);
    for (let i = 0; i < 700; i++) { // pebbles & twigs
      g.fillStyle = `rgba(${randi(70, 130)},${randi(62, 112)},${randi(48, 92)},${rand(0.2, 0.7)})`;
      g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 3));
    }
  }, { repeat: [3, 3], strength: 2.6, roughLo: 0.8, roughHi: 1 });

  ENV.forestFloor = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [44, 54, 38], 13, 2);
    blotches(g, w, h, 100, '26,36,24', 0.45);
    blotches(g, w, h, 60, '86,96,52', 0.22);
    mossSpecks(g, w, h, 60, [[48, 84, 40], [62, 98, 44], [36, 62, 32]], 0.55);
    for (let i = 0; i < 1100; i++) { // leaf litter
      const c = choice([[92, 74, 38], [72, 88, 42], [58, 46, 28], [104, 92, 50]]);
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${rand(0.25, 0.75)})`;
      g.save();
      g.translate(rand(0, w), rand(0, h)); g.rotate(rand(0, 7));
      g.fillRect(0, 0, rand(2, 7), rand(1, 3));
      g.restore();
    }
  }, { repeat: [16, 16], strength: 2.4, roughLo: 0.85, roughHi: 1 });

  ENV.rock = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [86, 86, 92], 16, 2);
    blotches(g, w, h, 110, '46,46,52', 0.45);
    blotches(g, w, h, 60, '138,138,146', 0.2);
    cracks(g, w, h, 42, '26,26,30', 0.65, [0.8, 3]);
    // strata banding
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(${randi(56, 96)},${randi(56, 96)},${randi(60, 102)},.22)`;
      g.fillRect(0, rand(0, h), w, rand(4, 22));
    }
    mossSpecks(g, w, h, 30, [[54, 82, 44]], 0.4);
  }, { repeat: [3, 3], strength: 3.0, roughLo: 0.72, roughHi: 1, normalScale: 1.2 });

  ENV.caveRock = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [74, 78, 88], 18, 2);
    blotches(g, w, h, 130, '30,34,44', 0.55);
    blotches(g, w, h, 50, '118,124,140', 0.18);
    cracks(g, w, h, 50, '16,18,24', 0.7, [0.8, 3.4]);
    // mineral veins
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = `rgba(${randi(120, 180)},${randi(150, 210)},${randi(170, 230)},${rand(0.05, 0.16)})`;
      g.lineWidth = rand(1, 3.5);
      g.beginPath(); let x = rand(0, w), y = rand(0, h), a = rand(0, 7);
      g.moveTo(x, y);
      for (let s = 0; s < 7; s++) { a += rand(-0.6, 0.6); x += Math.cos(a) * 30; y += Math.sin(a) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    // damp seepage
    streaks(g, w, h, 40, '12,16,24', 0.3);
  }, { repeat: [4, 4], strength: 3.2, roughLo: 0.6, roughHi: 1, normalScale: 1.3 });

  ENV.brick = pbrSet(512, 512, (g, w, h) => {
    grain(g, w, h, [96, 66, 54], 10, 2);
    const bh = h / 16;
    for (let r = 0; r < 16; r++) {
      const off = (r % 2) * (w / 8);
      for (let c = -1; c < 8; c++) {
        const x = c * (w / 8) + off + 3, y = r * bh + 3, bw = w / 8 - 6, bhh = bh - 6;
        g.fillStyle = `rgb(${randi(78, 122)},${randi(48, 78)},${randi(38, 62)})`;
        g.fillRect(x, y, bw, bhh);
        g.fillStyle = `rgba(0,0,0,${rand(0.05, 0.22)})`;
        g.fillRect(x, y, bw, bhh);
      }
    }
    streaks(g, w, h, 40, '26,18,14', 0.3);
    mossSpecks(g, w, h, 40, [[56, 80, 42]], 0.5);
    cracks(g, w, h, 16, '30,20,16', 0.4);
  }, { repeat: [2, 2], strength: 3.2, roughLo: 0.72, roughHi: 1 });

  ENV.rustMetal = pbrSet(256, 256, (g, w, h) => {
    grain(g, w, h, [92, 90, 88], 8, 2);
    blotches(g, w, h, 90, '122,62,28', 0.6);
    blotches(g, w, h, 60, '58,34,18', 0.5);
    streaks(g, w, h, 34, '84,44,20', 0.35);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${randi(120, 170)},${randi(60, 96)},${randi(30, 56)},${rand(0.15, 0.6)})`;
      g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 4));
    }
  }, { repeat: [1, 1], strength: 2.0, roughLo: 0.45, roughHi: 0.95 });

  // --- alpha decals ------------------------------------------------------
  const alphaTex = (w, h, draw) => {
    const c = drawToCanvas(w, h, draw);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  ENV.decalCrack = alphaTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    cracks(g, w, h, 12, '14,13,12', 0.8, [1, 3.4]);
  });
  ENV.decalStain = alphaTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    blotches(g, w, h, 26, '22,20,18', 0.55, 20, 90);
  });
  ENV.decalMoss = alphaTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    mossSpecks(g, w, h, 60, [[52, 84, 40], [66, 100, 44], [40, 68, 34]], 0.8);
  });
  ENV.decalPuddle = alphaTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(18,24,30,.92)');
    gr.addColorStop(0.7, 'rgba(22,28,34,.55)');
    gr.addColorStop(1, 'rgba(22,28,34,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.46, h * 0.36, rand(0, 3), 0, 7); g.fill();
  });
  ENV.decalRubble = alphaTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${randi(80, 140)},${randi(76, 132)},${randi(70, 124)},${rand(0.3, 0.9)})`;
      g.save(); g.translate(rand(0, w), rand(0, h)); g.rotate(rand(0, 7));
      g.fillRect(0, 0, rand(2, 9), rand(2, 7));
      g.restore();
    }
  });

  // --- foliage cards -----------------------------------------------------
  ENV.grassCard = alphaTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rand(8, w - 8), bend = rand(-24, 24), hh = rand(h * 0.45, h * 0.95);
      const c = choice([[70, 100, 46], [92, 120, 52], [56, 84, 40], [110, 116, 58]]);
      g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${rand(0.7, 1)})`;
      g.lineWidth = rand(1.4, 3.4); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, h);
      g.quadraticCurveTo(x + bend * 0.4, h - hh * 0.6, x + bend, h - hh);
      g.stroke();
    }
  });
  ENV.leafCard = alphaTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const c = choice([[34, 66, 38], [46, 84, 44], [28, 54, 32], [58, 92, 46]]);
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${rand(0.55, 1)})`;
      g.save(); g.translate(rand(0, w), rand(0, h)); g.rotate(rand(0, 7));
      g.beginPath(); g.ellipse(0, 0, rand(5, 16), rand(3, 8), 0, 0, 7); g.fill();
      g.restore();
    }
  });
  ENV.fernCard = alphaTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let f = 0; f < 6; f++) {
      const bx = rand(20, w - 20), a = rand(-1.1, 1.1) - Math.PI / 2, len = rand(h * 0.5, h * 0.9);
      const c = choice([[48, 86, 44], [62, 100, 48], [38, 70, 38]]);
      g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},.95)`;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx, h); g.lineTo(bx + Math.cos(a) * len, h + Math.sin(a) * len); g.stroke();
      for (let k = 1; k < 9; k++) {
        const t = k / 9, px = bx + Math.cos(a) * len * t, py = h + Math.sin(a) * len * t;
        const s = (1 - t) * 14 + 4;
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + s, py - s * 0.5); g.stroke();
        g.beginPath(); g.moveTo(px, py); g.lineTo(px - s, py - s * 0.5); g.stroke();
      }
    }
  });
  ENV.vineCard = alphaTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let v = 0; v < 5; v++) {
      const x0 = rand(10, w - 10);
      g.strokeStyle = 'rgba(46,62,34,.9)'; g.lineWidth = rand(1.5, 3);
      g.beginPath(); g.moveTo(x0, 0);
      let x = x0;
      for (let y = 0; y < h; y += 16) { x += rand(-7, 7); g.lineTo(x, y); }
      g.stroke();
      for (let k = 0; k < 24; k++) {
        const y = rand(0, h);
        g.fillStyle = `rgba(${randi(40, 80)},${randi(70, 110)},${randi(36, 60)},${rand(0.6, 1)})`;
        g.save(); g.translate(x0 + rand(-14, 14), y); g.rotate(rand(0, 7));
        g.beginPath(); g.ellipse(0, 0, rand(4, 9), rand(2, 5), 0, 0, 7); g.fill();
        g.restore();
      }
    }
  });

  return ENV;
}

// --------------------------------------------------------------- primitives

const _v = (x, y, z) => new THREE.Vector3(x, y, z);

/** Irregular boulder geometry (deformed icosahedron). */
export function boulderGeo(r, detail = 1, squash = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + rand(-0.22, 0.22);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Flat decal quad laid on the floor (or a wall). Visual only. */
export function decal(level, map, x, z, size, { y = 0.045, rotY = rand(0, 7), opacity = 0.85, color = 0xffffff, depthWrite = false } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map, transparent: true, opacity, color, depthWrite, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = rotY;
  m.position.set(x, y, z);
  m.renderOrder = 1;
  level.add(m);
  return m;
}

/**
 * Scatter many floor decals as ONE instanced draw call (shared material).
 * pick() returns [x, z] or null to skip.
 */
export function decalField(level, map, n, pick, { min = 1.6, max = 5, y = 0.045, opacity = 0.7, color = 0xffffff } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map, transparent: true, opacity, color, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const im = instanced(level, geo, mat, n, (i, d) => {
    const p = pick();
    if (!p) return false;
    const s = rand(min, max);
    d.position.set(p[0], y + rand(0, 0.004), p[1]);
    d.rotation.set(0, rand(0, 7), 0);
    d.scale.set(s, 1, s * rand(0.75, 1.25));
  }, { shadow: false });
  if (im) { im.receiveShadow = false; im.renderOrder = 1; }
  return im;
}

/** Instanced small debris field — one draw call. */
export function debrisField(level, n, pick, { mat, scale = [0.06, 0.26], y = 0 } = {}) {
  const geo = boulderGeo(1, 0, 0.7);
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.castShadow = true; im.receiveShadow = true;
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const p = pick();
    if (!p) continue;
    const s = rand(scale[0], scale[1]);
    d.position.set(p[0], y + s * 0.45, p[1]);
    d.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7));
    d.scale.set(s * rand(0.7, 1.4), s * rand(0.5, 1), s * rand(0.7, 1.4));
    d.updateMatrix();
    im.setMatrixAt(k++, d.matrix);
  }
  im.count = k;
  im.instanceMatrix.needsUpdate = true;
  level.add(im);
  return im;
}

/** Instanced cross-billboard vegetation (grass tufts / ferns / weeds). */
export function foliageField(level, map, n, pick, { size = [0.5, 1.3], color = 0xffffff, y = 0 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0, 0.5, 0);
  const b2 = base.clone(); b2.rotateY(Math.PI / 2);
  const geo = mergeGeoms([base, b2]);
  const mat = new THREE.MeshStandardMaterial({
    map, color, transparent: true, alphaTest: 0.32, side: THREE.DoubleSide,
    roughness: 1, metalness: 0, depthWrite: true,
  });
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.receiveShadow = true;
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const p = pick();
    if (!p) continue;
    const s = rand(size[0], size[1]);
    d.position.set(p[0], y, p[1]);
    d.rotation.set(0, rand(0, 7), 0);
    d.scale.set(s * rand(0.8, 1.3), s, s);
    d.updateMatrix();
    im.setMatrixAt(k++, d.matrix);
  }
  im.count = k;
  im.instanceMatrix.needsUpdate = true;
  level.add(im);
  return im;
}

function mergeGeoms(list) {
  // minimal position/uv/normal merge (all inputs are non-indexed-compatible planes)
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/**
 * Generic instanced scatter: one draw call for many copies of one geometry.
 * place(i, dummy) positions the THREE.Object3D dummy; return false to skip.
 */
export function instanced(level, geo, mat, n, place, { shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.castShadow = shadow; im.receiveShadow = shadow;
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    if (place(k, d) === false) continue;
    d.updateMatrix();
    im.setMatrixAt(k++, d.matrix);
  }
  im.count = k;
  im.instanceMatrix.needsUpdate = true;
  if (k === 0) { geo.dispose(); return null; }
  level.add(im);
  return im;
}

/** Register a per-frame visual updater on a level (drained by BaseLevel.update). */
export function addUpdater(level, fn) {
  (level.envUpdaters = level.envUpdaters || []).push(fn);
  return fn;
}

// --------------------------------------------------------------- props

export function rubblePile(level, x, z, radius, mat, count = 14) {
  const im = instanced(level, boulderGeo(1, 0, 0.65), mat, count, (i, d) => {
    const s = rand(0.12, 0.5) * radius;
    const a = rand(0, 7), r = Math.sqrt(Math.random()) * radius;
    d.position.set(x + Math.cos(a) * r, s * rand(0.25, 0.7), z + Math.sin(a) * r);
    d.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7));
    d.scale.set(s * rand(0.8, 1.3), s * rand(0.6, 1), s * rand(0.8, 1.3));
  });
  return im;
}

/** A collapsed chunk of wall — jagged top edge built from stacked blocks. */
export function brokenWall(level, x, z, width, height, rotY, mat, thickness = 0.55) {
  const cols = Math.max(3, Math.round(width / 0.9));
  const cw = width / cols;
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  const im = instanced(level, new THREE.BoxGeometry(1, 1, 1), mat, cols, (i, d) => {
    const hh = height * clamp(0.35 + Math.sin(i * 1.7) * 0.28 + rand(-0.18, 0.28), 0.12, 1);
    const lx = -width / 2 + cw * (i + 0.5), lz = rand(-0.05, 0.05);
    d.position.set(x + lx * cos + lz * sin, hh / 2, z - lx * sin + lz * cos);
    d.rotation.y = rotY + rand(-0.03, 0.03);
    d.scale.set(cw * 1.02, hh, thickness * rand(0.85, 1.15));
  });
  return im;
}

export function deadTree(level, x, z, scale = 1, mat) {
  const grp = new THREE.Group();
  const h = rand(3.4, 5.6) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * scale, 0.26 * scale, h, 7), mat);
  trunk.position.y = h / 2; trunk.castShadow = true; grp.add(trunk);
  const nb = randi(3, 6);
  for (let i = 0; i < nb; i++) {
    const bl = rand(0.8, 2.0) * scale;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * scale, 0.09 * scale, bl, 5), mat);
    const a = rand(0, 7), tilt = rand(0.5, 1.15);
    b.position.set(Math.cos(a) * bl * 0.35, h * rand(0.5, 0.95), Math.sin(a) * bl * 0.35);
    b.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    b.castShadow = true;
    grp.add(b);
  }
  grp.position.set(x, 0, z);
  grp.rotation.y = rand(0, 7);
  level.add(grp);
  return grp;
}

/** Layered conifer/broadleaf tree with drooping canopy tiers (denser silhouette). */
export function detailTree(level, x, z, { h = 3.4, r = 1.7, trunkMat, crownMat, tiers = 3, lean = 0.05 } = {}) {
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.2, h, 8), trunkMat);
  trunk.position.y = h / 2; trunk.castShadow = true; trunk.receiveShadow = true; grp.add(trunk);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const cr = r * (1 - t * 0.42) * rand(0.9, 1.1);
    const ch = cr * rand(1.6, 2.3);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, ch, 8), crownMat);
    cone.position.y = h * 0.72 + i * cr * 0.82;
    cone.rotation.y = rand(0, 7);
    cone.castShadow = true;
    grp.add(cone);
  }
  grp.position.set(x, 0, z);
  grp.rotation.z = rand(-lean, lean);
  grp.rotation.x = rand(-lean, lean);
  level.add(grp);
  return grp;
}

/**
 * Dense instanced forest: 1 draw call for trunks + 1 per canopy material.
 * Visual only — registers no colliders.
 */
export function treeField(level, n, pick, { trunkMat, crownMats = [], h = [3.2, 6.4], r = [1.4, 2.6], tiers = 3 } = {}) {
  const out = [];
  const picks = [];
  for (let i = 0; i < n * 3 && picks.length < n; i++) {
    const p = pick();
    if (p) picks.push([p[0], p[1], rand(h[0], h[1]), rand(r[0], r[1]), rand(0, 7), rand(-0.05, 0.05)]);
  }
  if (!picks.length) return out;
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.2, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  out.push(instanced(level, trunkGeo, trunkMat, picks.length, (i, d) => {
    const [x, z, th, tr, ry, lean] = picks[i];
    d.position.set(x, 0, z);
    d.rotation.set(lean, ry, lean * 0.6);
    d.scale.set(tr * 1.3, th, tr * 1.3);
  }));
  const coneGeo = new THREE.ConeGeometry(1, 2, 8);
  coneGeo.translate(0, 1, 0);
  const mats = crownMats.length ? crownMats : [trunkMat];
  for (let mi = 0; mi < mats.length; mi++) {
    const slots = [];
    for (let i = 0; i < picks.length; i++) {
      if (i % mats.length !== mi) continue;
      for (let t = 0; t < tiers; t++) slots.push([picks[i], t]);
    }
    if (!slots.length) continue;
    out.push(instanced(level, coneGeo, mats[mi], slots.length, (k, d) => {
      const [[x, z, th, tr, ry, lean], t] = slots[k];
      const cr = tr * (1 - (t / tiers) * 0.42) * rand(0.9, 1.1);
      d.position.set(x + lean * 2, th * 0.66 + t * cr * 0.84, z + lean * 2);
      d.rotation.set(lean, ry + t, lean * 0.5);
      d.scale.set(cr, cr * rand(0.85, 1.15), cr);
    }));
  }
  return out.filter(Boolean);
}

/** Instanced stalagmite / stalactite field (1 draw call). */
export function spikeField(level, n, pick, { mat, h = [0.7, 3.2], r = [0.16, 0.6], down = false, y = 0 } = {}) {
  const geo = new THREE.ConeGeometry(1, 1, 7);
  geo.translate(0, down ? -0.5 : 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { pos.setX(i, pos.getX(i) * rand(0.82, 1.2)); pos.setZ(i, pos.getZ(i) * rand(0.82, 1.2)); }
  geo.computeVertexNormals();
  return instanced(level, geo, mat, n, (i, d) => {
    const p = pick();
    if (!p) return false;
    const hh = rand(h[0], h[1]), rr = rand(r[0], r[1]);
    d.position.set(p[0], y, p[1]);
    d.rotation.set(rand(-0.06, 0.06), rand(0, 7), rand(-0.06, 0.06));
    d.scale.set(rr, hh, rr);
  });
}

/** Hanging cable between two points (catenary). */
export function wire(level, a, b, sag = 1.2, color = 0x14161a) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 5, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.3 }));
  m.castShadow = true;
  level.add(m);
  return m;
}

/** Stone/cave spike (stalagmite up, stalactite down). */
export function spike(level, x, y, z, r, h, mat, down = false) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 2), mat);
  const p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) * rand(0.8, 1.2));
    p.setZ(i, p.getZ(i) * rand(0.8, 1.2));
  }
  m.geometry.computeVertexNormals();
  if (down) m.rotation.x = Math.PI;
  m.position.set(x, y, z);
  m.rotation.y = rand(0, 7);
  m.castShadow = true; m.receiveShadow = true;
  level.add(m);
  return m;
}

/** Emissive crystal cluster (decor only). */
export function crystalCluster(level, x, z, color, scale = 1, count = 5, withLight = true) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1016, emissive: color, emissiveIntensity: rand(0.9, 1.7),
    roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.92,
  });
  for (let i = 0; i < count; i++) {
    const s = rand(0.1, 0.3) * scale;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), mat);
    c.scale.y = rand(1.8, 3.4);
    c.position.set(rand(-0.4, 0.4) * scale, s * rand(0.6, 1.4), rand(-0.4, 0.4) * scale);
    c.rotation.set(rand(-0.3, 0.3), rand(0, 7), rand(-0.3, 0.3));
    grp.add(c);
  }
  if (withLight) {
    const li = new THREE.PointLight(color, 0.55 * scale, 7 * scale, 1.8);
    li.position.y = 0.6 * scale;
    grp.add(li);
    const ph = rand(0, 7);
    addUpdater(level, (dt, t) => { li.intensity = (0.45 + 0.18 * Math.sin(t * 1.3 + ph)) * scale; });
  }
  grp.position.set(x, 0, z);
  level.add(grp);
  return grp;
}

/** Soft additive light shaft / god ray cone. */
export function lightShaft(level, x, y, z, rTop, rBot, h, color = 0xffd9a0, opacity = 0.05, tilt = [0, 0]) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.set(x, y, z);
  m.rotation.x = tilt[0]; m.rotation.z = tilt[1];
  m.renderOrder = 3;
  level.add(m);
  const ph = rand(0, 7);
  addUpdater(level, (dt, t) => { m.material.opacity = opacity * (0.82 + 0.18 * Math.sin(t * 0.5 + ph)); });
  return m;
}

/** Drifting dust / pollen / ash particles inside a box region. */
export function dustMotes(level, { count = 160, center = _v(0, 0, 0), size = _v(60, 8, 60), color = 0xd8cfc0, pointSize = 0.055, speed = 0.25, opacity = 0.32 } = {}) {
  const pos = new Float32Array(count * 3);
  const base = [];
  for (let i = 0; i < count; i++) {
    const x = center.x + rand(-size.x / 2, size.x / 2);
    const y = center.y + rand(0.2, size.y);
    const z = center.z + rand(-size.z / 2, size.z / 2);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    base.push([x, y, z, rand(0, 7), rand(0.4, 1.5)]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color, size: pointSize, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true,
  }));
  pts.frustumCulled = false;
  level.add(pts);
  addUpdater(level, (dt, t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const [bx, by, bz, ph, sp] = base[i];
      a[i * 3] = bx + Math.sin(t * speed * sp + ph) * 1.8;
      a[i * 3 + 1] = center.y + 0.15 + ((by + t * speed * 0.5 * sp) % size.y);
      a[i * 3 + 2] = bz + Math.cos(t * speed * 0.7 * sp + ph) * 1.8;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}

/** Low ground mist: a few soft additive planes hugging the floor. */
export function groundMist(level, { center = _v(0, 0, 0), radius = 50, layers = 5, color = 0xb9c6cf, opacity = 0.055, y = 0.7 } = {}) {
  const c = drawToCanvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 28; i++) {
      const x = rand(0, w), yy = rand(0, h), r = rand(30, 90);
      const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
      gr.addColorStop(0, `rgba(255,255,255,${rand(0.05, 0.16)})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, yy, r, 0, 7); g.fill();
    }
  });
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const grp = new THREE.Group();
  const planes = [];
  for (let i = 0; i < layers; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.1, radius * 2.1),
      new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y + i * rand(0.4, 1.1);
    m.material.map = map.clone();
    m.material.map.needsUpdate = true;
    m.material.map.repeat.set(2, 2);
    m.renderOrder = 2;
    planes.push({ m, sp: rand(0.004, 0.014) * (i % 2 ? 1 : -1) });
    grp.add(m);
  }
  grp.position.set(center.x, 0, center.z);
  level.add(grp);
  addUpdater(level, (dt) => {
    for (const p of planes) { p.m.material.map.offset.x += p.sp * dt; p.m.material.map.offset.y += p.sp * 0.6 * dt; }
  });
  return grp;
}

/** Distant silhouette ring of ridges/mountains — makes the world read as larger. */
export function mountainRing(level, { radius = 240, count = 34, hMin = 22, hMax = 80, color = 0x1b2230, y = -4, spread = 0.85 } = {}) {
  const geos = [];
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.06, 0.06);
    const r = radius * rand(spread, 1.15);
    const h = rand(hMin, hMax);
    const w = rand(h * 1.1, h * 2.4);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    const steps = randi(3, 6);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      shape.lineTo(-w / 2 + w * t + rand(-w * 0.06, w * 0.06), h * Math.sin(t * Math.PI) * rand(0.7, 1.05));
    }
    shape.lineTo(w / 2, 0);
    shape.lineTo(-w / 2, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    m.lookAt(0, y + h * 0.3, 0);
    grp.add(m);
  }
  level.add(grp);
  return grp;
}

/** Distant city blocks (boxes) far beyond the playable area. */
export function distantBlocks(level, { count = 40, inner = 120, outer = 230, hMin = 10, hMax = 46, color = 0x252b38, center = _v(0, 0, 0), arc = [0, Math.PI * 2] } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const im = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = rand(arc[0], arc[1]);
    const r = rand(inner, outer);
    const h = rand(hMin, hMax);
    d.position.set(center.x + Math.cos(a) * r, h / 2 - 1, center.z + Math.sin(a) * r);
    d.rotation.set(0, rand(0, 7), 0);
    d.scale.set(rand(8, 22), h, rand(8, 22));
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
  level.add(im);
  return im;
}

/** Configure a directional light as a proper shadow-casting key light. */
export function configureSun(light, { size = 70, near = 1, far = 220, mapSize = 2048, bias = -0.0006, radius = 2.4 } = {}, quality = 'high') {
  if (quality === 'low') { light.castShadow = false; return light; }
  light.castShadow = true;
  const ms = quality === 'medium' ? Math.min(1024, mapSize) : mapSize;
  light.shadow.mapSize.set(ms, ms);
  const c = light.shadow.camera;
  c.left = -size; c.right = size; c.top = size; c.bottom = -size;
  c.near = near; c.far = far;
  c.updateProjectionMatrix();
  light.shadow.bias = bias;
  light.shadow.normalBias = 0.035;
  light.shadow.radius = radius;
  return light;
}
