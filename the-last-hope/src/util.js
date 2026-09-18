import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function distToSeg2D(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// circle (px,pz,r) vs AABB {x0,z0,x1,z1} push-out. returns [nx,nz] or null
export function resolveCircleRect(px, pz, r, rect) {
  const cx = clamp(px, rect.x0, rect.x1), cz = clamp(pz, rect.z0, rect.z1);
  const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (r - d) / d; return [px + dx * p, pz + dz * p]; }
  const l = px - rect.x0, rg = rect.x1 - px, tp = pz - rect.z0, bt = rect.z1 - pz;
  const m = Math.min(l, rg, tp, bt);
  if (m === l) return [rect.x0 - r, pz];
  if (m === rg) return [rect.x1 + r, pz];
  if (m === tp) return [px, rect.z0 - r];
  return [px, rect.z1 + r];
}

// ---------------- canvas texture helpers ----------------

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function canvasTexture(w, h, draw, opts = {}) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.anisotropy = 4;
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fillNoise(g, w, h, base, amp, cell = 2) {
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    const v = rand(-amp, amp);
    g.fillStyle = `rgba(${clamp(base[0] + v, 0, 255) | 0},${clamp(base[1] + v, 0, 255) | 0},${clamp(base[2] + v, 0, 255) | 0},1)`;
    g.fillRect(x, y, cell, cell);
  }
}

