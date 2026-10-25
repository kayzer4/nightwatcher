// World-space collider registry for city geometry (buildings, roads).
// Boxes describe roads/detail props cheaply; meshes are exact triangle soup for
// buildings so ragdolls collide with the actual facade, not a bounding square.
// Kept Rapier-free so road/building components can register colliders without
// pulling the physics WASM into their chunk.

export interface CityBoxCollider {
  key: string;
  kind: "box";
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface CityMeshCollider {
  key: string;
  kind: "mesh";
  /** Flat world-space triangle soup (9 floats per triangle, indices implicit). */
  positions: number[];
}

export type CityCollider = CityBoxCollider | CityMeshCollider;

const colliders = new Map<string, CityCollider>();
let version = 0;

function sameBox(a: CityBoxCollider, b: CityBoxCollider): boolean {
  return (
    a.min.x === b.min.x && a.min.y === b.min.y && a.min.z === b.min.z &&
    a.max.x === b.max.x && a.max.y === b.max.y && a.max.z === b.max.z
  );
}

/** Upserts a static world-space box; no-ops when the geometry is unchanged. */
export function setCityCollider(box: Omit<CityBoxCollider, "kind">): void {
  const normal: CityBoxCollider = { ...box, kind: "box" };
  const prev = colliders.get(box.key);
  if (prev && prev.kind === "box" && sameBox(prev, normal)) return;
  colliders.set(box.key, normal);
  version++;
}

export function setCityMeshCollider(mesh: Omit<CityMeshCollider, "kind">): void {
  const normal: CityMeshCollider = { ...mesh, kind: "mesh" };
  const prev = colliders.get(mesh.key);
  if (prev && prev.kind === "mesh" && prev.positions === normal.positions) return;
  colliders.set(mesh.key, normal);
  version++;
}

export function removeCityCollider(key: string): void {
  if (colliders.delete(key)) version++;
}

/** Module-level version counter; bumping it tells the physics to re-sync. */
export function getCityColliderVersion(): number {
  return version;
}

export function getCityColliderSnapshot(): CityCollider[] {
  return [...colliders.values()];
}