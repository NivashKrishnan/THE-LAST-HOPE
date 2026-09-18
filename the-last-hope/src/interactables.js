import * as THREE from 'three';
import { rand } from './util.js';

// Reusable interaction system — every interactable in the game is one of these.
let MARKER_GEO = null;

export class Interactable {
  /**
   * opts: { object, prompt (string|fn), radius, enabled, once, onInteract(game,this), markerColor, markerPos }
   */
  constructor(game, opts) {
    if (!MARKER_GEO) MARKER_GEO = new THREE.OctahedronGeometry(0.13);
    this.game = game;
    this.object = opts.object;
    this.prompt = opts.prompt || 'Interact';
    this.radius = opts.radius ?? 2.6;
    this.enabled = opts.enabled ?? true;
    this.once = opts.once ?? false;
    this.onInteract = opts.onInteract || null;
    this.tickFn = opts.tick || null;
    this.t = rand(0, 7);
    this.hovered = false;

    const mat = new THREE.MeshBasicMaterial({ color: opts.markerColor ?? 0x8fe3ff, transparent: true, opacity: 0.95 });
    this.marker = new THREE.Mesh(MARKER_GEO, mat);
    if (opts.markerPos) {
      this.marker.position.copy(opts.markerPos);
    } else {
      const box = new THREE.Box3().setFromObject(this.object);
      this.marker.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.55, (box.min.z + box.max.z) / 2);
    }
    this.baseY = this.marker.position.y;
    this.marker.visible = this.enabled;
    this.marker.renderOrder = 5;
    (opts.markerParent || game.scene).add(this.marker);
  }

  get label() { return typeof this.prompt === 'function' ? this.prompt() : this.prompt; }
  get position() { const v = new THREE.Vector3(); this.object.getWorldPosition(v); return v; }

  setEnabled(b) { this.enabled = b; this.marker.visible = b; }

  update(dt) {
    if (this.tickFn) this.tickFn(dt, this);
    if (!this.marker.visible) return;
    this.t += dt;
    this.marker.position.y = this.baseY + Math.sin(this.t * 2.2) * 0.12;
    this.marker.rotation.y += dt * 2.4;
    const s = this.hovered ? 1.5 + Math.sin(this.t * 9) * 0.15 : 1;
    this.marker.scale.setScalar(s);
  }

  interact(game) {
    if (!this.enabled) return;
    if (this.onInteract) this.onInteract(game, this);
    if (this.once) this.setEnabled(false);
  }

  dispose(parent) {
    (parent || this.game.scene).remove(this.marker);
    this.marker.material.dispose();
  }
}
