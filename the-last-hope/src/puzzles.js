import { RUNES, RUNE_NAMES, runeDataURL, sleep } from './util.js';

// ---------------------------------------------------------------------------
// PUZZLE 1 & 5 & 8 — SYMBOL PAD
// ---------------------------------------------------------------------------
export class SymbolPad {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.root = $('puzzle'); this.panel = $('puzPanel');
    this.titleEl = $('puzTitle'); this.hintEl = $('puzHint');
    this.slotsEl = $('puzSlots'); this.symsEl = $('puzSymbols'); this.msgEl = $('puzMsg');
    this.resolve = null; this.arr = []; this.solution = []; this.slotCount = 3;

    // Prevent clicks or mouse events on modal from leaking to canvas or combat
    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'contextmenu'].forEach((evt) => {
      this.root.addEventListener(evt, (e) => e.stopPropagation());
    });

    $('btnPuzClear').onclick = (e) => {
      e.stopPropagation();
      this.arr = [];
      this.render();
      this.msg('');
      game.audio.uiClick();
    };
    $('btnPuzConfirm').onclick = (e) => {
      e.stopPropagation();
      this.confirm();
    };
    $('btnPuzClose').onclick = (e) => {
      e.stopPropagation();
      this.close(false);
    };
  }

  open({ title = 'ANCIENT MECHANISM', hint = '', slots = 3, solution, failLines = null }) {
    this.game.openModal(this);
    this.titleEl.textContent = title;
    this.hintEl.textContent = hint;
    this.slotCount = slots;
    this.solution = solution;
    this.failLines = failLines;
    this.arr = [];
    this.attempts = 0;
    this.msg('');
    this.buildSymbols();
    this.render();
    this.panel.classList.remove('good', 'shake');
    this.root.classList.remove('hidden');
    return new Promise((res) => { this.resolve = res; });
  }

  buildSymbols() {
    this.symsEl.innerHTML = '';
    RUNES.forEach((id) => {
      const b = document.createElement('div');
      b.className = 'puzSym';
      b.dataset.rune = id;
      b.setAttribute('title', RUNE_NAMES[id]);
      const img = document.createElement('img');
      img.src = runeDataURL(id, '#8fe3ff', 96);
      img.alt = RUNE_NAMES[id];
      img.draggable = false;
      const s = document.createElement('span'); s.textContent = RUNE_NAMES[id];
      b.appendChild(img); b.appendChild(s);
      b.onclick = (e) => {
        e.stopPropagation();
        if (this.arr.length >= this.slotCount) return;
        this.arr.push(id);
        this.game.audio.uiClick();
        this.msg(''); this.render();
      };
      this.symsEl.appendChild(b);
    });
  }

  render() {
    this.slotsEl.innerHTML = '';
    for (let i = 0; i < this.slotCount; i++) {
      const d = document.createElement('div');
      d.className = 'puzSlot';
      d.dataset.slotIndex = i;
      const id = this.arr[i];
      if (id) {
        d.dataset.rune = id;
        const img = document.createElement('img');
        img.src = runeDataURL(id, '#ffc46b', 96);
        img.alt = RUNE_NAMES[id];
        img.draggable = false;
        d.appendChild(img);
        d.onclick = (e) => {
          e.stopPropagation();
          this.arr.splice(i, 1);
          this.render();
          this.game.audio.uiHover();
        };
      } else {
        const q = document.createElement('div'); q.className = 'q'; q.textContent = '?';
        d.appendChild(q);
      }
      this.slotsEl.appendChild(d);
    }
  }

  msg(t, ok = false) { this.msgEl.textContent = t; this.msgEl.className = ok ? 'ok' : ''; }

  confirm() {
    const g = this.game;
    if (this.arr.length < this.slotCount) {
      this.msg(`SELECT ${this.slotCount} RUNES`);
      this.shake();
      g.audio.uiHover();
      return;
    }
    const ok = this.arr.join(',') === this.solution.join(',');
    if (ok) {
      this.msg('THE MECHANISM ACCEPTS', true);
      this.panel.classList.add('good');
      g.audio.success();
      setTimeout(() => this.close(true), 800);
    } else {
      this.attempts++;
      this.msg('TRY AGAIN.');
      this.shake();
      g.audio.fail();
      g.ui.feedback('TRY AGAIN', false);
      if (this.failLines && this.attempts >= 2) {
        this.attempts = 0;
        g.ui.dialogue('PETALO', this.failLines);
      }
      setTimeout(() => { this.arr = []; this.render(); }, 550);
    }
  }

  shake() {
    this.panel.classList.remove('shake');
    void this.panel.offsetWidth;
    this.panel.classList.add('shake');
  }

  close(result = false) {
    this.root.classList.add('hidden');
    this.game.closeModal(this);
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(result); }
  }
}

