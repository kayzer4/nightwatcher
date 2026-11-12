import type * as THREE from "three";

/** Raises road lamps just above the road mesh, whose local top is about 0.02. */
export const LAMP_BASE_LIFT = 0.03;

export interface WorldLamp {
  id: string;
  lampModel: string;
  cellKey: string;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  intensity: number;
  distance: number;
  color: string;
  angle: number;
  penumbra: number;
}
