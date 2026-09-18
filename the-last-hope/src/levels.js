import * as THREE from 'three';
import { TEX, rand, randi, choice, clamp, sleep, runeTexture, runeStripTexture, skylineTexture, distToSeg2D, canvasTexture, drawRune, RUNE_NAMES } from './util.js';
import { Interactable } from './interactables.js';
import { Monster, VoidBehemoth } from './monster.js';
import { SwitchPuzzleController } from './puzzles.js';
import * as ENVK from './environment.js';
const ENV = ENVK.ENV;

export const CHAPTERS = ['I', 'II', 'III', 'IV'];
export const CHAPTER_TITLES = ['GRAND GATEWAY', 'HIDDEN FOREST', 'THE MYSTERY CAVE', "CREATOR'S GATE"];

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });

// ---------------------------------------------------------------------------
class BaseLevel {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.colliders = [];
    this.interactables = [];
    this.hiddenClues = [];
    this.monsters = [];
    this.t = 0;
    this.petaloProfile = 'normal';
    this.introLook = null;
  }
  add(o) { this.group.add(o); return o; }
  solid(x0, z0, x1, z1, h = 99, camBlock = true) { this.colliders.push({ x0, z0, x1, z1, h, camBlock }); }
  solidAt(x, z, w, d, h = 99, camBlock = true) { this.solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, camBlock); }
  inter(opts) {
    if (opts.object) opts.object.updateMatrixWorld(true);
    const i = new Interactable(this.game, { ...opts, markerParent: this.group });
    this.interactables.push(i);
    return i;
  }
  update(dt) {
    this.t += dt;
    // wall-clock delta for cinematic-timed animations (robust on slow machines)
    const now = performance.now();
    this.wallDt = this._lastWall ? Math.min(0.5, (now - this._lastWall) / 1000) : dt;
    this._lastWall = now;
    // purely-visual environment animators (mist drift, shafts, crystal pulse…)
    if (this.envUpdaters) for (const fn of this.envUpdaters) fn(dt, this.t);
    for (const i of this.interactables) i.update(dt);
    if (this.monsters) {
      for (const m of this.monsters) m.update(dt);
    }
  }
  getGuidance() { return null; }
  applySave() {}
  restoreIcons(flags) {
    // rebuild HUD clue icons without notifications (used on continue)
    for (const f of flags) {
      if (f.startsWith('L2:') && !f.includes('gate')) this.game.ui.addClueIcon(f.slice(3), 'Rune of the ' + RUNE_NAMES[f.slice(3)]);
      if (f === 'L3:mural') ['eye', 'wave', 'flame'].forEach(r => this.game.ui.addClueIcon(r, 'Deep rune — ' + RUNE_NAMES[r]));
    }
  }
  dispose(scene) {
    this.interactables.forEach(i => i.dispose(this.group));
    if (this.monsters) {
      for (const m of this.monsters) m.dispose();
      this.monsters = [];
    }
    scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
}

// ---------------------------------------------------------------------------
// LEVEL 1 — GRAND GATEWAY (abandoned city)
// ---------------------------------------------------------------------------
class CityLevel extends BaseLevel {
  constructor(game) {
    super(game);
    this.spawn = { x: 0, z: -47, yaw: Math.PI };
    this.limit = { x0: -23, z0: -53, x1: 23, z1: 58 };
    this.barks = [
      'No people… no signals but ours. Keep moving, Arin.',
      'These streets have been silent for weeks, by my clock.',
      'Stay close. My sensors are the only eyes we have.',
    ];
    this.introView = V3(-9, 7.5, -58);
    this.inactivityTimer = 0;
    this.build();
  }

  build() {
    const g = this.game;
    // atmosphere
    g.scene.background = new THREE.Color(0x3a4150);
    g.scene.fog = new THREE.Fog(0x49515e, 22, 145);
    const hemi = new THREE.HemisphereLight(0x9aa7bb, 0x55483c, 1.3);
    const sun = new THREE.DirectionalLight(0xffc088, 1.9);
    sun.position.set(-42, 38, -26);
    this.sun = sun; this.hemi = hemi;
    this.add(hemi); this.add(sun);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(380, 20, 12),
      new THREE.MeshBasicMaterial({ map: TEX.skyCity, side: THREE.BackSide, fog: false }));
    this.add(dome);

