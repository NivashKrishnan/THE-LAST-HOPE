import * as THREE from 'three';
import { clamp, damp, rand, randi, choice } from './util.js';

// Base 3D Animated Supernatural Creature
export class Monster {
  constructor(game, opts = {}) {
    this.game = game;
    this.name = opts.name || 'Shadow Stalker';
    this.scale = opts.scale || 1.35;
    this.maxHp = opts.hp || 130;
    this.hp = this.maxHp;
    this.speed = opts.speed || 3.8;
    this.chaseSpeed = opts.chaseSpeed || 5.8;
    this.damageNormal = opts.damageNormal || 20;
    this.damageHeavy = opts.damageHeavy || 38;
    this.patrolPoints = opts.patrol || [];
    this.aggroRadius = opts.aggroRadius || 14;
    this.loseAggroRadius = opts.loseAggroRadius || 24;
    this.onDefeat = opts.onDefeat || null;
    this.isBoss = !!opts.isBoss;

    this.group = new THREE.Group();
    this.alive = true;
    this.state = 'IDLE'; // IDLE, PATROL, ALERT, CHASE, ATTACK_NORMAL, ATTACK_HEAVY, RECOVERY, STAGGER, RETREAT, SEARCH, DEAD
    this.stateTimer = 0;
    this.currentPatrolIdx = 0;
    this.lastPlayerPos = new THREE.Vector3();
    this.heading = 0;
    this.hitCount = 0;
    this.staggerTimer = 0;
    this.retreatCooldown = 0;
    this.stepTimer = 0;
    this.growlTimer = rand(3, 7);

    this.bodyParts = {};
    this._buildMesh();
    this.group.scale.setScalar(this.scale);

    if (opts.pos) {
      this.group.position.copy(opts.pos);
    }
    game.scene.add(this.group);
  }

  get position() { return this.group.position; }

