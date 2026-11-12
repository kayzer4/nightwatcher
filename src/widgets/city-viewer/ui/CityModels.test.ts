import assert from "node:assert/strict";
import test from "node:test";
import type { CityObject } from "@/shared/engine/CityGenerator";
import { extractWorldLamps } from "./CityModels";

test("the light source rises with the lamp base above the road surface", () => {
  const road = {
    model: "road-straight",
    pack: "roads",
    position: [0, -0.05, 0],
    rotation: 0,
    lights: [{ id: "test", lampModel: "light-curved", position: [0, 0, 0.45], color: "#ffffff", intensity: 2 }],
  } as CityObject;
  const [lamp] = extractWorldLamps([road], 2);
  assert.ok(lamp.pos.y > 1.21, `lamp source is still buried at ${lamp.pos.y}`);
});