    // ground & road
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ map: TEX.groundCity, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.add(ground);
    this._groundMat = ground.material;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 118), new THREE.MeshStandardMaterial({ map: TEX.road, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, -2); road.receiveShadow = true; this.add(road);
    this._roadMat = road.material;
    const walkMat = std(0x6b665e, { map: TEX.concrete });
    this._walkMat = walkMat;
    [[-5.9], [5.9]].forEach(([x]) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 118), walkMat);
      w.rotation.x = -Math.PI / 2; w.position.set(x, 0.03, -2); w.receiveShadow = true; this.add(w);
    });

    // buildings
    const facades = { A: TEX.facadeA, B: TEX.facadeB, C: TEX.facadeC };
    const specs = [
      [-16, -42, 10, 10, 22, 'A'], [16, -44, 12, 9, 14, 'B'],
      [-15, -27, 9, 9, 12, 'C'], [15, -25, 10, 10, 26, 'A'],
      [-16, -11, 10, 10, 30, 'B'], [16, -9, 9, 9, 10, 'C'],
      [-15, 3, 9, 9, 16, 'A'], [16, 5, 11, 10, 20, 'B'],
      [-16, 17, 10, 9, 12, 'C'], [15, 19, 10, 10, 28, 'A'],
      [-15, 33, 10, 10, 18, 'B'], [16, 35, 9, 9, 12, 'C'],
      [17, 47, 10, 9, 16, 'B'], [-17, 46, 9, 9, 20, 'A'],
    ];
    const roofMat = std(0x3c3a38);
    for (const [x, z, w, d, h, f] of specs) {
      const ft = facades[f];
      const side = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.92 });
      (this._facadeMats = this._facadeMats || []).push(side);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofMat, roofMat, side, side]);
      mesh.position.set(x, h / 2, z);
      mesh.rotation.y = 0;
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (f === 'C') mesh.rotation.z = rand(-0.02, 0.02);
      this.add(mesh);
      this.solidAt(x, z, w + 0.4, d + 0.4, h);
      // broken crown on some
      if (h > 15) {
        const chunk = new THREE.Mesh(new THREE.BoxGeometry(w * rand(0.3, 0.5), rand(1, 2.4), d * rand(0.3, 0.55)), roofMat);
        chunk.position.set(x + rand(-2, 2), h + 0.6, z + rand(-2, 2));
        chunk.rotation.y = rand(0, 1); chunk.castShadow = true;
        this.add(chunk);
      }
    }

    // street lamps
    const lampMat = std(0x35383c, { metalness: 0.6, roughness: 0.4 });
    this.flickerBulb = null;
    for (let z = -44; z <= 44; z += 16) {
      for (const x of [-4.6, 4.6]) {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.6, 8), lampMat);
        pole.position.y = 1.8; pole.castShadow = true; lamp.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.2),
          new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xffd9a0, emissiveIntensity: 0 }));
        head.position.set(0, 3.6, x < 0 ? 0.25 : -0.25); lamp.add(head);
        lamp.position.set(x, 0, z);
        this.add(lamp);
        if (z === 4 && x === -4.6) { // one flickering lamp near the plaza
          this.flickerBulb = head;
          this.flickerLight = new THREE.PointLight(0xffd9a0, 0, 9, 1.6);
          this.flickerLight.position.set(x, 3.4, z + 0.25);
          this.add(this.flickerLight);
        }
      }
    }

    // wrecked cars
    const carCols = [0x5a4a3a, 0x3a4a52, 0x54503e];
    [[2.6, -31, 0.3], [-2.7, -2, -0.25], [3, 25, 3.32]].forEach(([x, z, r], i) => {
      const car = new THREE.Group();
      const rust = std(carCols[i], { metalness: 0.5, roughness: 0.7 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 4.2), rust);
      body.position.y = 0.55; body.castShadow = true; car.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.1), std(0x1a2026, { metalness: 0.3, roughness: 0.3 }));
      cab.position.set(0, 1.05, -0.2); cab.castShadow = true; car.add(cab);
      const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12); wg.rotateZ(Math.PI / 2);
      const wm = std(0x16181a, { roughness: 0.9 });
      [[0.85, 1.35], [-0.85, 1.35], [0.85, -1.35], [-0.85, -1.35]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(wg, wm); w.position.set(wx, 0.32, wz); car.add(w);
      });
      car.position.set(x, 0, z); car.rotation.y = r;
      this.add(car);
      this.solidAt(x, z, 2.4, 4.6, 2, false);
    });

    // rubble
    for (let i = 0; i < 26; i++) {
      const s = rand(0.15, 0.7);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), std(0x5c5850));
      rock.position.set(rand(-10, 10), s * 0.5, rand(-50, 50));
      rock.rotation.set(rand(0, 3), rand(0, 3), 0);
      rock.castShadow = true; this.add(rock);
    }

    this._buildSignalDevice();
    this._buildGate();
    this._envDress();
  }

  // ---------------- ENVIRONMENT DRESSING (visual only) ----------------
  _envDress() {
    const g = this.game;
    const q = g.settings.quality || 'high';
    const low = q === 'low';
    ENVK.ensureEnv();

    // --- lighting: real key-light shadows + cool sky fill + warm bounce ---
    ENVK.configureSun(this.sun, { size: 62, far: 200, mapSize: 2048, radius: 2.6 }, q);
    this.sun.shadow && (this.sun.target.position.set(0, 0, 6), this.add(this.sun.target));
    const fill = new THREE.DirectionalLight(0x7f9ec4, 0.42);
    fill.position.set(38, 26, 44); this.add(fill);
    const bounce = new THREE.HemisphereLight(0xb8c6d8, 0x6b5a46, 0.32);
    this.add(bounce);
    g.scene.fog.color.setHex(0x4b5360);
    g.scene.fog.near = 26; g.scene.fog.far = 158;

    // --- surface quality: PBR normal/roughness on the existing materials ---
    ENVK.upgradeMaterial(this._groundMat, ENV.concrete, { repeat: [26, 26], normalScale: 0.85, roughness: 1 });
    ENVK.upgradeMaterial(this._roadMat, ENV.asphalt, { repeat: [2, 22], normalScale: 1.15, roughness: 1 });
    ENVK.upgradeMaterial(this._walkMat, ENV.sidewalk, { repeat: [2, 26], normalScale: 1.0 });
    (this._facadeMats || []).forEach(m => ENVK.upgradeMaterial(m, ENV.concrete, { repeat: [3, 6], normalScale: 0.9, roughness: 0.97 }));

    // shared prop materials
    const rubbleMat = ENVK.pbrMat(ENVK.cloneSet(ENV.concrete, [1.5, 1.5]), { color: 0x8d8880 });
    const stoneMat = ENVK.pbrMat(ENVK.cloneSet(ENV.rock, [1.4, 1.4]), { color: 0x8f9298 });
    const brickMat = ENVK.pbrMat(ENVK.cloneSet(ENV.brick, [1.2, 1.2]));
    const rustMat = ENVK.pbrMat(ENVK.cloneSet(ENV.rustMetal, [1, 1]), { metalness: 0.55, roughness: 0.7 });
    const deadMat = std(0x3f342a, { roughness: 1 });
    this._propMats = [rubbleMat, stoneMat, brickMat, rustMat, deadMat];

    // --- road surface storytelling: cracks, oil stains, puddles, rubble ---
    const onRoad = () => [rand(-7.6, 7.6), rand(-50, 50)];
    ENVK.decalField(this, ENV.decalCrack, low ? 16 : 36, onRoad, { min: 3, max: 7, opacity: 0.6, y: 0.041 });
    ENVK.decalField(this, ENV.decalStain, low ? 10 : 22, onRoad, { min: 2.5, max: 6, opacity: 0.5, y: 0.043 });
    ENVK.decalField(this, ENV.decalPuddle, low ? 6 : 14, onRoad, { min: 2.2, max: 4.6, opacity: 0.8, y: 0.045, color: 0x5b6774 });
    ENVK.decalField(this, ENV.decalRubble, low ? 10 : 24, onRoad, { min: 2, max: 5, opacity: 0.75, y: 0.047 });
    // moss creeping out from the kerb line
    ENVK.decalField(this, ENV.decalMoss, low ? 10 : 26, () => [(Math.random() < 0.5 ? -1 : 1) * rand(4.1, 7.6), rand(-50, 50)],
      { min: 2, max: 5, opacity: 0.55, y: 0.049 });

    // --- kerbs along both sidewalks -----------------------------------
    const kerbGeo = new THREE.BoxGeometry(0.34, 0.16, 118);
    [-4.28, 4.28].forEach(x => {
      const k = new THREE.Mesh(kerbGeo, this._walkMat);
      k.position.set(x, 0.08, -2); k.receiveShadow = true; k.castShadow = true;
      this.add(k);
    });

    // --- debris, weeds and wrecked structure along the building line ---
    // Everything below lives in the band between kerb and façade, or behind
    // the façades — the walkable road and pavement stay clear.
    const sideSpot = (zMin = -50, zMax = 50) => {
      const x = (Math.random() < 0.5 ? -1 : 1) * rand(7.6, 10.4);
      const z = rand(zMin, zMax);
      if (Math.abs(x - 8.5) < 2.6 && Math.abs(z + 5) < 2.6) return null;  // signal device
      if (z > 48) return null;                                             // gate approach
      return [x, z];
    };

    ENVK.debrisField(this, low ? 60 : 150, () => sideSpot(), { mat: rubbleMat, scale: [0.06, 0.3] });
    ENVK.debrisField(this, low ? 30 : 70, () => { const p = onRoad(); return p; }, { mat: rubbleMat, scale: [0.04, 0.17] });

    for (let i = 0; i < (low ? 5 : 11); i++) {
      const p = sideSpot(-46, 44); if (!p) continue;
      ENVK.rubblePile(this, p[0], p[1], rand(1.1, 2.4), Math.random() < 0.5 ? rubbleMat : brickMat, low ? 8 : 16);
    }
    for (let i = 0; i < (low ? 4 : 9); i++) {
      const p = sideSpot(-44, 42); if (!p) continue;
      ENVK.brokenWall(this, p[0], p[1], rand(2.6, 5.5), rand(1.2, 2.9), rand(0, 3.14), Math.random() < 0.55 ? brickMat : rubbleMat);
    }
    // toppled lamp posts / girders
    for (let i = 0; i < (low ? 3 : 7); i++) {
      const p = sideSpot(-44, 42); if (!p) continue;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(rand(0.2, 0.34), rand(0.2, 0.3), rand(3, 7)), rustMat);
      beam.position.set(p[0], rand(0.12, 0.3), p[1]);
      beam.rotation.set(rand(-0.1, 0.1), rand(0, 3.14), rand(-0.25, 0.25));
      beam.castShadow = true; beam.receiveShadow = true;
      this.add(beam);
    }
    // overturned barricades
    for (let i = 0; i < (low ? 3 : 6); i++) {
      const p = sideSpot(-42, 40); if (!p) continue;
      const bar = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.14), rustMat);
      top.position.y = 0.72; bar.add(top);
      [-0.9, 0.9].forEach(dx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.5), rustMat);
        leg.position.set(dx, 0.45, 0); bar.add(leg);
      });
      bar.position.set(p[0], 0, p[1]);
      bar.rotation.set(Math.random() < 0.5 ? 0 : 1.3, rand(0, 3.14), rand(-0.1, 0.1));
      bar.traverse(o => { o.castShadow = true; });
      this.add(bar);
    }

    // --- nature reclaiming the street ---------------------------------
    ENVK.foliageField(this, ENV.grassCard, low ? 120 : 340, () => {
      const r = Math.random();
      if (r < 0.45) { // gutter line
        const x = (Math.random() < 0.5 ? -1 : 1) * rand(4.0, 4.6);
        return [x + rand(-0.2, 0.2), rand(-50, 50)];
      }
      return sideSpot();
    }, { size: [0.35, 0.95], color: 0x9aa06a });

    ENVK.foliageField(this, ENV.leafCard, low ? 40 : 110, () => sideSpot(), { size: [0.7, 1.6], color: 0xa8b48c });

    for (let i = 0; i < (low ? 4 : 10); i++) {
      const p = sideSpot(-48, 46); if (!p) continue;
      ENVK.deadTree(this, p[0], p[1], rand(0.7, 1.25), deadMat);
    }
    // ivy climbing the façades
    for (let i = 0; i < (low ? 6 : 16); i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = rand(-46, 44);
      const h = rand(3, 8);
      const iv = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.6, 3.4), h),
        new THREE.MeshStandardMaterial({ map: ENV.vineCard, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: 0xbfc9a8 }));
      iv.position.set(side * 10.85, h / 2 + rand(0, 2), z);
      iv.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.add(iv);
    }

    // --- sagging power lines between the lamp posts ---------------------
    if (!low) {
      for (let z = -44; z < 44; z += 16) {
        ENVK.wire(this, V3(-4.6, 3.5, z), V3(-4.6, 3.5, z + 16), 0.9);
        ENVK.wire(this, V3(4.6, 3.5, z), V3(4.6, 3.5, z + 16), 0.9);
      }
      ENVK.wire(this, V3(-4.6, 3.4, -12), V3(4.6, 3.4, -12), 1.5);
      ENVK.wire(this, V3(-4.6, 3.4, 20), V3(4.6, 3.4, 20), 1.6);
    }

    // --- background scenery: the rest of the dead city -------------------
    ENVK.distantBlocks(this, { count: low ? 20 : 46, inner: 46, outer: 180, hMin: 12, hMax: 54, color: 0x333a49 });
    ENVK.distantBlocks(this, { count: low ? 10 : 22, inner: 180, outer: 300, hMin: 20, hMax: 70, color: 0x2b3140 });
    ENVK.mountainRing(this, { radius: 330, count: low ? 16 : 30, hMin: 26, hMax: 78, color: 0x2a3140, y: -6 });

    // --- atmosphere: dust, low haze, light shafts between the towers ----
    ENVK.dustMotes(this, { count: low ? 70 : 220, center: V3(0, 0, 0), size: V3(46, 9, 110), color: 0xd9cfbc, opacity: 0.26, pointSize: 0.05, speed: 0.3 });
    ENVK.groundMist(this, { center: V3(0, 0, 0), radius: 66, layers: low ? 2 : 4, color: 0x9fb0c2, opacity: 0.045, y: 0.5 });
    if (!low) {
      for (const [x, z] of [[-7.4, -34], [7.2, -14], [-6.8, 10], [7.6, 30], [-7.2, 44]]) {
        ENVK.lightShaft(this, x, 9, z, 1.4, 5.4, 18, 0xffcf9c, 0.045, [0, x < 0 ? 0.14 : -0.14]);
      }
    }
  }

  _buildSignalDevice() {
    const dev = new THREE.Group();
    const metal = std(0x3c4650, { metalness: 0.7, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.5, 16), metal);
    base.position.y = 0.25; base.castShadow = true; dev.add(base);
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.55), metal);
    console_.position.y = 0.85; console_.castShadow = true; dev.add(console_);
    this.screenMat = new THREE.MeshStandardMaterial({ color: 0x0e222c, emissive: 0x1c4a5a, emissiveIntensity: 0.5, roughness: 0.2 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), this.screenMat);
    screen.position.set(0, 1.0, 0.29); screen.rotation.x = -0.28; dev.add(screen);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.1, 8), metal);
    antenna.position.y = 2.1; dev.add(antenna);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0x223a44, emissive: 0x4fc3e8, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.2 });
    this.shard = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), this.shardMat);
    this.shard.position.y = 3.35; dev.add(this.shard);
    this.devLight = new THREE.PointLight(0x66ccff, 0.55, 8, 1.7);
    this.devLight.position.y = 3.2; dev.add(this.devLight);
    this.skyBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.34, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.skyBeam.position.y = 30; dev.add(this.skyBeam);
    dev.position.set(8.5, 0, -5);
    this.add(dev);
    this.device = dev;
    this.solidAt(8.5, -5, 2.0, 2.0, 3.4, false);
    this.signalActive = false;
    this.pingT = 0;

    this.deviceInter = this.inter({
      object: dev,
      prompt: () => {
        if (!this.game.hasFlag('L1:power_restored')) return 'Signal Device — Offline (Needs Grid Power)';
        return 'Activate the Signal Device';
      },
      radius: 3.0,
      onInteract: () => {
        if (!this.game.hasFlag('L1:power_restored')) {
          this.game.audio.fail();
          this.game.ui.feedback('NO POWER', false);
          this.game.ui.dialogue('ARIN', 'The device has no power. I need to find the substation fuse core.', 2600);
          return;
        }
        this.activateSignal();
      },
    });

    this._buildArmoryAndPuzzles();
  }

  _buildRuneStone(x, z, runeName, label, seqNum, colorHex) {
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });
    const stoneGrp = new THREE.Group();

    // Weathered stone pedestal
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 0.35, 16), std(0x484b52));
    base.position.y = 0.18;
    base.castShadow = true;
    base.receiveShadow = true;
    stoneGrp.add(base);

    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.45, 0.42), std(0x42464e));
    pillar.position.y = 1.05;
    pillar.castShadow = true;
    stoneGrp.add(pillar);

    // Glowing carved circular rune emblem on front face
    const runeTex = runeTexture(runeName);
    const emblemMat = new THREE.MeshStandardMaterial({
      map: runeTex,
      emissive: colorHex,
      emissiveIntensity: 1.8,
      roughness: 0.25,
      metalness: 0.3,
    });
    const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 18), emblemMat);
    emblem.rotation.x = Math.PI / 2;
    emblem.position.set(0, 1.25, 0.22);
    stoneGrp.add(emblem);

    // Point light casting localized color glow
    const pLight = new THREE.PointLight(colorHex, 1.2, 5.5, 1.6);
    pLight.position.set(0, 1.35, 0.35);
    stoneGrp.add(pLight);

    // Stone decorative brass cap
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.35, 4), std(0xd8a84e, { metalness: 0.7, roughness: 0.3 }));
    cap.position.y = 1.95;
    cap.rotation.y = Math.PI / 4;
    stoneGrp.add(cap);

    stoneGrp.position.set(x, 0, z);
    this.add(stoneGrp);
    this.solidAt(x, z, 1.2, 1.2, 2.2);

    this.inter({
      object: stoneGrp,
      prompt: () => this.game.hasFlag('L1:rune_' + runeName) ? `Rune of the ${label} (Recorded)` : `Inspect Rune of the ${label}`,
      radius: 2.8,
      onInteract: () => {
        this.inactivityTimer = 0;
        if (this.game.hasFlag('L1:rune_' + runeName)) {
          this.game.ui.feedback(`RUNE OF THE ${label.toUpperCase()} (#${seqNum})`, true);
          return;
        }

        this.game.audio.runeChime(seqNum - 1);
        emblemMat.emissiveIntensity = 3.8;
        pLight.intensity = 2.8;

        this.game.addClue('L1:rune_' + runeName, runeName, `${seqNum}. Rune of the ${label}`);
        this.game.ui.feedback(`RUNE OF THE ${label.toUpperCase()} FOUND!`, true);

        if (runeName === 'leaf') {
          this.game.ui.dialogue('ARIN', 'The Rune of the Leaf — it pulses with harmonic resonance. First in the sequence.', 3200);
        } else if (runeName === 'star') {
          this.game.ui.dialogue('ARIN', 'The Rune of the Star — shining brightly near the plaza landmark. Second in the sequence.', 3200);
        } else if (runeName === 'moon') {
          this.game.ui.dialogue('ARIN', 'The Rune of the Moon — carved outside the ancient terminal. Third in the sequence.', 3200);
        }

        if (this.game.hasFlag('L1:rune_leaf') && this.game.hasFlag('L1:rune_star') && this.game.hasFlag('L1:rune_moon')) {
          this.game.setObjective('return_stone', 'Return to the ancient stone terminal.');
          this.game.ui.notify('ALL RUNES DISCOVERED', 'Sequence: Leaf → Star → Moon. Return to the terminal.', 'gold', 3800);
        }
        this.game.refreshGuidance();
      }
    });
  }

  _buildArmoryAndPuzzles() {
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });

    // 1. SURVIVOR NOTICE BOARD & SHELTER (First Clue)
    const shelter = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.12), std(0x4a3622));
    board.position.set(0, 1.8, 0);
    shelter.add(board);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), std(0x3a2c1d));
    crate.position.set(0.6, 0.45, 0.4);
    shelter.add(crate);

    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.32, 8), std(0xd8a84e, { metalness: 0.7 }));
    lantern.position.set(0.6, 1.05, 0.4);
    shelter.add(lantern);
    const lanternLight = new THREE.PointLight(0xffaa44, 1.3, 6, 1.5);
    lanternLight.position.set(0.6, 1.25, 0.4);
    shelter.add(lanternLight);

    shelter.position.set(-4.8, 0, -40);
    this.add(shelter);
    this.solidAt(-4.8, -40, 2.0, 1.6, 2.5);

    this.inter({
      object: shelter,
      prompt: 'Read Survivor Bulletin',
      radius: 2.8,
      onInteract: () => {
        this.inactivityTimer = 0;
        this.game.addFlag('L1:clue_first');
        this.game.docReader.open({
          tag: 'SURVIVOR BULLETIN #14',
          title: 'Municipal Emergency Protocol',
          text: 'To any surviving students or citizens:\n\nSomeone was here recently. We tracked the mysterious Signal down the boulevard to the ancient terminal, but the armory gate requires the three district crests in resonance order.\n\nSearch the street for the three glowing runes:\n• 1st: Rune of the LEAF (near the starting entrance archway)\n• 2nd: Rune of the STAR (by the central car landmark)\n• 3rd: Rune of the MOON (at the ancient terminal steps)\n\nInside the armory is the museum\'s ceremonial katana. You will need it — a supernatural creature stalks the plaza!'
        });
        if (!this.game.hasFlag('L1:rune_leaf') || !this.game.hasFlag('L1:rune_star') || !this.game.hasFlag('L1:rune_moon')) {
          this.game.setObjective('find_runes', 'Find the three hidden runes along the boulevard.');
        }
        this.game.refreshGuidance();
      }
    });

    // 2. THE THREE GLOWING RUNES ALONG THE NATURAL PATH
    this._buildRuneStone(4.8, -35, 'leaf', 'Leaf', 1, 0x55ff88);
    this._buildRuneStone(-4.8, -18, 'star', 'Star', 2, 0x66ccff);
    this._buildRuneStone(6.4, -6, 'moon', 'Moon', 3, 0xffc46b);

    // 3. PUZZLE 1: ARMORY GATE & ANCIENT STONE TERMINAL
    this.armoryDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 4.4, 3.8),
      std(0x283038, { metalness: 0.8, roughness: 0.35 })
    );
    this.armoryDoor.position.set(10.5, 2.2, -28);
    this.armoryDoor.castShadow = true;
    this.add(this.armoryDoor);
    this.armoryColliderIdx = this.colliders.length;
    this.solidAt(10.5, -28, 0.6, 4.0, 4.4);

    const term = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.35, 0.55), std(0x1a222a, { metalness: 0.7 }));
    term.position.set(10.2, 0.68, -25.6);
    this.add(term);
    const termLight = new THREE.PointLight(0x8fe3ff, 0.8, 4);
    termLight.position.set(10.2, 1.4, -25.6);
    this.add(termLight);

    this.inter({
      object: term,
      prompt: () => this.game.hasFlag('L1:armory_open') ? 'Ancient Terminal — Passage Unlocked' : 'Ancient Stone Terminal — PUZZLE 1',
      radius: 2.8,
      onInteract: async () => {
        this.inactivityTimer = 0;
        if (this.game.hasFlag('L1:armory_open')) return;
        const solved = await this.game.pad.open({
          title: 'ANCIENT STONE TERMINAL (PUZZLE 1)',
          hint: 'Input the three discovered district runes in sequence: Leaf → Star → Moon.',
          slots: 3,
          solution: ['leaf', 'star', 'moon']
        });
        if (solved) {
          this.game.addFlag('L1:armory_open');
          this.game.audio.stoneRumble();
          this.game.audio.success();
          this.armoryDoor.position.y = -3.2;
          this.colliders[this.armoryColliderIdx] = null;
          this.colliders = this.colliders.filter(Boolean);
          this.game.vfx.burst(V3(10.5, 1.0, -28), { color: 0x8fe3ff, count: 40, speed: 2.8, size: 0.12 });

          // Story Reveal & Radio Transmission
          this.game.ui.radioTransmission("...Arin... don't go deeper...", 4200);

          // Monster Suspense Tease (Visible in distance, roars and darts away)
          this._spawnTeaseMonster();

          this.game.setObjective('find_katana', 'Enter the armory cache and claim the katana.');
          this.game.refreshGuidance();
        }
      }
    });

    // 4. ARMORY CACHE & KATANA WEAPON ALTA
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.15, 1.3), std(0x2d2218));
    rack.position.set(14.5, 0.58, -28);
    this.add(rack);
    this.dispKatana = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 1.1), std(0xe8ecf2, { metalness: 0.95, roughness: 0.15 }));
    this.dispKatana.position.set(14.5, 1.2, -28);
    this.dispKatana.rotation.y = Math.PI / 2;
    this.add(this.dispKatana);
    this.katanaLight = new THREE.PointLight(0x8fe3ff, 1.8, 5);
    this.katanaLight.position.set(14.5, 1.45, -28);
    this.add(this.katanaLight);

    this.katanaInter = this.inter({
      object: rack,
      prompt: () => this.game.hasFlag('katana_unlocked') ? 'Empty Weapon Altar' : 'Take Ceremonial Katana',
      radius: 2.6,
      onInteract: () => {
        this.inactivityTimer = 0;
        if (this.game.hasFlag('katana_unlocked')) return;
        this.game.addFlag('katana_unlocked');
        this.game.playerCombat.unlockKatana();
        this.dispKatana.visible = false;
        this.katanaLight.intensity = 0.2;
        this.katanaInter.setEnabled(false);
        this.game.setObjective('survive_stalker', 'Survive the beast stalking the central plaza!');
        this.spawnStalker();
      }
    });

    // 5. PUZZLE 3: POWER SUBSTATION JUNCTION
    const subBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.9), std(0x2b333a, { metalness: 0.6 }));
    subBox.position.set(-8.5, 0.9, -5);
    this.add(subBox);
    this.solidAt(-8.5, -5, 1.4, 1.2, 2.0);
    this.subLight = new THREE.PointLight(0xff5533, 0.8, 5);
    this.subLight.position.set(-8.5, 1.8, -4.5);
    this.add(this.subLight);

    this.subInter = this.inter({
      object: subBox,
      prompt: () => {
        if (this.game.hasFlag('L1:power_restored')) return 'Substation Online — Power Grid Routed';
        if (this.game.hasFlag('L1:fuse_core')) return 'Install Fuse Core & Route Power (PUZZLE 3)';
        return 'Power Substation — Missing Fuse Core';
      },
      radius: 2.8,
      onInteract: () => {
        this.inactivityTimer = 0;
        if (this.game.hasFlag('L1:power_restored')) return;
        if (!this.game.hasFlag('L1:fuse_core')) {
          this.game.audio.fail();
          this.game.ui.feedback('MISSING FUSE CORE', false);
          this.game.ui.dialogue('ARIN', 'The breaker slot is empty. The creature in the plaza dropped a glowing component!', 2800);
          return;
        }
        // Power restored!
        this.game.addFlag('L1:power_restored');
        this.game.audio.generatorRumble();
        this.game.audio.success();
        this.subLight.color.set(0x8fe3ff);
        this.subLight.intensity = 2.4;
        if (this.flickerBulb) this.flickerBulb.material.emissiveIntensity = 2.0;
        if (this.flickerLight) this.flickerLight.intensity = 3.5;
        this.game.ui.notify('GRID POWER RESTORED', 'The Signal Device is now powered and ready for activation!', 'gold', 3600);
        this.game.setObjective('activate_signal', 'Activate the powered Signal Device at the central plaza.');
        this.game.refreshGuidance();
      }
    });
  }

  _spawnTeaseMonster() {
    // Distant glimpse of the monster creates atmosphere and suspense
    const tease = new Monster(this.game, {
      name: 'SHADOW SILHOUETTE',
      scale: 1.3,
      hp: 999,
      pos: V3(2, 0, 16),
      patrol: []
    });
    this.game.audio.monsterGrowl();
    // Quickly dashes behind ruined wall and disappears
    setTimeout(() => {
      if (tease && tease.alive) tease.dispose();
    }, 2400);
  }

  spawnStalker() {
    if (this.stalkerSpawned) return;
    this.stalkerSpawned = true;
    const monster = new Monster(this.game, {
      name: 'SHADOW STALKER',
      scale: 1.45,
      hp: 120,
      speed: 3.4,
      chaseSpeed: 5.6,
      damageNormal: 18,
      damageHeavy: 32,
      pos: V3(0, 0, -8),
      patrol: [V3(-4, 0, -8), V3(4, 0, -8), V3(0, 0, 4)],
      onDefeat: (m) => {
        this.game.addFlag('L1:stalker_defeated');
        this._spawnFuseCore(m.position.clone());
        this.game.setObjective('power_substation', 'Take the dropped Fuse Core to the Substation (PUZZLE 3).');
        this.game.refreshGuidance();
      }
    });
    this.monsters.push(monster);
    monster._enterAlert();
  }

  _spawnFuseCore(pos) {
    this._fusePos = pos.clone();
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10),
      new THREE.MeshStandardMaterial({ color: 0x224466, emissive: 0x8fe3ff, emissiveIntensity: 2.5, metalness: 0.8 })
    );
    core.position.set(pos.x, 0.3, pos.z);
    core.rotation.z = Math.PI / 3;
    this.add(core);
    const light = new THREE.PointLight(0x8fe3ff, 1.8, 6);
    light.position.copy(core.position);
    this.add(light);

    const inter = this.inter({
      object: core,
      prompt: 'Collect High-Capacity Fuse Core',
      radius: 2.4,
      once: true,
      onInteract: () => {
        this.inactivityTimer = 0;
        this.game.addFlag('L1:fuse_core');
        this.game.audio.clueFound();
        this.game.ui.notify('COMPONENT ACQUIRED', 'High-Capacity Fuse Core', 'gold', 3000);
        core.visible = false;
        light.intensity = 0;
        this.game.refreshGuidance();
      }
    });
  }

  _buildGate() {
    const wallMat = std(0x4e4a44, { map: TEX.concrete });
    [[-14.75], [14.75]].forEach(([x]) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(19.5, 6.2, 1.4), wallMat);
      w.position.set(x, 3.1, 52); w.castShadow = true; w.receiveShadow = true; this.add(w);
      this.solidAt(x, 52, 19.5, 1.4, 6.2);
    });
    // posts
    const postMat = std(0x3a3d42, { metalness: 0.5, roughness: 0.5 });
    [-5.2, 5.2].forEach(x => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.4, 1.6), postMat);
      p.position.set(x, 3.7, 52); p.castShadow = true; this.add(p);
      this.solidAt(x, 52, 1.2, 1.6, 7.4);
    });
    // door
    this.gateDoor = new THREE.Mesh(new THREE.BoxGeometry(9.6, 6.4, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x46525c, metalness: 0.75, roughness: 0.4, map: TEX.concrete }));
    this.gateDoor.position.set(0, 3.2, 52);
    this.gateDoor.castShadow = true;
    this.add(this.gateDoor);
    this.gateColliderIdx = this.colliders.length;
    this.solidAt(0, 52, 9.6, 0.7, 6.4);
    this.gateOpenT = 0; this.gateOpening = false; this.gateOpened = false;

    this.gateInter = this.inter({
      object: this.gateDoor, markerPos: V3(0, 5, 52),
      prompt: () => this.gateOpened ? 'Pass through the gate' : 'Northern Gate — sealed',
      radius: 4.5,
      onInteract: () => {
        if (!this.signalActive) {
          this.game.ui.feedback('SEALED', false);
          if (this.game.petalo.active) this.game.petalo.say('Sealed tight. That strange console at the plaza might restore its power.');
          else this.game.ui.dialogue('ARIN', 'Locked. There has to be a way to power it…', 2600);
        }
      },
    });
  }

  activateSignal() {
    const g = this.game;
    if (this.signalActive) return;
    this.signalActive = true;
    g.addFlag('L1:device');
    g.audio.signalActivation();
    const p = this.device.position;
    g.vfx.burst(V3(p.x, 3.3, p.z), { color: 0x8fe3ff, count: 90, speed: 4.5, size: 0.13, life: 1.3, gravity: -1 });
    g.vfx.ring(V3(p.x, 0, p.z), { color: 0x8fe3ff, r1: 12 });
    this.screenMat.emissive.set(0x4fd0f0); this.screenMat.emissiveIntensity = 2.2;
    this.shardMat.emissiveIntensity = 2.6;
    this.devLight.intensity = 3.2; this.devLight.distance = 16;
    this.skyBeam.material.opacity = 0.35;
    this.gateOpening = true;
    this.gateInter.setEnabled(false);
    g.completeObjective('The signal awakened');
    g.setObjective('follow_gate', 'Follow the signal through the northern gate.');
    // PETALO arrives
    g.petalo.activate(V3(p.x, 2.2, p.z + 1.5));
    g.petalo.setProfile('normal');
    g.petalo.say('Systems online… hello, Arin! I am PETALO, your guidance unit.', 3600);
    g.petalo.say('That pulse was the Signal. It points north — beyond the old gate.', 3600);
    g.petalo.say('Follow it. And press H any time you need me to lead the way.', 3400);
    g.ui.hintBar('<span class="kbd">W A S D</span> MOVE · <span class="kbd">SHIFT</span> RUN · <span class="kbd">SPACE</span> JUMP<br><span class="kbd">E</span> INTERACT · <span class="kbd">H</span> PETALO HINT · <span class="kbd">ESC</span> PAUSE');
    this.tutTimer = 30;
    g.refreshGuidance();
  }

  applySave() {
    if (this.game.hasFlag('L1:armory_open')) {
      if (this.armoryDoor) this.armoryDoor.position.y = -3.2;
      this.colliders[this.armoryColliderIdx] = null;
      this.colliders = this.colliders.filter(Boolean);
    }
    if (this.game.hasFlag('katana_unlocked')) {
      if (this.dispKatana) this.dispKatana.visible = false;
      if (this.katanaLight) this.katanaLight.intensity = 0.2;
      if (this.katanaInter) this.katanaInter.setEnabled(false);
    }
    if (this.game.hasFlag('L1:power_restored')) {
      if (this.subLight) {
        this.subLight.color.set(0x8fe3ff);
        this.subLight.intensity = 2.4;
      }
      if (this.flickerBulb) this.flickerBulb.material.emissiveIntensity = 2.0;
      if (this.flickerLight) this.flickerLight.intensity = 3.5;
    }

    if (this.game.hasFlag('L1:device')) {
      this.signalActive = true;
      this.screenMat.emissive.set(0x4fd0f0); this.screenMat.emissiveIntensity = 2.2;
      this.shardMat.emissiveIntensity = 2.6;
      this.devLight.intensity = 3.2;
      this.skyBeam.material.opacity = 0.35;
      this.gateOpened = true; this.gateOpening = false;
      this.gateDoor.position.y = -3.4; this.gateDoor.visible = false;
      this.colliders[this.gateColliderIdx] = null;
      this.colliders = this.colliders.filter(Boolean);
      this.gateInter.setEnabled(false);
      this.deviceInter.setEnabled(false);
      this.game.setObjective('follow_gate', 'Follow the signal through the northern gate.');
    } else if (this.game.hasFlag('L1:power_restored')) {
      this.game.setObjective('activate_signal', 'Activate the powered Signal Device at the central plaza.');
    } else if (this.game.hasFlag('katana_unlocked')) {
      this.game.setObjective('survive_stalker', 'Survive the beast stalking the central plaza!');
      if (!this.game.hasFlag('L1:stalker_defeated')) this.spawnStalker();
    } else if (this.game.hasFlag('L1:armory_open')) {
      this.game.setObjective('find_katana', 'Enter the armory cache and claim the katana.');
    } else if (this.game.hasFlag('L1:rune_leaf') && this.game.hasFlag('L1:rune_star') && this.game.hasFlag('L1:rune_moon')) {
      this.game.setObjective('return_stone', 'Return to the ancient stone terminal.');
    } else if (this.game.hasFlag('L1:clue_first')) {
      this.game.setObjective('find_runes', 'Find the three hidden runes along the boulevard.');
    } else {
      this.game.setObjective('find_signal', 'Find the source of the signal.');
      if (!this.game.hasFlag('L1:intro_spoken')) {
        this.game.addFlag('L1:intro_spoken');
        this.game.ui.dialogue('ARIN', 'The cities emptied after the Signal... but the transmission led me here: "If you want to restore what was lost, reach the Creator."', 4500);
      }
    }
  }

  enter() {
    this.game.audio.startAmbient('city');
    this.applySave();
  }

  getGuidance() {
    if (!this.game.hasFlag('L1:clue_first') && !this.game.hasFlag('katana_unlocked')) return { target: V3(-4.8, 0, -40) };
    if (!this.game.hasFlag('L1:rune_leaf') && !this.game.hasFlag('katana_unlocked')) return { target: V3(4.8, 0, -35) };
    if (!this.game.hasFlag('L1:rune_star') && !this.game.hasFlag('katana_unlocked')) return { target: V3(-4.8, 0, -18) };
    if (!this.game.hasFlag('L1:rune_moon') && !this.game.hasFlag('katana_unlocked')) return { target: V3(6.4, 0, -6) };
    if (!this.game.hasFlag('L1:armory_open') && !this.game.hasFlag('katana_unlocked')) return { target: V3(10.2, 0, -25.6) };
    if (!this.game.hasFlag('katana_unlocked')) return { target: V3(14.5, 0, -28) };
    if (!this.game.hasFlag('L1:stalker_defeated')) return { target: V3(0, 0, -8) };
    if (!this.game.hasFlag('L1:fuse_core')) return { target: this._fusePos || V3(0, 0, -8) };
    if (!this.game.hasFlag('L1:power_restored')) return { target: V3(-8.5, 0, -5) };
    if (!this.signalActive) return { target: V3(8.5, 0, -5) };
    if (!this._exited) return { target: V3(0, 0, 52) };
    return null;
  }

  getHint() {
    if (!this.game.hasFlag('L1:clue_first')) return { text: 'Check the survivor notice board near the start of the boulevard.', target: V3(-4.8, 0, -40) };
    if (!this.game.hasFlag('L1:rune_leaf')) return { text: 'Find the first glowing rune (Leaf) near the starting archway.', target: V3(4.8, 0, -35) };
    if (!this.game.hasFlag('L1:rune_star')) return { text: 'Find the second glowing rune (Star) near the wrecked car landmark.', target: V3(-4.8, 0, -18) };
    if (!this.game.hasFlag('L1:rune_moon')) return { text: 'Find the third glowing rune (Moon) outside the ancient terminal.', target: V3(6.4, 0, -6) };
    if (!this.game.hasFlag('L1:armory_open')) return { text: 'Input the three discovered runes into the terminal: Leaf → Star → Moon.', target: V3(10.2, 0, -25.6) };
    if (!this.game.hasFlag('katana_unlocked')) return { text: 'Enter the armory passage and take the ceremonial katana.', target: V3(14.5, 0, -28) };
    if (!this.game.hasFlag('L1:stalker_defeated')) return { text: 'Defeat the Shadow Stalker using your katana combos (LMB) and block (RMB)!', target: V3(0, 0, -8) };
    if (!this.game.hasFlag('L1:power_restored')) return { text: 'Bring the dropped Fuse Core to the substation junction to restore power.', target: V3(-8.5, 0, -5) };
    if (!this.signalActive) return { text: 'Activate the powered Signal Device in the central plaza.', target: V3(8.5, 0, -5) };
    return { text: 'The northern gate is open! Proceed to the next area.', target: V3(0, 0, 52) };
  }

  update(dt) {
    super.update(dt);

    // Inactivity subtle hint timer (~35s without progress)
    if (!this.game.hasFlag('L1:armory_open') && this.game.state === 'play') {
      this.inactivityTimer = (this.inactivityTimer || 0) + dt;
      if (this.inactivityTimer >= 35) {
        this.inactivityTimer = 15; // Cooldown before repeating
        if (!this.game.hasFlag('L1:clue_first')) {
          this.game.ui.hintBar('HINT: Check the survivor bulletin along the starting sidewalk.');
        } else if (!this.game.hasFlag('L1:rune_leaf') || !this.game.hasFlag('L1:rune_star') || !this.game.hasFlag('L1:rune_moon')) {
          this.game.ui.hintBar('HINT: Look for the three glowing runes along the street: Leaf, Star, Moon.');
        } else {
          this.game.ui.hintBar('HINT: The symbols reveal the terminal sequence: Leaf → Star → Moon.');
        }
      }
    }
    if (this.shard) { this.shard.rotation.y += dt * 1.4; this.shard.rotation.x += dt * 0.6; this.shard.position.y = 3.35 + Math.sin(this.t * 2) * 0.1; }
    // signal ping audible when near
    if (!this.signalActive || this.t % 1 < 0.5) {
      this.pingT -= dt;
      if (this.pingT <= 0) {
        this.pingT = 2.4;
        const d = Math.hypot(this.game.player.pos.x - 8.5, this.game.player.pos.z + 5);
        if (d < 24) this.game.audio.signalPing(clamp(0.12 - d * 0.004, 0.02, 0.12));
      }
    }
    // flickering lamp
    if (this.flickerLight) {
      const f = Math.random() < 0.12 ? rand(0.1, 1.1) : this.flickerLight.intensity;
      this.flickerLight.intensity = f;
      this.flickerBulb.material.emissiveIntensity = f * 1.4;
    }
    // gate animation
    if (this.gateOpening) {
      this.gateOpenT += this.wallDt;
      if (this.gateOpenT > 0.1 && !this._gateSound) { this._gateSound = true; this.game.audio.gateOpen(); this.game.vfx.burst(V3(0, 0.4, 52), { color: 0x9a8a6a, count: 50, speed: 2.5, size: 0.16, life: 1.4, gravity: -4 }); }
      const k = clamp(this.gateOpenT / 4.2, 0, 1);
      this.gateDoor.position.y = 3.2 - 6.8 * (k * k * (3 - 2 * k));
      if (k >= 1) {
        this.gateOpening = false; this.gateOpened = true;
        this.gateDoor.visible = false;
        this.colliders.splice(this.gateColliderIdx, 1);
      }
    }
    // tutorial hint bar timer
    if (this.tutTimer !== undefined) {
      this.tutTimer -= this.wallDt;
      if (this.tutTimer <= 0) { this.game.ui.hintBar(null); this.tutTimer = undefined; }
    }
    // exit zone
    if (this.gateOpened && !this._exited && this.game.state === 'play') {
      const p = this.game.player.pos;
      if (p.z > 55 && Math.abs(p.x) < 6) { this._exited = true; this.game.nextLevel(); }
    }
  }
}