  _buildMesh() {
    const std = (c, r = 0.8, m = 0.2, extra = {}) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });

    const hideMat = std(0x13171e, 0.85, 0.25);
    const boneMat = std(0x2a303a, 0.7, 0.35);
    const hornMat = std(0x0a0c10, 0.6, 0.45);
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 2.8,
      roughness: 0.2,
    });
    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0x880022,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const root = new THREE.Group();
    this.group.add(root);
    this.bodyParts.root = root;

    // Torso (hunched, muscular, apex predator shape)
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.95, 1.25);
    torsoGeo.translate(0, 0, 0.1);
    const torso = new THREE.Mesh(torsoGeo, hideMat);
    torso.position.y = 1.35;
    torso.rotation.x = 0.22;
    torso.castShadow = true;
    root.add(torso);
    this.bodyParts.torso = torso;

    // Spine spines / ridges
    for (let i = -0.45; i <= 0.45; i += 0.22) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), hornMat);
      spike.position.set(0, 0.52, i);
      spike.rotation.x = -0.3;
      spike.castShadow = true;
      torso.add(spike);
    }

    // Chest plate / rib cage
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.45, 0.6), boneMat);
    rib.position.set(0, -0.05, 0.15);
    torso.add(rib);

    // Neck & Head
    const neck = new THREE.Group();
    neck.position.set(0, 0.35, 0.65);
    torso.add(neck);
    this.bodyParts.neck = neck;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.65), hideMat);
    head.position.set(0, 0.1, 0.25);
    head.castShadow = true;
    neck.add(head);
    this.bodyParts.head = head;

    // Massive horned brow
    [-0.22, 0.22].forEach((x) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.75, 7), hornMat);
      horn.position.set(x, 0.28, -0.05);
      horn.rotation.set(-0.4, 0, x < 0 ? -0.35 : 0.35);
      horn.castShadow = true;
      head.add(horn);
    });

    // Glowing Menacing Eyes
    [-0.15, 0.15].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), this.eyeMat);
      eye.position.set(x, 0.08, 0.3);
      head.add(eye);
    });
    this.eyeLight = new THREE.PointLight(0xff1122, 1.2, 5);
    this.eyeLight.position.set(0, 0.1, 0.45);
    head.add(this.eyeLight);

    // Hinged Lower Jaw
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.5), boneMat);
    jaw.position.set(0, -0.22, 0.22);
    head.add(jaw);
    this.bodyParts.jaw = jaw;

    // Fangs
    [-0.12, 0.12].forEach((x) => {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.15, 5), hornMat);
      fang.position.set(x, 0.08, 0.2);
      fang.rotation.x = Math.PI;
      jaw.add(fang);
    });

    // Long Predatory Forearms & Claws (Left & Right)
    this.bodyParts.armL = this._buildLimb(root, 0.45, 1.4, 0.45, true, hideMat, hornMat);
    this.bodyParts.armR = this._buildLimb(root, -0.45, 1.4, 0.45, true, hideMat, hornMat);

    // Digitigrade Hind Legs (Left & Right)
    this.bodyParts.legL = this._buildLimb(root, 0.38, 1.25, -0.45, false, hideMat, hornMat);
    this.bodyParts.legR = this._buildLimb(root, -0.38, 1.25, -0.45, false, hideMat, hornMat);

    // Shadow Aura Smoke Ring
    const aura = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.6, 16), this.auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.08;
    this.group.add(aura);
    this.bodyParts.aura = aura;
  }

  _buildLimb(parent, x, y, z, isArm, mainMat, clawMat) {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, y, z);
    parent.add(shoulder);

    // Upper limb
    const upperGeo = new THREE.BoxGeometry(0.22, 0.65, 0.24);
    upperGeo.translate(0, -0.28, 0);
    const upper = new THREE.Mesh(upperGeo, mainMat);
    upper.castShadow = true;
    shoulder.add(upper);

    // Joint / Elbow / Knee
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.58, 0);
    shoulder.add(elbow);

    // Lower limb
    const lowerGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2);
    lowerGeo.translate(0, -0.32, 0.06);
    const lower = new THREE.Mesh(lowerGeo, mainMat);
    lower.castShadow = true;
    elbow.add(lower);

    // Paw / Claw cluster
    const paw = new THREE.Group();
    paw.position.set(0, -0.68, 0.08);
    elbow.add(paw);

    [-0.07, 0, 0.07].forEach((cx) => {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 5), clawMat);
      claw.position.set(cx, -0.05, 0.12);
      claw.rotation.x = Math.PI * 0.45;
      claw.castShadow = true;
      paw.add(claw);
    });

    return { shoulder, elbow, paw };
  }

  // ------------------------------------------------------------- AI State Machine
  update(dt) {
    if (!this.alive) return;

    this.stateTimer += dt;
    if (this.retreatCooldown > 0) this.retreatCooldown -= dt;

    const pl = this.game.player;
    if (!pl) return;

    const pPos = pl.pos;
    const mPos = this.group.position;
    const toPlayer = new THREE.Vector3().subVectors(pPos, mPos);
    toPlayer.y = 0;
    const distToPlayer = toPlayer.length();

    // Occasional atmospheric growl
    this.growlTimer -= dt;
    if (this.growlTimer <= 0) {
      this.growlTimer = rand(5, 11);
      if (distToPlayer < 26) this.game.audio.monsterGrowl();
    }

    // State transitions
    switch (this.state) {
      case 'IDLE':
        this._updateIdle(dt, distToPlayer);
        break;
      case 'PATROL':
        this._updatePatrol(dt, distToPlayer);
        break;
      case 'ALERT':
        this._updateAlert(dt, toPlayer, distToPlayer);
        break;
      case 'CHASE':
        this._updateChase(dt, toPlayer, distToPlayer);
        break;
      case 'ATTACK_NORMAL':
        this._updateAttackNormal(dt, toPlayer, distToPlayer);
        break;
      case 'ATTACK_HEAVY':
        this._updateAttackHeavy(dt, toPlayer, distToPlayer);
        break;
      case 'RECOVERY':
        this._updateRecovery(dt, toPlayer, distToPlayer);
        break;
      case 'STAGGER':
        this._updateStagger(dt);
        break;
      case 'RETREAT':
        this._updateRetreat(dt, toPlayer);
        break;
      case 'SEARCH':
        this._updateSearch(dt, distToPlayer);
        break;
    }

    // Aura pulse
    if (this.bodyParts.aura) {
      this.bodyParts.aura.rotation.z += dt * 0.6;
      this.bodyParts.aura.material.opacity = 0.35 + Math.sin(this.stateTimer * 4) * 0.15;
    }

    // Resolve level wall collisions
    this._resolveCollisions();
  }

  _updateIdle(dt, dist) {
    this._animateBreathing(dt);
    if (dist < this.aggroRadius) {
      this._enterAlert();
    } else if (this.stateTimer > 4 && this.patrolPoints.length > 0) {
      this.state = 'PATROL';
      this.stateTimer = 0;
    }
  }

  _updatePatrol(dt, dist) {
    if (dist < this.aggroRadius) {
      this._enterAlert();
      return;
    }

    if (!this.patrolPoints.length) {
      this.state = 'IDLE';
      return;
    }

    const target = this.patrolPoints[this.currentPatrolIdx];
    const toTarget = new THREE.Vector3(target.x - this.group.position.x, 0, target.z - this.group.position.z);
    const d = toTarget.length();

    if (d < 1.0) {
      this.currentPatrolIdx = (this.currentPatrolIdx + 1) % this.patrolPoints.length;
      this.state = 'IDLE';
      this.stateTimer = 0;
    } else {
      toTarget.normalize();
      this._faceDirection(toTarget, dt, 4.0);
      this.group.position.addScaledVector(toTarget, this.speed * 0.65 * dt);
      this._animateWalk(dt, 0.65);
    }
  }

  _enterAlert() {
    this.state = 'ALERT';
    this.stateTimer = 0;
    this.game.audio.monsterGrowl();
    this.game.audio.startTension();
    this.game.ui.updateMonsterHp(this.hp, this.maxHp, this.name);
    this.game.ui.notify('HOSTILE DETECTED', `${this.name} senses your presence!`, 'red', 2600);
  }

  _updateAlert(dt, toPlayer, dist) {
    // Stop and face player with menace
    this._faceDirection(toPlayer.clone().normalize(), dt, 6.0);
    this.bodyParts.torso.position.y = 1.45 + Math.sin(this.stateTimer * 6) * 0.08;
    if (this.bodyParts.neck) this.bodyParts.neck.rotation.x = -0.3;
    if (this.bodyParts.jaw) this.bodyParts.jaw.rotation.x = 0.4;

    if (this.stateTimer > 0.85) {
      this.state = 'CHASE';
      this.stateTimer = 0;
      this.game.audio.monsterRoar();
      this.game.ui.updateMonsterHp(this.hp, this.maxHp, this.name);
    }
  }

  _updateChase(dt, toPlayer, dist) {
    if (dist > this.loseAggroRadius) {
      this.state = 'SEARCH';
      this.stateTimer = 0;
      this.lastPlayerPos.copy(this.game.player.pos);
      this.game.audio.stopTension();
      this.game.ui.hideMonsterHp();
      return;
    }

    const dir = toPlayer.clone().normalize();
    this._faceDirection(dir, dt, 7.5);

    // Reposition / Retreat check if low health
    if (this.hp < this.maxHp * 0.3 && this.retreatCooldown <= 0 && dist < 5.0) {
      this.state = 'RETREAT';
      this.stateTimer = 0;
      this.retreatCooldown = 7.0;
      return;
    }

    // In attack reach?
    if (dist < 2.5) {
      // 70% normal attack, 30% heavy attack
      if (Math.random() < 0.35) {
        this._startHeavyAttack();
      } else {
        this._startNormalAttack();
      }
      return;
    }

    // Sprint toward player
    this.group.position.addScaledVector(dir, this.chaseSpeed * dt);
    this._animateWalk(dt, 1.4);

    // Footstep thud
    this.stepTimer += dt * 3.5;
    if (this.stepTimer > 1.0) {
      this.stepTimer = 0;
      this.game.audio.monsterStep();
    }
  }

  _startNormalAttack() {
    this.state = 'ATTACK_NORMAL';
    this.stateTimer = 0;
    this.attackHitDone = false;
  }

  _updateAttackNormal(dt, toPlayer, dist) {
    this._faceDirection(toPlayer.clone().normalize(), dt, 4.0);

    // Telegraph (0.0 to 0.35s): Raise right claw
    if (this.stateTimer < 0.35) {
      const k = this.stateTimer / 0.35;
      this.bodyParts.armR.shoulder.rotation.set(-1.6 * k, 0.4 * k, 0.5 * k);
      this.eyeLight.intensity = 2.0;
    }
    // Strike (0.35s to 0.55s): Slash forward
    else if (this.stateTimer < 0.55) {
      const k = (this.stateTimer - 0.35) / 0.2;
      this.bodyParts.armR.shoulder.rotation.set(1.4 * (1 - k) - 0.4, -0.6 * k, -0.4);

      if (!this.attackHitDone && dist < 2.8) {
        this.attackHitDone = true;
        this.game.playerCombat?.takeDamage(this.damageNormal, this.position);
      }
    }
    // Complete -> Recovery
    else {
      this.state = 'RECOVERY';
      this.stateTimer = 0;
      this.recoveryDuration = 0.55;
    }
  }

  _startHeavyAttack() {
    this.state = 'ATTACK_HEAVY';
    this.stateTimer = 0;
    this.attackHitDone = false;
    // Visual and audio attack warning
    this.game.audio.monsterRoar();
    this.eyeMat.color.set(0xff0055);
    this.eyeMat.emissive.set(0xff0033);
    this.eyeLight.intensity = 4.0;
    this.eyeLight.color.set(0xff0044);
    this.game.ui.feedback('WARNING: HEAVY ATTACK!', false);
  }

  _updateAttackHeavy(dt, toPlayer, dist) {
    // Telegraph Windup (0.0s to 0.75s): Rears up both arms high, glowing eyes
    if (this.stateTimer < 0.75) {
      const k = this.stateTimer / 0.75;
      this.bodyParts.torso.position.y = 1.35 + 0.4 * k;
      this.bodyParts.torso.rotation.x = 0.22 - 0.4 * k;
      this.bodyParts.armL.shoulder.rotation.set(-1.8 * k, -0.4 * k, -0.4 * k);
      this.bodyParts.armR.shoulder.rotation.set(-1.8 * k, 0.4 * k, 0.4 * k);
    }
    // Heavy Slam (0.75s to 0.95s): Slams both arms down onto ground
    else if (this.stateTimer < 0.95) {
      const k = (this.stateTimer - 0.75) / 0.2;
      this.bodyParts.torso.position.y = 1.75 - 0.5 * k;
      this.bodyParts.armL.shoulder.rotation.set(1.2 * k, 0, 0);
      this.bodyParts.armR.shoulder.rotation.set(1.2 * k, 0, 0);

      if (!this.attackHitDone) {
        this.attackHitDone = true;
        this.game.audio.monsterStep();
        // Ground shockwave
        const groundPos = this.position.clone();
        this.game.vfx.ring(groundPos, { color: 0xff3344, r1: 5.5, life: 0.7 });
        this.game.vfx.burst(groundPos, { color: 0xff5533, count: 36, speed: 4.5, size: 0.14 });

        if (dist < 3.4) {
          this.game.playerCombat?.takeDamage(this.damageHeavy, this.position);
        }
      }
    }
    // Slam finished -> Enters longer recovery window
    else {
      this.eyeLight.intensity = 1.2;
      this.eyeLight.color.set(0xff1122);
      this.state = 'RECOVERY';
      this.stateTimer = 0;
      this.recoveryDuration = 0.95; // Opening for player counter-attack!
    }
  }

  _updateRecovery(dt, toPlayer, dist) {
    // Breathing in recovery
    this._animateBreathing(dt);
    if (this.stateTimer >= this.recoveryDuration) {
      this.state = 'CHASE';
      this.stateTimer = 0;
    }
  }

  _updateStagger(dt) {
    // Drooped vulnerable pose
    this.bodyParts.torso.position.y = 1.05;
    this.bodyParts.torso.rotation.x = 0.55;
    if (this.bodyParts.neck) this.bodyParts.neck.rotation.x = 0.5;
    this.bodyParts.armL.shoulder.rotation.set(-0.3, 0, -0.4);
    this.bodyParts.armR.shoulder.rotation.set(-0.3, 0, 0.4);

    if (this.stateTimer >= this.staggerTimer) {
      this.state = 'CHASE';
      this.stateTimer = 0;
      this.game.audio.monsterGrowl();
    }
  }

  _updateRetreat(dt, toPlayer) {
    // Leaps or sprints backward away from player
    const away = toPlayer.clone().negate().normalize();
    this._faceDirection(toPlayer.clone().normalize(), dt, 6.0); // Keep facing player while backing up
    this.group.position.addScaledVector(away, this.chaseSpeed * 1.1 * dt);
    this._animateWalk(dt, 1.2);

    if (this.stateTimer > 1.2) {
      this.state = 'CHASE';
      this.stateTimer = 0;
      this.game.audio.monsterRoar();
    }
  }

  _updateSearch(dt, dist) {
    if (dist < this.aggroRadius) {
      this._enterAlert();
      return;
    }

    // Sniffing and looking around
    this.heading += Math.sin(this.stateTimer * 2.5) * 0.02;
    this.group.rotation.y = this.heading;
    this._animateBreathing(dt);

    if (this.stateTimer > 4.5) {
      this.state = 'PATROL';
      this.stateTimer = 0;
      this.game.ui.hideMonsterHp();
    }
  }

  // ------------------------------------------------------------- Combat Reactions
  takeDamage(amount, isFinisher, hitDir) {
    if (!this.alive) return;

    this.hp -= amount;
    this.hitCount++;
    this.game.audio.monsterHit();
    this.game.ui.updateMonsterHp(this.hp, this.maxHp, this.name);

    // Hit flash
    this._flashBody(0xff6666);

    // Knockback
    if (hitDir) {
      this.group.position.addScaledVector(hitDir, isFinisher ? 0.9 : 0.4);
    }

    // Stagger trigger on combo finisher or 3 quick hits
    if (isFinisher || this.hitCount >= 3) {
      this.hitCount = 0;
      this.state = 'STAGGER';
      this.stateTimer = 0;
      this.staggerTimer = 1.35;
      this.game.ui.feedback('STAGGERED!', true);
    }

    // Aggro if hit while idle/patrol
    if (['IDLE', 'PATROL', 'SEARCH'].includes(this.state)) {
      this.state = 'CHASE';
      this.stateTimer = 0;
      this.game.audio.monsterRoar();
      this.game.audio.startTension();
    }

    if (this.hp <= 0) {
      this.die();
    }
  }

  _flashBody(color) {
    const orig = this.bodyParts.torso.material.color.getHex();
    this.bodyParts.torso.material.color.set(color);
    setTimeout(() => {
      if (this.bodyParts.torso) this.bodyParts.torso.material.color.set(orig);
    }, 140);
  }

  die() {
    this.alive = false;
    this.state = 'DEAD';
    this.game.audio.monsterDeath();
    this.game.audio.stopTension();
    this.game.ui.hideMonsterHp();
    this.game.ui.notify('BEAST DEFEATED', `${this.name} has fallen.`, 'gold', 3200);

    // Death collapse animation
    const collapse = () => {
      this.group.position.y -= 0.05;
      this.group.rotation.z += 0.03;
      if (this.group.position.y > -0.6) {
        requestAnimationFrame(collapse);
      } else {
        // Disperse into dark motes
        this.game.vfx.burst(this.position.clone().add(new THREE.Vector3(0, 1, 0)), {
          color: 0x880033,
          count: 60,
          speed: 3.5,
          size: 0.16,
          life: 1.5,
        });
        this.group.visible = false;
      }
    };
    collapse();

    if (this.onDefeat) {
      this.onDefeat(this);
    }
  }

  // ------------------------------------------------------------- Animation & Helpers
  _animateBreathing(dt) {
    const s = Math.sin(this.stateTimer * 2.8);
    this.bodyParts.torso.position.y = 1.35 + s * 0.04;
    this.bodyParts.torso.rotation.x = 0.22 + s * 0.03;
  }

  _animateWalk(dt, speedMul) {
    const p = this.stateTimer * 5.2 * speedMul;
    const s1 = Math.sin(p);
    const s2 = Math.sin(p + Math.PI);

    this.bodyParts.armL.shoulder.rotation.x = s2 * 0.6;
    this.bodyParts.armR.shoulder.rotation.x = s1 * 0.6;
    this.bodyParts.legL.shoulder.rotation.x = s1 * 0.65;
    this.bodyParts.legR.shoulder.rotation.x = s2 * 0.65;
    this.bodyParts.torso.position.y = 1.35 + Math.abs(s1) * 0.08;
  }

  _faceDirection(dir, dt, speed = 6.0) {
    if (dir.lengthSq() < 0.001) return;
    const targetAngle = Math.atan2(dir.x, dir.z);
    this.heading = damp(this.heading, targetAngle, speed, dt);
    this.group.rotation.y = this.heading;
  }

  _resolveCollisions() {
    const lvl = this.game.level;
    if (!lvl || !lvl.colliders) return;

    const p = this.group.position;
    const r = 0.65 * this.scale;
    for (const c of lvl.colliders) {
      if (!c || p.y > (c.h ?? 99)) continue;
      if (p.x + r > c.x0 && p.x - r < c.x1 && p.z + r > c.z0 && p.z - r < c.z1) {
        const dL = p.x - c.x0, dR = c.x1 - p.x;
        const dT = p.z - c.z0, dB = c.z1 - p.z;
        const min = Math.min(dL, dR, dT, dB);
        if (min === dL) p.x = c.x0 - r;
        else if (min === dR) p.x = c.x1 + r;
        else if (min === dT) p.z = c.z0 - r;
        else p.z = c.z1 + r;
      }
    }
  }

  dispose() {
    this.alive = false;
    this.game.ui.hideMonsterHp();
    this.game.audio.stopTension();
    this.game.scene.remove(this.group);
  }
}

