import { createSeededRandom } from "@/shared/game-core";
import { CityGenerator, DEFAULT_CONFIG, type CityObject, type ModelConfig } from "@/shared/engine/CityGenerator";

export const BACKDROP_GRID_SIZE = 40;
export const BACKDROP_LAYER_EDGES = [10, 16, 22, 28, 34, 40] as const;
export const BACKDROP_GAP_CELLS = 1;
export const BACKDROP_NEAR_FRACTION = 0.2;

export interface BackdropModelGroup {
  url: string;
  objects: CityObject[];
}

export interface BackdropPlan {
  groups: BackdropModelGroup[];
  assetUrls: string[];
  layers: number[];
}

export type BackdropLOD = "detailed" | "reduced" | "distant" | "hidden";

export function backdropLOD(distance: number): BackdropLOD {
  if (distance < 20) return "detailed";
  if (distance < 34) return "reduced";
  if (distance < 52) return "distant";
  return "hidden";
}

export function backdropLayer(position: readonly [number, number, number]): number {
  const radius = Math.max(Math.abs(position[0]), Math.abs(position[2]));
  const index = BACKDROP_LAYER_EDGES.findIndex((edge) => radius < edge);
  return index < 0 ? BACKDROP_LAYER_EDGES.length - 1 : index;
}

/** Generates textured outer districts by the same road and building rules as the playable city. */
export class BackdropCityPlan {
  constructor(private readonly seed: number, private readonly configs: Record<string, ModelConfig>) {}

  generate(): BackdropPlan {
    const originalRandom = Math.random;
    Math.random = createSeededRandom(this.seed ^ 0x5f3759df);
    let objects: CityObject[];
    try {
      objects = new CityGenerator({
        gridSizeX: BACKDROP_GRID_SIZE,
        gridSizeZ: BACKDROP_GRID_SIZE,
        cellSize: DEFAULT_CONFIG.cellSize,
        reservedCenterCells: DEFAULT_CONFIG.gridSizeX + BACKDROP_GAP_CELLS * 2,
      }, this.configs).generate();
    } finally {
      Math.random = originalRandom;
    }

    const halfPlayableX = DEFAULT_CONFIG.gridSizeX * DEFAULT_CONFIG.cellSize / 2;
    const halfPlayableZ = DEFAULT_CONFIG.gridSizeZ * DEFAULT_CONFIG.cellSize / 2;
    const gapX = halfPlayableX + BACKDROP_GAP_CELLS * DEFAULT_CONFIG.cellSize;
    const gapZ = halfPlayableZ + BACKDROP_GAP_CELLS * DEFAULT_CONFIG.cellSize;
    const halfBackdrop = BACKDROP_GRID_SIZE * DEFAULT_CONFIG.cellSize / 2;
    const nearLimit = Math.max(halfPlayableX, halfPlayableZ) + (halfBackdrop - Math.max(halfPlayableX, halfPlayableZ)) * BACKDROP_NEAR_FRACTION;
    const lowBuildings = Object.entries(this.configs)
      .filter(([key, config]) => (config.pack === "Models" || config.pack === "buildings")
        && config.modelType === "building"
        && !key.includes("skyscraper")
        && config.actualHeight <= 1.5)
      .map(([key, config]) => ({ pack: config.pack, model: key.slice(key.indexOf("/") + 1), lights: config.lights }));
    const perimeterBuildings = Object.entries(this.configs)
      .filter(([, config]) => (config.pack === "Models" || config.pack === "buildings")
        && config.modelType === "building"
        && !config.tags.includes("detail")
        && config.actualHeight <= 1.3
        && config.actualWidth <= 1.3
        && config.actualDepth <= 1.3)
      .map(([key, config]) => ({ pack: config.pack, model: key.slice(key.indexOf("/") + 1) }));
    const groups = new Map<string, CityObject[]>();
    const layers = Array(BACKDROP_LAYER_EDGES.length).fill(0) as number[];
    for (const object of objects) {
      const x = Math.abs(object.position[0]);
      const z = Math.abs(object.position[2]);
      // Reserve the first outer row for a building perimeter, away from both road networks.
      if (x < gapX && z < gapZ) continue;
      let backdropObject = object;
      if (object.pack !== "roads" && Math.max(x, z) <= nearLimit && lowBuildings.length > 0) {
        const hash = (Math.imul(Math.round(object.position[0] * 10), 73856093)
          ^ Math.imul(Math.round(object.position[2] * 10), 19349663)
          ^ this.seed) >>> 0;
        const model = lowBuildings[hash % lowBuildings.length];
        backdropObject = { ...object, ...model };
      }
      const url = `/models/${backdropObject.pack}/${backdropObject.model}.glb`;
      const group = groups.get(url) ?? [];
      group.push(backdropObject);
      groups.set(url, group);
      layers[backdropLayer(backdropObject.position)]++;
    }
    if (perimeterBuildings.length > 0) {
      const ringSizeX = DEFAULT_CONFIG.gridSizeX + BACKDROP_GAP_CELLS * 2;
      const ringSizeZ = DEFAULT_CONFIG.gridSizeZ + BACKDROP_GAP_CELLS * 2;
      for (let gx = 0; gx < ringSizeX; gx++) {
        for (let gz = 0; gz < ringSizeZ; gz++) {
          if (gx > 0 && gx < ringSizeX - 1 && gz > 0 && gz < ringSizeZ - 1) continue;
          const hash = (Math.imul(gx + 1, 73856093) ^ Math.imul(gz + 1, 19349663) ^ this.seed) >>> 0;
          const model = perimeterBuildings[hash % perimeterBuildings.length];
          const position: [number, number, number] = [
            (gx + 0.5) * DEFAULT_CONFIG.cellSize - gapX + (gx === 0 ? -0.1 : gx === ringSizeX - 1 ? 0.1 : 0),
            0,
            (gz + 0.5) * DEFAULT_CONFIG.cellSize - gapZ + (gz === 0 ? -0.1 : gz === ringSizeZ - 1 ? 0.1 : 0),
          ];
          const frontDir = gz === 0 ? "back" : gz === ringSizeZ - 1 ? "front" : gx === 0 ? "right" : "left";
          const building: CityObject = {
            ...model, position, frontDir, rotation: 0, gridW: 1, gridD: 1,
            scale: DEFAULT_CONFIG.cellSize * 0.875,
            connRight: false, connBack: false, connLeft: false, connFront: false,
          };
          const url = `/models/${building.pack}/${building.model}.glb`;
          const group = groups.get(url) ?? [];
          group.push(building);
          groups.set(url, group);
          layers[backdropLayer(position)]++;
        }
      }
    }
    return {
      groups: [...groups].map(([url, groupObjects]) => ({ url, objects: groupObjects })),
      assetUrls: [...groups.keys()],
      layers,
    };
  }
}
