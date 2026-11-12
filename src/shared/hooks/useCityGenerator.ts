"use client";

import { useMemo } from "react";
import { CityGenerator, CityObject, ModelConfig, CityConfig } from "@/shared/engine/CityGenerator";
import { createSeededRandom } from "@/shared/game-core";

export { createSeededRandom } from "@/shared/game-core";

export function useCityGenerator(seed: number, config?: Partial<CityConfig>, modelConfigs?: Record<string, ModelConfig>): CityObject[] {
  return useMemo(() => {
    const origRandom = Math.random;
    Math.random = createSeededRandom(seed);
    try {
      const generator = new CityGenerator(config, modelConfigs);
      return generator.generate();
    } finally {
      Math.random = origRandom;
    }
  }, [seed, config, modelConfigs]);
}
