import * as THREE from "three";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";

type Levels = [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
const geometryCache = new Map<string, Levels[]>();
const pending = new Map<string, Promise<void>>();

/** Build UV-preserving geometry LODs once per GLB, before the player starts. */
export function prepareBackdropLOD(url: string, scene: THREE.Object3D): Promise<void> {
  if (geometryCache.has(url)) return Promise.resolve();
  const current = pending.get(url);
  if (current) return current;
  const work = (async () => {
    const modifier = new SimplifyModifier();
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry?.attributes.position) meshes.push(object);
    });
    const levels = await Promise.all(meshes.map(async (mesh): Promise<Levels> => {
      const source = mesh.geometry;
      const count = source.attributes.position.count;
      if (count < 80) return [source, source, source];
      try {
        const medium = await modifier.modify(source, Math.floor(count * 0.45));
        const distant = await modifier.modify(source, Math.floor(count * 0.75));
        return [source, medium, distant];
      } catch (error) {
        console.warn("[backdrop] LOD simplification failed:", url, error);
        return [source, source, source];
      }
    }));
    geometryCache.set(url, levels);
  })().finally(() => pending.delete(url));
  pending.set(url, work);
  return work;
}

export function backdropGeometry(url: string, meshIndex: number, level: 0 | 1 | 2, fallback: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometryCache.get(url)?.[meshIndex]?.[level] ?? fallback;
}