function grime(g, w, h, n = 260, col = '0,0,0', aMax = 0.16) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${col},${rand(0.02, aMax)})`;
    const r = rand(2, 26);
    g.beginPath(); g.arc(rand(0, w), rand(0, h), r, 0, 7); g.fill();
  }
}

// ---------------- runes ----------------

export const RUNES = ['leaf', 'moon', 'star', 'eye', 'wave', 'flame'];
export const RUNE_NAMES = { leaf: 'LEAF', moon: 'MOON', star: 'STAR', eye: 'EYE', wave: 'WAVE', flame: 'FLAME' };

export function drawRune(g, id, x, y, s, color, lw) {
  g.save();
  g.strokeStyle = color; g.fillStyle = color;
  g.lineWidth = lw || Math.max(2, s * 0.1);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = s * 0.35;
  switch (id) {
    case 'leaf': {
      g.beginPath();
      g.moveTo(x, y - s);
      g.quadraticCurveTo(x + s * 0.95, y - s * 0.25, x, y + s);
      g.quadraticCurveTo(x - s * 0.95, y - s * 0.25, x, y - s);
      g.stroke();
      g.beginPath(); g.moveTo(x, y - s * 0.72); g.lineTo(x, y + s * 0.72); g.stroke();
      g.lineWidth *= 0.6;
      g.beginPath(); g.moveTo(x, y - s * 0.2); g.lineTo(x + s * 0.4, y - s * 0.45); g.stroke();
      g.beginPath(); g.moveTo(x, y + s * 0.15); g.lineTo(x - s * 0.4, y - s * 0.1); g.stroke();
      break;
    }
    case 'moon': {
      g.beginPath(); g.arc(x, y, s * 0.9, 0, Math.PI * 2); g.fill();
      g.save(); g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(x + s * 0.45, y - s * 0.12, s * 0.78, 0, Math.PI * 2); g.fill();
      g.restore();
      break;
    }
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const a2 = a + Math.PI / 5;
        const ox = x + Math.cos(a) * s, oy = y + Math.sin(a) * s;
        const ix = x + Math.cos(a2) * s * 0.45, iy = y + Math.sin(a2) * s * 0.45;
        if (i === 0) g.moveTo(ox, oy); else g.lineTo(ox, oy);
        g.lineTo(ix, iy);
      }
      g.closePath(); g.stroke();
      break;
    }
    case 'eye': {
      g.beginPath(); g.ellipse(x, y, s, s * 0.55, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'wave': {
      for (let k = -1; k <= 1; k += 2) {
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, px = x - s + t * s * 2;
          const py = y + k * s * 0.38 + Math.sin(t * Math.PI * 2) * s * 0.22;
          i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.stroke();
      }
      break;
    }
    case 'flame': {
      g.beginPath();
      g.moveTo(x, y - s);
      g.bezierCurveTo(x + s * 0.85, y - s * 0.15, x + s * 0.55, y + s * 0.65, x, y + s);
      g.bezierCurveTo(x - s * 0.55, y + s * 0.65, x - s * 0.85, y - s * 0.15, x, y - s);
      g.stroke();
      g.lineWidth *= 0.6;
      g.beginPath();
      g.moveTo(x, y - s * 0.3);
      g.quadraticCurveTo(x + s * 0.35, y + s * 0.15, x, y + s * 0.55);
      g.quadraticCurveTo(x - s * 0.35, y + s * 0.15, x, y - s * 0.3);
      g.stroke();
      break;
    }
  }
  g.restore();
}

const runeURLCache = {};
export function runeDataURL(id, color = '#8fe3ff', size = 96) {
  const key = id + color + size;
  if (runeURLCache[key]) return runeURLCache[key];
  const c = makeCanvas(size, size), g = c.getContext('2d');
  drawRune(g, id, size / 2, size / 2, size * 0.32, color);
  return runeURLCache[key] = c.toDataURL();
}

export function runeTexture(id, fg = '#8fe3ff', opts = {}) {
  return canvasTexture(256, 256, (g, w, h) => {
    fillNoise(g, w, h, opts.bg || [24, 28, 34], 10, 3);
    drawRune(g, id, w / 2, h / 2, 78, fg);
  });
}

// stone tablet / mural with a row of runes
export function runeStripTexture(ids, opts = {}) {
  const w = 512, h = 200;
  return canvasTexture(w, h, (g) => {
    fillNoise(g, w, h, opts.bg || [28, 26, 24], 12, 3);
    grime(g, w, h, 120, '0,0,0', 0.25);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeStyle = opts.frame || 'rgba(255,196,107,.35)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
    const n = ids.length, span = w / (n + 1);
    const col = opts.fg || '#ffc46b';
    ids.forEach((id, i) => {
      drawRune(g, id, span * (i + 1), h / 2, 44, col);
      if (i < n - 1) {
        g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.25)';
        g.beginPath(); g.moveTo(span * (i + 1.5) - 6, h / 2 - 8); g.lineTo(span * (i + 1.5) + 8, h / 2); g.lineTo(span * (i + 1.5) - 6, h / 2 + 8); g.closePath(); g.fill();
        g.restore();
      }
    });
    if (opts.caption) {
      g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.4)';
      g.font = '16px monospace'; g.textAlign = 'center';
      g.fillText(opts.caption, w / 2, h - 26); g.restore();
    }
  });
}

// ---------------- shared texture set ----------------

export const TEX = {};

export function initTextures() {
  TEX.concrete = canvasTexture(256, 256, (g, w, h) => { fillNoise(g, w, h, [96, 92, 86], 14); grime(g, w, h); });
  TEX.groundCity = canvasTexture(256, 256, (g, w, h) => { fillNoise(g, w, h, [74, 70, 64], 12); grime(g, w, h, 200); }, { repeat: [24, 24] });
  TEX.rock = canvasTexture(256, 256, (g, w, h) => {
    fillNoise(g, w, h, [72, 72, 78], 18, 3); grime(g, w, h, 200, '0,0,0', 0.3);
    g.strokeStyle = 'rgba(20,20,24,.5)';
    for (let i = 0; i < 22; i++) { g.lineWidth = rand(1, 2.5); g.beginPath(); let x = rand(0, w), y = rand(0, h); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); } g.stroke(); }
  }, { repeat: [6, 6] });
  TEX.groundForest = canvasTexture(256, 256, (g, w, h) => {
    fillNoise(g, w, h, [46, 56, 40], 12);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${randi(20, 60)},${randi(48, 86)},${randi(24, 50)},.5)`; g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 4)); }
  }, { repeat: [20, 20] });
  TILES(TEX);
  FACADES(TEX);
  TEX.road = canvasTexture(256, 256, (g, w, h) => {
    fillNoise(g, w, h, [52, 52, 54], 8);
    g.fillStyle = 'rgba(200,190,90,.55)'; g.fillRect(w / 2 - 3, 20, 6, 90); g.fillRect(w / 2 - 3, 150, 6, 90);
    grime(g, w, h, 160, '0,0,0', 0.3);
  }, { repeat: [1, 10] });
  TEX.skyCity = skyTexture(['#171d29', '#3a3f4d', '#6e5f4e', '#8a6f52']);
  TEX.skyForest = skyTexture(['#060b12', '#11202a', '#1c3328', '#234534']);
  TEX.skyGateNight = skyTexture(['#020208', '#120e2a', '#2c1d52', '#4a2f6e']);
  TEX.skyGateDawn = skyTexture(['#2c4a72', '#7d92b8', '#e8b878', '#ffd9a0']);
}