// ---------------------------------------------------------------------------
// LEVEL 2 — HIDDEN FOREST
// ---------------------------------------------------------------------------
class ForestLevel extends BaseLevel {
  constructor(game) {
    super(game);
    this.spawn = { x: 0, z: -52, yaw: Math.PI };
    this.limitCircle = { x: 0, z: 0, r: 62 };
    this.path = [[0, -52], [-6, -30], [5, -10], [-4, 8], [8, 26], [3, 42], [0, 50]];
    this.barks = [
      'This forest grew back fast after the event… almost too fast.',
      "I'm reading old energy under the trees. Ancient, but awake.",
      'Runes respond to the Signal. The missing ones are close.',
    ];
    this.introView = V3(11, 5.5, -64);
    this.found = 0;
    this.solved = false;
    this.build();
  }

  _nearPath(x, z, r) {
    for (let i = 0; i < this.path.length - 1; i++)
      if (distToSeg2D(x, z, this.path[i][0], this.path[i][1], this.path[i + 1][0], this.path[i + 1][1]) < r) return true;
    return false;
  }

  build() {
    const g = this.game;
    g.scene.background = new THREE.Color(0x0a1410);
    g.scene.fog = new THREE.Fog(0x16241d, 10, 88);
    this.hemi = new THREE.HemisphereLight(0x7a9a7f, 0x323b2f, 0.9);
    this.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xbccde4, 0.85);
    moon.position.set(24, 34, -16); this.add(moon);
    this.moon = moon;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(280, 18, 10),
      new THREE.MeshBasicMaterial({ map: TEX.skyForest, side: THREE.BackSide, fog: false }));
    this.add(dome);

    // ground
    const ground = new THREE.Mesh(new THREE.CircleGeometry(74, 40), new THREE.MeshStandardMaterial({ map: TEX.groundForest, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.add(ground);
    this._groundMat = ground.material;

    // dirt path
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6b5a43, roughness: 1, transparent: true, opacity: 0.85 });
    this._dirtMat = dirtMat;
    for (let i = 0; i < this.path.length - 1; i++) {
      const [ax, az] = this.path[i], [bx, bz] = this.path[i + 1];
      const len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / 2.1);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const d = new THREE.Mesh(new THREE.CircleGeometry(rand(1.7, 2.2), 10), dirtMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(ax + (bx - ax) * t + rand(-0.3, 0.3), 0.04, az + (bz - az) * t + rand(-0.3, 0.3));
        d.receiveShadow = true; this.add(d);
      }
    }

    // trees
    const trunkMat = std(0x4a3a28, { roughness: 0.95 });
    this._trunkMat = trunkMat;
    const crownCols = [0x1e3d2a, 0x27513a, 0x2f5c34, 0x1a3425];
    const treeCount = g.settings.quality === 'low' ? 60 : 100;
    for (let i = 0; i < treeCount; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 60 + 3;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.92;
      if (this._nearPath(x, z, 4.2)) continue;
      if (Math.hypot(x - 2, z - 44) < 8) continue;
      const h = rand(2.4, 4.2), cr = rand(1.3, 2.1);
      const amber = Math.random() < 0.1;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h, 7), trunkMat);
      trunk.position.set(x, h / 2, z); trunk.castShadow = true; this.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(cr, cr * 2.6, 8),
        std(amber ? 0x8a6428 : choice(crownCols), { roughness: 0.9 }));
      crown.position.set(x, h + cr * 1.05, z); crown.rotation.y = rand(0, 3); crown.castShadow = true; this.add(crown);
      this.solidAt(x, z, 0.7, 0.7, 99, false);
    }
    // bushes & rocks
    for (let i = 0; i < 42; i++) {
      const a = rand(0, Math.PI * 2), r = rand(6, 58);
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      if (this._nearPath(x, z, 2.4)) continue;
      const s = rand(0.5, 1.2);
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), std(choice([0x1c3020, 0x243a26])));
      b.scale.y = 0.55; b.position.set(x, s * 0.4, z); this.add(b);
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2), r = rand(8, 58);
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      if (this._nearPath(x, z, 3)) continue;
      const s = rand(0.6, 1.7);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), std(0x5a5e62, { map: TEX.rock }));
      rock.position.set(x, s * 0.5, z); rock.rotation.y = rand(0, 3); rock.castShadow = true; this.add(rock);
      this.solidAt(x, z, s * 1.4, s * 1.4, s, false);
    }

    // fallen log — environmental obstacle (jump over it)
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 7.4, 10), trunkMat);
    log.rotation.z = Math.PI / 2; log.rotation.y = 0.12;
    log.position.set(5, 0.46, -10); log.castShadow = true;
    this.add(log);
    this.solid(1.4, -10.6, 8.6, -9.4, 0.62, false);

    // stream + stepping stones
    const water = new THREE.Mesh(new THREE.PlaneGeometry(56, 2.8),
      new THREE.MeshPhongMaterial({ color: 0x1d4a5a, transparent: true, opacity: 0.7, shininess: 90, specular: 0x88bbcc }));
    water.rotation.x = -Math.PI / 2; water.position.set(-6, 0.05, 17); this.add(water);
    this.water = water;
    const stoneMat = std(0x6a6e72, { map: TEX.rock });
    [[-1, 16.5], [1.2, 17.2], [3.4, 17.9]].forEach(([x, z]) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.5, 0.65), rand(0.6, 0.75), 0.16, 9), stoneMat);
      st.position.set(x, 0.08, z); this.add(st);
    });

    // fireflies
    {
      const n = 80, pos = new Float32Array(n * 3);
      this.fireflyBase = [];
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), r = rand(4, 52);
        const x = Math.cos(a) * r, y = rand(0.4, 2.6), z = Math.sin(a) * r * 0.9;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        this.fireflyBase.push([x, y, z, rand(0, 7)]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbaff9a, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.add(this.fireflies);
    }

    this._buildConduitSwitches();
    this._buildRunes();
    this._buildMechanism();
    this._buildForestGate();
    this._buildCryptKeyPuzzle();
    this._envDress();
  }

  // ---------------- ENVIRONMENT DRESSING (visual only) ----------------
  _envDress() {
    const g = this.game;
    const q = g.settings.quality || 'high';
    const low = q === 'low';
    ENVK.ensureEnv();

    // --- moonlit key light with soft shadows, cooler ambience ---------
    ENVK.configureSun(this.moon, { size: 56, far: 180, mapSize: 2048, radius: 3.2 }, q);
    g.scene.fog.color.setHex(0x12201b);
    g.scene.fog.near = 12; g.scene.fog.far = 92;
    const canopyBounce = new THREE.HemisphereLight(0x5f7d66, 0x1d251c, 0.28);
    this.add(canopyBounce);

    // --- richer ground & trail materials --------------------------------
    ENVK.upgradeMaterial(this._groundMat, ENV.forestFloor, { repeat: [20, 20], normalScale: 1.15, roughness: 1 });
    ENVK.upgradeMaterial(this._dirtMat, ENV.dirt, { repeat: [1, 1], normalScale: 1.1, roughness: 1 });
    ENVK.upgradeMaterial(this._trunkMat, ENV.rock, { repeat: [1, 2], normalScale: 0.8, roughness: 1 });

    const mossRock = ENVK.pbrMat(ENVK.cloneSet(ENV.rock, [1.3, 1.3]), { color: 0x72786e });
    const barkMat = ENVK.pbrMat(ENVK.cloneSet(ENV.rock, [1, 2.4]), { color: 0x4b3b29 });
    const crownMats = [std(0x1d3c29, { roughness: 1 }), std(0x24462f, { roughness: 1 }), std(0x16301f, { roughness: 1 }), std(0x2c5236, { roughness: 1 })];

    // keep-out: never dress the walking trail, the clearing or the gate lane
    const free = (x, z, pad = 5.4) => {
      if (this._nearPath(x, z, pad)) return false;
      if (Math.hypot(x - 2, z - 44) < 9.5) return false;   // mechanism clearing
      if (Math.abs(x) < 8 && z > 50) return false;          // gate approach
      if (Math.hypot(x - 5, z + 10) < 5) return false;      // fallen-log jump
      for (const c of (this.runeStones || [])) if (Math.hypot(x - c.pos.x, z - c.pos.z) < 4) return false;
      return true;
    };
    const spot = (rMin = 8, rMax = 60, pad = 5.4) => {
      for (let k = 0; k < 8; k++) {
        const a = rand(0, Math.PI * 2), r = rand(rMin, rMax);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.92;
        if (free(x, z, pad)) return [x, z];
      }
      return null;
    };

    // --- a deeper, layered forest (visual density only, no colliders) ---
    ENVK.treeField(this, low ? 55 : 150, () => spot(9, 68, 6.4), {
      trunkMat: barkMat, crownMats, h: [3.2, 6.4], r: [1.4, 2.6], tiers: low ? 2 : 3,
    });
    // far treeline silhouette so the canopy never just stops
    ENVK.treeField(this, low ? 40 : 120, () => {
      const a = rand(0, Math.PI * 2), r = rand(66, 124);
      return [Math.cos(a) * r, Math.sin(a) * r * 0.95];
    }, { trunkMat: barkMat, crownMats: [crownMats[0], crownMats[2]], h: [5, 9.5], r: [2, 3.4], tiers: 2 });
    ENVK.mountainRing(this, { radius: 235, count: low ? 14 : 26, hMin: 30, hMax: 82, color: 0x101d18, y: -6 });

    // --- undergrowth: ferns, grass, leaf litter -------------------------
    ENVK.foliageField(this, ENV.fernCard, low ? 140 : 420, () => spot(5, 62, 3.1), { size: [0.5, 1.5], color: 0xcfe0c0 });
    ENVK.foliageField(this, ENV.grassCard, low ? 180 : 560, () => spot(4, 64, 2.6), { size: [0.3, 0.95], color: 0xbcd0a0 });
    ENVK.foliageField(this, ENV.leafCard, low ? 90 : 260, () => spot(6, 60, 3.4), { size: [0.7, 1.8], color: 0xaec49a });
    ENVK.debrisField(this, low ? 90 : 240, () => spot(5, 62, 2.8), { mat: mossRock, scale: [0.05, 0.24] });

    // trail edging: pebbles + moss right alongside the path (never on it)
    ENVK.decalField(this, ENV.decalMoss, low ? 26 : 72, () => {
      for (let k = 0; k < 8; k++) {
        const a = rand(0, Math.PI * 2), r = rand(6, 56);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.92;
        if (this._nearPath(x, z, 3.4) && !this._nearPath(x, z, 2.2)) return [x, z];
      }
      return null;
    }, { min: 1.4, max: 3.4, opacity: 0.5, y: 0.05 });

    // --- mossy boulders, stumps, extra fallen logs ----------------------
    const boulderSpots = [];
    for (let i = 0; i < (low ? 8 : 20); i++) {
      const p = spot(9, 58, 5.6); if (!p) continue;
      const s = rand(0.7, 2.3);
      const b = new THREE.Mesh(ENVK.boulderGeo(s, 1, 0.72), mossRock);
      b.position.set(p[0], s * 0.35, p[1]);
      b.rotation.set(rand(-0.2, 0.2), rand(0, 7), rand(-0.2, 0.2));
      b.castShadow = true; b.receiveShadow = true;
      this.add(b);
      boulderSpots.push([p[0], p[1], s]);
    }
    ENVK.decalField(this, ENV.decalMoss, boulderSpots.length, () => {
      const b = boulderSpots.pop();
      return b ? [b[0], b[1]] : null;
    }, { min: 2, max: 4.5, opacity: 0.45, y: 0.051 });
    for (let i = 0; i < (low ? 5 : 14); i++) {
      const p = spot(10, 56, 6.2); if (!p) continue;
      const len = rand(3.5, 8);
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.22, 0.45), rand(0.28, 0.55), len, 9), barkMat);
      lg.rotation.z = Math.PI / 2; lg.rotation.y = rand(0, 7);
      lg.position.set(p[0], rand(0.25, 0.45), p[1]);
      lg.castShadow = true; lg.receiveShadow = true;
      this.add(lg);
    }
    for (let i = 0; i < (low ? 5 : 14); i++) {
      const p = spot(9, 56, 5.6); if (!p) continue;
      const h = rand(0.5, 1.3);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.3, 0.5), rand(0.4, 0.65), h, 9), barkMat);
      st.position.set(p[0], h / 2, p[1]); st.castShadow = true; this.add(st);
    }
    // dead standing trunks for silhouette variety
    for (let i = 0; i < (low ? 5 : 13); i++) {
      const p = spot(12, 58, 6); if (!p) continue;
      ENVK.deadTree(this, p[0], p[1], rand(0.8, 1.5), barkMat);
    }

    // --- hanging vines from the canopy ---------------------------------
    for (let i = 0; i < (low ? 8 : 24); i++) {
      const p = spot(10, 55, 6); if (!p) continue;
      const h = rand(2, 4.5);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(rand(0.8, 1.8), h),
        new THREE.MeshStandardMaterial({ map: ENV.vineCard, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: 0x9fb98c }));
      v.position.set(p[0], rand(3.4, 5.6), p[1]);
      v.rotation.y = rand(0, 7);
      this.add(v);
    }

    // --- atmosphere: moonbeams, mist, drifting pollen -------------------
    if (!low) {
      for (let i = 0; i < 9; i++) {
        const p = spot(8, 52, 4.2); if (!p) continue;
        ENVK.lightShaft(this, p[0], 6.5, p[1], 0.5, rand(2.2, 4.4), 13, 0xcfe4ff, rand(0.035, 0.07), [rand(-0.1, 0.1), rand(-0.12, 0.12)]);
      }
      // a wider shaft over the mechanism clearing (keeps the objective readable)
      ENVK.lightShaft(this, 2, 8, 44, 1.6, 7, 16, 0xdce9ff, 0.05);
    }
    ENVK.groundMist(this, { center: V3(0, 0, 4), radius: 62, layers: low ? 2 : 5, color: 0x8fb2a2, opacity: 0.05, y: 0.35 });
    ENVK.dustMotes(this, { count: low ? 70 : 200, center: V3(0, 0, 0), size: V3(110, 7, 110), color: 0xcfe3c0, opacity: 0.22, pointSize: 0.045, speed: 0.22 });
  }

  _buildConduitSwitches() {
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });

    // 1. SEQUENCE CLUE TABLET
    const tab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.3), std(0x4a4e44, { map: TEX.rock }));
    tab.position.set(-3.5, 0.9, -32);
    this.add(tab);
    this.inter({
      object: tab,
      prompt: 'Read Conduit Sequence Tablet',
      radius: 2.6,
      onInteract: () => {
        this.game.addFlag('L2:clue_switches');
        this.game.docReader.open({
          tag: 'ANCIENT INSCRIPTION',
          title: 'Conduit Alignment Triad (PUZZLE 2)',
          text: 'To cross into the deep sacred grove, the ancient energy conduits must be awakened in unbroken harmony:\n\n1. First: Stone of Roots (I) near the entrance path.\n2. Second: Stone of Waters (II) beside the riverbank.\n3. Third: Stone of Canopy (III) amidst the shadowed trees.\n\nOnly then will the energy barrier fall.'
        });
      }
    });

    // 2. SWITCH PUZZLE CONTROLLER & 3 PILLARS
    this.switchPuzzle = new SwitchPuzzleController(this.game, {
      sequence: [1, 2, 3],
      onSolve: () => {
        this.game.addFlag('L2:switches_solved');
        if (this.conduitBarrier) this.conduitBarrier.position.y = -6;
        if (this.conduitColliderIdx !== null) {
          this.colliders[this.conduitColliderIdx] = null;
          this.colliders = this.colliders.filter(Boolean);
          this.conduitColliderIdx = null;
        }
        this.game.setObjective('enter_grove', 'The conduit barrier has fallen! Enter the deep grove.');
        setTimeout(() => this.spawnForestHunter(), 1200);
      }
    });

    const switchSpecs = [
      { id: 1, name: 'Roots (I)', x: -10, z: -22 },
      { id: 2, name: 'Waters (II)', x: 13, z: -4 },
      { id: 3, name: 'Canopy (III)', x: -7, z: 14 },
    ];

    switchSpecs.forEach(s => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), std(0x3e443c, { map: TEX.rock }));
      pillar.position.set(s.x, 1.1, s.z);
      this.add(pillar);
      this.solidAt(s.x, s.z, 0.9, 0.9, 2.2);

      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24),
        new THREE.MeshStandardMaterial({ color: 0x112211, emissive: 0x221100, emissiveIntensity: 0.3 }));
      gem.position.set(s.x, 2.35, s.z);
      this.add(gem);

      const light = new THREE.PointLight(0x8fe3ff, 0.2, 5);
      light.position.set(s.x, 2.5, s.z);
      this.add(light);

      this.switchPuzzle.registerSwitch(s.id, gem, light);

      this.inter({
        object: pillar,
        prompt: `Activate Conduit Switch ${s.id} — ${s.name}`,
        radius: 2.8,
        onInteract: () => {
          this.switchPuzzle.press(s.id);
        }
      });
    });

    // 3. CONDUIT ENERGY BARRIER
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0x8fe3ff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.conduitBarrier = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), barrierMat);
    this.conduitBarrier.position.set(0, 4.0, 20);
    this.add(this.conduitBarrier);
    this.conduitColliderIdx = this.colliders.length;
    this.solidAt(0, 20, 16, 1.2, 8);
  }

  spawnForestHunter() {
    if (this.hunterSpawned) return;
    this.hunterSpawned = true;
    const monster = new Monster(this.game, {
      name: 'FOREST HUNTER',
      scale: 1.5,
      hp: 160,
      speed: 3.8,
      chaseSpeed: 6.0,
      damageNormal: 22,
      damageHeavy: 38,
      pos: V3(2, 0, 26),
      patrol: [V3(2, 0, 26), V3(-4, 0, 28), V3(6, 0, 24)],
      onDefeat: (m) => {
        this.game.addFlag('L2:hunter_defeated');
        this._spawnArchivistKey(m.position.clone());
        this.game.setObjective('open_crypt', 'Claim the Archivist Key and unlock the subterranean vault (PUZZLE 4).');
      }
    });
    this.monsters.push(monster);
    monster._enterAlert();
    this.game.ui.notify('AMBUSH!', 'The Forest Hunter prowls the clearing! Use your katana!', 'red', 3500);
  }

  _spawnArchivistKey(pos) {
    const keyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4a034, emissive: 0xffc46b, emissiveIntensity: 2.2, metalness: 0.9 })
    );
    keyMesh.position.set(pos.x, 0.3, pos.z);
    keyMesh.rotation.z = Math.PI / 4;
    this.add(keyMesh);
    const light = new THREE.PointLight(0xffc46b, 1.8, 6);
    light.position.copy(keyMesh.position);
    this.add(light);

    this.inter({
      object: keyMesh,
      prompt: 'Pick up Archivist Sun Key',
      radius: 2.5,
      once: true,
      onInteract: () => {
        this.game.addFlag('L2:archivist_key');
        this.game.audio.clueFound();
        this.game.ui.notify('KEY ACQUIRED', 'Archivist Sun Key (Unlocks Crypt)', 'gold', 3500);
        keyMesh.visible = false;
        light.intensity = 0;
        this.game.refreshGuidance();
      }
    });
  }

  _buildCryptKeyPuzzle() {
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });

    // Journal desk with clue
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.9), std(0x3a2c20));
    desk.position.set(-4.5, 0.5, 45);
    this.add(desk);
    this.inter({
      object: desk,
      prompt: 'Read Archivist Journal',
      radius: 2.5,
      onInteract: () => {
        this.game.addFlag('L2:clue_keys');
        this.game.docReader.open({
          tag: 'ARCHIVIST JOURNAL — LAST DISPATCH',
          title: 'The Vault of Hours (PUZZLE 4)',
          text: 'The underground machines are silent. We locked the passage to the Mystery Cave and the Celestial Clock.\n\nHeed this warning: Only the Key of the Radiant Sun unlocks the door. The rusted iron key triggers a cave collapse, and the obsidian skull key summons the swarm.\n\nDo not choose wrongly.'
        });
      }
    });
  }

  _runeStone(rune, x, z, rotY, whisper) {
    const g = this.game;
    const grp = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.9, 0.5),
      new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0x8a8a90, roughness: 0.9 }));
    stone.position.y = 0.95; stone.castShadow = true; grp.add(stone);
    const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(rune, '#ffc46b'), transparent: false, color: 0x5a5a5a, fog: true });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), runeMat);
    face.position.set(0, 1.15, 0.26); grp.add(face);
    grp.position.set(x, 0, z); grp.rotation.y = rotY;
    this.add(grp);
    this.solidAt(x, z, 1.1, 0.6, 99, false);
    const clue = { pos: { x, y: 1, z }, object: grp, done: false, whisper, rune, face, runeMat, grp };
    this.hiddenClues.push(clue);
    return clue;
  }

  _buildRunes() {
    this.runesFound = { leaf: false, moon: false, star: false };
    this.runeStones = [
      this._runeStone('leaf', 11.5, -13.8, -2.4, 'Scanning… something is carved on that stone, just past the log.'),
      this._runeStone('moon', -13.5, 9, 0.9, 'A glimmer by the stream rocks. Carved stone — worth a look.'),
      this._runeStone('star', 14, 26.5, -0.7, 'My sensors itch… there is a marked stone in those bushes.'),
    ];
    for (const c of this.runeStones) {
      c.sparkle = null;
      this.inter({
        object: c.grp, prompt: 'Examine the carved stone', radius: 2.6,
        onInteract: () => this.collectRune(c),
      });
    }
  }

  collectRune(c) {
    const g = this.game;
    if (c.done) { g.ui.dialogue('PETALO', 'We already read this one.', 2000); return; }
    c.done = true;
    this.runesFound[c.rune] = true;
    this.found++;
    if (c.sparkle) c.sparkle.stop();
    c.runeMat.color.set(0xffffff);
    g.vfx.burst(V3(c.pos.x, 1.4, c.pos.z), { color: 0xffc46b, count: 34, speed: 2, size: 0.1, life: 1, gravity: -1 });
    g.addClue('L2:' + c.rune, c.rune, 'Rune of the ' + RUNE_NAMES[c.rune].toLowerCase());
    const left = 3 - this.found;
    const lines = {
      2: `The Rune of the ${RUNE_NAMES[c.rune]}! Two more sleep beneath the trees.`,
      1: `The Rune of the ${RUNE_NAMES[c.rune]} — one remains.`,
      0: `That's all three! The mechanism near the gate should wake now.`,
    };
    g.petalo.say(lines[left]);
    if (left > 0) g.setObjective('forest_runes', `Uncover the forest's hidden runes. (${this.found}/3)`);
    else g.setObjective('forest_mechanism', 'Activate the forest mechanism by the gate.');
    g.refreshGuidance();
  }

  _buildMechanism() {
    const g = this.game;
    // platform
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.3, 20), std(0x62666e, { map: TEX.rock }));
    plat.position.set(2, 0.15, 44); plat.receiveShadow = true; this.add(plat);
    // console
    const con = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 1.0), std(0x565a62, { map: TEX.rock }));
    body.position.y = 0.48; body.castShadow = true; con.add(body);
    this.mechRunes = [];
    ['leaf', 'moon', 'star'].forEach((r, i) => {
      const m = new THREE.MeshBasicMaterial({ map: runeTexture(r, '#668'), color: 0x3a3a3a });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), m);
      p.position.set(-0.7 + i * 0.7, 0.62, 0.51);
      con.add(p);
      this.mechRunes.push(m);
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 1.15), std(0x494d55, { map: TEX.rock }));
    top.position.y = 1.0; con.add(top);
    con.position.set(2, 0.3, 45.2); con.rotation.y = Math.PI;
    this.add(con);
    this.solidAt(2, 45.2, 2.6, 1.3, 99, false);

    // order tablet
    const tab = new THREE.Group();
    const tstand = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.4, 0.35), std(0x4e4a42, { map: TEX.rock }));
    tstand.position.y = 0.7; tstand.rotation.x = -0.12; tstand.castShadow = true; tab.add(tstand);
    const tface = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.78),
      new THREE.MeshBasicMaterial({ map: runeStripTexture(['leaf', 'moon', 'star'], { caption: 'FIRST THE LEAF · THEN THE MOON · LAST THE STAR' }) }));
    tface.position.set(0, 0.82, 0.19); tface.rotation.x = -0.12; tab.add(tface);
    tab.position.set(4.9, 0, 42.6); tab.rotation.y = 2.7;
    this.add(tab);
    this.solidAt(4.9, 42.6, 2.2, 0.6, 99, false);
    this.inter({
      object: tab, prompt: 'Read the stone tablet', radius: 2.6,
      onInteract: () => {
        g.ui.dialogue('STONE TABLET', '"First the Leaf, then the Moon, last the Star."', 3600);
        g.audio.interact();
      },
    });

    // mechanism interactable
    this.mechInter = this.inter({
      object: con, prompt: 'Use the Forest Mechanism', radius: 3.2, markerPos: V3(2, 2.2, 45.2),
      onInteract: async () => {
        if (this.solved) return;
        if (this.found < 3) {
          g.ui.feedback('DORMANT', false);
          const missing = this.runeStones.find(c => !c.done);
          g.petalo.say(`It sleeps. ${3 - this.found} rune${3 - this.found > 1 ? 's' : ''} still hide${3 - this.found > 1 ? '' : 's'} in the forest — follow me!`);
          if (missing) g.petalo.guideTo(V3(missing.pos.x, 0, missing.pos.z), 9);
          return;
        }
        const ok = await g.startPuzzle({
          title: 'FOREST MECHANISM',
          hint: 'Set the three runes in the order told by the stone tablet.',
          slots: 3,
          solution: ['leaf', 'moon', 'star'],
          failLines: 'Remember the tablet: first the Leaf, then the Moon, last the Star.',
        });
        if (ok) this.solveMechanism();
      },
    });

    // lanterns (lit on solve)
    this.lanterns = [];
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, emissive: 0xffc46b, emissiveIntensity: 0 });
    const postMat = std(0x3a332a);
    [[4.8, 39.5], [-1.4, 38.5], [5.2, 47.6], [-2.6, 46.4], [1.2, 52.6], [2.8, 35.2]].forEach(([x, z]) => {
      const p = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.3, 8), postMat);
      post.position.y = 1.15; post.castShadow = true; p.add(post);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lampMat.clone());
      lamp.position.y = 2.42; p.add(lamp);
      const li = new THREE.PointLight(0xffc46b, 0, 10, 1.7);
      li.position.y = 2.4; p.add(li);
      p.position.set(x, 0, z);
      this.add(p);
      this.lanterns.push({ light: li, mat: lamp.material, target: 0 });
      this.solidAt(x, z, 0.3, 0.3, 99, false);
    });
  }

  solveMechanism() {
    const g = this.game;
    this.solved = true;
    g.addFlag('L2:gate');
    this.mechInter.setEnabled(false);
    g.ui.feedback('CORRECT', true);
    g.vfx.ring(V3(2, 0.3, 45.2), { color: 0x8fe3ff, r1: 10 });
    // runes light one by one, lanterns staggered
    this.mechRunes.forEach((m, i) => setTimeout(() => {
      m.color.set(0xffffff);
      g.audio.strikeCrystal(i + 2);
      g.vfx.burst(V3(2 - 0.7 + i * 0.7, 1, 44.6), { color: 0x8fe3ff, count: 16, speed: 1.2, size: 0.08, life: 0.7, gravity: 0 });
    }, 400 * (i + 1)));
    this.lanterns.forEach((l, i) => setTimeout(() => {
      l.target = 1.25;
      l.mat.emissiveIntensity = 1.4;
      g.vfx.burst(V3(l.light.parent.position.x, 2.5, l.light.parent.position.z), { color: 0xffc46b, count: 12, speed: 1, size: 0.07, life: 0.6, gravity: 0 });
    }, 900 + 350 * i));
    setTimeout(() => { this.gateOpening = true; }, 2400);
    g.petalo.celebrate();
    g.petalo.say('Yes! Power flows through the old stones… the gate is opening!');
    g.completeObjective('Forest mechanism activated');
    g.setObjective('forest_exit', 'The gate is open. Continue following the signal.');
    g.refreshGuidance();
  }

  _buildForestGate() {
    const rockMat = std(0x54565c, { map: TEX.rock });
    [-8.5, 8.5].forEach(x => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 4), rockMat);
      r.position.set(x, 4.5, 57); r.rotation.y = rand(-0.1, 0.1); r.castShadow = true; this.add(r);
      this.solidAt(x, 57, 7, 4, 9);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 4.2), rockMat);
    lintel.position.set(0, 8, 57); this.add(lintel);
    // side walls
    [-16, 16].forEach(x => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 3), rockMat);
      w.position.set(x, 3, 57); this.add(w);
      this.solidAt(x, 57, 10, 3, 6);
    });
    this.gateDoor = new THREE.Mesh(new THREE.BoxGeometry(9.4, 7.6, 0.7),
      std(0x4a3b26, { map: TEX.concrete, roughness: 0.8 }));
    this.gateDoor.position.set(0, 3.8, 57);
    this.gateDoor.castShadow = true;
    this.add(this.gateDoor);
    this.gateColliderIdx = this.colliders.length;
    this.solidAt(0, 57, 9.4, 0.7, 7.6);
    this.gateOpening = false; this.gateOpenT = 0; this.gateOpened = false;
    this.inter({
      object: this.gateDoor, markerPos: V3(0, 5.6, 57),
      prompt: () => {
        if (this.gateOpened) return 'Pass into the Mystery Cave';
        if (!this.solved) return 'Old Forest Gate — locked by mechanism';
        return 'Unlock Vault Door (PUZZLE 4)';
      },
      radius: 4.5,
      enabled: true,
      onInteract: async () => {
        const gg = this.game;
        if (this.gateOpened) return;
        if (!this.solved) {
          gg.ui.feedback('LOCKED BY MECHANISM', false);
          gg.petalo.say(this.found < 3
            ? 'It will not move. The mechanism by the gate controls it — and the mechanism needs its runes.'
            : 'The mechanism controls this gate. Enter the rune order from the tablet!');
          return;
        }

        if (!gg.hasFlag('L2:archivist_key')) {
          gg.ui.feedback('KEY REQUIRED', false);
          gg.petalo.say('A heavy multi-ward lock. The beast in the clearing had an ancient key…');
          return;
        }

        const ok = await gg.keyPuzzle.open({
          hint: 'Select the key designated in the Archivist Journal.',
          keys: [
            { id: 'iron', name: 'Rusted Iron Key', icon: '🗝️', color: '#888888' },
            { id: 'sun', name: 'Archivist Sun Key', icon: '☀️', color: '#ffc46b' },
            { id: 'skull', name: 'Obsidian Skull Key', icon: '💀', color: '#aa44bb' },
          ],
          correctKeyId: 'sun'
        });

        if (ok) {
          gg.addFlag('L2:crypt_unlocked');
          gg.audio.doorHeavy();
          this.gateOpening = true;
          gg.completeObjective('Archivist Vault Disengaged');
          gg.setObjective('enter_cave', 'The vault is unlocked! Step forward into the Mystery Cave.');
        }
      },
    });
  }

  applySave() {
    const g = this.game;
    if (g.hasFlag('L2:switches_solved')) {
      if (this.conduitBarrier) this.conduitBarrier.position.y = -6;
      if (this.conduitColliderIdx !== null) {
        this.colliders[this.conduitColliderIdx] = null;
        this.colliders = this.colliders.filter(Boolean);
        this.conduitColliderIdx = null;
      }
    }
    for (const c of this.runeStones) {
      if (g.hasFlag('L2:' + c.rune)) { c.done = true; this.runesFound[c.rune] = true; this.found++; c.runeMat.color.set(0xffffff); }
    }
    if (g.hasFlag('L2:crypt_unlocked')) this._applySolved(true);
    else if (g.hasFlag('L2:gate')) {
      this.solved = true;
      this.mechInter.setEnabled(false);
      this.mechRunes.forEach(m => m.color.set(0xffffff));
      g.setObjective('open_crypt', 'Unlock the vault door using the Archivist Sun Key (PUZZLE 4).');
    }
    else if (this.found >= 3) g.setObjective('forest_mechanism', 'Activate the forest mechanism by the gate (PUZZLE 5).');
    else if (g.hasFlag('L2:switches_solved')) g.setObjective('forest_runes', `Uncover the forest's hidden runes. (${this.found}/3)`);
    else g.setObjective('solve_conduits', 'Solve the Conduit Switch Triad (PUZZLE 2) to enter the deep forest.');
  }

  _applySolved(instant) {
    const g = this.game;
    this.solved = true;
    this.mechInter.setEnabled(false);
    this.mechRunes.forEach(m => m.color.set(0xffffff));
    this.lanterns.forEach(l => { l.target = 1.25; l.light.intensity = instant ? 1.25 : 0; l.mat.emissiveIntensity = 1.4; });
    this.gateOpened = true;
    this.gateDoor.position.y = -3.9; this.gateDoor.visible = false;
    if (this.gateColliderIdx !== null) { this.colliders.splice(this.gateColliderIdx, 1); this.gateColliderIdx = null; }
    g.setObjective('forest_exit', 'The gate is open. Continue following the signal.');
  }

  enter() {
    this.game.audio.startAmbient('forest');
    this.applySave();
    if (this.game.petalo.active) this.game.petalo.say('The Hidden Forest… the signal is faint here. The trees swallowed everything.', 3800);
  }

  getGuidance() {
    if (this.solved) return { target: V3(0, 0, 60) };
    if (this.found >= 3) return { target: V3(2, 0, 45) };
    const missing = this.runeStones.find(c => !c.done);
    return missing ? { target: V3(missing.pos.x, 0, missing.pos.z) } : { target: V3(2, 0, 45) };
  }
  getHint() {
    if (this.solved) return { text: 'Through the arch — the signal is strong beyond it!', target: V3(0, 0, 60) };
    if (this.found >= 3) return { text: 'The mechanism waits. Leaf, Moon, Star — like the tablet says.', target: V3(2, 0, 45) };
    const missing = this.runeStones.find(c => !c.done);
    return { text: 'A rune stone is hidden this way — follow my light!', target: missing ? V3(missing.pos.x, 0, missing.pos.z) : null };
  }

  update(dt) {
    super.update(dt);
    if (this.water) { this.water.position.y = 0.05 + Math.sin(this.t * 1.4) * 0.015; this.water.material.opacity = 0.62 + Math.sin(this.t * 2.2) * 0.06; }
    if (this.fireflies) {
      const pos = this.fireflies.geometry.attributes.position.array;
      for (let i = 0; i < this.fireflyBase.length; i++) {
        const [bx, by, bz, ph] = this.fireflyBase[i];
        pos[i * 3] = bx + Math.sin(this.t * 0.7 + ph) * 1.6;
        pos[i * 3 + 1] = by + Math.sin(this.t * 1.1 + ph * 2) * 0.5;
        pos[i * 3 + 2] = bz + Math.cos(this.t * 0.5 + ph) * 1.6;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.material.opacity = 0.55 + Math.sin(this.t * 3) * 0.3;
    }
    for (const l of this.lanterns) if (l.light.intensity < l.target) l.light.intensity = Math.min(l.target, l.light.intensity + dt * 1.5);
    if (this.gateOpening) {
      this.gateOpenT += this.wallDt;
      if (this.gateOpenT > 0.1 && !this._gateSound) { this._gateSound = true; this.game.audio.gateOpen(); this.game.vfx.burst(V3(0, 0.5, 57), { color: 0x8a7a5a, count: 46, speed: 2.4, size: 0.15, life: 1.3, gravity: -4 }); }
      const k = clamp(this.gateOpenT / 4.6, 0, 1);
      this.gateDoor.position.y = 3.8 - 7.8 * (k * k * (3 - 2 * k));
      if (k >= 1) {
        this.gateOpening = false; this.gateOpened = true; this.gateDoor.visible = false;
        if (this.gateColliderIdx !== null) { this.colliders.splice(this.gateColliderIdx, 1); this.gateColliderIdx = null; }
      }
    }
    if (this.gateOpened && !this._exited && this.game.state === 'play') {
      const p = this.game.player.pos;
      if (p.z > 60.5 && Math.abs(p.x) < 7) { this._exited = true; this.game.nextLevel(); }
    }
  }
}

