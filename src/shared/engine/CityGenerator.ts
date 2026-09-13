import { Entity } from "./Entity";
import { Building } from "./Building";
import { StreetLight } from "./StreetLight";

export type Density = "dense" | "mixed" | "sparse";

export interface CityConfig {
  gridSize: number;
  cellSize: number;
  density: Density;
}

export interface NeighborEntry {
  model: string;
  rotation: number;
  allowedSides: string[];
}

export interface ModelConfig {
  name: string; pack: string; modelType: string;
  rotation: number; frontDir: "left"|"right"|"front"|"back"|"none";
  height: "low"|"medium"|"tall"|"skyscraper";
  actualHeight: number; actualWidth: number; actualDepth: number;
  foundation: string; foundationScale: number; foundationOffsetY: number;
  gridW: number; gridD: number;
  neighborModelsLeft: NeighborEntry[]; neighborModelsRight: NeighborEntry[];
  neighborModelsFront: NeighborEntry[]; neighborModelsBack: NeighborEntry[];
  roadConnectLeft: boolean; roadConnectRight: boolean; roadConnectFront: boolean; roadConnectBack: boolean;
  roadType: string; isTerminal: boolean;
  lightRadius: number; lightColor: string; lightOnByDefault: boolean;
  scale: number; offsetY: number; tags: string[]; notes: string;
}

export interface CityObject {
  model: string;
  pack: "roads" | "Models";
  position: [number, number, number];
  rotation: number;
  gridW: number;
  gridD: number;
  scale: number;
  foundation?: { model: string; scale: number; offsetY: number };
}

// Connection directions: [right, down, left, up]
type ConnDir = [boolean, boolean, boolean, boolean];

const ROAD_MODELS: Record<string, { conns: ConnDir[] }> = {
  "road-straight": { conns: [[true, false, true, false], [false, true, false, true]] },
  "road-bend": { conns: [[true, true, false, false], [false, true, true, false], [false, false, true, true], [true, false, false, true]] },
  "road-crossroad": { conns: [[true, true, true, true]] },
  "road-intersection": { conns: [[true, true, true, false], [false, true, true, true], [true, false, true, true], [true, true, false, true]] },
  "road-end": { conns: [[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]] },
  "road-square": { conns: [[true, true, true, true]] },
};