function skyTexture(stops) {
  return canvasTexture(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { srgb: true });
}

function FACADES(TEX) {
  const mk = (base, win, litProb, broken) => canvasTexture(256, 512, (g, w, h) => {
    fillNoise(g, w, h, base, 10, 4);
    const cols = 6, rows = 12, ww = w / cols, hh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * ww + ww * 0.22, y = r * hh + hh * 0.24, sw = ww * 0.56, sh = hh * 0.5;
      const brk = Math.random() < broken;
      g.fillStyle = brk ? '#0a0c0e' : (Math.random() < litProb ? win : '#14181d');
      g.fillRect(x, y, sw, sh);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.strokeRect(x, y, sw, sh);
      if (brk) { g.strokeStyle = 'rgba(120,130,140,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sw, y + sh); g.moveTo(x + sw, y); g.lineTo(x, y + sh); g.stroke(); }
    }
    grime(g, w, h, 300, '0,0,0', 0.28);
    // streaks
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,.12)'; const x = rand(0, w); g.fillRect(x, rand(0, h * .5), rand(2, 6), rand(30, 150)); }
  });
  TEX.facadeA = mk([94, 96, 100], '#3d3423', 0.06, 0.25);
  TEX.facadeB = mk([78, 84, 92], '#2e3c46', 0.04, 0.35);
  TEX.facadeC = mk([58, 56, 54], '#1c1e22', 0.02, 0.5);
}

function TILES(TEX) {
  TEX.tiles = canvasTexture(512, 512, (g, w, h) => {
    fillNoise(g, w, h, [64, 60, 74], 10, 4);
    g.strokeStyle = 'rgba(20,18,30,.7)'; g.lineWidth = 2;
    const n = 8, s = w / n;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    g.strokeStyle = 'rgba(150,130,220,.18)';
    for (let r = 1; r <= 3; r++) { g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, r * 78, 0, 7); g.stroke(); }
    grime(g, w, h, 200, '0,0,0', 0.3);
  }, { repeat: [16, 16] });
}

// skyline silhouette texture (city seen from gate) — lit & unlit variants
export function skylineTexture(lit) {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = rand(28, 90), bh = rand(h * 0.25, h * 0.9);
      g.fillStyle = '#0b0e14';
      g.fillRect(x, h - bh, bw, bh);
      if (lit) {
        for (let wx = x + 4; wx < x + bw - 6; wx += 9) for (let wy = h - bh + 6; wy < h - 8; wy += 12) {
          if (Math.random() < 0.35) { g.fillStyle = `rgba(255,${randi(180, 220)},${randi(90, 140)},${rand(.5, 1)})`; g.fillRect(wx, wy, 4, 5); }
        }
      } else if (Math.random() < 0.10) {
        g.fillStyle = 'rgba(90,60,40,.5)';
        g.fillRect(x + rand(4, bw - 8), h - rand(20, bh), 4, 5);
      }
      x += bw + rand(2, 10);
    }
  });
}