// ---------------------------------------------------------------------------
// LEVEL 3 — MYSTERY CAVE
// ---------------------------------------------------------------------------
class CaveLevel extends BaseLevel {
  constructor(game) {
    super(game);
    this.spawn = { x: 0, z: -24, yaw: Math.PI };
    this.limit = { x0: -29, z0: -27, x1: 29, z1: 46 };
    this.petaloProfile = 'cave';
    this.barks = [
      'My light is yours, Arin. The dark is only the dark.',
      'These crystals formed long before the fall… they remember.',
      'Watch the walls. The old ones wrote their secrets here.',
    ];
    this.introView = V3(-7, 4.5, -31);
    this.expected = ['eye', 'wave', 'flame'];
    this.seq = [];
    this.solved = false;
    this.muralFound = false;
    this.build();
  }

  build() {
    const g = this.game;
    g.scene.background = new THREE.Color(0x020306);
    g.scene.fog = new THREE.FogExp2(0x04060a, 0.028);
    this.add(new THREE.HemisphereLight(0x2a3c50, 0x0b0e14, 0.9));
    // faint daylight leaking in from the entrance, plus a soft mid-cave fill
    const entranceGlow = new THREE.PointLight(0x88aacc, 3.2, 28, 1.3);
    entranceGlow.position.set(0, 4, -25);
    this.add(entranceGlow);
    const midGlow = new THREE.PointLight(0x5a7aa8, 1.6, 34, 1.5);
    midGlow.position.set(4, 5, 8);
    this.add(midGlow);

    const rockMat = new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0xa8b2c4, roughness: 0.95 });
    const darkRock = new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0x5c6474, roughness: 1 });
    this._rockMat = rockMat; this._darkRock = darkRock;

    // floor & ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(92, 76), rockMat);
    floor.rotation.x = -Math.PI / 2; floor.position.z = 9; floor.receiveShadow = true; this.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(92, 76), darkRock);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 6.8, 9); this.add(ceil);

    // perimeter walls
    const wallH = 8;
    const mkWall = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), darkRock);
      m.position.set(x, wallH / 2 - 0.5, z); this.add(m);
      this.solidAt(x, z, w, d, wallH);
    };
    mkWall(0, -29.5, 64, 3);            // south
    mkWall(-31, 9, 3, 82);              // west
    mkWall(31, 9, 3, 82);               // east
    mkWall(-17, 41.5, 30, 3);           // north (left of tunnel gap)
    mkWall(17, 41.5, 30, 3);            // north (right of gap)
    // tunnel enclosure north of the door
    mkWall(-4.2, 43.5, 1.6, 9);
    mkWall(4.2, 43.5, 1.6, 9);
    mkWall(0, 47.6, 10, 2.4);

    // inner boulder blocks shaping an S-path
    const blocks = [
      [-15, -13, 13, 7], [9, -4, 13, 8], [-17, 8, 11, 7], [11, 18, 11, 7], [-7, 28, 9, 5],
    ];
    for (const [x, z, w, d] of blocks) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, rand(4, 6.4), d), darkRock);
      m.position.set(x, m.geometry.parameters.height / 2 - 0.4, z);
      m.rotation.y = rand(-0.14, 0.14);
      this.add(m);
      this.solidAt(x, z, w, d, wallH);
    }

    // scattered rocks
    for (let i = 0; i < 22; i++) {
      const s = rand(0.5, 1.6);
      const x = rand(-27, 27), z = rand(-25, 38);
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      r.position.set(x, s * 0.5, z); r.rotation.y = rand(0, 3); this.add(r);
      this.solidAt(x, z, s * 1.3, s * 1.3, s, false);
    }
    // stalactites
    for (let i = 0; i < 30; i++) {
      const h = rand(1.4, 3.6), r = rand(0.25, 0.7);
      const s = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), darkRock);
      s.rotation.x = Math.PI;
      s.position.set(rand(-28, 28), 6.8 - h / 2 + 0.2, rand(-26, 40));
      this.add(s);
    }

    // glowing decor crystal clusters
    const decoCols = [0x35e0ff, 0x9a6aff, 0x35ffc8];
    for (let i = 0; i < 16; i++) {
      const col = choice(decoCols);
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.16, 0.34), 0),
        new THREE.MeshStandardMaterial({ color: 0x101418, emissive: col, emissiveIntensity: rand(0.8, 1.6), roughness: 0.2 }));
      const x = rand(-26, 26), z = rand(-24, 37);
      c.position.set(x, rand(0.2, 0.6), z);
      c.scale.y = rand(1.6, 2.4);
      c.rotation.y = rand(0, 3);
      this.add(c);
    }

    // water pool
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 22),
      new THREE.MeshPhongMaterial({ color: 0x14425a, transparent: true, opacity: 0.78, shininess: 120, specular: 0x99ddff }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(-23, 0.06, -23); this.add(pool);
    this.pool = pool;
    setTimeout(() => { if (this.pool.parent) g.vfx.sparkle(this.pool, { color: 0x66ccee, count: 5, radius: 2.2, size: 0.06 }); }, 0);

    this._buildMural();
    this._buildClockPuzzle();
    this._buildGeneratorPuzzle();
    this._buildCrystals();
    this._buildLore();
    this._buildDoor();
    this._envDress();
  }

  // ---------------- ENVIRONMENT DRESSING (visual only) ----------------
  _envDress() {
    const g = this.game;
    const q = g.settings.quality || 'high';
    const low = q === 'low';
    ENVK.ensureEnv();

    // --- damp, mineral-rich rock surfaces -------------------------------
    ENVK.upgradeMaterial(this._rockMat, ENV.caveRock, { repeat: [8, 8], normalScale: 1.5, roughness: 0.94 });
    ENVK.upgradeMaterial(this._darkRock, ENV.caveRock, { repeat: [5, 5], normalScale: 1.6, roughness: 1 });

    const wetRock = ENVK.pbrMat(ENVK.cloneSet(ENV.caveRock, [1.6, 1.6]), { color: 0x8e99ad, roughness: 0.78 });
    const dripRock = ENVK.pbrMat(ENVK.cloneSet(ENV.caveRock, [1, 2.2]), { color: 0x7b8598, roughness: 0.7 });
    const rubble = ENVK.pbrMat(ENVK.cloneSet(ENV.rock, [1.4, 1.4]), { color: 0x6f7787 });

    // keep-out: the player's roaming space around objectives stays clean
    const keepOut = [[-6, -19, 5], [21, 2, 4.2], [-22, 15, 4.2], [7, 31, 4.2], [-25.5, 26, 3.6], [0, 40.6, 6], [0, -24, 4.5], [-23, -23, 4.4]];
    const free = (x, z) => {
      for (const [kx, kz, kr] of keepOut) if (Math.hypot(x - kx, z - kz) < kr) return false;
      if (Math.abs(x) < 5 && z > 36) return false;             // exit tunnel lane
      return true;
    };
    // hug the walls / boulder blocks rather than the open floor
    const wallSpot = () => {
      for (let k = 0; k < 10; k++) {
        const edge = Math.random();
        let x, z;
        if (edge < 0.34) { x = (Math.random() < 0.5 ? -1 : 1) * rand(21, 28.5); z = rand(-26, 38); }
        else if (edge < 0.62) { x = rand(-27, 27); z = Math.random() < 0.5 ? rand(-27, -22) : rand(34, 39); }
        else { // beside the inner blocks
          const b = choice([[-15, -13, 13, 7], [9, -4, 13, 8], [-17, 8, 11, 7], [11, 18, 11, 7], [-7, 28, 9, 5]]);
          const side = Math.random() < 0.5 ? -1 : 1;
          x = b[0] + side * (b[2] / 2 + rand(0.4, 2.2));
          z = b[1] + rand(-b[3] / 2, b[3] / 2);
        }
        if (free(x, z)) return [x, z];
      }
      return null;
    };

    // --- formations: stalagmites, columns, shelves, flowstone -----------
    ENVK.spikeField(this, low ? 24 : 70, () => wallSpot(), { mat: wetRock, h: [0.7, 3.2], r: [0.16, 0.6], y: -0.05 });
    ENVK.spikeField(this, low ? 22 : 60, () => [rand(-28, 28), rand(-26, 40)], { mat: dripRock, h: [0.6, 3.4], r: [0.14, 0.62], down: true, y: 6.75 });
    // full columns where ceiling meets floor
    for (let i = 0; i < (low ? 3 : 9); i++) {
      const p = wallSpot(); if (!p) continue;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.3, 0.6), rand(0.45, 0.85), 7.2, 9, 3), wetRock);
      const pos = col.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) { pos.setX(v, pos.getX(v) * rand(0.85, 1.18)); pos.setZ(v, pos.getZ(v) * rand(0.85, 1.18)); }
      col.geometry.computeVertexNormals();
      col.position.set(p[0], 3.2, p[1]);
      col.castShadow = true; col.receiveShadow = true;
      this.add(col);
    }
    // rock shelves / boulder banks along the walls
    for (let i = 0; i < (low ? 8 : 22); i++) {
      const p = wallSpot(); if (!p) continue;
      const s = rand(0.8, 2.6);
      const b = new THREE.Mesh(ENVK.boulderGeo(s, 1, 0.62), rubble);
      b.position.set(p[0], s * 0.3, p[1]);
      b.rotation.set(rand(-0.3, 0.3), rand(0, 7), rand(-0.3, 0.3));
      b.castShadow = true; b.receiveShadow = true;
      this.add(b);
    }
    ENVK.debrisField(this, low ? 80 : 220, () => { const x = rand(-28, 28), z = rand(-26, 39); return free(x, z) ? [x, z] : null; }, { mat: rubble, scale: [0.06, 0.3] });

    // --- crystal formations (decor; the three puzzle crystals untouched) --
    const cols = [0x35e0ff, 0x9a6aff, 0x35ffc8, 0x7fa8ff];
    for (let i = 0; i < (low ? 6 : 16); i++) {
      const p = wallSpot(); if (!p) continue;
      // only a few carry a real light — the rest are emissive-only (cheap)
      ENVK.crystalCluster(this, p[0], p[1], choice(cols), rand(0.7, 1.9), low ? 3 : randi(4, 8), i < (low ? 2 : 5));
    }
    // glow-moss patches on the damp floor
    ENVK.decalField(this, ENV.decalMoss, low ? 10 : 28, () => wallSpot(), { min: 1.6, max: 4, opacity: 0.45, y: 0.05, color: 0x6fa8c8 });
    // dark seepage stains & shallow standing water
    const wet = () => { const x = rand(-28, 28), z = rand(-26, 38); return free(x, z) ? [x, z] : null; };
    ENVK.decalField(this, ENV.decalStain, low ? 8 : 18, wet, { min: 2, max: 5.5, opacity: 0.6, y: 0.046, color: 0x3d4a5c });
    ENVK.decalField(this, ENV.decalPuddle, low ? 6 : 14, wet, { min: 2, max: 5, opacity: 0.7, y: 0.048, color: 0x44566b });

    // --- light: daylight shaft at the mouth, cracks in the roof ---------
    ENVK.lightShaft(this, 0, 3.6, -25.5, 1.2, 4.6, 9, 0x9fc4e8, 0.09);
    if (!low) {
      for (const [x, z, r] of [[-12, 4, 1.1], [14, 24, 0.9], [-19, 32, 0.8]]) {
        ENVK.lightShaft(this, x, 3.6, z, r * 0.5, r * 2.6, 7.4, 0x8fb8d8, 0.04);
        const li = new THREE.PointLight(0x9fc4e8, 0.5, 12, 1.8);
        li.position.set(x, 5.6, z); this.add(li);
      }
    }

    // --- atmosphere: heavy cave haze + falling drip motes ---------------
    ENVK.groundMist(this, { center: V3(0, 0, 8), radius: 34, layers: low ? 2 : 4, color: 0x6f8296, opacity: 0.05, y: 0.25 });
    ENVK.dustMotes(this, { count: low ? 60 : 170, center: V3(0, 0, 6), size: V3(56, 6, 62), color: 0xa9c6dd, opacity: 0.3, pointSize: 0.05, speed: 0.18 });
  }

  _buildMural() {
    const g = this.game;
    const grp = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 0.6),
      new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0x6a7080, roughness: 0.9 }));
    slab.position.y = 1.2; grp.add(slab);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.5),
      new THREE.MeshBasicMaterial({ map: runeStripTexture(['eye', 'wave', 'flame'], { fg: '#8fe3ff', bg: [16, 20, 28], frame: 'rgba(143,227,255,.4)', caption: 'THE DEEP WAKENS IN ORDER' }) }));
    face.position.set(0, 1.3, 0.32); grp.add(face);
    const muralLight = new THREE.PointLight(0x8fe3ff, 1.6, 10, 1.4);
    muralLight.position.set(0, 1.6, 1.6); grp.add(muralLight);
    grp.position.set(-6, 0, -19); grp.rotation.y = 0.45;
    this.add(grp);
    this.solidAt(-6, -19, 4.5, 1, 99, false);
    this.mural = grp;
    const clue = { pos: { x: -6, y: 1.3, z: -19 }, object: grp, done: false, whisper: 'Arin — this wall is glowing. Markings! This one matters.' };
    this.hiddenClues.push(clue);
    this.muralClue = clue;
    this.inter({
      object: grp, prompt: 'Study the glowing mural', radius: 3.4,
      onInteract: () => {
        if (this.muralFound) { g.ui.dialogue('CAVE MURAL', '"Eye, then Wave, then Flame — the deep wakes in order."', 3000); return; }
        this.muralFound = true;
        clue.done = true;
        g.addClue('L3:mural', 'eye', 'Deep runes: EYE · WAVE · FLAME');
        g.ui.dialogue('CAVE MURAL', '"Eye, then Wave, then Flame — the deep wakes in order."', 3800);
        g.petalo.say('Strike the three crystals in that exact order. Violet-eye, cyan-wave, amber-flame.', 4200);
        g.setObjective('cave_crystals', 'Strike the three crystals in the mural’s order.');
        g.ui.seqDots(3, 0);
        g.refreshGuidance();
      },
    });
  }

  _buildClockPuzzle() {
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });

    // Observatory pedestal & clock face
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.4, 12), std(0x444850, { map: TEX.rock }));
    ped.position.set(-24, 0.7, 10);
    this.add(ped);
    this.solidAt(-24, 10, 1.6, 1.6, 1.4);

    const dialMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.1, 18),
      std(0x202630, { metalness: 0.8, roughness: 0.25 })
    );
    dialMesh.position.set(-24, 1.45, 10);
    dialMesh.rotation.x = 0.3;
    this.add(dialMesh);

    const clockLight = new THREE.PointLight(0x8fe3ff, 1.2, 5);
    clockLight.position.set(-24, 2.0, 10);
    this.add(clockLight);

    // Diary notice
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.6), std(0xd0be9a));
    note.position.set(-24, 1.2, 8);
    this.add(note);
    this.inter({
      object: note,
      prompt: 'Read Observatory Record',
      radius: 2.5,
      onInteract: () => {
        this.game.addFlag('L3:clue_clock');
        this.game.docReader.open({
          tag: 'CHRONOMETER LOG — DEEP LEVEL',
          title: 'The Cataclysm Hour (PUZZLE 6)',
          text: 'The station chronometer recorded the precise second the sky shattered: 03:45 AM.\n\nAll emergency generators locked behind safety bulkheads until the dial mechanism is returned to 03:45.\n\nHour hand at 3. Minute hand at 45. Synchronize the mechanism to unlock the generator bay!'
        });
      }
    });

    // Blast door to Generator Bay
    this.blastDoor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5.5, 0.5), std(0x353a42, { metalness: 0.75 }));
    this.blastDoor.position.set(16, 2.75, 12);
    this.add(this.blastDoor);
    this.blastColliderIdx = this.colliders.length;
    this.solidAt(16, 12, 4.4, 0.8, 5.5);

    this.inter({
      object: dialMesh,
      prompt: () => this.game.hasFlag('L3:clock_solved') ? 'Celestial Clock Aligned' : 'Align Celestial Clock (PUZZLE 6)',
      radius: 2.8,
      onInteract: async () => {
        if (this.game.hasFlag('L3:clock_solved')) return;
        const ok = await this.game.clockPuzzle.open({
          targetHour: 3,
          targetMinute: 45,
          hint: 'Set the hour hand to 3 and the minute hand to 45 (03:45).'
        });
        if (ok) {
          this.game.addFlag('L3:clock_solved');
          this.blastDoor.position.y = -3.8;
          this.colliders[this.blastColliderIdx] = null;
          this.colliders = this.colliders.filter(Boolean);
          this.game.ui.notify('BULKHEAD OPENED', 'The blast doors to the Generator Bay have opened!', 'gold', 3600);
          this.game.setObjective('generator_puzzle', 'Enter the Generator Bay and restore power (PUZZLE 7).');
          this.game.refreshGuidance();
        }
      }
    });
  }

  _buildGeneratorPuzzle() {
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });

    // 1. SPARK IGNITER (found in south crystal alcove)
    const igniter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x442266, emissive: 0x9a6aff, emissiveIntensity: 2.2 })
    );
    igniter.position.set(22, 0.4, -18);
    this.add(igniter);
    const igniterLight = new THREE.PointLight(0x9a6aff, 1.4, 4);
    igniterLight.position.copy(igniter.position);
    this.add(igniterLight);

    this.inter({
      object: igniter,
      prompt: 'Collect Spark Igniter',
      radius: 2.5,
      once: true,
      onInteract: () => {
        this.game.addFlag('L3:spark_igniter');
        this.game.audio.clueFound();
        this.game.ui.notify('COMPONENT ACQUIRED', 'Spark Igniter (Generator Part 1/2)', 'gold', 3200);
        igniter.visible = false;
        igniterLight.intensity = 0;
        this.game.refreshGuidance();
      }
    });

    // 2. COOLANT VALVE (found on subterranean ledge)
    const valve = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.06, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x224455, emissive: 0x35c8ff, emissiveIntensity: 2.0 })
    );
    valve.position.set(-22, 0.4, -20);
    valve.rotation.x = Math.PI / 2;
    this.add(valve);
    const valveLight = new THREE.PointLight(0x35c8ff, 1.4, 4);
    valveLight.position.copy(valve.position);
    this.add(valveLight);

    this.inter({
      object: valve,
      prompt: 'Collect Coolant Valve',
      radius: 2.5,
      once: true,
      onInteract: () => {
        this.game.addFlag('L3:coolant_valve');
        this.game.audio.clueFound();
        this.game.ui.notify('COMPONENT ACQUIRED', 'Coolant Valve (Generator Part 2/2)', 'gold', 3200);
        valve.visible = false;
        valveLight.intensity = 0;
        this.game.refreshGuidance();
      }
    });

    // 3. AUXILIARY GENERATOR MACHINE (Inside Generator Bay at x: 23, z: 12)
    const gen = new THREE.Group();
    const turbine = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 2.4, 14), std(0x2a3038, { metalness: 0.8 }));
    turbine.position.y = 1.2;
    gen.add(turbine);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.2, 8), std(0x1a2028, { metalness: 0.7 }));
    pipe.position.set(0.8, 1.6, 0.8);
    pipe.rotation.z = 0.4;
    gen.add(pipe);

    gen.position.set(23, 0, 12);
    this.add(gen);
    this.solidAt(23, 12, 3.2, 3.2, 3.0);

    this.genLight = new THREE.PointLight(0xff4422, 0.6, 6);
    this.genLight.position.set(23, 2.8, 12);
    this.add(this.genLight);

    this.inter({
      object: gen,
      prompt: () => {
        if (this.game.hasFlag('L3:generator_active')) return 'Auxiliary Generator — Online (Grid Energized)';
        const has1 = this.game.hasFlag('L3:spark_igniter');
        const has2 = this.game.hasFlag('L3:coolant_valve');
        if (has1 && has2) return 'Install Components & Pull Starter (PUZZLE 7)';
        return 'Auxiliary Generator — Missing Components (0/2)';
      },
      radius: 3.4,
      onInteract: () => {
        if (this.game.hasFlag('L3:generator_active')) return;
        const has1 = this.game.hasFlag('L3:spark_igniter');
        const has2 = this.game.hasFlag('L3:coolant_valve');
        if (!has1 || !has2) {
          this.game.audio.fail();
          this.game.ui.feedback('MISSING COMPONENTS', false);
          this.game.ui.dialogue('ARIN', 'The turbine requires a Spark Igniter and Coolant Valve from the side caverns.', 3000);
          return;
        }

        // Generator started!
        this.game.addFlag('L3:generator_active');
        this.game.audio.generatorRumble();
        this.game.audio.success();
        this.genLight.color.set(0x8fe3ff);
        this.genLight.intensity = 3.6;
        this.game.ui.notify('GENERATOR ONLINE', 'Subterranean power restored! The resonance crystals are active!', 'gold', 3800);
        this.game.setObjective('cave_crystals', 'Strike the three crystals in the mural’s order (Eye, Wave, Flame).');
        this.game.refreshGuidance();
      }
    });
  }

  _buildCrystals() {
    const g = this.game;
    const defs = [
      { rune: 'eye', col: 0x9a6aff, name: 'violet', pos: [21, 2], idx: 0 },
      { rune: 'wave', col: 0x35c8ff, name: 'cyan', pos: [-22, 15], idx: 4 },
      { rune: 'flame', col: 0xffa040, name: 'amber', pos: [7, 31], idx: 5 },
    ];
    this.crystals = [];
    for (const d of defs) {
      const grp = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 0.55, 10),
        new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0x5a606e, roughness: 0.9 }));
      base.position.y = 0.27; grp.add(base);
      const mat = new THREE.MeshStandardMaterial({ color: 0x101418, emissive: d.col, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.96 });
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), mat);
      cry.scale.y = 2.3; cry.position.y = 1.55; grp.add(cry);
      const light = new THREE.PointLight(d.col, 0.9, 12, 1.6);
      light.position.y = 1.8; grp.add(light);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({ map: runeTexture(d.rune, '#dddddd'), color: 0x777777 }));
      plaque.position.set(0, 0.62, 1.02); grp.add(plaque);
      grp.position.set(d.pos[0], 0, d.pos[1]);
      const ang = Math.atan2(-d.pos[0], 8 - d.pos[1]);
      grp.rotation.y = ang;
      this.add(grp);
      this.solidAt(d.pos[0], d.pos[1], 1.8, 1.8, 99, false);
      const entry = { ...d, grp, cry, mat, light, lit: false };
      this.crystals.push(entry);
      entry.inter = this.inter({
        object: grp, prompt: () => `Strike the ${d.name} crystal`, radius: 3.0, markerPos: V3(d.pos[0], 3.2, d.pos[1]),
        onInteract: () => this.strike(entry),
      });
    }
  }

  _buildLore() {
    const g = this.game;
    const grp = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 0.4),
      new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0x5f6470, roughness: 0.9 }));
    slab.position.y = 0.85; grp.add(slab);
    const tex = canvasTexture(512, 256, (gg, w, h) => {
      gg.fillStyle = '#20242c'; gg.fillRect(0, 0, w, h);
      gg.fillStyle = 'rgba(200,220,240,.75)'; gg.font = 'italic 22px Georgia'; gg.textAlign = 'center';
      gg.fillText('…and when hope was lost,', w / 2, 70);
      gg.fillText('the Creator left a seed', w / 2, 110);
      gg.fillText('for the children of dust.', w / 2, 150);
      gg.font = '16px Georgia'; gg.fillStyle = 'rgba(160,180,200,.4)';
      gg.fillText('— inscription of the old ones', w / 2, 205);
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 0.95, 0.22); grp.add(face);
    grp.position.set(-25.5, 0, 26); grp.rotation.y = 1.0;
    this.add(grp);
    this.solidAt(-25.5, 26, 2.7, 0.9, 99, false);
    const clue = { pos: { x: -25.5, y: 1, z: 26 }, object: grp, done: false, whisper: 'Something is engraved in this alcove. Old writing — pre fall.' };
    this.hiddenClues.push(clue);
    this.inter({
      object: grp, prompt: 'Read the inscription', radius: 2.8,
      onInteract: () => {
        if (clue.done) return;
        clue.done = true;
        g.ui.dialogue('OLD INSCRIPTION', '"…and when hope was lost, the Creator left a seed for the children of dust."', 4600);
        g.petalo.say('An old promise. Someone wanted us to find this place.', 3400);
        g.save.addFlag('L3:lore');
        g.audio.clueFound();
        g.ui.notify('LORE DISCOVERED', 'Inscription of the old ones', 'gold');
      },
    });
  }

  _buildDoor() {
    const g = this.game;
    // frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8.2, 7.6, 1.2),
      new THREE.MeshStandardMaterial({ map: TEX.rock, color: 0x66707e, roughness: 0.9 }));
    frame.position.set(0, 3.4, 40.4); this.add(frame);
    this.solidAt(-3.5, 40.4, 1.6, 1.4, 8.5);
    this.solidAt(3.5, 40.4, 1.6, 1.4, 8.5);
    const slabTex = canvasTexture(256, 256, (gg, w, h) => {
      gg.fillStyle = '#3a4048'; gg.fillRect(0, 0, w, h);
      for (let i = 0; i < 800; i++) { gg.fillStyle = `rgba(${randi(40, 70)},${randi(46, 76)},${randi(56, 88)},.5)`; gg.fillRect(rand(0, w), rand(0, h), 3, 3); }
      gg.strokeStyle = 'rgba(143,227,255,.5)'; gg.lineWidth = 5;
      gg.beginPath(); gg.arc(w / 2, h / 2, 74, 0, 7); gg.stroke();
      ['eye', 'wave', 'flame'].forEach((r, i) => drawRune(gg, r, w / 2 - 70 + i * 70, h / 2, 22, '#8fe3ff', 3.5));
    });
    this.door = new THREE.Mesh(new THREE.BoxGeometry(5.4, 6.6, 0.7),
      new THREE.MeshStandardMaterial({ map: slabTex, roughness: 0.85 }));
    this.door.position.set(0, 3.0, 40.6);
    this.add(this.door);
    this.doorColliderIdx = this.colliders.length;
    this.solidAt(0, 40.6, 5.4, 0.8, 8.5);
    this.doorOpening = false; this.doorOpenT = 0; this.doorOpened = false;

    // warm light at the end of the exit tunnel (off until opened)
    this.tunnelLight = new THREE.PointLight(0xffc98a, 0, 18, 1.4);
    this.tunnelLight.position.set(0, 3, 45);
    this.add(this.tunnelLight);

    this.inter({
      object: this.door, markerPos: V3(0, 4.6, 40.6),
      prompt: () => this.doorOpened ? 'Enter the lit tunnel' : 'Sealed stone door',
      radius: 4,
      onInteract: () => {
        if (!this.solved) {
          g.ui.feedback(this.muralFound ? 'TRY AGAIN' : 'SEALED', false);
          g.petalo.say(this.muralFound
            ? 'Three runes on the door — the crystals must sing in that order: eye, wave, flame.'
            : 'Old runes seal it. There must be a pattern hidden in this cave — let us look around.');
        }
      },
    });
  }

  strike(c) {
    const g = this.game;
    if (this.solved) return;
    g.audio.strikeCrystal(c.idx);
    g.vfx.burst(V3(c.grp.position.x, 1.8, c.grp.position.z), { color: c.col, count: 26, speed: 2, size: 0.1, life: 0.8, gravity: -1 });
    if (!this.muralFound) {
      this.muralFound = true;
      g.petalo.say('These crystals hum with power… but the order matters. A wall marking must hold it — the mural!', 4200);
    }
    if (!this.game.hasFlag('L3:generator_active')) {
      g.audio.fail();
      g.ui.feedback('GENERATOR OFFLINE', false);
      g.petalo.say('The crystal does not resonate. The Auxiliary Generator must be restored first (PUZZLE 7)!');
      return;
    }
    const want = this.expected[this.seq.length];
    if (c.rune === want) {
      this.seq.push(c.rune);
      c.lit = true;
      c.mat.emissiveIntensity = 2.2;
      c.light.intensity = 1.9; c.light.distance = 14;
      g.ui.seqDots(3, this.seq.length);
      if (this.seq.length === 3) this.solve();
    } else {
      this.seq = [];
      this.crystals.forEach(cc => { cc.lit = false; cc.mat.emissiveIntensity = 0.55; cc.light.intensity = 0.55; });
      g.ui.seqDots(3, 0);
      g.ui.feedback('TRY AGAIN', false);
      g.audio.fail();
      g.vfx.burst(V3(c.grp.position.x, 1.8, c.grp.position.z), { color: 0xff4444, count: 20, speed: 1.6, size: 0.1, life: 0.7, gravity: -0.5 });
      if (!this._failT || this.t - this._failT > 8) {
        this._failT = this.t;
        g.petalo.say('Wrong order — watch the mural again: eye, wave, flame.', 3200);
      }
    }
  }

  solve() {
    const g = this.game;
    this.solved = true;
    g.save.addFlag('L3:door');
    this.crystals.forEach(c => c.inter.setEnabled(false));
    g.audio.success();
    g.ui.seqDots(null);
    const doorP = V3(0, 3.4, 40.6);
    this.crystals.forEach((c, i) => {
      setTimeout(() => {
        g.vfx.beamBetween(V3(c.grp.position.x, 2.2, c.grp.position.z), doorP, { color: c.col, r: 0.12, life: 2.4 });
      }, i * 220);
    });
    setTimeout(() => { this.doorOpening = true; g.audio.gateOpen(); g.vfx.burst(V3(0, 0.6, 40.6), { color: 0x8a94a4, count: 50, speed: 2.4, size: 0.15, life: 1.4, gravity: -4 }); }, 1300);
    this.tunnelLight.intensity = 1.9;
    g.petalo.celebrate();
    g.petalo.say('The door! We are close to the Creator now — I can feel it.');
    g.completeObjective('Cave mechanism activated');
    g.setObjective('cave_exit', 'The path is open. Head toward the light.');
    g.refreshGuidance();
  }

  applySave() {
    const g = this.game;
    if (g.hasFlag('L3:clock_solved')) {
      if (this.blastDoor) this.blastDoor.position.y = -3.8;
      if (this.blastColliderIdx !== null) {
        this.colliders[this.blastColliderIdx] = null;
        this.colliders = this.colliders.filter(Boolean);
        this.blastColliderIdx = null;
      }
    }
    if (g.hasFlag('L3:generator_active') && this.genLight) {
      this.genLight.color.set(0x8fe3ff);
      this.genLight.intensity = 3.6;
    }
    if (g.hasFlag('L3:mural')) {
      this.muralFound = true; this.muralClue.done = true;
    }
    if (g.hasFlag('L3:door')) {
      this.solved = true;
      this.crystals.forEach(c => { c.lit = true; c.mat.emissiveIntensity = 2.2; c.light.intensity = 1.9; c.inter.setEnabled(false); });
      this.doorOpened = true;
      this.door.position.y = 8.6; this.door.visible = false;
      this.tunnelLight.intensity = 1.9;
      if (this.doorColliderIdx !== null) { this.colliders.splice(this.doorColliderIdx, 1); this.doorColliderIdx = null; }
      g.setObjective('cave_exit', 'The path is open. Head toward the light.');
    } else if (g.hasFlag('L3:generator_active')) {
      g.setObjective('cave_crystals', 'Strike the three resonance crystals in the mural order.');
      g.ui.seqDots(3, 0);
    } else if (g.hasFlag('L3:clock_solved')) {
      g.setObjective('restore_generator', 'Restore the Auxiliary Generator components (PUZZLE 7).');
    } else {
      g.setObjective('solve_clock', 'Align the Celestial Clock (PUZZLE 6) to access the generator bay.');
    }
  }

  enter() {
    this.game.audio.startAmbient('cave');
    this.applySave();
    if (this.game.petalo.active && !this.game.hasFlag('L3:door')) {
      this.game.petalo.say('Dark down here… my light will help. Stay close, Arin.', 3600);
    }
  }

  getGuidance() {
    if (this.solved) return { target: V3(0, 0, 44) };
    if (this.muralFound) {
      const next = this.expected[this.seq.length];
      const c = this.crystals.find(cc => cc.rune === next);
      return c ? { target: V3(c.grp.position.x, 0, c.grp.position.z) } : null;
    }
    return { target: V3(-6, 0, -19) };
  }
  getHint() {
    if (this.solved) return { text: 'Into the light — the tunnel leads to the Creator.', target: V3(0, 0, 44) };
    if (this.muralFound) {
      const next = this.expected[this.seq.length];
      const c = this.crystals.find(cc => cc.rune === next);
      return { text: `Next crystal: the ${c.name} one — ${RUNE_NAMES[c.rune].toLowerCase()} comes ${['first', 'second', 'last'][this.seq.length]}.`, target: V3(c.grp.position.x, 0, c.grp.position.z) };
    }
    return { text: 'The glowing mural holds the pattern. This way!', target: V3(-6, 0, -19) };
  }

  update(dt) {
    super.update(dt);
    for (const c of this.crystals) {
      c.cry.rotation.y += dt * (c.lit ? 1.2 : 0.4);
      if (c.lit) c.light.intensity = 1.9 + Math.sin(this.t * 4 + c.idx) * 0.35;
    }
    if (this.pool) this.pool.material.opacity = 0.7 + Math.sin(this.t * 1.8) * 0.06;
    if (this.doorOpening) {
      this.doorOpenT += this.wallDt;
      const k = clamp(this.doorOpenT / 4, 0, 1);
      this.door.position.y = 3.0 + 5.8 * (k * k * (3 - 2 * k));
      this.door.position.x = Math.sin(this.t * 38) * 0.03 * (1 - k);
      if (k >= 1) {
        this.doorOpening = false; this.doorOpened = true; this.door.visible = false;
        if (this.doorColliderIdx !== null) { this.colliders.splice(this.doorColliderIdx, 1); this.doorColliderIdx = null; }
      }
    }
    if (this.doorOpened && !this._exited && this.game.state === 'play') {
      const p = this.game.player.pos;
      if (p.z > 44 && Math.abs(p.x) < 3.4) { this._exited = true; this.game.nextLevel(); }
    }
  }
}

