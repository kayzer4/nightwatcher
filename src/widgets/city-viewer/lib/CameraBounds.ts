import type { OrbitControls } from "three-stdlib";

/** Keeps the camera's orbit target inside the playable district and within a usable height range. */
export class CameraBounds {
  constructor(
    private readonly minCameraY: number,
    private readonly maxCameraY: number,
    private readonly minTargetY: number,
    private readonly maxTargetY: number,
    private readonly maxTargetX = Infinity,
    private readonly maxTargetZ = Infinity,
  ) {}

  constrain(controls: OrbitControls): boolean {
    const cameraY = controls.object.position.y;
    const targetY = controls.target.y;
    const lowerShift = Math.max(this.minCameraY - cameraY, this.minTargetY - targetY);
    const upperShift = Math.min(this.maxCameraY - cameraY, this.maxTargetY - targetY);
    const shift = lowerShift > 0 ? lowerShift : upperShift < 0 ? upperShift : 0;
    const targetX = Math.max(-this.maxTargetX, Math.min(this.maxTargetX, controls.target.x));
    const targetZ = Math.max(-this.maxTargetZ, Math.min(this.maxTargetZ, controls.target.z));
    const shiftX = targetX - controls.target.x;
    const shiftZ = targetZ - controls.target.z;
    if (Math.abs(shift) < 1e-6 && Math.abs(shiftX) < 1e-6 && Math.abs(shiftZ) < 1e-6) return false;
    controls.object.position.y += shift;
    controls.target.y += shift;
    controls.object.position.x += shiftX;
    controls.target.x += shiftX;
    controls.object.position.z += shiftZ;
    controls.target.z += shiftZ;
    return true;
  }
}

/** Street-level panning is limited by camera height, not by the orbit target's Y. */
export function createCityCameraBounds(maxPanX: number, maxPanZ: number): CameraBounds {
  return new CameraBounds(0.18, 15, -Infinity, 4, maxPanX, maxPanZ);
}