const BUILDING_MODELS = [
  "building-a", "building-b", "building-c", "building-d", "building-e",
  "building-f", "building-g", "building-h", "building-i", "building-j",
  "building-k", "building-l", "building-m", "building-n",
  "building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c",
  "building-skyscraper-d", "building-skyscraper-e",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDensity(d: Density): [number, number] {
  switch (d) {
    case "dense": return [3, 6];
    case "mixed": return [1, 4];
    case "sparse": return [0, 2];
  }
}

function rotateConn(conn: ConnDir, steps: number): ConnDir {
  const s = ((steps % 4) + 4) % 4;
  let c = [...conn] as ConnDir;
  for (let i = 0; i < s; i++) {
    c = [c[3], c[0], c[1], c[2]];
  }
  return c;
}

function connMatches(a: ConnDir, b: ConnDir): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function findRoadModel(need: ConnDir): { model: string; rotation: number } | null {
  for (const [name, def] of Object.entries(ROAD_MODELS)) {
    for (const baseConn of def.conns) {
      for (let rot = 0; rot < 4; rot++) {
        const rotated = rotateConn(baseConn, rot);
        if (connMatches(rotated, need)) {
          return { model: name, rotation: rot * Math.PI / 2 };
        }
      }
    }
  }
  return null;
}

export const DEFAULT_CONFIG: CityConfig = {
  gridSize: 16,
  cellSize: 1,
  density: "mixed",
};

export class CityGenerator {
  config: CityConfig;
  modelConfigs: Record<string, ModelConfig>;
  objects: CityObject[] = [];
  buildings: Building[] = [];
  streetLights: StreetLight[] = [];
  private map: ("road" | "empty")[][] = [];

  constructor(config?: Partial<CityConfig>, modelConfigs?: Record<string, ModelConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.modelConfigs = modelConfigs || {};
  }

  private getModelConfig(modelName: string, pack: string): ModelConfig | undefined {
    const key = `${pack}/${modelName}`;
    return this.modelConfigs[key];
  }

  generate(): CityObject[] {
    const { gridSize, cellSize, density } = this.config;
    const half = (gridSize * cellSize) / 2;
    this.objects = [];
    this.buildings = [];
    this.streetLights = [];
    this.map = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => "empty" as const)
    );

    this.generateStreets(gridSize);
    this.generateRoads(gridSize, cellSize, half);
    this.generateBuildings(gridSize, cellSize, density, half);
    this.generateWalls(gridSize, cellSize, half);

    return this.objects;
  }

  private generateStreets(gridSize: number): void {
    const BLOCK_MIN = 2;
    const BLOCK_MAX = 4;

    const hStreets: number[] = [];
    let z = 0;
    while (z < gridSize) {
      if (z > 0 && z < gridSize - 1) hStreets.push(z);
      z += randInt(BLOCK_MIN, BLOCK_MAX);
    }

    const vStreets: number[] = [];
    let x = 0;
    while (x < gridSize) {
      if (x > 0 && x < gridSize - 1) vStreets.push(x);
      x += randInt(BLOCK_MIN, BLOCK_MAX);
    }

    if (!hStreets.includes(1)) hStreets.unshift(1);
    if (!hStreets.includes(gridSize - 2)) hStreets.push(gridSize - 2);
    if (!vStreets.includes(1)) vStreets.unshift(1);
    if (!vStreets.includes(gridSize - 2)) vStreets.push(gridSize - 2);

    for (const sz of hStreets) {
      for (let sx = 0; sx < gridSize; sx++) this.map[sx][sz] = "road";
    }
    for (const sx of vStreets) {
      for (let sz = 0; sz < gridSize; sz++) this.map[sx][sz] = "road";
    }
  }

  private hasRoad(x: number, z: number, gridSize: number): boolean {
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return false;
    return this.map[x][z] === "road";
  }

  private generateRoads(gridSize: number, cellSize: number, half: number): void {
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (this.map[x][z] !== "road") continue;

        const need: ConnDir = [
          this.hasRoad(x + 1, z, gridSize),
          this.hasRoad(x, z + 1, gridSize),
          this.hasRoad(x - 1, z, gridSize),
          this.hasRoad(x, z - 1, gridSize),
        ];

        const match = findRoadModel(need);
        this.objects.push({
          model: match?.model || "road-crossroad",
          pack: "roads",
          position: [x * cellSize + cellSize / 2 - half, 0, z * cellSize + cellSize / 2 - half],
          rotation: match?.rotation || 0,
          gridW: 1,
          gridD: 1,
          scale: 1,
        });
      }
    }
  }

  private generateBuildings(
    gridSize: number,
    cellSize: number,
    density: Density,
    half: number
  ): void {
    const buildGrid: boolean[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => false)
    );

    // Collect road positions for building orientation
    const roadPositions: { x: number; z: number }[] = [];
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (this.map[x][z] === "road") {
          roadPositions.push({
            x: x * cellSize + cellSize / 2 - half,
            z: z * cellSize + cellSize / 2 - half,
          });
        }
      }
    }

    // Shuffle empty cells
    const emptyCells: [number, number][] = [];
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (this.map[x][z] === "empty") emptyCells.push([x, z]);
      }
    }
    for (let i = emptyCells.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [emptyCells[i], emptyCells[j]] = [emptyCells[j], emptyCells[i]];
    }

    for (const [cx, cz] of emptyCells) {
      if (buildGrid[cx][cz]) continue;

      const model = pick(BUILDING_MODELS);
      const mc = this.getModelConfig(model, "Models");
      const gridW = mc?.gridW || 1;
      const gridD = mc?.gridD || 1;

      // Check if building fits in grid
      if (cx + gridW > gridSize || cz + gridD > gridSize) {
        // Fallback to 1x1
        const posX = cx * cellSize + cellSize / 2 - half;
        const posZ = cz * cellSize + cellSize / 2 - half;
        const building = new Building(model, posX, posZ);
        building.faceNearestRoad(roadPositions);
        this.buildings.push(building);
        this.objects.push({
          model: building.model,
          pack: "Models",
          position: [building.position.x, building.position.y, building.position.z],
          rotation: building.rotation,
          gridW: 1,
          gridD: 1,
          scale: mc?.scale || 1.1,
          foundation: mc?.foundation && mc.foundation !== "none" ? { model: mc.foundation, scale: mc.foundationScale, offsetY: mc.foundationOffsetY } : undefined,
        });
        buildGrid[cx][cz] = true;
        continue;
      }

      // Check all cells are free
      let fits = true;
      for (let dx = 0; dx < gridW && fits; dx++) {
        for (let dz = 0; dz < gridD && fits; dz++) {
          if (buildGrid[cx + dx]?.[cz + dz] || this.map[cx + dx]?.[cz + dz] === "road") fits = false;
        }
      }

      if (!fits) {
        // Fallback to 1x1
        const posX = cx * cellSize + cellSize / 2 - half;
        const posZ = cz * cellSize + cellSize / 2 - half;
        const building = new Building(model, posX, posZ);
        building.faceNearestRoad(roadPositions);
        this.buildings.push(building);
        this.objects.push({
          model: building.model,
          pack: "Models",
          position: [building.position.x, building.position.y, building.position.z],
          rotation: building.rotation,
          gridW: 1,
          gridD: 1,
          scale: mc?.scale || 1.1,
          foundation: mc?.foundation && mc.foundation !== "none" ? { model: mc.foundation, scale: mc.foundationScale, offsetY: mc.foundationOffsetY } : undefined,
        });
        buildGrid[cx][cz] = true;
        continue;
      }

      // Multi-cell building
      const centerX = cx + (gridW - 1) / 2;
      const centerZ = cz + (gridD - 1) / 2;
      const posX = centerX * cellSize + cellSize / 2 - half;
      const posZ = centerZ * cellSize + cellSize / 2 - half;

      const building = new Building(model, posX, posZ, "commercial", gridW, gridD);
      building.faceNearestRoad(roadPositions);
      this.buildings.push(building);

      this.objects.push({
        model: building.model,
        pack: "Models",
        position: [building.position.x, building.position.y, building.position.z],
        rotation: building.rotation,
        gridW,
        gridD,
        scale: mc?.scale || 1.1,
        foundation: mc?.foundation && mc.foundation !== "none" ? { model: mc.foundation, scale: mc.foundationScale, offsetY: mc.foundationOffsetY } : undefined,
      });

      for (let dx = 0; dx < gridW; dx++) {
        for (let dz = 0; dz < gridD; dz++) {
          buildGrid[cx + dx][cz + dz] = true;
        }
      }
    }

    // Foundation tiles for remaining empty cells
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        if (this.map[x][z] === "empty" && !buildGrid[x][z]) {
          this.objects.push({
            model: "tile-low",
            pack: "roads",
            position: [x * cellSize + cellSize / 2 - half, 0.01, z * cellSize + cellSize / 2 - half],
            rotation: 0,
            gridW: 1,
            gridD: 1,
            scale: 1,
          });
        }
      }
    }
  }

  private generateWalls(gridSize: number, cellSize: number, half: number): void {
    const wallHeight = 2;
    const wallOffset = 0.5;

    for (let x = 0; x < gridSize; x++) {
      const posX = x * cellSize + cellSize / 2 - half;
      this.objects.push({
        model: "tile-high", pack: "roads",
        position: [posX, wallHeight / 2, -half - wallOffset], rotation: 0, gridW: 1, gridD: 1, scale: 1,
      });
      this.objects.push({
        model: "tile-high", pack: "roads",
        position: [posX, wallHeight / 2, half + wallOffset], rotation: 0, gridW: 1, gridD: 1, scale: 1,
      });
    }

    for (let z = 0; z < gridSize; z++) {
      const posZ = z * cellSize + cellSize / 2 - half;
      this.objects.push({
        model: "tile-high", pack: "roads",
        position: [-half - wallOffset, wallHeight / 2, posZ], rotation: Math.PI / 2, gridW: 1, gridD: 1, scale: 1,
      });
      this.objects.push({
        model: "tile-high", pack: "roads",
        position: [half + wallOffset, wallHeight / 2, posZ], rotation: Math.PI / 2, gridW: 1, gridD: 1, scale: 1,
      });
    }
  }
}
