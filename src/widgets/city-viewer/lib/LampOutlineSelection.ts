import type * as THREE from "three";

/** The postprocessing pass outlines at most one hovered lamp. */
export class LampOutlineSelection {
  current: THREE.Object3D | null = null;

  select(object: THREE.Object3D): void {
    this.current = object;
  }

  clear(object: THREE.Object3D): void {
    if (this.current === object) this.current = null;
  }
}

export const lampOutlineSelection = new LampOutlineSelection();

/** Invisible interaction meshes must not become opaque depth occluders in OutlinePass. */
export function withOutlineHelpersHidden<T>(selected: THREE.Object3D, render: () => T): T {
  const helpers: Array<{ object: THREE.Object3D; visible: boolean }> = [];
  selected.parent?.traverse((object) => {
    if (!object.userData.outlineIgnore) return;
    helpers.push({ object, visible: object.visible });
    object.visible = false;
  });
  try {
    return render();
  } finally {
    for (const { object, visible } of helpers) object.visible = visible;
  }
}