// ---------------------------------------------------------------------------
// FINAL BOSS: THE VOID BEHEMOTH
// ---------------------------------------------------------------------------
export class VoidBehemoth extends Monster {
  constructor(game, opts = {}) {
    super(game, {
      name: 'THE VOID BEHEMOTH',
      scale: 2.3,
      hp: 460,
      speed: 3.5,
      chaseSpeed: 6.2,
      damageNormal: 28,
      damageHeavy: 48,
      isBoss: true,
      ...opts,
    });

    this.chargeTimer = 0;
    this.bossPhase = 1;
    this.attackPatternIndex = 0;

    // Dark obsidian horns and purple glowing cosmic veins
    if (this.bodyParts.head) {
      const crownHorn = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 1.2, 7),
        new THREE.MeshStandardMaterial({ color: 0x06070a, metalness: 0.9, roughness: 0.2 })
      );
      crownHorn.position.set(0, 0.45, 0);
      crownHorn.rotation.x = -0.3;
      this.bodyParts.head.add(crownHorn);
    }
    if (this.eyeLight) {
      this.eyeLight.color.set(0xa844ff);
      this.eyeLight.intensity = 5.0;
    }
    if (this.eyeMat) {
      this.eyeMat.color.set(0xc866ff);
      this.eyeMat.emissive.set(0x9922ff);
    }
  }

  _startHeavyAttack() {
    this.attackPatternIndex = (this.attackPatternIndex + 1) % 3;

    // Pattern 0: Shockwave Ground Slam
    // Pattern 1: Double Claw Frenzy
    // Pattern 2: Behemoth Charging Rush
    if (this.attackPatternIndex === 2) {
      this._startChargeAttack();
    } else {
      super._startHeavyAttack();
    }
  }

  _startChargeAttack() {
    this.state = 'BOSS_CHARGE';
    this.stateTimer = 0;
    this.chargeHitDone = false;
    this.game.audio.monsterRoar();
    this.game.ui.feedback('BEHEMOTH CHARGE!', false);
  }

  update(dt) {
    if (this.state === 'BOSS_CHARGE') {
      this._updateCharge(dt);
      this._resolveCollisions();
      return;
    }
    super.update(dt);
  }

  _updateCharge(dt) {
    this.stateTimer += dt;
    const pl = this.game.player;
    if (!pl) return;

    // Windup stance (0.0 to 0.6s)
    if (this.stateTimer < 0.6) {
      const toPlayer = new THREE.Vector3().subVectors(pl.pos, this.position).normalize();
      this._faceDirection(toPlayer, dt, 8.0);
      this.bodyParts.torso.position.y = 1.1;
    }
    // High-speed charge (0.6 to 1.6s)
    else if (this.stateTimer < 1.6) {
      const fwd = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, this.heading, 0));
      this.group.position.addScaledVector(fwd, 9.5 * dt);
      this._animateWalk(dt, 2.2);

      const d = Math.hypot(pl.pos.x - this.position.x, pl.pos.z - this.position.z);
      if (!this.chargeHitDone && d < 3.2) {
        this.chargeHitDone = true;
        this.game.playerCombat?.takeDamage(35, this.position);
      }
    }
    // Charge recovery (1.6 to 2.3s)
    else {
      this.state = 'RECOVERY';
      this.stateTimer = 0;
      this.recoveryDuration = 0.9;
    }
  }
}
