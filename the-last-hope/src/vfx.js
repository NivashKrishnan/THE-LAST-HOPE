import * as THREE from 'three';
import { rand } from './util.js';

// Lightweight particle/VFX manager: bursts, rings, beams, clue sparkles, rising motes.
export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];   // transient
    this.sparkles = [];  // persistent until stopped
    this.motesOn = false;
    this.motesRegion = { center: new THREE.Vector3(), r: 30 };
    this.moteTimer = 0;
  }

  burst(pos, { color = 0x9fdfff, count = 40, speed = 3, size = 0.1, life = 0.8, gravity = -2.5, up = 0.5 } = {}) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const a = rand(0, Math.PI * 2), e = rand(-0.5, 1) * up + rand(0.2, 1);
      const s = speed * rand(0.3, 1);
      v[i * 3] = Math.cos(a) * s; v[i * 3 + 1] = e * s; v[i * 3 + 2] = Math.sin(a) * s;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(g, m);
    this.scene.add(pts);
    this.systems.push({ kind: 'burst', obj: pts, vel: v, life, maxLife: life, gravity, count });
  }

  ring(pos, { color = 0x9fdfff, r1 = 6, life = 0.9, y = 0.05 } = {}) {
    const g = new THREE.RingGeometry(0.3, 1, 48);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, (pos.y || 0) + y, pos.z);
    this.scene.add(mesh);
    this.systems.push({ kind: 'ring', obj: mesh, life, maxLife: life, r1 });
  }

  beamBetween(a, b, { color = 0x9fdfff, r = 0.12, life = 1.6 } = {}) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, 6, 1, true);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(mesh);
    this.systems.push({ kind: 'fade', obj: mesh, life, maxLife: life });
    return mesh;
  }

  sparkle(target, { color = 0xffc46b, count = 7, radius = 0.8, size = 0.09 } = {}) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(g, m);
    this.scene.add(pts);
    const phases = []; for (let i = 0; i < count; i++) phases.push(rand(0, Math.PI * 2));
    const h = { obj: pts, target, phases, count, radius, t: 0, stopped: false, stop() { this.stopped = true; } };
    this.sparkles.push(h);
    return h;
  }

  risingMotes(on, region) {
    this.motesOn = on;
    if (region) this.motesRegion = region;
  }

  clearAll() {
    for (const s of this.systems) {
      this.scene.remove(s.obj);
      s.obj.geometry.dispose(); s.obj.material.dispose();
    }
    this.systems.length = 0;
    for (const s of this.sparkles) {
      this.scene.remove(s.obj);
      s.obj.geometry.dispose(); s.obj.material.dispose();
    }
    this.sparkles.length = 0;
    this.motesOn = false;
  }

  update(dt) {
    // transient systems
    for (let i = this.systems.length - 1; i >= 0; i--) {
      const s = this.systems[i];
      s.life -= dt;
      const t = Math.max(0, s.life / s.maxLife);
      if (s.kind === 'burst') {
        const pos = s.obj.geometry.attributes.position.array;
        for (let j = 0; j < s.count; j++) {
          s.vel[j * 3 + 1] += s.gravity * dt;
          pos[j * 3] += s.vel[j * 3] * dt;
          pos[j * 3 + 1] += s.vel[j * 3 + 1] * dt;
          pos[j * 3 + 2] += s.vel[j * 3 + 2] * dt;
        }
        s.obj.geometry.attributes.position.needsUpdate = true;
        s.obj.material.opacity = t;
      } else if (s.kind === 'ring') {
        const sc = 0.3 + (1 - t) * s.r1;
        s.obj.scale.set(sc, sc, sc);
        s.obj.material.opacity = t * 0.8;
      } else if (s.kind === 'fade') {
        s.obj.material.opacity = t * 0.85;
      }
      if (s.life <= 0) {
        this.scene.remove(s.obj);
        s.obj.geometry.dispose(); s.obj.material.dispose();
        this.systems.splice(i, 1);
      }
    }
    // sparkles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      if (s.stopped || !s.target.parent) {
        this.scene.remove(s.obj);
        s.obj.geometry.dispose(); s.obj.material.dispose();
        this.sparkles.splice(i, 1); continue;
      }
      s.t += dt;
      const c = new THREE.Vector3();
      s.target.getWorldPosition(c);
      const pos = s.obj.geometry.attributes.position.array;
      for (let j = 0; j < s.count; j++) {
        const ph = s.phases[j] + s.t * (1.2 + j * 0.13);
        pos[j * 3] = c.x + Math.cos(ph) * s.radius * (0.7 + 0.3 * Math.sin(ph * 0.7));
        pos[j * 3 + 1] = c.y + 0.3 + Math.sin(ph * 1.7) * 0.5 + 0.35;
        pos[j * 3 + 2] = c.z + Math.sin(ph) * s.radius * (0.7 + 0.3 * Math.cos(ph * 0.6));
      }
      s.obj.geometry.attributes.position.needsUpdate = true;
      s.obj.material.opacity = 0.6 + 0.35 * Math.sin(s.t * 5);
    }
    // rising motes
    if (this.motesOn) {
      this.moteTimer -= dt;
      if (this.moteTimer <= 0) {
        this.moteTimer = 0.08;
        const c = this.motesRegion.center, r = this.motesRegion.r;
        const p = new THREE.Vector3(c.x + rand(-r, r), rand(0, 1), c.z + rand(-r, r));
        this.burst(p, { color: 0xffe3a8, count: 2, speed: 0.15, size: 0.14, life: rand(2.5, 4), gravity: 0.55, up: 1 });
      }
    }
  }
}
