import { CityGenerator, DEFAULT_CONFIG, DEFAULT_NPC_CONFIGS } from "@/shared/engine/CityGenerator";
import type { CityObject, ModelConfig, PlacedAttractor } from "@/shared/engine/CityGenerator";

export const INITIAL_DISSATISFACTION = 0.5;
export const LIGHT_SATISFACTION_RATE = 0.08;
export const DARK_DISSATISFACTION_RATE = 0.025;

/** Light gradually calms residents; darkness slowly increases dissatisfaction. */
export function updateDissatisfaction(current: number, lightLevel: number, seconds: number): number {
  const light = Math.max(0, Math.min(1, lightLevel));
  const delta = (1 - light) * DARK_DISSATISFACTION_RATE - light * LIGHT_SATISFACTION_RATE;
  return Math.max(0, Math.min(1, current + delta * Math.max(0, seconds)));
}

export function createSeededRandom(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface CityPlan {
  objects: CityObject[];
  attractors: PlacedAttractor[];
  assetUrls: string[];
}

export function createCityPlan(seed: number, configs: Record<string, ModelConfig>): CityPlan {
  const originalRandom = Math.random;
  Math.random = createSeededRandom(seed);
  try {
    const generator = new CityGenerator(DEFAULT_CONFIG, configs);
    const objects = generator.generate();
    const assetUrls = new Set<string>();
    for (const object of objects) {
      assetUrls.add(`/models/${object.pack}/${object.model}.glb`);
      for (const light of object.lights ?? []) {
        if (light.lampModel && light.lampModel !== "none") {
          assetUrls.add(`/models/lamps/${light.lampModel}.glb`);
        }
      }
    }
    for (const npc of Object.values(DEFAULT_NPC_CONFIGS)) {
      if (npc.model) assetUrls.add(npc.model);
    }
    return { objects, attractors: generator.attractors, assetUrls: [...assetUrls] };
  } finally {
    Math.random = originalRandom;
  }
}
