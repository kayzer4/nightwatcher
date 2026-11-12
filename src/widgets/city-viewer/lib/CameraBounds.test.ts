import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { OrbitControls } from "three-stdlib";
import { CameraBounds, createCityCameraBounds } from "./CameraBounds";

test("camera reaches road level but stays above the surface and below the height cap", () => {
  const bounds = new CameraBounds(0.18, 15, -0.1, 4);
  const camera = new THREE.Vector3(4, 0.5, 4);
  const target = new THREE.Vector3(0, -10, 0);
  const controls = { object: { position: camera }, target } as OrbitControls;
  const offset = camera.y - target.y;
  assert.equal(bounds.constrain(controls), true);
  assert.ok(camera.y >= 0.18 && camera.y <= 15);
  assert.ok(target.y >= -0.1 && target.y <= 4);
  assert.equal(camera.y - target.y, offset);
  camera.y = 30;
  target.y = 19.5;
  assert.equal(bounds.constrain(controls), true);
  assert.ok(camera.y <= 15);
  assert.ok(target.y <= 4);
});

test("street-height camera remains usable and cannot pass through the road", () => {
  const bounds = new CameraBounds(0.18, 15, -0.1, 4);
  const camera = new THREE.Vector3(2, 0.22, 4);
  const target = new THREE.Vector3(0, 0, 0);
  const controls = { object: { position: camera }, target } as OrbitControls;
  assert.equal(bounds.constrain(controls), false);
  camera.y = 0.08;
  target.y = -0.14;
  assert.equal(bounds.constrain(controls), true);
  assert.equal(camera.y, 0.18);
  assert.ok(target.y >= -0.1);
  assert.ok(Math.abs(camera.y - target.y - 0.22) < 1e-9);
});

test("game camera can descend to road height while still looking downward", () => {
  const bounds = createCityCameraBounds(5, 5);
  const camera = new THREE.Vector3(2, 0.2, 4);
  const target = new THREE.Vector3(0, -3.3, 0);
  const controls = { object: { position: camera }, target } as OrbitControls;
  assert.equal(bounds.constrain(controls), false);
  camera.y = 0.05;
  target.y = -3.45;
  assert.equal(bounds.constrain(controls), true);
  assert.ok(Math.abs(camera.y - 0.18) < 1e-9);
  assert.ok(Math.abs(camera.y - target.y - 3.5) < 1e-9);
});

test("right-button panning stops at the playable city while preserving the view angle", () => {
  const bounds = new CameraBounds(0.18, 15, -0.1, 4, 5, 5);
  const camera = new THREE.Vector3(27, 9, -11);
  const target = new THREE.Vector3(20, 0, -18);
  const controls = { object: { position: camera }, target } as OrbitControls;
  const offset = camera.clone().sub(target);
  assert.equal(bounds.constrain(controls), true);
  assert.equal(target.x, 5);
  assert.equal(target.z, -5);
  assert.deepEqual(camera.clone().sub(target), offset);
  assert.equal(bounds.constrain(controls), false);
});