// ---------------------------------------------------------------------------
// LEVEL 4 — CREATOR'S GATE
// ---------------------------------------------------------------------------
class GateLevel extends BaseLevel {
  constructor(game) {
    super(game);
    this.spawn = { x: 0, z: -40, yaw: Math.PI };
    this.limitCircle = { x: 0, z: 0, r: 58 };
    this.barks = ['The Creator\'s Gate… every reading says it is older than the sky.'];
    this.introView = V3(12, 7, -54);
    this.solved = false;
    this.restored = false;
    this.build();
  }

  build() {
    const g = this.game;
    g.scene.background = new THREE.Color(0x0a0716);
    this.fog = new THREE.Fog(0x18122a, 16, 150);
    g.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0x9a8ac8, 0x332d48, 1.05);
    this.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xc8baff, 0.95);
    this.dir.position.set(30, 40, -22);
    this.add(this.dir);

    // skies (crossfade on restoration)
    this.skyNight = new THREE.Mesh(new THREE.SphereGeometry(390, 20, 12),
      new THREE.MeshBasicMaterial({ map: TEX.skyGateNight, side: THREE.BackSide, fog: false, transparent: true }));
    this.skyDawn = new THREE.Mesh(new THREE.SphereGeometry(388, 20, 12),
      new THREE.MeshBasicMaterial({ map: TEX.skyGateDawn, side: THREE.BackSide, fog: false, transparent: true, opacity: 0 }));
    this.add(this.skyNight); this.add(this.skyDawn);

    // stars
    {
      const n = 700, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), e = rand(0.05, 1.4), r = rand(300, 370);
        pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
        pos[i * 3 + 1] = Math.sin(e) * r;
        pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false }));
      this.add(this.stars);
    }
    // planet
    {
      const pl = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 18),
        new THREE.MeshBasicMaterial({ color: 0x4a3a7e, fog: false }));
      pl.position.set(-170, 95, 260); this.add(pl);
      const pr = new THREE.Mesh(new THREE.TorusGeometry(38, 3.5, 8, 60),
        new THREE.MeshBasicMaterial({ color: 0x6a5aae, fog: false, transparent: true, opacity: 0.5 }));
      pr.position.copy(pl.position); pr.rotation.set(1.2, 0.3, 0); this.add(pr);
      this.planet = pl; this.planetRing = pr;
    }
    // aurora
    {
      const aurTex = canvasTexture(512, 128, (gg, w, h) => {
        for (let i = 0; i < 26; i++) {
          const x = rand(0, w), ww = rand(6, 22);
          const gr = gg.createLinearGradient(0, 0, 0, h);
          gr.addColorStop(0, 'rgba(80,255,200,0)');
          gr.addColorStop(rand(0.2, 0.5), `rgba(${randi(60, 120)},255,${randi(160, 220)},${rand(0.12, 0.3)})`);
          gr.addColorStop(1, 'rgba(80,140,255,0)');
          gg.fillStyle = gr;
          gg.fillRect(x, 0, ww, h);
        }
      });
      this.auroras = [];
      [[0, 130, 150, 0.35], [-60, 110, 200, 0.25]].forEach(([x, y, z, op]) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(280, 46),
          new THREE.MeshBasicMaterial({ map: aurTex, transparent: true, opacity: op, side: THREE.DoubleSide, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        p.position.set(x, y, z); p.rotation.x = 0.25;
        this.add(p);
        this.auroras.push(p);
      });
    }

    // platform
    const plat = new THREE.Mesh(new THREE.CircleGeometry(82, 48), new THREE.MeshStandardMaterial({ map: TEX.tiles, roughness: 0.9 }));
    plat.rotation.x = -Math.PI / 2; plat.receiveShadow = true; this.add(plat);
    this._platMat = plat.material;
    const av = new THREE.Mesh(new THREE.PlaneGeometry(11, 100), std(0x55506a, { map: TEX.concrete }));
    av.rotation.x = -Math.PI / 2; av.position.set(0, 0.02, -5); av.receiveShadow = true; this.add(av);
    this._avMat = av.material;
    // glowing guide studs along the avenue
    const studGeo = new THREE.BoxGeometry(0.22, 0.1, 0.22);
    const studMat = new THREE.MeshStandardMaterial({ color: 0x1a1430, emissive: 0x9a7aff, emissiveIntensity: 1.4, roughness: 0.4 });
    for (let z = -46; z <= 34; z += 5) for (const x of [-5.4, 5.4]) {
      const s = new THREE.Mesh(studGeo, studMat);
      s.position.set(x, 0.06, z); this.add(s);
    }
    [[0, -24], [0, 2]].forEach(([x, z]) => {
      const pl = new THREE.PointLight(0x9a7aff, 1.6, 24, 1.4);
      pl.position.set(x, 3, z); this.add(pl);
    });

    // obelisks with the six runes
    this.obelisks = [];
    const obRunes = [['leaf', -6.8, -22], ['moon', -6.8, -8], ['star', -6.8, 6], ['eye', 6.8, -22], ['wave', 6.8, -8], ['flame', 6.8, 6]];
    for (const [rune, x, z] of obRunes) {
      const grp = new THREE.Group();
      const ob = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.4, 1.1), std(0x2c2838, { map: TEX.rock, roughness: 0.7, metalness: 0.2 }));
      ob.position.y = 2.2; ob.castShadow = true; grp.add(ob);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 4), std(0x3c3650, { metalness: 0.4, roughness: 0.4 }));
      cap.position.y = 4.95; cap.rotation.y = Math.PI / 4; grp.add(cap);
      const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(rune, '#8fe3ff'), color: 0x3f3f4a });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), runeMat);
      face.position.set(x < 0 ? 0.56 : -0.56, 2.6, 0); face.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      grp.add(face);
      grp.position.set(x, 0, z);
      this.add(grp);
      this.solidAt(x, z, 1.3, 1.3, 99, false);
      this.obelisks.push({ grp, rune, mat: runeMat, glowT: -1, top: V3(x, 5.4, z) });
    }

    this._buildGate();
    this._buildCore();
    this._buildBloom();
    this._buildDistantCity();
    this._envDress();
  }

  // ---------------- ENVIRONMENT DRESSING (visual only) ----------------
  _envDress() {
    const g = this.game;
    const q = g.settings.quality || 'high';
    const low = q === 'low';
    ENVK.ensureEnv();

    ENVK.configureSun(this.dir, { size: 74, far: 220, mapSize: 2048, radius: 2.8 }, q);
    ENVK.upgradeMaterial(this._platMat, ENV.rock, { repeat: [18, 18], normalScale: 0.9, roughness: 0.92 });
    ENVK.upgradeMaterial(this._avMat, ENV.concrete, { repeat: [3, 24], normalScale: 0.9, roughness: 0.9 });

    const stone = ENVK.pbrMat(ENVK.cloneSet(ENV.rock, [1.3, 1.3]), { color: 0x555070, roughness: 0.8, metalness: 0.1 });
    const darkStone = ENVK.pbrMat(ENVK.cloneSet(ENV.rock, [1.1, 1.1]), { color: 0x3a3450, roughness: 0.85 });

    const free = (x, z) => {
      if (Math.abs(x) < 8.5 && z > -50 && z < 46) return false;   // avenue + core + console
      if (Math.hypot(x, z - 18) < 7) return false;                 // core pedestal
      if (Math.hypot(x, z - 13.4) < 6) return false;               // console + tablet
      if (Math.abs(z - 42) < 7 && Math.abs(x) < 26) return false;  // gate face
      return Math.hypot(x, z) < 78;
    };
    const spot = (rMin = 14, rMax = 70) => {
      for (let k = 0; k < 10; k++) {
        const a = rand(0, Math.PI * 2), r = rand(rMin, rMax);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.94;
        if (free(x, z)) return [x, z];
      }
      return null;
    };

    // --- ruined colonnade flanking the processional avenue --------------
    for (let i = 0; i < (low ? 6 : 12); i++) {
      const z = -44 + i * 7.4;
      for (const side of [-1, 1]) {
        const x = side * rand(11.5, 13.5);
        const broken = Math.random() < 0.45;
        const h = broken ? rand(1.6, 4.2) : rand(6, 8.5);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.5, 0.7), rand(0.6, 0.85), h, 10), stone);
        col.position.set(x, h / 2, z);
        col.rotation.set(broken ? rand(-0.05, 0.05) : 0, rand(0, 7), broken ? rand(-0.06, 0.06) : 0);
        col.castShadow = true; col.receiveShadow = true;
        this.add(col);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), darkStone);
        cap.position.set(x, h + 0.2, z); cap.rotation.y = col.rotation.y; cap.castShadow = true;
        this.add(cap);
        if (broken) { // the rest of it, lying where it fell
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, rand(2, 4.4), 9), stone);
          seg.rotation.z = Math.PI / 2; seg.rotation.y = rand(0, 7);
          seg.position.set(x + side * rand(1.2, 2.6), 0.55, z + rand(-1.6, 1.6));
          seg.castShadow = true; this.add(seg);
        }
      }
    }

    // --- outer ruins, fallen obelisks, rubble fields ---------------------
    for (let i = 0; i < (low ? 6 : 16); i++) {
      const p = spot(20, 66); if (!p) continue;
      ENVK.brokenWall(this, p[0], p[1], rand(3, 8), rand(1.4, 4.4), rand(0, 3.14), Math.random() < 0.5 ? stone : darkStone, 0.8);
    }
    for (let i = 0; i < (low ? 5 : 12); i++) {
      const p = spot(18, 64); if (!p) continue;
      const len = rand(3.5, 7);
      const ob = new THREE.Mesh(new THREE.BoxGeometry(1.1, len, 1.1), darkStone);
      ob.rotation.z = Math.PI / 2 + rand(-0.12, 0.12); ob.rotation.y = rand(0, 7);
      ob.position.set(p[0], 0.58, p[1]);
      ob.castShadow = true; ob.receiveShadow = true;
      this.add(ob);
    }
    for (let i = 0; i < (low ? 5 : 14); i++) {
      const p = spot(16, 70); if (!p) continue;
      ENVK.rubblePile(this, p[0], p[1], rand(1.2, 3), stone, low ? 8 : 16);
    }
    ENVK.debrisField(this, low ? 90 : 240, () => spot(12, 74), { mat: stone, scale: [0.06, 0.32] });

    // --- surface age on the plaza ---------------------------------------
    ENVK.decalField(this, ENV.decalCrack, low ? 14 : 34, () => spot(9, 74), { min: 2.5, max: 7, opacity: 0.55, y: 0.05 });
    ENVK.decalField(this, ENV.decalRubble, low ? 10 : 24, () => spot(9, 74), { min: 2, max: 6, opacity: 0.6, y: 0.052 });
    ENVK.decalField(this, ENV.decalMoss, low ? 10 : 26, () => {
      const a = rand(0, Math.PI * 2), r = rand(14, 70);
      return [Math.cos(a) * r, Math.sin(a) * r * 0.94];
    }, { min: 2, max: 5, opacity: 0.4, y: 0.054 });

    // --- background scenery: cliffs and far structures -------------------
    ENVK.distantBlocks(this, { count: low ? 12 : 30, inner: 95, outer: 200, hMin: 14, hMax: 52, color: 0x241f38 });
    ENVK.mountainRing(this, { radius: 250, count: low ? 16 : 30, hMin: 30, hMax: 95, color: 0x171128, y: -8 });
    ENVK.mountainRing(this, { radius: 330, count: low ? 10 : 20, hMin: 50, hMax: 130, color: 0x120e20, y: -10, spread: 0.95 });

    // --- atmosphere ------------------------------------------------------
    ENVK.groundMist(this, { center: V3(0, 0, 6), radius: 72, layers: low ? 2 : 5, color: 0x8b82b8, opacity: 0.05, y: 0.4 });
    ENVK.dustMotes(this, { count: low ? 80 : 230, center: V3(0, 0, 4), size: V3(120, 10, 120), color: 0xc9b9ff, opacity: 0.25, pointSize: 0.05, speed: 0.2 });
    if (!low) {
      ENVK.lightShaft(this, 0, 22, 42, 3.4, 9, 40, 0xb9a8ff, 0.03);
      for (const [x, z] of [[-14, -18], [15, 4], [-16, 26]]) ENVK.lightShaft(this, x, 12, z, 1, 4.2, 24, 0x9f8ce0, 0.03);
    }
  }

  _buildGate() {
    const stoneMat = std(0x3d3650, { map: TEX.rock, roughness: 0.75, metalness: 0.15 });
    [-8.4, 8.4].forEach(x => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(4.4, 20, 4.4), stoneMat);
      p.position.set(x, 10, 42); p.castShadow = true; this.add(p);
      this.solidAt(x, 42, 4.4, 4.4, 20);
      // glowing symbols on pillars
      for (let i = 0; i < 3; i++) {
        const runes = ['leaf', 'moon', 'star', 'eye', 'wave', 'flame'];
        const rm = new THREE.MeshBasicMaterial({ map: runeTexture(runes[(i * 2 + (x > 0 ? 1 : 0)) % 6], '#8fe3ff'), color: 0x555566, transparent: true, opacity: 0.9 });
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), rm);
        f.position.set(x + (x < 0 ? 2.21 : -2.21), 5 + i * 5, 42);
        f.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.add(f);
        (this.pillarRunes = this.pillarRunes || []).push(rm);
      }
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 4.8), stoneMat);
    lintel.position.set(0, 21, 42); lintel.castShadow = true; this.add(lintel);
    // outer walls
    [-18, 18].forEach(x => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 3.6), stoneMat);
      w.position.set(x, 5.5, 42); this.add(w);
      this.solidAt(x, 42, 14, 3.6, 11);
    });

    // double doors (sink into the ground)
    this.doors = [];
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x33405a, metalness: 0.85, roughness: 0.3, map: TEX.concrete });
    [-3.15, 3.15].forEach(x => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(6.3, 15, 0.9), doorMat);
      d.position.set(x, 7.5, 42); d.castShadow = true;
      this.add(d);
      this.doors.push(d);
    });
    this.doorColliderIdx = this.colliders.length;
    this.solidAt(0, 42, 13, 0.9, 15);
    this.gateOpening = false; this.gateOpenT = 0;

    // golden light behind
    this.backLightPlane = new THREE.Mesh(new THREE.PlaneGeometry(15, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.backLightPlane.position.set(0, 8, 43.4);
    this.add(this.backLightPlane);
    this.backLight = new THREE.PointLight(0xffc98a, 0, 40, 1.4);
    this.backLight.position.set(0, 7, 45);
    this.add(this.backLight);
    this.beamUp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, 120, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beamUp.position.set(0, 60, 44);
    this.add(this.beamUp);

    const g = this.game;
    this.inter({
      object: this.doors[0], markerPos: V3(0, 10, 42),
      prompt: () => this.gateOpening || this.restored ? 'The gate stands open' : "Creator's Gate — dormant",
      radius: 6,
      onInteract: () => {
        if (this.solved) return;
        g.ui.feedback('DORMANT', false);
        g.petalo.say('Only the Energy Core can wake it. The console below the core — that is our way in.', 3800);
      },
    });
  }

  _buildCore() {
    const g = this.game;
    // pedestal
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 1.1, 18), std(0x3d3650, { map: TEX.rock, metalness: 0.3 }));
    ped.position.set(0, 0.55, 18); ped.castShadow = true; this.add(ped);
    this.solidAt(0, 18, 3.4, 3.4, 99, false);
    // core
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x0e2233, emissive: 0x66d5ff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.2 });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 22), this.coreMat);
    this.core.position.set(0, 3.1, 18);
    this.add(this.core);
    this.coreLight = new THREE.PointLight(0x66d5ff, 1.5, 17, 1.6);
    this.coreLight.position.set(0, 3.2, 18);
    this.add(this.coreLight);
    // rings
    this.rings = [];
    this.ringSpeed = 1;
    [1.5, 1.95, 2.4].forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 64),
        new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x66d5ff, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 }));
      ring.position.set(0, 3.1, 18);
      ring.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      this.add(ring);
      this.rings.push(ring);
    });

    // restoration console
    const con = new THREE.Group();
    const cbody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.55), std(0x3c4256, { metalness: 0.6, roughness: 0.35 }));
    cbody.position.y = 0.52; cbody.castShadow = true; con.add(cbody);
    this.consoleScreen = new THREE.MeshStandardMaterial({ color: 0x0c1a24, emissive: 0x2a7a9a, emissiveIntensity: 0.9, roughness: 0.2 });
    const cscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.4), this.consoleScreen);
    cscreen.position.set(0, 1.0, 0.2); cscreen.rotation.x = -0.5; con.add(cscreen);
    con.position.set(0, 0, 13.4);
    this.add(con);
    this.solidAt(0, 13.4, 1.1, 0.8, 99, false);
    this.consoleInter = this.inter({
      object: con,
      prompt: () => {
        if (this.solved) return 'Restoration System Active';
        if (!g.hasFlag('L4:matrix_core')) return 'Restoration Console — Locked (Defeat Void Behemoth)';
        return 'Access Restoration Console (PUZZLE 8)';
      },
      radius: 3.2,
      markerPos: V3(0, 2, 13.4),
      onInteract: async () => {
        if (this.solved) return;
        if (!g.hasFlag('L4:matrix_core')) {
          g.audio.fail();
          g.ui.feedback('MATRIX CORE REQUIRED', false);
          g.petalo.say('The console is locked. The Void Behemoth guarding the arena holds the Master Matrix Core!');
          return;
        }
        const ok = await g.startPuzzle({
          title: 'FINAL ESCAPE PUZZLE — RESTORATION MATRIX',
          hint: 'Combine all cosmic relics gathered along your journey (Forest Runes & Cave Crystals).',
          slots: 6,
          solution: ['leaf', 'moon', 'star', 'eye', 'wave', 'flame'],
          failLines: 'Forest first — leaf, moon, star. Then the deep — eye, wave, flame.',
        });
        if (ok) this.beginRestoration();
      },
    });

    this.bossSpawned = false;
  }

  spawnVoidBehemoth() {
    if (this.bossSpawned || this.game.hasFlag('L4:boss_defeated')) return;
    this.bossSpawned = true;
    const g = this.game;
    const boss = new VoidBehemoth(g, {
      pos: V3(0, 0, -6),
      patrol: [V3(-6, 0, -4), V3(6, 0, -4), V3(0, 0, 4)],
      onDefeat: (m) => {
        g.addFlag('L4:boss_defeated');
        this._spawnMatrixCore(m.position.clone());
        g.setObjective('claim_core', 'Claim the dropped Master Matrix Core and approach the Restoration Console (PUZZLE 8).');
      }
    });
    this.monsters.push(boss);
    boss._enterAlert();
    g.audio.monsterRoar();
    g.ui.notify('FINAL BOSS', 'THE VOID BEHEMOTH DESCENDS! USE ALL YOUR COMBAT SKILLS!', 'red', 4500);
  }

  _spawnMatrixCore(pos) {
    const coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({ color: 0x1a2244, emissive: 0x8fe3ff, emissiveIntensity: 3.0, metalness: 0.9 })
    );
    coreMesh.position.set(pos.x, 0.6, pos.z);
    this.add(coreMesh);
    const light = new THREE.PointLight(0x8fe3ff, 2.5, 8);
    light.position.copy(coreMesh.position);
    this.add(light);

    this.inter({
      object: coreMesh,
      prompt: 'Claim Master Matrix Core',
      radius: 2.6,
      once: true,
      onInteract: () => {
        this.game.addFlag('L4:matrix_core');
        this.game.audio.clueFound();
        this.game.ui.notify('RELIC ACQUIRED', 'Master Matrix Core — The Key to Restoration', 'gold', 3800);
        coreMesh.visible = false;
        light.intensity = 0;
        this.game.setObjective('restore_world', 'Approach the Restoration Console to unlock the final escape mechanism (PUZZLE 8).');
        this.game.refreshGuidance();
      }
    });

    // order tablet
    const tab = new THREE.Group();
    const tstand = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 0.4), std(0x49435e, { map: TEX.rock }));
    tstand.position.y = 0.75; tstand.rotation.x = -0.12; tstand.castShadow = true; tab.add(tstand);
    const tface = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.2),
      new THREE.MeshBasicMaterial({ map: runeStripTexture(['leaf', 'moon', 'star', 'eye', 'wave', 'flame'], { fg: '#ffc46b', caption: 'THE PATH OF THE FOREST MUST LEAD THE DEEP' }) }));
    tface.position.set(0, 0.88, 0.22); tface.rotation.x = -0.12; tab.add(tface);
    tab.position.set(-3.6, 0, 12.6); tab.rotation.y = 0.5;
    this.add(tab);
    this.solidAt(-3.6, 12.6, 3.5, 0.8, 99, false);
    this.inter({
      object: tab, prompt: 'Read the creator tablet', radius: 3,
      onInteract: () => {
        g.ui.dialogue('CREATOR TABLET', '"Leaf, Moon, Star — then Eye, Wave, Flame. The path of the forest must lead the deep."', 4600);
        g.audio.interact();
      },
    });
  }

  _buildBloom() {
    this.bloomItems = [];
    const tuftMat = std(0x3f7a3a, { roughness: 0.9 });
    const leafMats = [std(0x4c9a44), std(0x67b04c), std(0x8fc45c)];
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), r = rand(10, 42);
      const t = new THREE.Mesh(new THREE.ConeGeometry(rand(0.1, 0.2), rand(0.4, 0.7), 5), tuftMat);
      t.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r * 0.92 + 6);
      t.scale.setScalar(0.001);
      this.add(t);
      this.bloomItems.push({ obj: t, delay: rand(0, 2.5), k: 0 });
    }
    const trunkMat = std(0x5a4632);
    for (let i = 0; i < 9; i++) {
      const a = rand(0, Math.PI * 2), r = rand(26, 48);
      const grp = new THREE.Group();
      const h = rand(2, 3.4);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, h, 7), trunkMat);
      trunk.position.y = h / 2; grp.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1, 1.6), 0), choice(leafMats));
      crown.position.y = h + 0.8; crown.castShadow = true; grp.add(crown);
      grp.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.9 + 6);
      grp.scale.setScalar(0.001);
      this.add(grp);
      this.bloomItems.push({ obj: grp, delay: rand(0.8, 3.5), k: 0 });
    }
  }

  _buildDistantCity() {
    const mk = (lit) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(170, 30),
        new THREE.MeshBasicMaterial({ map: skylineTexture(lit), transparent: true, fog: false, opacity: lit ? 0 : 1 }));
      m.position.set(0, 12, 120);
      this.add(m);
      return m;
    };
    this.cityDark = mk(false);
    this.cityLit = mk(true);
  }

  async beginRestoration() {
    const g = this.game;
    if (this.restored) return;
    this.restored = true; this.solved = true;
    g.save.addFlag('L4:core');
    this.consoleInter.setEnabled(false);
    this.consoleScreen.emissive.set(0xffc46b); this.consoleScreen.emissiveIntensity = 2.4;
    g.setObjective('restore', 'Witness the restoration.');
    g.refreshGuidance();

    // core ignition
    g.vfx.burst(this.core.position, { color: 0xffe3a8, count: 130, speed: 5.5, size: 0.14, life: 1.6, gravity: -0.4 });
    g.vfx.ring(V3(0, 0.2, 18), { color: 0xffc46b, r1: 18 });
    this.coreMat.emissive.set(0xffe3a8); this.coreMat.emissiveIntensity = 2.8;
    this.coreLight.color.set(0xffe3a8); this.coreLight.intensity = 5; this.coreLight.distance = 34;
    this.ringSpeed = 7;
    this.rings.forEach(r => r.material.emissive.set(0xffe3a8));
    this.obelisks.forEach((o, i) => setTimeout(() => {
      o.glowT = 0; o.mat.color.set(0xffffff);
      g.audio.strikeCrystal(i + 1);
      g.vfx.burst(o.top, { color: 0x8fe3ff, count: 22, speed: 1.6, size: 0.09, life: 0.9, gravity: 0 });
    }, 350 * i));
    (this.pillarRunes || []).forEach(r => r.color.set(0xaadfff));

    await sleep(1700);
    g.audio.restoration();
    g.petalo.say('Energy levels rising… Arin, stand back — it is beginning!', 3200);

    const playerP = g.player.pos;
    await g.playCinematic([
      {
        pos: V3(playerP.x, 2.0, playerP.z - 3.5), look: V3(0, 7, 42), dur: 2800,
        onStart: () => { this.gateOpening = true; g.audio.gateOpen(); },
      },
      {
        pos: V3(-17, 13, 2), look: V3(0, 8, 42), dur: 3400,
        onStart: () => { this.heavenFade = true; g.vfx.risingMotes(true, { center: V3(0, 0, 18), r: 44 }); },
      },
      {
        pos: V3(18, 8, 30), look: V3(0, 2, -14), dur: 3200,
        onStart: () => {
          this.cityFade = true; this.blooming = true;
          g.petalo.celebrate();
          g.petalo.say('You did it, Arin… the world is breathing again.', 4200);
        },
      },
      { pos: V3(0, 2.4, 9), look: V3(0, 4, 42), dur: 2600 },
    ], { keepCinematic: true });

    setTimeout(() => g.vfx.risingMotes(false), 4500);
    await g.ui.fade('#fff8ec', 1, 1100);
    g.showEnding();
    await g.ui.fade('#fff8ec', 0, 1600);
  }

  // after "Continue Exploring" from the ending (or on continue-save)
  setRestoredState() {
    const g = this.game;
    this.restored = true; this.solved = true;
    this.consoleInter.setEnabled(false);
    this.coreMat.emissive.set(0xffe3a8); this.coreMat.emissiveIntensity = 2.2;
    this.coreLight.color.set(0xffe3a8); this.coreLight.intensity = 3;
    this.ringSpeed = 2.2;
    this.doors.forEach(d => d.position.y = -7.8);
    if (this.doorColliderIdx !== null) { this.colliders.splice(this.doorColliderIdx, 1); this.doorColliderIdx = null; }
    this.backLightPlane.material.opacity = 0.85;
    this.backLight.intensity = 2.2;
    this.beamUp.material.opacity = 0.16;
    this.skyDawn.material.opacity = 1; this.skyNight.material.opacity = 0;
    this.stars.material.opacity = 0;
    this.auroras.forEach(a => a.material.opacity = 0);
    this.hemi.color.set(0xbfd8e8); this.hemi.groundColor.set(0x8a7a5a); this.hemi.intensity = 0.95;
    this.dir.color.set(0xffd9a0); this.dir.intensity = 1.35; this.dir.position.set(-22, 42, 28);
    this.fog.color.set(0x9db4c0); this.fog.near = 34; this.fog.far = 230;
    this.cityDark.material.opacity = 0; this.cityLit.material.opacity = 1;
    this.bloomItems.forEach(b => { b.obj.scale.setScalar(1); b.k = 1; });
    this.obelisks.forEach(o => { o.mat.color.set(0xffffff); });
    (this.pillarRunes || []).forEach(r => r.color.set(0xaadfff));
    this.consoleScreen.emissive.set(0xffc46b);
  }

  applySave() {
    const g = this.game;
    if (g.hasFlag('L4:core')) {
      this.setRestoredState();
      g.setObjective('restored', 'The valley breathes again. Explore, or rest.');
    } else if (g.hasFlag('L4:matrix_core')) {
      g.setObjective('restore_world', 'Approach the Restoration Console to unlock the final escape mechanism (PUZZLE 8).');
    } else if (g.hasFlag('L4:boss_defeated')) {
      g.setObjective('claim_core', 'Claim the dropped Master Matrix Core and approach the Restoration Console (PUZZLE 8).');
    } else {
      g.setObjective('defeat_behemoth', 'Defeat the Void Behemoth guarding the Creator’s Gate!');
    }
  }

  enter() {
    const g = this.game;
    g.audio.startAmbient(this.restored ? 'dawn' : 'cosmic');
    this.applySave();
    if (!this.restored && g.petalo.active) {
      g.petalo.say("The Creator's Gate… it is guarded by the apex shadow. Stand your ground, Arin!", 4200);
    }
  }

  getGuidance() {
    if (this.restored) return null;
    if (!this.game.hasFlag('L4:boss_defeated') && this.monsters.length > 0 && this.monsters[0].alive) {
      return { target: this.monsters[0].position };
    }
    return { target: V3(0, 0, 13.4) };
  }
  getHint() {
    if (this.restored) return { text: 'It is done. Breathe it in, Arin.', target: null };
    if (!this.game.hasFlag('L4:boss_defeated')) return { text: 'Dodge the Behemoth\'s slams and strike with your Katana combo!', target: V3(0, 0, -4) };
    return { text: 'The console below the core. The full sequence — the tablet beside it shows the order.', target: V3(0, 0, 13.4) };
  }

  update(dt) {
    super.update(dt);
    if (!this.restored && !this.bossSpawned && !this.game.hasFlag('L4:boss_defeated')) {
      const p = this.game.player.pos;
      if (p.z > -32) {
        this.spawnVoidBehemoth();
      }
    }
    // core idle
    if (this.core) {
      this.core.position.y = 3.1 + Math.sin(this.t * 1.6) * 0.15;
      this.core.rotation.y += dt * 0.4;
      this.coreLight.position.y = this.core.position.y;
      this.coreLight.intensity = (this.restored ? 5 : 1.5) + Math.sin(this.t * 3.2) * (this.restored ? 0.7 : 0.2);
    }
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.rotation.x += dt * 0.5 * this.ringSpeed * (i % 2 ? -0.7 : 1);
      r.rotation.y += dt * 0.35 * this.ringSpeed * (i % 2 ? 1 : -0.8);
      r.position.y = this.core ? this.core.position.y : 3.1;
    }
    for (const o of this.obelisks) if (o.glowT >= 0 && o.glowT < 1) o.glowT = Math.min(1, o.glowT + dt);

    // gate doors sinking
    if (this.gateOpening) {
      this.gateOpenT += this.wallDt;
      const k = clamp(this.gateOpenT / 6, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.doors.forEach(d => d.position.y = 7.5 - 15.4 * e);
      this.backLightPlane.material.opacity = e * 0.9;
      this.backLight.intensity = e * 2.4;
      this.beamUp.material.opacity = e * 0.16;
      if (this.gateOpenT > 0.2 && Math.random() < 0.3) {
        this.game.vfx.burst(V3(rand(-5, 5), 0.5, 42), { color: 0xbfa880, count: 6, speed: 2, size: 0.13, life: 1, gravity: -4 });
      }
      if (k >= 1) {
        this.gateOpening = false;
        this.doors.forEach(d => d.visible = false);
        if (this.doorColliderIdx !== null) { this.colliders.splice(this.doorColliderIdx, 1); this.doorColliderIdx = null; }
      }
    }

    // dawn crossfade (sky, stars, fog, lights)
    if (this.heavenFade) {
      this._hf = Math.min(1, (this._hf || 0) + this.wallDt / 6);
      const k = this._hf, e = k * k * (3 - 2 * k);
      this.skyDawn.material.opacity = e;
      this.skyNight.material.opacity = 1 - e * 0.85;
      this.stars.material.opacity = 0.9 * (1 - e);
      this.auroras.forEach(a => a.material.opacity = (1 - e) * 0.3);
      this.hemi.color.setHex(0x6a5a9a).lerp(new THREE.Color(0xbfd8e8), e);
      this.hemi.groundColor.setHex(0x1e1a26).lerp(new THREE.Color(0x8a7a5a), e);
      this.hemi.intensity = 0.55 + e * 0.4;
      this.dir.color.setHex(0xc0b0ff).lerp(new THREE.Color(0xffd9a0), e);
      this.dir.intensity = 0.55 + e * 0.8;
      this.dir.position.lerp(new THREE.Vector3(-22, 42, 28), e * 0.06);
      this.fog.color.setHex(0x18122a).lerp(new THREE.Color(0x9db4c0), e);
      this.fog.near = 16 + e * 18; this.fog.far = 150 + e * 80;
      if (this.cityFade) { /* handled below too */ }
    }
    if (this.cityFade) {
      this._cf = Math.min(1, (this._cf || 0) + this.wallDt / 4);
      const e = this._cf * this._cf;
      this.cityDark.material.opacity = Math.max(0, 1 - e * 1.6);
      // flicker-on effect
      this.cityLit.material.opacity = e * (0.75 + (Math.random() < 0.2 ? Math.random() * 0.25 : 0.25));
    }
    // bloom growth
    if (this.blooming) {
      for (const b of this.bloomItems) {
        if (b.k >= 1) continue;
        b.delay -= this.wallDt;
        if (b.delay > 0) continue;
        b.k = Math.min(1, b.k + this.wallDt * 0.7);
        const e = b.k * b.k * (3 - 2 * b.k);
        b.obj.scale.setScalar(Math.max(0.001, e));
      }
    }
    // planet slow ring spin
    if (this.planetRing) this.planetRing.rotation.z += dt * 0.02;
  }
}

// ---------------------------------------------------------------------------
export function createLevel(game, idx) {
  switch (idx) {
    case 1: return new CityLevel(game);
    case 2: return new ForestLevel(game);
    case 3: return new CaveLevel(game);
    case 4: return new GateLevel(game);
    default: return new CityLevel(game);
  }
}
