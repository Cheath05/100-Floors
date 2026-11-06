// Third-person orbit camera around the local player.
import * as THREE from 'three';
import type { MapDef } from '@floors/shared';

export class ThirdPersonCamera {
  /** Camera sits at target + (sin yaw, ., cos yaw) * distance, so W moves away from it. */
  yaw = Math.PI;
  pitch = 0.32;
  distance = 6;
  private target = new THREE.Vector3();
  private smoothed = new THREE.Vector3();
  private first = true;
  sensitivity = 0.0025;

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Look in the direction the character faces (used on spawn). */
  faceAlong(facing: number): void {
    this.yaw = facing + Math.PI;
  }

  applyMouse(dx: number, dy: number, wheel: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * this.sensitivity, -0.35, 1.25);
    this.distance = THREE.MathUtils.clamp(this.distance + wheel * 0.6, 2.5, 14);
  }

  /** World-space unit vectors for "forward" and "right" on the ground, from the camera's view. */
  basis(): { fx: number; fz: number; rx: number; rz: number } {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { fx, fz, rx: -fz, rz: fx };
  }

  update(px: number, py: number, pz: number, dt: number, map: MapDef | null): void {
    this.target.set(px, py + 1.45, pz);
    if (this.first) {
      this.smoothed.copy(this.target);
      this.first = false;
    } else {
      // Light smoothing on height only (jumps), horizontal follows exactly to avoid swim.
      this.smoothed.x = this.target.x;
      this.smoothed.z = this.target.z;
      this.smoothed.y += (this.target.y - this.smoothed.y) * Math.min(1, dt * 12);
    }
    const cp = Math.cos(this.pitch);
    let x = this.smoothed.x + Math.sin(this.yaw) * cp * this.distance;
    let y = this.smoothed.y + Math.sin(this.pitch) * this.distance;
    let z = this.smoothed.z + Math.cos(this.yaw) * cp * this.distance;
    if (map?.bounds.kind === 'rect') {
      // Stay inside indoor rooms.
      x = THREE.MathUtils.clamp(x, -map.bounds.halfX + 0.3, map.bounds.halfX - 0.3);
      z = THREE.MathUtils.clamp(z, -map.bounds.halfZ + 0.3, map.bounds.halfZ - 0.3);
      y = Math.min(y, 13.5);
    }
    y = Math.max(y, 0.35);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.smoothed);
  }
}
