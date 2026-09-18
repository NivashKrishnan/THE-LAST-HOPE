import * as THREE from 'three';
import { clamp, rand } from './util.js';

// Procedural 3D Katana model + Player Combat System
export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.equipped = false;       // Unlocked when player finds katana
    this.drawn = false;          // Drawn in hand vs sheathed on back
    this.playerHp = 100;
    this.maxHp = 100;
    this.invulnTimer = 0;
    this.isDead = false;

    // Attack state
    this.comboStep = 0;          // 0 = none, 1, 2, 3
    this.attackTimer = 0;
    this.attackDuration = 0.3;
    this.comboWindow = 0;
    this.attackCooldown = 0;     // Small cooldown buffer preventing erratic spamming
    this.blocking = false;
    this.hitRegistered = false;

    // Visuals & Meshes
    this.katanaInHand = null;
    this.sheathOnBack = null;
    this.slashArcMesh = null;
    this.slashArcTimer = 0;

    this._buildKatanaMeshes();
  }

  _buildKatanaMeshes() {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xe8ecf2,
      metalness: 0.95,
      roughness: 0.18,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.1,
      emissive: 0x8fe3ff,
      emissiveIntensity: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd8a84e,
      metalness: 0.8,
      roughness: 0.3,
    });
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      metalness: 0.7,
      roughness: 0.5,
    });
    const hiltMat = new THREE.MeshStandardMaterial({
      color: 0x121418,
      metalness: 0.1,
      roughness: 0.85,
    });
    const wrapMat = new THREE.MeshStandardMaterial({
      color: 0x3d4b58,
      metalness: 0.2,
      roughness: 0.8,
    });
    const sayaMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      metalness: 0.4,
      roughness: 0.35,
    });

    // 1. KATANA SWORD (Held in hand)
    const sword = new THREE.Group();

    // Blade (slight gentle curve composed of segments)
    const bladeLen = 0.82;
    const bladeGeo = new THREE.BoxGeometry(0.014, bladeLen, 0.042);
    bladeGeo.translate(0, bladeLen / 2, -0.005);
    const blade = new THREE.Mesh(bladeGeo, metalMat);
    blade.castShadow = true;
    sword.add(blade);

    // Glowing sharp cutting edge strip
    const edgeGeo = new THREE.BoxGeometry(0.004, bladeLen, 0.008);
    edgeGeo.translate(0, bladeLen / 2, 0.018);
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    sword.add(edge);

    // Habaki (collar above guard)
    const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.05), goldMat);
    habaki.position.y = 0.02;
    sword.add(habaki);

    // Tsuba (hand guard disc)
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.012, 16), guardMat);
    tsuba.position.y = 0;
    tsuba.rotation.x = Math.PI / 2;
    sword.add(tsuba);

    // Tsuka (hilt / grip)
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.26, 10), hiltMat);
    hilt.position.y = -0.13;
    sword.add(hilt);

    // Handle diamond wrap bands
    for (let i = -0.22; i <= -0.04; i += 0.045) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 10), wrapMat);
      ring.position.y = i;
      sword.add(ring);
    }

    // Kashira (pommel cap)
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.022, 10), goldMat);
    pommel.position.y = -0.26;
    sword.add(pommel);

    this.katanaInHand = sword;
    sword.visible = false;

    // 2. SHEATH / SAYA (Slung across backpack / torso)
    const sheath = new THREE.Group();
    const sayaGeo = new THREE.BoxGeometry(0.028, bladeLen + 0.06, 0.052);
    sayaGeo.translate(0, -(bladeLen + 0.06) / 2, 0);
    const sayaMesh = new THREE.Mesh(sayaGeo, sayaMat);
    sayaMesh.castShadow = true;
    sheath.add(sayaMesh);

    // Kojiri (brass sheath tip)
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.054), goldMat);
    tip.position.y = -(bladeLen + 0.06);
    sheath.add(tip);

    // Kurigata & Sageo cord
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.08, 0.06), wrapMat);
    cord.position.y = -0.14;
    sheath.add(cord);

    // When sword is in sheath, show hilt poking out
    const idleHilt = hilt.clone();
    idleHilt.position.y = 0.13;
    const idleTsuba = tsuba.clone();
    idleTsuba.position.y = 0.01;
    sheath.add(idleHilt);
    sheath.add(idleTsuba);

    this.sheathOnBack = sheath;
    sheath.visible = false;

    // 3. SLASH ARC TRAIL MESH (Additive glowing crescent arc)
    const arcGeo = new THREE.RingGeometry(1.2, 1.9, 24, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const arcMat = new THREE.MeshBasicMaterial({
      color: 0x8fe3ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.slashArcMesh = new THREE.Mesh(arcGeo, arcMat);
    this.slashArcMesh.rotation.x = Math.PI / 2;
    this.slashArcMesh.position.y = 1.1;
    this.game.scene.add(this.slashArcMesh);
  }

  attachToPlayer(player) {
    if (!player || !player.body || !player.armR) return;

    // Sheath mounted angled across back
    this.sheathOnBack.position.set(-0.16, 1.45, -0.26);
    this.sheathOnBack.rotation.set(0.35, 0.15, -0.75);
    player.body.add(this.sheathOnBack);

    // Katana held in right hand
    this.katanaInHand.position.set(0, -0.62, 0.08);
    this.katanaInHand.rotation.set(Math.PI / 2, 0, 0);
    player.armR.add(this.katanaInHand);

    this.updateVisibility();
  }

  unlockKatana() {
    this.equipped = true;
    this.drawn = true;
    this.updateVisibility();
    this.game.ui.notify('KATANA ACQUIRED', 'LMB: Attack Combo · RMB: Block / Deflect', 'gold', 4500);
    this.game.ui.hintBar('<span class="kbd">LMB</span> ATTACK (3-HIT COMBO) · <span class="kbd">RMB</span> BLOCK · <span class="kbd">W A S D</span> MOVE');
    this.game.audio.success();
  }

  updateVisibility() {
    if (!this.equipped) {
      if (this.sheathOnBack) this.sheathOnBack.visible = false;
      if (this.katanaInHand) this.katanaInHand.visible = false;
      return;
    }
    if (this.drawn) {
      if (this.sheathOnBack) {
        this.sheathOnBack.visible = true;
        // Hide sword hilt from sheath when drawn
        this.sheathOnBack.children.forEach(c => {
          if (c.geometry && c.geometry.type === 'CylinderGeometry') c.visible = false;
        });
      }
      if (this.katanaInHand) this.katanaInHand.visible = true;
    } else {
      if (this.sheathOnBack) {
        this.sheathOnBack.visible = true;
        this.sheathOnBack.children.forEach(c => c.visible = true);
      }
      if (this.katanaInHand) this.katanaInHand.visible = false;
    }
  }

  // ------------------------------------------------------------- Input Handlers
  onMouseDown(button) {
    if (!this.equipped || this.isDead || this.game.state !== 'play') return;

    if (button === 0) { // LMB -> Attack
      this.triggerAttack();
    } else if (button === 2) { // RMB -> Block
      this.startBlock();
    }
  }

  onMouseUp(button) {
    if (button === 2) {
      this.endBlock();
    }
  }

  triggerAttack() {
    if (this.isDead || this.blocking || this.attackCooldown > 0) return;
    this.drawn = true;
    this.updateVisibility();

    // If currently in attack duration, queue if close to recovery
    if (this.attackTimer > 0) {
      if (this.attackTimer < 0.1 && this.comboStep < 3) {
        this._queuedAttack = true;
      }
      return;
    }

    // Advance combo step
    if (this.comboWindow > 0 && this.comboStep > 0 && this.comboStep < 3) {
      this.comboStep = this.comboStep + 1;
    } else {
      this.comboStep = 1;
    }

    this.hitRegistered = false;
    this.attackDuration = this.comboStep === 3 ? 0.44 : 0.26;
    this.attackTimer = this.attackDuration;
    this.comboWindow = this.attackDuration + 0.48; // generous buffer for next strike
    this.attackCooldown = 0.08; // small debounce buffer

    // Audio & VFX
    this.game.audio.katanaSwing(this.comboStep);
    this._triggerSlashArc();

    // Camera & player micro-impulse forward
    const pl = this.game.player;
    if (pl && pl.group) {
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, pl.heading, 0));
      pl.group.position.addScaledVector(fwd, this.comboStep === 3 ? 0.45 : 0.24);
    }
  }

  startBlock() {
    if (this.isDead) return;
    this.drawn = true;
    this.updateVisibility();
    this.blocking = true;
  }

  endBlock() {
    this.blocking = false;
  }

  _triggerSlashArc() {
    const pl = this.game.player;
    if (!pl || !this.slashArcMesh) return;

    const p = pl.pos;
    this.slashArcMesh.position.set(p.x, p.y + 1.1, p.z);
    this.slashArcMesh.rotation.y = pl.heading + (this.comboStep === 2 ? Math.PI * 0.4 : -Math.PI * 0.4);
    this.slashArcMesh.rotation.x = Math.PI / 2 + (this.comboStep === 3 ? 0.4 : -0.2);
    this.slashArcMesh.material.color.set(this.comboStep === 3 ? 0xffc46b : 0x8fe3ff);
    this.slashArcMesh.material.opacity = 0.9;
    this.slashArcTimer = 0.22;
  }

  // ------------------------------------------------------------- Combat Update
  update(dt) {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Update slash arc fade
    if (this.slashArcTimer > 0) {
      this.slashArcTimer -= dt;
      if (this.slashArcMesh) {
        this.slashArcMesh.material.opacity = Math.max(0, (this.slashArcTimer / 0.22) * 0.9);
      }
    }

    // Combo timers
    if (this.comboWindow > 0) {
      this.comboWindow -= dt;
      if (this.comboWindow <= 0 && this.attackTimer <= 0) {
        this.comboStep = 0;
      }
    }

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;

      // Hit detection window at midpoint of swing
      if (!this.hitRegistered && this.attackTimer < this.attackDuration * 0.65) {
        this._checkHitbox();
      }

      if (this.attackTimer <= 0) {
        if (this.comboStep === 3) {
          this.comboStep = 0;
          this.attackCooldown = 0.24; // Finisher recovery cooldown
        } else {
          this.attackCooldown = 0.12; // Normal recovery cooldown
        }

        if (this._queuedAttack) {
          this._queuedAttack = false;
          this.triggerAttack();
        }
      }
    }

    this._updatePlayerArmPose(dt);
  }

  _updatePlayerArmPose(dt) {
    const pl = this.game.player;
    if (!pl || !pl.armR) return;

    if (this.blocking) {
      // Raised defensive guard posture
      pl.armR.rotation.set(-1.15, 0.4, 0.35);
      pl.armL.rotation.set(-1.0, -0.3, -0.3);
      if (this.katanaInHand) {
        this.katanaInHand.rotation.set(Math.PI * 0.4, -0.3, 0.6);
      }
    } else if (this.attackTimer > 0) {
      // Dynamic swing arcs based on combo step
      const progress = 1 - (this.attackTimer / this.attackDuration);
      if (this.comboStep === 1) { // High diagonal downward slash
        const angle = -1.6 + progress * 2.8;
        pl.armR.rotation.set(angle, -0.3 + progress * 0.8, -0.2);
        if (this.katanaInHand) this.katanaInHand.rotation.set(Math.PI / 2, 0, 0);
      } else if (this.comboStep === 2) { // Backhand horizontal slice
        const angle = 1.2 - progress * 2.6;
        pl.armR.rotation.set(angle, 0.5 - progress * 1.0, 0.3);
        if (this.katanaInHand) this.katanaInHand.rotation.set(Math.PI / 2, 0.4, -0.4);
      } else if (this.comboStep === 3) { // Powerful overhead cleave
        const angle = -2.2 + progress * 3.4;
        pl.armR.rotation.set(angle, 0.1, 0.1);
        pl.armL.rotation.set(angle * 0.85, -0.1, -0.1);
        if (this.katanaInHand) this.katanaInHand.rotation.set(Math.PI * 0.55, 0, 0);
      }
    } else if (this.drawn) {
      // Ready combat idle stance: blade held alertly at right side
      pl.armR.rotation.set(-0.45, 0.18, 0.22);
      if (this.katanaInHand) {
        this.katanaInHand.rotation.set(Math.PI * 0.45, -0.1, 0.1);
      }
    }
  }

  _checkHitbox() {
    this.hitRegistered = true;
    const pl = this.game.player;
    if (!pl) return;

    const pPos = pl.pos;
    const pFwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, pl.heading, 0));
    const hitDist = 2.85;
    const damage = this.comboStep === 3 ? 45 : (this.comboStep === 2 ? 30 : 25);
    const isFinisher = this.comboStep === 3;

    // Check against level monsters
    const lvl = this.game.level;
    if (!lvl || !lvl.monsters) return;

    for (const monster of lvl.monsters) {
      if (!monster.alive) continue;
      const mPos = monster.position;
      const toMonster = new THREE.Vector3().subVectors(mPos, pPos);
      const d = toMonster.length();

      if (d <= hitDist) {
        toMonster.normalize();
        const dot = pFwd.dot(toMonster);
        if (dot > 0.15) { // within ~80 degrees forward cone
          monster.takeDamage(damage, isFinisher, pFwd);

          // Impact audio & particles
          this.game.audio.katanaHit();
          const hitPoint = new THREE.Vector3().copy(mPos).addScaledVector(toMonster, -0.4);
          hitPoint.y += 1.4;
          this.game.vfx.burst(hitPoint, {
            color: 0x8fe3ff,
            count: 32,
            speed: 4.2,
            size: 0.12,
            life: 0.55,
          });
          this.game.vfx.burst(hitPoint, {
            color: 0xff6b6b,
            count: 20,
            speed: 3.0,
            size: 0.09,
            life: 0.45,
          });

          // Camera micro-shake
          this._applyCameraShake(0.12);
          break; // hit first monster in line
        }
      }
    }
  }

  // ------------------------------------------------------------- Player Damage & Death
  takeDamage(amount, fromPos) {
    if (this.isDead || this.invulnTimer > 0 || this.game.state !== 'play') return;

    if (this.blocking) {
      // Block parry! Reduce damage by 85%
      const reduced = Math.max(2, Math.round(amount * 0.15));
      this.playerHp = Math.max(1, this.playerHp - reduced);
      this.invulnTimer = 0.35;
      this.game.audio.katanaBlock();

      const pl = this.game.player;
      if (pl) {
        const sparkPos = pl.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        this.game.vfx.burst(sparkPos, { color: 0xffc46b, count: 24, speed: 4.0, size: 0.12, life: 0.4 });
      }
      this.game.ui.feedback('BLOCKED!', true);
      this._applyCameraShake(0.08);
      this.game.ui.updatePlayerHp(this.playerHp, this.maxHp);
      return;
    }

    // Full hit
    this.playerHp -= amount;
    this.invulnTimer = 0.7;
    this.game.audio.katanaHit();
    this._applyCameraShake(0.24);
    this.game.ui.feedback(`-${amount} HP`, false);
    this.game.ui.damageFlash();
    this.game.ui.updatePlayerHp(this.playerHp, this.maxHp);

    // Push player back
    const pl = this.game.player;
    if (pl && fromPos) {
      const pushDir = new THREE.Vector3().subVectors(pl.pos, fromPos);
      pushDir.y = 0;
      if (pushDir.lengthSq() > 0.01) {
        pushDir.normalize();
        pl.group.position.addScaledVector(pushDir, 0.75);
      }
    }

    if (this.playerHp <= 0) {
      this.playerHp = 0;
      this.die();
    }
  }

  _applyCameraShake(intensity) {
    const cam = this.game.camera;
    if (!cam) return;
    cam.position.x += rand(-intensity, intensity);
    cam.position.y += rand(-intensity, intensity);
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.game.audio.fail();
    this.game.ui.showDeathScreen(true);
  }

  respawn() {
    this.isDead = false;
    this.playerHp = this.maxHp;
    this.comboStep = 0;
    this.attackTimer = 0;
    this.blocking = false;
    this.invulnTimer = 1.0;
    this.game.ui.showDeathScreen(false);
    this.game.ui.updatePlayerHp(this.playerHp, this.maxHp);

    // Reset player to safe spawn for current level
    const lvl = this.game.level;
    if (lvl && lvl.spawn) {
      this.game.player.reset(lvl.spawn.x, lvl.spawn.z, lvl.spawn.yaw);
    }
  }
}
