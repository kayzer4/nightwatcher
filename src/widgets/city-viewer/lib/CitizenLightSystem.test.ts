import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { removeBuildingLightSource, setBuildingLightSource } from "@/shared/game-core/building-lights";
import type { WorldLamp } from "./world-lamp";
import { CitizenLightSystem } from "./CitizenLightSystem";

test("building blocks a street lamp before its light reaches a resident", () => {
  const lighting = new CitizenLightSystem();
  const lamp: WorldLamp = {
    id: "lamp", lampModel: "light-curved", cellKey: "0_0",
    pos: new THREE.Vector3(0, 2, 0), dir: new THREE.Vector3(0, -1, 0),
    intensity: 1, distance: 5, color: "white", angle: Math.PI * 83 / 180, penumbra: 0.25,
  };
  const resident = new THREE.Vector3(1, 0, 0);
  const sample = (boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[]) =>
    lighting.sample(resident, [lamp], boxes, null, 1, false, [], []);
  assert.ok(sample([]) > 0);
  assert.equal(sample([{ minX: 0.4, maxX: 0.6, minZ: -0.1, maxZ: 0.1 }]), 0);
});

test("a nearby active window contributes light to a resident", () => {
  const lighting = new CitizenLightSystem();
  setBuildingLightSource("window-test", {
    x: 10, y: 1, z: 0, dirX: 1, dirY: 0, dirZ: 0, intensity: 1, distance: 1.8,
  });
  try {
    assert.ok(lighting.sample(new THREE.Vector3(11, 1, 0), [], [], null, 1, false, [], []) > 0);
    assert.equal(lighting.sample(new THREE.Vector3(14, 1, 0), [], [], null, 1, false, [], []), 0);
  } finally {
    removeBuildingLightSource("window-test");
  }
});
