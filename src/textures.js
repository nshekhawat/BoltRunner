// Procedural materials. M3: flat colours. Textures/normal maps arrive in M5.
import * as THREE from 'three';

export function makeMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
  return {
    rock: std(0xa0664a, { roughness: 0.95 }),
    barrel: std(0xb5502c, { roughness: 0.7, metalness: 0.4 }),
    barrelRim: std(0x6b6f78, { roughness: 0.5, metalness: 0.8 }),
    wood: std(0x8a5a33),
    drone: std(0xe8e2d2, { roughness: 0.4, metalness: 0.5 }),
    droneDark: std(0x3b3f4a, { roughness: 0.5, metalness: 0.6 }),
    droneEye: new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2 }),
    rotor: std(0x222, { transparent: true, opacity: 0.6 }),
    vent: std(0x7a7f88, { roughness: 0.4, metalness: 0.9 }),
    steam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    tyre: std(0x2a2a2e, { roughness: 0.9 }),
    rim: std(0x9a9ea8, { roughness: 0.4, metalness: 0.9 }),
    battery: new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x1a8a4a, emissiveIntensity: 0.8, roughness: 0.4 }),
    batteryBolt: new THREE.MeshBasicMaterial({ color: 0xfff27a }),
    ground: std(0xd9a46b, { roughness: 0.95 }),
    robotMetal: std(0x9aa4b2, { roughness: 0.4, metalness: 0.7 }),
  };
}