// ---------------------------------------------------------------------------
// PUZZLE 6 — CELESTIAL CLOCK PUZZLE MODAL
// ---------------------------------------------------------------------------
export class ClockPuzzle {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.root = $('clockPuzzle');
    this.hourHand = $('clockHourHand');
    this.minHand = $('clockMinHand');
    this.display = $('clockTimeDisplay');
    this.hintEl = $('clockHint');
    this.msgEl = $('clockMsg');
    this.resolve = null;

    this.hour = 12;
    this.minute = 0;
    this.targetHour = 3;
    this.targetMinute = 45;

    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'contextmenu'].forEach((evt) => {
      this.root.addEventListener(evt, (e) => e.stopPropagation());
    });

    const on = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
    };
    on('btnHourDec', () => this.adjustTime(-1, 0));
    on('btnHourInc', () => this.adjustTime(1, 0));
    on('btnMinDec', () => this.adjustTime(0, -5));
    on('btnMinInc', () => this.adjustTime(0, 5));
    on('btnClockConfirm', () => this.confirm());
    on('btnClockClose', () => this.close(false));
  }

  open({ hint = 'Align the clock with the moment the cosmic event began (03:45).', targetHour = 3, targetMinute = 45 }) {
    this.game.openModal(this);
    this.hintEl.textContent = hint;
    this.targetHour = targetHour;
    this.targetMinute = targetMinute;
    this.hour = 12;
    this.minute = 0;
    this.msgEl.textContent = '';
    this.updateClockVisuals();
    this.root.classList.remove('hidden');
    return new Promise((res) => { this.resolve = res; });
  }

  adjustTime(dh, dm) {
    this.hour = (this.hour + dh + 12) % 12 || 12;
    this.minute = (this.minute + dm + 60) % 60;
    this.game.audio.clockTick();
    this.updateClockVisuals();
  }

  updateClockVisuals() {
    const hDeg = (this.hour % 12) * 30 + (this.minute / 60) * 30;
    const mDeg = this.minute * 6;
    this.hourHand.style.transform = `translateX(-50%) rotate(${hDeg}deg)`;
    this.minHand.style.transform = `translateX(-50%) rotate(${mDeg}deg)`;
    const hh = String(this.hour).padStart(2, '0');
    const mm = String(this.minute).padStart(2, '0');
    this.display.textContent = `${hh}:${mm}`;
  }

  confirm() {
    const ok = this.hour === this.targetHour && this.minute === this.targetMinute;
    if (ok) {
      this.msgEl.style.color = 'var(--am)';
      this.msgEl.textContent = 'HARMONIC ALIGNMENT CONFIRMED';
      this.game.audio.clockChime();
      this.game.audio.success();
      setTimeout(() => this.close(true), 900);
    } else {
      this.msgEl.style.color = 'var(--red)';
      this.msgEl.textContent = 'DISCORDANT ALIGNMENT. CHECK SURVIVOR NOTES.';
      this.game.audio.fail();
      this.game.ui.feedback('INCORRECT TIME', false);
    }
  }

  close(result = false) {
    this.root.classList.add('hidden');
    this.game.closeModal(this);
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(result); }
  }
}

