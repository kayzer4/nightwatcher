import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { backdropGeometry, prepareBackdropLOD } from "./BackdropLODGeometry";

test("simplified GLB geometry keeps UVs and reduces triangle count", async () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  await prepareBackdropLOD("test://textured-building", scene);
  const medium = backdropGeometry("test://textured-building", 0, 1, geometry);
  const distant = backdropGeometry("test://textured-building", 0, 2, geometry);
  assert.ok(medium.getAttribute("uv"));
  assert.ok(distant.getAttribute("uv"));
  assert.ok((medium.index?.count ?? 0) < (geometry.index?.count ?? 0));
  assert.ok((distant.index?.count ?? 0) < (medium.index?.count ?? 0));
});
