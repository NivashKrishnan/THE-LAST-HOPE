import * as THREE from 'three';
import { clamp, damp, lerpAngle, resolveCircleRect, rand } from './util.js';

// Third-person character controller for Arin + orbit camera with collision.
export class Player {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.onGround = true;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 4.6;
    this.curCamDist = 4.6;
    this.speed = 0;
    this.phase = 0;
    this.stepAcc = 0;
    this.radius = 0.36;
    this.heading = Math.PI;
    this._buildMesh();
    game.scene.add(this.group);
    this.camPos = new THREE.Vector3();
    this._camInit = false;
  }

  _buildMesh() {
    const M = (c, r = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05, ...extra });
    const jacket = M(0x2e6f8e), pants = M(0x2b2f36), skin = M(0xd9a878, 0.85),
      hair = M(0x241a12, 0.9), pack = M(0x8a5a2b, 0.8), shoe = M(0x1b1d20, 0.6);

    const mk = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || this.group).add(m);
      return m;
    };

    this.body = new THREE.Group();
    this.group.add(this.body);

    // legs (pivot at hip)
    const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.2); legGeo.translate(0, -0.41, 0);
    const shoeGeo = new THREE.BoxGeometry(0.18, 0.1, 0.3); shoeGeo.translate(0, -0.83, 0.04);
    this.legL = new THREE.Group(); this.legL.position.set(0.11, 0.84, 0); this.body.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(-0.11, 0.84, 0); this.body.add(this.legR);
    mk(legGeo, pants, 0, 0, 0, this.legL); mk(legGeo, pants, 0, 0, 0, this.legR);
    mk(shoeGeo, shoe, 0, 0, 0, this.legL); mk(shoeGeo, shoe, 0, 0, 0, this.legR);

    // torso
    mk(new THREE.BoxGeometry(0.46, 0.6, 0.26), jacket, 0, 1.15, 0, this.body);
    mk(new THREE.BoxGeometry(0.5, 0.14, 0.3), jacket, 0, 0.86, 0, this.body);
    // backpack
    mk(new THREE.BoxGeometry(0.36, 0.44, 0.16), pack, 0, 1.16, -0.22, this.body);
    mk(new THREE.BoxGeometry(0.2, 0.12, 0.05), M(0xd8b25a, 0.5, { emissive: 0x664411, emissiveIntensity: 0.4 }), 0, 1.3, -0.31, this.body);

    // arms (pivot at shoulder)
    const armGeo = new THREE.BoxGeometry(0.13, 0.6, 0.16); armGeo.translate(0, -0.3, 0);
    this.armL = new THREE.Group(); this.armL.position.set(0.3, 1.4, 0); this.body.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(-0.3, 1.4, 0); this.body.add(this.armR);
    mk(armGeo, jacket, 0, 0, 0, this.armL); mk(armGeo, jacket, 0, 0, 0, this.armR);
    const handGeo = new THREE.BoxGeometry(0.11, 0.1, 0.13); handGeo.translate(0, -0.62, 0);
    mk(handGeo, skin, 0, 0, 0, this.armL); mk(handGeo, skin, 0, 0, 0, this.armR);

    // head + hair
    mk(new THREE.SphereGeometry(0.17, 18, 14), skin, 0, 1.62, 0, this.body);
    const h1 = mk(new THREE.BoxGeometry(0.3, 0.14, 0.3), hair, 0, 1.74, -0.02, this.body);
    h1.castShadow = false;
    mk(new THREE.BoxGeometry(0.31, 0.16, 0.1), hair, 0, 1.66, -0.13, this.body).castShadow = false;
  }

  reset(x, z, camYaw = Math.PI) {
    this.group.position.set(x, 0, z);
    this.vy = 0; this.onGround = true; this.speed = 0;
    this.camYaw = camYaw; this.camPitch = 0.32;
    this.heading = camYaw + Math.PI;
    this._camInit = false;
  }

  get pos() { return this.group.position; }

  applyMouse(dx, dy) {
    const s = this.game.settings.sens * 0.0023;
    this.camYaw += dx * s;
    const inv = this.game.settings.invert ? -1 : 1;
    this.camPitch = clamp(this.camPitch + dy * s * inv, 0.02, 1.35);
  }

  update(dt) {
    const g = this.game, keys = g.keys;
    let ix = 0, iz = 0;
    if (g.inputEnabled) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    }
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const maxSpeed = run ? 6.4 : 3.5;
    const F = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const R = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    const dir = new THREE.Vector3().addScaledVector(F, iz).addScaledVector(R, ix);
    const want = dir.lengthSq() > 0 ? maxSpeed : 0;
    if (dir.lengthSq() > 0) dir.normalize();
    this.speed = damp(this.speed, want, 10, dt);
    if (this.speed > 0.05 && dir.lengthSq() > 0) {
      this.group.position.addScaledVector(dir, this.speed * dt);
      this.heading = lerpAngle(this.heading, Math.atan2(dir.x, dir.z), 1 - Math.exp(-12 * dt));
    }
    this.group.rotation.y = this.heading;

    // jump / gravity
    if (g.inputEnabled && (keys.has('Space')) && this.onGround) {
      this.vy = 4.9; this.onGround = false; g.audio.jump();
    }
    const wasAir = !this.onGround;
    this.vy -= 13.2 * dt;
    this.group.position.y += this.vy * dt;
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      if (wasAir && this.vy < -5) g.audio.land();
      this.vy = 0; this.onGround = true;
    }

    // collisions
    const lvl = g.level;
    if (lvl) {
      const p = this.group.position, r = this.radius;
      for (const c of lvl.colliders) {
        if (p.y > (c.h ?? 99)) continue;
        const res = resolveCircleRect(p.x, p.z, r, c);
        if (res) { p.x = res[0]; p.z = res[1]; }
      }
      if (lvl.limitCircle) {
        const L = lvl.limitCircle, d = Math.hypot(p.x - L.x, p.z - L.z);
        if (d > L.r) { const k = L.r / d; p.x = L.x + (p.x - L.x) * k; p.z = L.z + (p.z - L.z) * k; }
      } else if (lvl.limit) {
        const L = lvl.limit;
        p.x = clamp(p.x, L.x0, L.x1); p.z = clamp(p.z, L.z0, L.z1);
      }
    }

    // walk-cycle animation
    const sf = clamp(this.speed / 6.4, 0, 1);
    this.phase += dt * (4 + this.speed * 2.1);
    const swing = Math.sin(this.phase) * 0.72 * sf;
    const swing2 = Math.sin(this.phase + Math.PI) * 0.72 * sf;
    this.legL.rotation.x = damp(this.legL.rotation.x, this.onGround ? swing : 0.45, 14, dt);
    const isCombatPose = this.game.playerCombat && (this.game.playerCombat.attackTimer > 0 || this.game.playerCombat.blocking);
    if (!isCombatPose) {
      this.armL.rotation.x = damp(this.armL.rotation.x, this.onGround ? swing2 * 0.8 : -0.7, 14, dt);
      this.armR.rotation.x = damp(this.armR.rotation.x, this.onGround ? swing * 0.8 : -0.7, 14, dt);
    }
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * sf + (this.onGround ? 0 : 0.06);
    this.body.rotation.x = damp(this.body.rotation.x, sf * 0.09, 8, dt);

    // footsteps
    if (this.onGround && this.speed > 0.6) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > 2.3) { this.stepAcc = 0; g.audio.footstep(run); }
    }

    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    const g = this.game;
    const pivot = new THREE.Vector3(this.group.position.x, this.group.position.y + 1.55, this.group.position.z);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const off = new THREE.Vector3(Math.sin(this.camYaw) * cp, sp, Math.cos(this.camYaw) * cp);

    // camera collision
    let wantDist = this.camDist;
    if (g.level) {
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * this.camDist;
        const px = pivot.x + off.x * t, py = Math.max(0.25, pivot.y + off.y * t), pz = pivot.z + off.z * t;
        let hit = false;
        for (const c of g.level.colliders) {
          if (!c.camBlock) continue;
          if (px > c.x0 - 0.25 && px < c.x1 + 0.25 && pz > c.z0 - 0.25 && pz < c.z1 + 0.25 && py < (c.h ?? 99) + 0.4) { hit = true; break; }
        }
        if (hit) { wantDist = Math.max(1.0, t - 0.45); break; }
      }
    }
    this.curCamDist = damp(this.curCamDist, wantDist, wantDist < this.curCamDist ? 30 : 5, dt);
    const target = pivot.clone().addScaledVector(off, this.curCamDist);
    target.y = Math.max(0.32, target.y);
    if (!this._camInit) { this.camPos.copy(target); this._camInit = true; }
    this.camPos.x = damp(this.camPos.x, target.x, 22, dt);
    this.camPos.y = damp(this.camPos.y, target.y, 22, dt);
    this.camPos.z = damp(this.camPos.z, target.z, 22, dt);
    g.camera.position.copy(this.camPos);
    g.camera.lookAt(pivot.x, pivot.y + 0.15, pivot.z);
  }

  teleportBehindCamera() { this._camInit = false; }
}