// ---------------------------------------------------------------------------
// PUZZLE 4 — KEY PUZZLE MODAL
// ---------------------------------------------------------------------------
export class KeyPuzzle {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.root = $('keyPuzzle');
    this.hintEl = $('keyHint');
    this.listEl = $('keyList');
    this.msgEl = $('keyMsg');
    this.resolve = null;
    this.selectedKey = null;

    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'contextmenu'].forEach((evt) => {
      this.root.addEventListener(evt, (e) => e.stopPropagation());
    });

    const on = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
    };
    on('btnKeyConfirm', () => this.confirm());
    on('btnKeyClose', () => this.close(false));
  }

  open({ hint = 'Identify the key described in the archivist\'s journal.', keys = [], correctKeyId }) {
    this.game.openModal(this);
    this.hintEl.textContent = hint;
    this.keys = keys;
    this.correctKeyId = correctKeyId;
    this.selectedKey = null;
    this.msgEl.textContent = '';
    this.renderKeys();
    this.root.classList.remove('hidden');
    return new Promise((res) => { this.resolve = res; });
  }

  renderKeys() {
    this.listEl.innerHTML = '';
    this.keys.forEach(k => {
      const card = document.createElement('div');
      card.className = 'keyCard' + (this.selectedKey === k.id ? ' selected' : '');
      const icon = document.createElement('div');
      icon.className = 'keyIcon';
      icon.style.color = k.color || 'var(--cy)';
      icon.textContent = k.icon || '🗝️';
      const label = document.createElement('span');
      label.textContent = k.name;
      card.appendChild(icon);
      card.appendChild(label);
      card.onclick = (e) => {
        e.stopPropagation();
        this.selectedKey = k.id;
        this.game.audio.uiClick();
        this.renderKeys();
      };
      this.listEl.appendChild(card);
    });
  }

  confirm() {
    if (!this.selectedKey) {
      this.msgEl.textContent = 'SELECT A KEY FIRST';
      this.game.audio.uiHover();
      return;
    }
    const ok = this.selectedKey === this.correctKeyId;
    if (ok) {
      this.msgEl.style.color = 'var(--am)';
      this.msgEl.textContent = 'VAULT LOCK DISENGAGED';
      this.game.audio.doorHeavy();
      this.game.audio.success();
      setTimeout(() => this.close(true), 800);
    } else {
      this.msgEl.style.color = 'var(--red)';
      this.msgEl.textContent = 'KEY DOES NOT FIT THE TUMBLERS';
      this.game.audio.fail();
      this.game.ui.feedback('WRONG KEY', false);
    }
  }

  close(result = false) {
    this.root.classList.add('hidden');
    this.game.closeModal(this);
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(result); }
  }
}

// ---------------------------------------------------------------------------
// DOCUMENT / LORE READER MODAL
// ---------------------------------------------------------------------------
export class DocumentReader {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.root = $('docReader');
    this.tagEl = $('docTag');
    this.titleEl = $('docTitle');
    this.bodyEl = $('docBody');
    this.resolve = null;

    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'contextmenu'].forEach((evt) => {
      this.root.addEventListener(evt, (e) => e.stopPropagation());
    });

    const on = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
    };
    on('btnDocClose', () => this.close());
    on('btnDocCloseBottom', () => this.close());
  }

  open({ tag = 'SURVIVOR LOG', title = 'Document', text = '' }) {
    this.game.openModal(this);
    this.tagEl.textContent = tag;
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = text.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    this.game.audio.clueFound();
    this.root.classList.remove('hidden');
    return new Promise((res) => { this.resolve = res; });
  }

  close() {
    this.root.classList.add('hidden');
    this.game.closeModal(this);
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
  }
}

// ---------------------------------------------------------------------------
// PUZZLE 2 — SWITCH PUZZLE CONTROLLER (In-World Sequential Switches)
// ---------------------------------------------------------------------------
export class SwitchPuzzleController {
  constructor(game, { sequence = [1, 2, 3], onSolve = null }) {
    this.game = game;
    this.sequence = sequence;
    this.input = [];
    this.onSolve = onSolve;
    this.switches = {};
    this.solved = false;
  }

  registerSwitch(id, mesh, light) {
    this.switches[id] = { mesh, light, active: false };
  }

  press(id) {
    if (this.solved) return;
    const sw = this.switches[id];
    if (!sw || sw.active) return;

    this.game.audio.switchClick();
    sw.active = true;
    if (sw.light) sw.light.intensity = 2.5;
    if (sw.mesh && sw.mesh.material) {
      sw.mesh.material.emissive?.set(0x8fe3ff);
      sw.mesh.material.emissiveIntensity = 1.8;
    }
    this.input.push(id);

    // Validate current prefix
    const idx = this.input.length - 1;
    if (this.input[idx] !== this.sequence[idx]) {
      // Failed sequence!
      this.game.audio.fail();
      this.game.ui.feedback('SEQUENCE RESET', false);
      setTimeout(() => this.reset(), 500);
      return;
    }

    this.game.audio.uiClick();
    this.game.ui.feedback(`SWITCH ${id} ACTIVE (${this.input.length}/${this.sequence.length})`, true);

    // Checked all?
    if (this.input.length === this.sequence.length) {
      this.solved = true;
      this.game.audio.success();
      this.game.ui.notify('CONDUIT ALIGNED', 'The ancient energy barrier has fallen!', 'gold', 3500);
      if (this.onSolve) this.onSolve();
    }
  }

  reset() {
    this.input = [];
    Object.values(this.switches).forEach(sw => {
      sw.active = false;
      if (sw.light) sw.light.intensity = 0.2;
      if (sw.mesh && sw.mesh.material) {
        sw.mesh.material.emissive?.set(0x221100);
        sw.mesh.material.emissiveIntensity = 0.2;
      }
    });
  }
}
