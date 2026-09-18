import * as THREE from 'three';
import { damp, lerp, rand, choice } from './util.js';

// PETALO — small floating companion robot.
// Follows the player, investigates clues, illuminates darkness,
// hints toward objectives and celebrates puzzle successes.
export class Petalo {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.active = false;
    this.mode = 'follow';
    this.modeT = 0;
    this.t = rand(0, 9);
    this.guideTarget = null;
    this.inspectTarget = null;
    this.clueCooldown = 0;
    this.barkTimer = rand(35, 50);
    this._build();
    this.group.visible = false;
    game.scene.add(this.group);
  }

  _build() {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xd7dee4, roughness: 0.25, metalness: 0.75 })
    );
    this.group.add(body);
    this.eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ff })
    );
    this.eye.position.set(0, 0.02, 0.13);
    this.group.add(this.eye);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.016, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.4, metalness: 0.8, emissive: 0x8fe3ff, emissiveIntensity: 0.5 })
    );
    this.ring.rotation.x = Math.PI / 2.4;
    this.group.add(this.ring);
    const finGeo = new THREE.ConeGeometry(0.045, 0.14, 6);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b2, roughness: 0.4, metalness: 0.7 });
    this.finL = new THREE.Mesh(finGeo, finMat); this.finL.position.set(0.19, 0, -0.04); this.finL.rotation.z = -1.2;
    this.finR = new THREE.Mesh(finGeo, finMat); this.finR.position.set(-0.19, 0, -0.04); this.finR.rotation.z = 1.2;
    this.group.add(this.finL, this.finR);
    this.light = new THREE.PointLight(0x9fd8ff, 2.0, 15, 1.1);
    this.light.position.y = 0.1;
    this.group.add(this.light);
  }

  activate(pos) {
    this.active = true;
    this.group.visible = true;
    if (pos) this.group.position.copy(pos);
    this.group.scale.setScalar(0.01);
    this.game.ui.petaloIndicator(true);
  }
  deactivate() {
    this.active = false; this.group.visible = false;
    this.game.ui.petaloIndicator(false);
  }

  setProfile(p) {
    this._profCave = (p === 'cave');
    if (p === 'cave') {
      this.light.intensity = 8.5; this.light.distance = 34; this.light.color.set(0xbfe4ff);
    } else {
      this.light.intensity = 2.0; this.light.distance = 15; this.light.color.set(0x9fd8ff);
    }
  }

  say(text, ms = 3400) { this.game.ui.dialogue('PETALO', text, ms); }

  guideTo(target, dur = 7) {
    if (!this.active || !target) return;
    this.mode = 'guide';
    this.modeT = dur;
    this.guideTarget = target.clone ? target.clone() : new THREE.Vector3(target.x, 0, target.z);
    this.game.ui.petaloPing();
  }

  celebrate() {
    if (!this.active) return;
    this.mode = 'celebrate'; this.modeT = 2.4;
    this.game.vfx.burst(this.group.position, { color: 0xffc46b, count: 24, speed: 1.4, size: 0.07, life: 0.9, gravity: 0.4 });
  }

  hint() {
    if (!this.active) return;
    const lvl = this.game.level;
    if (lvl && lvl.getHint) {
      const h = lvl.getHint(this.game);
      if (h) {
        this.say(h.text);
        if (h.target) this.guideTo(h.target, 8);
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const g = this.game, pp = g.player.pos;
    // scale-in on activation
    if (this.group.scale.x < 1) this.group.scale.setScalar(Math.min(1, this.group.scale.x + dt * 2));

    const bob = Math.sin(this.t * 2.1) * 0.07;
    this.ring.rotation.z += dt * 1.6;
    this.finL.rotation.y = Math.sin(this.t * 3) * 0.35;
    this.finR.rotation.y = -Math.sin(this.t * 3) * 0.35;

    this.modeT -= dt;
    const desired = new THREE.Vector3();

    if (this.mode === 'guide' && this.guideTarget) {
      // hover 3.5m ahead of the player toward the target
      const to = new THREE.Vector3().subVectors(this.guideTarget, pp); to.y = 0;
      const d = to.length();
      if (d > 0.1) to.normalize();
      desired.copy(pp).addScaledVector(to, Math.min(3.5, d * 0.5));
      desired.y = 1.9 + bob;
      this.group.lookAt(this.guideTarget.x, 1.9, this.guideTarget.z);
      if (this.modeT <= 0 || d < 2.5) this.mode = 'follow';
    } else if (this.mode === 'inspect' && this.inspectTarget) {
      const o = this.inspectTarget;
      const a = this.t * 1.6;
      desired.set(o.x + Math.cos(a) * 1.0, (o.y || 0) + 1.5 + bob, o.z + Math.sin(a) * 1.0);
      this.group.lookAt(o.x, (o.y || 0) + 1, o.z);
      const pd = Math.hypot(pp.x - this.group.position.x, pp.z - this.group.position.z);
      if (this.modeT <= 0 || pd > 12) { this.mode = 'follow'; this.inspectTarget = null; }
    } else if (this.mode === 'celebrate') {
      desired.set(pp.x, pp.y + 1.9 + bob, pp.z);
      this.group.rotation.y += dt * 9;
      this.light.intensity = (this._profCave ? 8.5 : 2.0) + Math.sin(this.t * 16) * (this._profCave ? 2 : 0.8);
      if (this.modeT <= 0) this.mode = 'follow';
    } else {
      // follow — hover behind-right of player
      const hd = g.player.heading;
      desired.set(
        pp.x - Math.sin(hd) * 1.15 + Math.cos(hd) * 0.55,
        pp.y + 1.75 + bob,
        pp.z - Math.cos(hd) * 1.15 - Math.sin(hd) * 0.55
      );
      this.group.lookAt(pp.x, pp.y + 1.3, pp.z);
    }

    const dist = this.group.position.distanceTo(desired);
    const k = dist > 8 ? 7 : 4.2;
    this.group.position.x = damp(this.group.position.x, desired.x, k, dt);
    this.group.position.y = damp(this.group.position.y, desired.y, k, dt);
    this.group.position.z = damp(this.group.position.z, desired.z, k, dt);
    if (this.group.position.distanceTo(pp) > 10) {
      this.group.position.copy(desired); // catch up
    }

    if (this.mode !== 'celebrate') {
      const base = this._profCave ? 8.5 : 2.0;
      this.light.intensity = base + Math.sin(this.t * 5) * 0.08 * base;
    }

    // hidden-clue detection
    this.clueCooldown -= dt;
    const lvl = this.game.level;
    if (lvl && lvl.hiddenClues && this.clueCooldown <= 0 && this.mode === 'follow' && g.state === 'play') {
      for (const c of lvl.hiddenClues) {
        if (c.done || c.scanned) continue;
        const d = Math.hypot(pp.x - c.pos.x, pp.z - c.pos.z);
        if (d < 8.5) {
          c.scanned = true;
          this.clueCooldown = 9;
          this.mode = 'inspect'; this.modeT = 4.2;
          this.inspectTarget = c.pos;
          this.say(c.whisper);
          g.vfx.sparkle(c.object, { color: 0xffc46b, radius: 0.7 });
          this.game.ui.petaloPing();
          break;
        }
      }
    }

    // ambient barks
    this.barkTimer -= dt;
    if (this.barkTimer <= 0) {
      this.barkTimer = rand(45, 80);
      if (this.mode === 'follow' && g.state === 'play' && !g.ui.dlgBusy) {
        const barks = (lvl && lvl.barks) || [
          'The signal grows stronger ahead, Arin.',
          "I'm scanning. Stay observant.",
          'Whatever happened here… we can fix it.',
        ];
        this.say(choice(barks), 2800);
      }
    }
  }
}
