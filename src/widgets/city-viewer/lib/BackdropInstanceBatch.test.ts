import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BackdropInstanceBatch } from "./BackdropInstanceBatch";

test("instanced LODs draw only the objects assigned to each distance", () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const meshes: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh] = [
    new THREE.InstancedMesh(geometry, material, 4),
    new THREE.InstancedMesh(geometry, material, 4),
    new THREE.InstancedMesh(geometry, material, 4),
  ];
  const transforms = [0, 1, 2, 3].map((x) => new THREE.Matrix4().makeTranslation(x, 0, 0));
  const batch = new BackdropInstanceBatch(meshes, transforms);
  batch.update(["detailed", "distant", "hidden", "reduced"]);
  assert.deepEqual(meshes.map((mesh) => mesh.count), [1, 1, 1]);
  const matrix = new THREE.Matrix4();
  meshes[1].getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[12] - 3) < 1e-9);
  batch.update(["hidden", "hidden", "hidden", "hidden"]);
  assert.deepEqual(meshes.map((mesh) => mesh.visible), [false, false, false]);
  batch.dispose();
  geometry.dispose();
  material.dispose();
});
