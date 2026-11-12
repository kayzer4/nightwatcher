import * as THREE from "three";
import type { BackdropLOD } from "./BackdropCityPlan";

/** One source mesh rendered at three geometry resolutions. */
export class BackdropInstanceBatch {
  constructor(
    readonly meshes: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh],
    readonly transforms: readonly THREE.Matrix4[],
  ) {}

  update(levels: readonly BackdropLOD[]): void {
    const names: BackdropLOD[] = ["detailed", "reduced", "distant"];
    for (let lodIndex = 0; lodIndex < this.meshes.length; lodIndex++) {
      const mesh = this.meshes[lodIndex];
      let visibleCount = 0;
      for (let i = 0; i < levels.length; i++) {
        if (levels[i] === names[lodIndex]) mesh.setMatrixAt(visibleCount++, this.transforms[i]);
      }
      mesh.count = visibleCount;
      mesh.visible = visibleCount > 0;
      if (visibleCount > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
  }
}
