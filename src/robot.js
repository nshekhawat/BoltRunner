// M3 placeholder: a capsule with the final Robot interface. Replaced by the real rig in M4.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { DUCK_HEIGHT } from './spawn.js';

export class Robot {
  constructor(mats) {
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 6, 16), mats.robotMetal);
    this.body.castShadow = true; this.body.position.y = 0.9; this.group.add(this.body);
    this._boxes = [{ cx: 0, cy: 0, w: 0, h: 0 }, { cx: 0, cy: 0, w: 0, h: 0 }, { cx: 0, cy: 0, w: 0, h: 0 }];
    this.time = 0;
  }
  // Per-part collision boxes (torso, legs, head) in world space for the current pose.
  boxes(y, ducking, scale) {
    const b = this._boxes, x = C.ROBOT_X;
    if (ducking) { Object.assign(b[0], { cx: x, cy: y + 0.5, w: 1.1 * scale, h: DUCK_HEIGHT * scale }); Object.assign(b[1], { cx: x, cy: y + 0.3, w: 0.8 * scale, h: 0.6 * scale }); Object.assign(b[2], { cx: x + 0.3, cy: y + 0.7, w: 0.5 * scale, h: 0.5 * scale }); }
    else { Object.assign(b[0], { cx: x, cy: y + 1.0, w: 0.8 * scale, h: 0.8 * scale }); Object.assign(b[1], { cx: x, cy: y + 0.35, w: 0.6 * scale, h: 0.7 * scale }); Object.assign(b[2], { cx: x, cy: y + 1.55, w: 0.6 * scale, h: 0.5 * scale }); }
    return b;
  }
  update(dt, s) { // s: { mode, y, vy, speed, ducking, hitFlash }
    this.time += dt;
    this.group.position.y = s.y;
    this.body.scale.set(1, s.ducking ? 0.55 : 1, 1);
    this.body.position.y = s.ducking ? 0.5 : 0.9;
    this.body.material.emissive.setHex(s.hitFlash > 0 && Math.floor(s.hitFlash * 20) % 2 ? 0xff4400 : 0);
  }
}
