"use client";

import { useMemo } from "react";
import { CityGenerator, CityObject, ModelConfig, CityConfig } from "@/shared/engine/CityGenerator";

export function createSeededRandom(seed: number) {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function useCityGenerator(seed: number, config?: Partial<CityConfig>, modelConfigs?: Record<string, ModelConfig>): CityObject[] {
  return useMemo(() => {
    const origRandom = Math.random;
    Math.random = createSeededRandom(seed);
    const generator = new CityGenerator(config, modelConfigs);
    const objects = generator.generate();
    Math.random = origRandom;
    return objects;
  }, [seed, config, modelConfigs]);
}
