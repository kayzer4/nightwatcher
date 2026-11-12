import assert from "node:assert/strict";
import test from "node:test";
import configs from "@/shared/config/model-configs.json";
import type { ModelConfig } from "@/shared/engine/CityGenerator";
import { BACKDROP_GAP_CELLS, BACKDROP_GRID_SIZE, BACKDROP_NEAR_FRACTION, BackdropCityPlan, backdropLOD } from "./BackdropCityPlan";

test("outer six layers use the configured textured road and building models", () => {
  const originalRandom = Math.random;
  const plan = new BackdropCityPlan(42, configs.configs as unknown as Record<string, ModelConfig>).generate();
  assert.equal(Math.random, originalRandom);
  assert.equal(plan.layers.length, 6);
  assert.ok(plan.layers.every((count) => count > 0));
  const ringSize = 6 + BACKDROP_GAP_CELLS * 2;
  const perimeterCount = ringSize * ringSize - 6 * 6;
  assert.ok(plan.layers.reduce((total, count) => total + count, 0) < 2000, "background should stay below the render budget");
  assert.ok(plan.groups.some((group) => group.url.startsWith("/models/roads/") && group.objects.length > 0));
  assert.ok(plan.groups.some((group) => group.url.startsWith("/models/Models/") && group.objects.length > 0));
  assert.deepEqual(plan.assetUrls, plan.groups.map((group) => group.url));
  const nearLimit = 6 + (BACKDROP_GRID_SIZE - 6) * BACKDROP_NEAR_FRACTION;
  const perimeter: Array<{ x: number; z: number }> = [];
  for (const group of plan.groups) {
    for (const object of group.objects) {
      const radius = Math.max(Math.abs(object.position[0]), Math.abs(object.position[2]));
      if (radius > 6 && radius < 9) {
        assert.notEqual(object.pack, "roads");
        assert.ok(radius - object.scale / 2 > 6, "perimeter building must start beyond the playable border");
        perimeter.push({ x: object.position[0], z: object.position[2] });
      } else {
        assert.ok(radius >= 6 + BACKDROP_GAP_CELLS * 2 + 1);
      }
      if (object.pack === "roads" || radius > nearLimit) continue;
      const config = (configs.configs as unknown as Record<string, { actualHeight: number }>)[`${object.pack}/${object.model}`];
      assert.ok(config.actualHeight <= (radius < 9 ? 1.3 : 1.5), `${object.pack}/${object.model} is too tall near the playable city`);
      assert.ok(!object.model.includes("skyscraper"));
    }
  }
  assert.equal(perimeter.length, perimeterCount);
  assert.equal(new Set(perimeter.map(({ x, z }) => `${x},${z}`)).size, perimeterCount);
});

test("background roads do not point into the perimeter buildings", () => {
  for (const seed of [42, 43, 123]) {
    const plan = new BackdropCityPlan(seed, configs.configs as unknown as Record<string, ModelConfig>).generate();
    for (const object of plan.groups.flatMap((group) => group.objects)) {
      if (object.pack !== "roads") continue;
      const [x, , z] = object.position;
      const steps = ((Math.round(-object.rotation / (Math.PI / 2)) % 4) + 4) % 4;
      let connections = [object.connRight, object.connBack, object.connLeft, object.connFront];
      for (let i = 0; i < steps; i++) connections = [connections[3], connections[0], connections[1], connections[2]];
      if (x === 9 && Math.abs(z) <= 7) assert.equal(connections[2], false, `${x},${z} points left into buildings`);
      if (x === -9 && Math.abs(z) <= 7) assert.equal(connections[0], false, `${x},${z} points right into buildings`);
      if (z === 9 && Math.abs(x) <= 7) assert.equal(connections[3], false, `${x},${z} points forward into buildings`);
      if (z === -9 && Math.abs(x) <= 7) assert.equal(connections[1], false, `${x},${z} points back into buildings`);
    }
  }
});

test("background model detail decreases with distance", () => {
  assert.equal(backdropLOD(10), "detailed");
  assert.equal(backdropLOD(20), "reduced");
  assert.equal(backdropLOD(25), "reduced");
  assert.equal(backdropLOD(34), "distant");
  assert.equal(backdropLOD(45), "distant");
  assert.equal(backdropLOD(52), "hidden");
  assert.equal(backdropLOD(65), "hidden");
});
