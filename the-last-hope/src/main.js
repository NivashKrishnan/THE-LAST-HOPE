import * as THREE from 'three';
import { initTextures, clamp } from './util.js';
import { SaveSys, loadSettings, storeSettings } from './save.js';
import { AudioSys } from './audio.js';
import { VFX } from './vfx.js';
import { UI } from './ui.js';
import { Player } from './player.js';
import { Petalo } from './petalo.js';
import { SymbolPad, ClockPuzzle, KeyPuzzle, DocumentReader } from './puzzles.js';
import { CombatSystem } from './combat.js';
import { createLevel, CHAPTERS, CHAPTER_TITLES } from './levels.js';

class Game {
  constructor() {
    initTextures();
    this.settings = loadSettings();
    this.state = 'boot';
    this.keys = new Set();
    this.dragLook = false;
    this._dragging = false;
    this._expectUnlock = false;
    this.nearIt = null;
    this.objId = null;
    this.levelIndex = 0;
    this.level = null;
    this.camAnim = null;
    this._pauseT = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(this.settings.quality === 'low' ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    this.camera.position.set(0, 3, 8);

    this.audio = new AudioSys();
    this.audio.volume = this.settings.volume;
    this.save = new SaveSys();
    this.ui = new UI(this);
    this.vfx = new VFX(this.scene);
    this.player = new Player(this);
    this.petalo = new Petalo(this);
    this.pad = new SymbolPad(this);
    this.clockPuzzle = new ClockPuzzle(this);
    this.keyPuzzle = new KeyPuzzle(this);
    this.docReader = new DocumentReader(this);
    this.playerCombat = new CombatSystem(this);
    this.playerCombat.attachToPlayer(this.player);

    // guidance signal pillar (marks the current objective target)
    this.beam = new THREE.Group();
    const mkBeam = (r, op) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 54, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.y = 27; return m;
    };
    this.beam.add(mkBeam(0.48, 0.09)); this.beam.add(mkBeam(0.18, 0.2));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; this.beam.add(ring);
    this.beam.visible = false;
    this.scene.add(this.beam);

    this._bindInput();
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.state = 'menu';
    this.ui.showMenu(this.save.has());
    this.ui.fade('#000000', 0, 900);
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this._loop(t));
  }

  // --------------------------------------------------------------- input
  _bindInput() {
    const c = this.canvas;
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (this.activeModal) {
          if (e.code === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.activeModal.close(false);
          }
          return;
        }
        if (e.code === 'KeyE' && this.state === 'play') this._interactKey();
        if (e.code === 'KeyH' && this.state === 'play') this.petalo.hint();
        if (e.code === 'KeyP') { if (this.state === 'play') this.pauseGame(); else if (this.state === 'pause') this.resumeGame(); }
        if (e.code === 'Escape') {
          if (this.state === 'pause' && performance.now() - this._pauseT > 400) this.resumeGame();
          else if (this.state === 'play' && this.dragLook) this.pauseGame();
        }
      }
      if (!this.activeModal) this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    c.addEventListener('mousedown', (e) => {
      if (this.state !== 'play' || this.activeModal) return;
      this.audio.ensure();
      if (this.dragLook) this._dragging = true;
      else if (document.pointerLockElement !== c) this._requestLock();
      this.playerCombat.onMouseDown(e.button);
    });
    addEventListener('mouseup', (e) => {
      this._dragging = false;
      if (this.state !== 'play' || this.activeModal) return;
      this.playerCombat.onMouseUp(e.button);
    });
    addEventListener('mousemove', (e) => {
      if (this.state !== 'play' || this.activeModal) return;
      if (document.pointerLockElement === c || (this._dragging && this.dragLook)) this.player.applyMouse(e.movementX, e.movementY);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === c;
      if (locked) this.ui.focusOverlay(false);
      else {
        if (this.state === 'play' && !this._expectUnlock && !this.activeModal) this.pauseGame();
        this._expectUnlock = false;
      }
    });
    document.addEventListener('pointerlockerror', () => { this.dragLook = true; this.ui.focusOverlay(false); });
    this.ui.el.focusOverlay.addEventListener('click', () => {
      if (this.activeModal) return;
      this.ui.focusOverlay(false);
      this.audio.ensure();
      if (!this.dragLook) this._requestLock();
    });
  }

  _requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.dragLook = true; this.ui.focusOverlay(false); });
    } catch { this.dragLook = true; this.ui.focusOverlay(false); }
  }

  _exitLock() {
    this._expectUnlock = true;
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (err) {}
    }
  }

  openModal(modal) {
    this.activeModal = modal;
    this.state = 'puzzle';
    this._exitLock();
    if (this.ui) {
      this.ui.prompt(null);
      this.ui.focusOverlay(false);
    }
    this.keys.clear();
    this._dragging = false;
    document.body.classList.add('modalOpen');
    document.body.style.cursor = 'default';
  }

  closeModal(modal) {
    if (this.activeModal === modal) {
      this.activeModal = null;
    }
    document.body.classList.remove('modalOpen');
    document.body.style.cursor = '';
    if (this.state === 'puzzle') {
      this.state = 'play';
      this.keys.clear();
      this._dragging = false;
      if (!this.dragLook) {
        this._requestLock();
      }
    }
  }

  get inputEnabled() { return this.state === 'play'; }

  // --------------------------------------------------------------- UI actions
  handleUI(action) {
    switch (action) {
      case 'start': this.startNewGame(); break;
      case 'continue': this.continueGame(); break;
      case 'exit': this.ui.el.menu.classList.add('hidden'); this.ui.showExit(true); break;
      case 'exitBack': this.ui.showExit(false); this.ui.showMenu(this.save.has()); break;
      case 'resume': this.resumeGame(); break;
      case 'restartLevel': this.restartLevel(); break;
      case 'quitMenu': this.quitToMenu(); break;
      case 'endContinue': this.endContinue(); break;
      case 'endRestart': this.quitToMenu(); break;
    }
  }

  applySettingsFromUI(s) {
    this.settings = s;
    storeSettings(s);
    this.audio.setVolume(s.volume);
    this.renderer.setPixelRatio(s.quality === 'low' ? 1 : Math.min(devicePixelRatio, 2));
    const sh = s.quality !== 'low';
    if (this.renderer.shadowMap.enabled !== sh) {
      this.renderer.shadowMap.enabled = sh;
      this.scene.traverse(o => {
        if (o.isDirectionalLight && o.shadow) o.castShadow = sh;
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true);
      });
    }
  }

  // --------------------------------------------------------------- game flow
  async startNewGame() {
    this.save.clear();
    this.audio.ensure();
    this.playerCombat.equipped = false;
    this.playerCombat.drawn = false;
    this.playerCombat.playerHp = 100;
    this.playerCombat.isDead = false;
    this.playerCombat.updateVisibility();
    this.ui.updatePlayerHp(100, 100);
    this.ui.updateWeaponHud(false, 0);
    this.ui.hideMenu();
    await this.ui.playRadioIntro();
    this.loadLevel(1, {});
  }

  continueGame() {
    this.audio.ensure();
    const d = this.save.load();
    this.ui.hideMenu();
    if (!d || !d.level) { this.startNewGame(); return; }
    this.loadLevel(d.level, { fromSave: true });
  }

  pauseGame() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this._pauseT = performance.now();
    this.ui.showPause(true);
    this._exitLock();
  }
  resumeGame() {
    if (this.state !== 'pause') return;
    this.ui.showPause(false);
    this.state = 'play';
    this.audio.ensure();
    if (!this.dragLook) this._requestLock();
  }
  restartLevel() {
    if (!this.levelIndex) return;
    this.save.clearLevelFlags(this.levelIndex);
    this.ui.showPause(false);
    this.loadLevel(this.levelIndex, {});
  }
  async quitToMenu() {
    this.ui.showPause(false);
    this.ui.hideEnding();
    await this.ui.fade('#05070c', 1, 500);
    if (this.level) { this.level.dispose(this.scene); this.level = null; }
    this.vfx.clearAll();
    this.setSignalTarget(null);
    this.petalo.deactivate();
    this.scene.fog = null;
    this.audio.stopAmbient();
    this.ui.showHUD(false);
    this.ui.clearDialogue();
    this.ui.prompt(null);
    this.state = 'menu';
    this._exitLock();
    this.ui.showMenu(this.save.has());
    await this.ui.fade('#05070c', 0, 600);
  }

  async loadLevel(n, { fromSave = false } = {}) {
    this.state = 'loading';
    this.ui.prompt(null);
    this.ui.clearDialogue();
    this.ui.letterbox(false);
    this.ui.seqDots(null);
    this.ui.hintBar(null);
    this._exitLock();
    await this.ui.fade('#05070c', 1, 650);

    if (this.level) { this.level.dispose(this.scene); this.level = null; }
    this.vfx.clearAll();
    this.levelIndex = n;
    this.level = createLevel(this, n);
    this.scene.add(this.level.group);

    const sp = this.level.spawn;
    this.player.reset(sp.x, sp.z, sp.yaw);

    const petaloOn = !(n === 1 && !this.save.hasFlag('L1:device'));
    if (petaloOn) {
      this.petalo.activate(new THREE.Vector3(sp.x - 1, 1.9, sp.z - 1));
      this.petalo.setProfile(this.level.petaloProfile);
    } else this.petalo.deactivate();

    this.setSignalTarget(null);
    this.ui.showHUD(true);
    this.ui.hideEnding();
    this.ui.showPause(false);
    this.ui.resetClues();
    if (this.save.hasFlag('katana_unlocked')) {
      this.playerCombat.equipped = true;
      this.playerCombat.drawn = true;
      this.playerCombat.updateVisibility();
    }
    this.ui.updatePlayerHp(this.playerCombat.playerHp, this.playerCombat.maxHp);
    this.ui.updateWeaponHud(this.playerCombat.equipped, this.playerCombat.comboStep);
    if (this.save.data && this.save.data.flags) this.level.restoreIcons(this.save.data.flags);
    this.save.patch({ level: n });

    const card = this.ui.chapter(CHAPTERS[n - 1], CHAPTER_TITLES[n - 1], 2000);
    await this.ui.fade('#05070c', 0, 500);
    this.level.enter({ fromSave });
    this.state = 'play';
    this.player.teleportBehindCamera();
    this.showFocusIfUnlocked();
  }

  nextLevel() {
    if (this.levelIndex >= 1 && this.levelIndex < 4) this.loadLevel(this.levelIndex + 1, {});
  }

  showEnding() {
    this.state = 'ending';
    const flags = (this.save.data && this.save.data.flags) || [];
    const clues = ['L2:leaf', 'L2:moon', 'L2:star', 'L3:mural', 'L3:lore'].filter(f => flags.includes(f)).length;
    this.ui.showEnding(
      `The signal fades into birdsong. Cities will light again. Rivers will run clear.<br>
       And one day, the world will remember the student who listened.<br><br>
       <span style="color:#8fe3ff;letter-spacing:.2em;font-size:12px">
       CLUES DISCOVERED ${clues}/5 &nbsp;·&nbsp; CHAPTERS 4/4 &nbsp;·&nbsp; THANK YOU FOR PLAYING</span>`
    );
  }
  endContinue() {
    this.ui.hideEnding();
    this.state = 'play';
    this.audio.startAmbient('dawn');
    this.setObjective('restored', 'The valley breathes again. Explore, or rest.');
    this.showFocusIfUnlocked();
  }

  // --------------------------------------------------------------- objectives / clues
  setObjective(id, text) {
    const isNew = this.objId !== id;
    this.objId = id;
    this.ui.objective(text);
    if (isNew) this.ui.notify('NEW OBJECTIVE', text, 'cy', 3400);
    this.refreshGuidance();
  }
  completeObjective(sub) { this.ui.notify('OBJECTIVE COMPLETE', sub, 'gold', 2800); }
  addClue(flag, rune, label) {
    this.save.addFlag(flag);
    this.ui.addClueIcon(rune, label);
    this.ui.notify('CLUE DISCOVERED', label, 'gold', 2800);
    this.audio.clueFound();
    this.refreshGuidance();
  }
  hasFlag(f) { return this.save.hasFlag(f); }
  addFlag(f) { this.save.addFlag(f); }

  refreshGuidance() {
    const gd = this.level && this.level.getGuidance ? this.level.getGuidance(this) : null;
    this.setSignalTarget(gd && gd.target ? gd.target : null);
  }
  setSignalTarget(v) {
    if (!v) { this.beam.visible = false; return; }
    this.beam.visible = true;
    this.beam.position.set(v.x, 0, v.z);
  }

  // --------------------------------------------------------------- puzzle / cinematics
  startPuzzle(cfg) {
    return this.pad.open(cfg).then(ok => {
      if (ok) this.petalo.celebrate();
      return ok;
    });
  }

  showFocusIfUnlocked() {
    if (this.state === 'play' && !this.activeModal && document.pointerLockElement !== this.canvas && !this.dragLook) this.ui.focusOverlay(true);
  }

  _camLookTarget() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return this.camera.position.clone().addScaledVector(d, 12);
  }
  _camAnimTo(pos, look, dur) {
    return new Promise(res => {
      this.camAnim = {
        p0: this.camera.position.clone(), l0: this._camLookTarget(),
        p1: pos.clone(), l1: look.clone(), start: performance.now(), dur, res
      };
    });
  }
  _updateCamAnim() {
    const a = this.camAnim;
    const k = Math.min(1, (performance.now() - a.start) / a.dur), e = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(a.p0, a.p1, e);
    const l = new THREE.Vector3().lerpVectors(a.l0, a.l1, e);
    this.camera.lookAt(l);
    if (k >= 1) { this.camAnim = null; a.res(); }
  }
  _desiredCamPose() {
    const pl = this.player;
    const cp = Math.cos(pl.camPitch), sp = Math.sin(pl.camPitch);
    const off = new THREE.Vector3(Math.sin(pl.camYaw) * cp, sp, Math.cos(pl.camYaw) * cp).multiplyScalar(pl.camDist);
    const pivot = pl.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
    return { pos: pivot.clone().add(off), look: pivot };
  }
  async playCinematic(keys, opts = {}) {
    this.state = 'cinematic';
    this._exitLock();
    this.ui.prompt(null);
    if (opts.letterbox !== false) this.ui.letterbox(true);
    for (const k of keys) {
      try { k.onStart && k.onStart(); } catch (e) { console.warn(e); }
      await this._camAnimTo(k.pos, k.look, k.dur);
    }
    if (!opts.keepCinematic) {
      const behind = this._desiredCamPose();
      await this._camAnimTo(behind.pos, behind.look, 650);
      if (opts.letterbox !== false) this.ui.letterbox(false);
      this.state = 'play';
      this.player.teleportBehindCamera();
      this.showFocusIfUnlocked();
    }
  }

  // --------------------------------------------------------------- frame loop
  _loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const st = this.state;
    if (this.camAnim) this._updateCamAnim(dt);
    if (st === 'play') {
      this.player.update(dt);
      this.playerCombat.update(dt);
      this.ui.updateWeaponHud(this.playerCombat.equipped, this.playerCombat.comboStep);
      this._updateInteract();
    }
    if (['play', 'puzzle', 'cinematic', 'ending'].includes(st) && this.level) {
      this.level.update(dt);
      this.petalo.update(dt);
    }
    if (st !== 'pause') {
      this.vfx.update(dt);
      if (this.beam.visible) {
        this.beam.rotation.y += dt * 0.4;
        const p = 0.75 + Math.sin(t * 0.0022) * 0.25;
        this.beam.children[0].material.opacity = 0.09 * p;
        this.beam.children[1].material.opacity = 0.2 * p;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  _updateInteract() {
    let best = null, bd = 1e9;
    const pp = this.player.pos;
    for (const it of this.level.interactables) {
      it.hovered = false;
      if (!it.enabled) continue;
      const p = it.position;
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (d < it.radius && d < bd) { bd = d; best = it; }
    }
    if (best) { best.hovered = true; this.ui.prompt(best.label); }
    else this.ui.prompt(null);
    this.nearIt = best;
  }
  _interactKey() {
    if (this.nearIt) { this.audio.interact(); this.nearIt.interact(this); }
  }
}

try {
  window.__game = new Game();
} catch (err) {
  document.body.innerHTML = '<div style="color:#ff8080;font-family:monospace;padding:40px">Failed to start THE LAST HOPE: ' + err.message + '<pre>' + err.stack + '</pre></div>';
  console.error(err.stack || err);
}
