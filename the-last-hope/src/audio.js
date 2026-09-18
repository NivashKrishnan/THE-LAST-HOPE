// Fully synthesized WebAudio sound system — no external assets.
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.volume = 0.8;
    this.ambient = null; this.signalTimer = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  _env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }

  tone({ f = 440, f1 = 0, type = 'sine', t = 0, a = 0.01, d = 0.25, v = 0.2 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + t;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + d);
    const g = c.createGain(); this._env(g, t0, a, v, d);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + a + d + 0.1);
  }

  noise({ f = 800, q = 1, type = 'bandpass', t = 0, a = 0.005, d = 0.15, v = 0.3, rate = 1 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.playbackRate.value = rate;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = c.createGain(); this._env(g, t0, a, v, d);
    s.connect(flt); flt.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + a + d + 0.1);
  }

  // ---------- one-shots ----------
  footstep(run = false) { this.noise({ f: rand(280, 560), d: 0.08, v: run ? 0.14 : 0.10, rate: rand(0.8, 1.25) }); }
  land() { this.noise({ f: 220, d: 0.18, v: 0.22, rate: 0.7 }); }
  jump() { this.noise({ f: 900, d: 0.12, v: 0.05, rate: 1.4 }); }
  interact() { this.tone({ f: 660, f1: 990, type: 'square', d: 0.09, v: 0.08 }); this.noise({ f: 2400, d: 0.04, v: 0.05 }); }
  uiHover() { this.tone({ f: 1800, d: 0.04, v: 0.03 }); }
  uiClick() { this.tone({ f: 990, f1: 1320, type: 'triangle', d: 0.07, v: 0.08 }); }
  petaloBlip() { this.tone({ f: 1245, d: 0.06, v: 0.09 }); this.tone({ f: 1660, d: 0.1, t: 0.08, v: 0.09 }); }
  clueFound() {
    [880, 1174.7, 1568].forEach((f, i) => this.tone({ f, d: 0.3, t: i * 0.09, v: 0.1 }));
    this.noise({ f: 6000, d: 0.5, v: 0.03 });
  }
  success() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone({ f, d: 0.9, t: i * 0.09, v: 0.14 }));
    this.noise({ f: 5000, d: 1.4, v: 0.04, a: 0.3 });
  }
  fail() {
    this.tone({ f: 98, type: 'sawtooth', d: 0.4, v: 0.16 });
    this.tone({ f: 104, type: 'sawtooth', d: 0.4, v: 0.16 });
    this.noise({ f: 300, d: 0.3, v: 0.1 });
  }
  gateOpen() {
    this.tone({ f: 55, f1: 34, type: 'sine', d: 2.6, v: 0.5, a: 0.15 });
    this.noise({ f: 260, f1: 0, type: 'lowpass', d: 2.8, v: 0.35, a: 0.2, rate: 0.6 });
  }
  strikeCrystal(idx) {
    const fs = [523.25, 587.33, 698.46, 783.99, 880, 1046.5];
    const f = fs[idx % fs.length];
    this.tone({ f, type: 'triangle', d: 1.1, v: 0.2 });
    this.tone({ f: f * 2.01, d: 0.7, v: 0.06 });
  }
  signalPing(v = 0.07) {
    this.tone({ f: 1320, d: 1.1, v });
    this.tone({ f: 1760, d: 1.3, t: 0.14, v: v * 0.7 });
  }
  signalActivation() {
    [392, 523.25, 659.25, 880, 1174.7, 1568].forEach((f, i) => this.tone({ f, d: 0.8, t: i * 0.07, v: 0.12 }));
    this.noise({ f: 3000, d: 1.8, a: 0.4, v: 0.05 });
  }
  restoration() {
    [130.8, 196, 261.6, 329.6, 392].forEach((f, i) => this.tone({ f, d: 6, a: 1.6, t: i * 0.2, v: 0.12 }));
    for (let i = 0; i < 12; i++) this.tone({ f: 523.25 * Math.pow(1.3348, i % 6) * (i > 5 ? 2 : 1), d: 0.7, t: 1 + i * 0.28, v: 0.07 });
    this.noise({ f: 2000, d: 5, a: 2, v: 0.045 });
  }

  // ---------- combat & monster sounds ----------
  radioStatic(dur = 1.8) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 1.2;

    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1400, t0);
    flt.frequency.linearRampToValueAtTime(1900, t0 + dur * 0.5);
    flt.frequency.linearRampToValueAtTime(1200, t0 + dur);
    flt.Q.value = 2.4;

    const amOsc = c.createOscillator();
    amOsc.frequency.setValueAtTime(18, t0);
    amOsc.frequency.linearRampToValueAtTime(28, t0 + dur);

    const amGain = c.createGain();
    amGain.gain.value = 0.5;
    amOsc.connect(amGain.gain);

    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(0.24, t0 + 0.12);
    g.gain.setValueAtTime(0.22, t0 + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    s.connect(flt);
    flt.connect(amGain);
    amGain.connect(g);
    g.connect(this.master);

    s.start(t0);
    amOsc.start(t0);
    s.stop(t0 + dur);
    amOsc.stop(t0 + dur);
  }

  radioBeep() {
    this.tone({ f: 1760, d: 0.08, v: 0.14, type: 'sine' });
    this.tone({ f: 2640, d: 0.06, t: 0.09, v: 0.12, type: 'sine' });
  }

  runeChime(idx = 0) {
    const scales = [
      [587.33, 880, 1174.7], // D
      [659.25, 987.77, 1318.5], // E
      [783.99, 1174.7, 1568.0], // G
    ];
    const notes = scales[idx % scales.length];
    notes.forEach((f, i) => {
      this.tone({ f, type: 'triangle', d: 1.4, t: i * 0.08, v: 0.15, a: 0.01 });
      this.tone({ f: f * 2.01, type: 'sine', d: 0.9, t: i * 0.08, v: 0.05 });
    });
    this.noise({ f: 4800, d: 0.5, v: 0.04, a: 0.05 });
  }

  stoneRumble() {
    this.tone({ f: 65, f1: 32, type: 'sawtooth', d: 3.2, v: 0.45, a: 0.3 });
    this.tone({ f: 44, f1: 28, type: 'sine', d: 3.5, v: 0.4, a: 0.2 });
    this.noise({ f: 160, q: 0.8, type: 'lowpass', d: 3.4, v: 0.35, a: 0.25 });
  }

  katanaSwing(step = 1) {
    if (step === 1) {
      // High downward diagonal slash - brisk whoosh
      this.noise({ f: 1100, type: 'bandpass', q: 2.5, d: 0.18, v: 0.28, rate: 1.25 });
      this.tone({ f: 680, f1: 260, type: 'sine', d: 0.16, v: 0.12 });
    } else if (step === 2) {
      // Backhand horizontal cut - sharper whistling whip
      this.noise({ f: 1450, type: 'bandpass', q: 3.2, d: 0.17, v: 0.32, rate: 1.4 });
      this.tone({ f: 880, f1: 320, type: 'triangle', d: 0.15, v: 0.14 });
    } else {
      // Step 3: Powerful overhead cleave finisher - deep rushing roar whoosh
      this.noise({ f: 720, type: 'bandpass', q: 1.8, d: 0.28, v: 0.42, rate: 0.95 });
      this.tone({ f: 420, f1: 140, type: 'sawtooth', d: 0.26, v: 0.24, a: 0.02 });
      this.tone({ f: 110, f1: 50, type: 'sine', d: 0.3, v: 0.25 });
    }
  }

  katanaHit() {
    // Sharp razor steel bite + deep flesh impact + resonant vibration
    this.noise({ f: 2200, q: 4.2, d: 0.2, v: 0.42, rate: 1.4 });
    this.tone({ f: 460, f1: 90, type: 'sawtooth', d: 0.26, v: 0.38 });
    this.tone({ f: 880, f1: 440, type: 'triangle', d: 0.18, v: 0.25 });
    this.noise({ f: 280, d: 0.28, v: 0.38 });
  }

  katanaBlock() {
    // Sharp ringing metallic deflection clang
    this.tone({ f: 1950, f1: 2800, type: 'triangle', d: 0.45, v: 0.36 });
    this.tone({ f: 3600, d: 0.28, v: 0.24 });
    this.tone({ f: 540, type: 'sine', d: 0.35, v: 0.2 });
    this.noise({ f: 5200, q: 7, d: 0.18, v: 0.32 });
  }

  monsterStep() {
    this.noise({ f: 120, q: 0.8, type: 'lowpass', d: 0.24, v: 0.25, rate: 0.65 });
    this.tone({ f: 65, f1: 35, type: 'sine', d: 0.2, v: 0.2 });
  }

  monsterGrowl() {
    if (!this.ctx) return;
    const f0 = rand(70, 95);
    this.tone({ f: f0, f1: f0 * 0.8, type: 'sawtooth', d: 0.8, v: 0.26, a: 0.1 });
    this.noise({ f: 220, q: 2.5, d: 0.7, v: 0.22, rate: 0.7 });
  }

  monsterRoar() {
    if (!this.ctx) return;
    this.tone({ f: 120, f1: 55, type: 'sawtooth', d: 1.5, v: 0.38, a: 0.08 });
    this.tone({ f: 165, f1: 75, type: 'sawtooth', d: 1.4, v: 0.3, a: 0.1 });
    this.noise({ f: 450, q: 1.5, type: 'bandpass', d: 1.3, v: 0.32, a: 0.05 });
  }

  monsterHit() {
    this.tone({ f: 190, f1: 85, type: 'sawtooth', d: 0.28, v: 0.32 });
    this.noise({ f: 340, d: 0.25, v: 0.22 });
  }

  monsterDeath() {
    this.tone({ f: 140, f1: 30, type: 'sawtooth', d: 2.4, v: 0.45, a: 0.1 });
    this.tone({ f: 90, f1: 25, type: 'sine', d: 2.8, v: 0.4 });
    this.noise({ f: 250, q: 1.2, d: 2.2, v: 0.35, a: 0.2 });
  }

  switchClick() {
    this.tone({ f: 1200, f1: 600, type: 'square', d: 0.06, v: 0.14 });
    this.noise({ f: 1800, d: 0.08, v: 0.18 });
  }

  clockTick() {
    this.tone({ f: 2200, d: 0.03, v: 0.08 });
    this.noise({ f: 3200, d: 0.03, v: 0.05 });
  }

  clockChime() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({ f, type: 'triangle', d: 1.8, t: i * 0.22, v: 0.16, a: 0.01 });
      this.tone({ f: f * 2.02, d: 1.1, t: i * 0.22, v: 0.05 });
    });
  }

  generatorRumble() {
    this.tone({ f: 45, f1: 80, type: 'sawtooth', d: 1.8, v: 0.28, a: 0.3 });
    this.noise({ f: 140, q: 1, type: 'lowpass', d: 2.0, v: 0.35, a: 0.2 });
  }

  doorHeavy() {
    this.tone({ f: 50, f1: 38, type: 'sine', d: 2.2, v: 0.4, a: 0.1 });
    this.noise({ f: 200, type: 'lowpass', d: 2.2, v: 0.3, a: 0.15 });
  }

  startTension() {
    if (this._tensionOn || !this.ctx) return;
    this._tensionOn = true;
    const c = this.ctx;
    this.tensionGain = c.createGain();
    this.tensionGain.gain.setValueAtTime(0.0001, c.currentTime);
    this.tensionGain.gain.linearRampToValueAtTime(0.22, c.currentTime + 1.2);
    this.tensionGain.connect(this.master);

    // low pulsing drone
    this.tensionOsc1 = c.createOscillator();
    this.tensionOsc1.type = 'sawtooth';
    this.tensionOsc1.frequency.value = 52;

    this.tensionOsc2 = c.createOscillator();
    this.tensionOsc2.type = 'sine';
    this.tensionOsc2.frequency.value = 55;

    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 240;

    // heartbeat LFO
    this.tensionLfo = c.createOscillator();
    this.tensionLfo.frequency.value = 1.8;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.08;
    this.tensionLfo.connect(lfoG);
    lfoG.connect(this.tensionGain.gain);

    this.tensionOsc1.connect(flt);
    this.tensionOsc2.connect(flt);
    flt.connect(this.tensionGain);

    this.tensionOsc1.start();
    this.tensionOsc2.start();
    this.tensionLfo.start();
  }

  stopTension() {
    if (!this._tensionOn || !this.ctx) return;
    this._tensionOn = false;
    const c = this.ctx;
    if (this.tensionGain) {
      this.tensionGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.5);
      setTimeout(() => {
        try {
          this.tensionOsc1?.stop(); this.tensionOsc1?.disconnect();
          this.tensionOsc2?.stop(); this.tensionOsc2?.disconnect();
          this.tensionLfo?.stop(); this.tensionLfo?.disconnect();
        } catch {}
      }, 1600);
    }
  }

  // ---------- ambient loops ----------
  stopAmbient() {
    if (!this.ambient) return;
    try { this.ambient.stop(); } catch {}
    this.ambient = null;
  }

  startAmbient(name) {
    this.stopAmbient();
    if (!this.ctx) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master);
    const nodes = [out], timers = [];
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const flt = c.createBiquadFilter();
    src.connect(flt); flt.connect(out);
    let target = 0.1;
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.connect(lfoG); lfoG.connect(out.gain);

    if (name === 'city') {
      flt.type = 'lowpass'; flt.frequency.value = 320; target = 0.16;
      lfo.frequency.value = 0.07; lfoG.gain.value = 0.05;
    } else if (name === 'forest') {
      flt.type = 'bandpass'; flt.frequency.value = 700; flt.Q.value = 0.5; target = 0.09;
      lfo.frequency.value = 0.11; lfoG.gain.value = 0.04;
      timers.push(setInterval(() => {
        if (Math.random() < 0.4 && this.ctx) {
          const f0 = rand(2100, 3200);
          this.tone({ f: f0, f1: f0 * 1.3, d: 0.09, v: 0.028 });
          this.tone({ f: f0 * 1.2, d: 0.07, t: 0.14, v: 0.02 });
        }
      }, 1700));
    } else if (name === 'cave') {
      flt.type = 'lowpass'; flt.frequency.value = 130; target = 0.22;
      lfo.frequency.value = 0.05; lfoG.gain.value = 0.05;
      timers.push(setInterval(() => {
        if (Math.random() < 0.55 && this.ctx) {
          this.tone({ f: rand(1300, 1900), f1: 500, d: 0.16, v: 0.045 });
          this.tone({ f: rand(900, 1200), f1: 400, d: 0.14, t: 0.22, v: 0.02 });
        }
      }, 1400));
    } else if (name === 'cosmic') {
      flt.type = 'lowpass'; flt.frequency.value = 500; target = 0.06;
      lfo.frequency.value = 0.04; lfoG.gain.value = 0.02;
      [[110, 0.05], [164.8, 0.04], [220.5, 0.025]].forEach(([f, v]) => {
        const o = c.createOscillator(), g2 = c.createGain();
        o.type = 'sine'; o.frequency.value = f; o.detune.value = rand(-6, 6);
        g2.gain.value = v; o.connect(g2); g2.connect(out); o.start(); nodes.push(o, g2);
      });
      timers.push(setInterval(() => { if (this.ctx) this.tone({ f: rand(1200, 1600), d: 2.5, a: 0.8, v: 0.02 }); }, 4200));
    } else if (name === 'dawn') {
      flt.type = 'lowpass'; flt.frequency.value = 600; target = 0.07;
      lfo.frequency.value = 0.09; lfoG.gain.value = 0.02;
      timers.push(setInterval(() => {
        if (Math.random() < 0.5 && this.ctx) {
          const f0 = rand(2400, 3600);
          this.tone({ f: f0, f1: f0 * 1.4, d: 0.12, v: 0.03 });
          this.tone({ f: f0 * 1.1, f1: f0 * 0.9, d: 0.1, t: 0.16, v: 0.024 });
        }
      }, 1300));
    }

    nodes.push(src, flt, lfo, lfoG);
    src.start(); lfo.start();
    out.gain.linearRampToValueAtTime(target, c.currentTime + 2.5);
    this.ambient = {
      stop: () => {
        timers.forEach(clearInterval);
        out.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.6);
        setTimeout(() => { nodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch {} }); }, 800);
      }
    };
  }
}
