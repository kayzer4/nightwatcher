"use client";

import { useMemo } from "react";
import { CityGenerator, CityObject, ModelConfig } from "@/shared/engine/CityGenerator";

function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface GeneratedCity {
  objects: CityObject[];
}

export function useCityGenerator(seed: number, modelConfigs?: Record<string, ModelConfig>): GeneratedCity {
  return useMemo(() => {
    const rng = createSeededRandom(seed);

    const origRandom = Math.random;
    Math.random = rng;

    const generator = new CityGenerator({}, modelConfigs);
    const objects = generator.generate();

    Math.random = origRandom;

    return { objects };
  }, [seed, modelConfigs]);
}
