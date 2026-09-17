export interface CityConfig {
  gridSizeX: number;
  gridSizeZ: number;
  cellSize: number;
}

export interface ModelConfig {
  name: string;
  pack: string;
  modelType: string;
  rotation: number;
  scale: number;
  offsetY: number;
  gridW: number;
  gridD: number;
  roadConnectLeft: boolean;
  roadConnectRight: boolean;
  roadConnectFront: boolean;
  roadConnectBack: boolean;
  roadType: "straight" | "bend" | "intersection" | "crossroad" | "end" | "none";
  isTerminal: boolean;
  tags: string[];
  frontDir: "left" | "right" | "front" | "back" | "none";
  height: "low" | "medium" | "high";
  actualHeight: number;
  actualWidth: number;
  actualDepth: number;
  foundation: "none" | "low" | "high";
  foundationScale: number;
  foundationOffsetY: number;
  lightRadius: number;
  lightColor: string;
  lightOnByDefault: boolean;
}

export interface CityObject {
  model: string;
  pack: string;
  position: [number, number, number];
  rotation: number;
  rotationX?: number;
  gridW: number;
  gridD: number;
  scale: number;
  connRight: boolean;
  connBack: boolean;
  connLeft: boolean;
  connFront: boolean;
  frontDir?: "left" | "right" | "front" | "back" | "none";
}

type ConnDir = [boolean, boolean, boolean, boolean];
type CellType = "road" | "building" | "empty";

interface Block {
  x: number;
  z: number;
  w: number;
  h: number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

function getModelConns(cfg: ModelConfig): ConnDir {
  return [cfg.roadConnectRight, cfg.roadConnectBack, cfg.roadConnectLeft, cfg.roadConnectFront];
}

function findRoadModel(need: ConnDir, modelConfigs: Record<string, ModelConfig>): { model: string; rotation: number; scale: number; rotSteps: number } | null {
  const candidates: { model: string; rotation: number; scale: number; rotSteps: number }[] = [];

  for (const [, cfg] of Object.entries(modelConfigs)) {
    if (cfg.modelType !== "road" || cfg.roadType === "none") continue;
    const baseConns = getModelConns(cfg);

    for (let rot = 0; rot < 4; rot++) {
      const rotated = rotateConn(baseConns, rot);
      if (connMatches(rotated, need)) {
        candidates.push({
          model: cfg.name,
          rotation: -rot * Math.PI / 2 + (cfg.rotation || 0),
          scale: cfg.scale || 1,
          rotSteps: rot,
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getBuildingCandidates(modelConfigs: Record<string, ModelConfig>): { model: string; pack: string; scale: number; gridW: number; gridD: number }[] {
  const candidates: { model: string; pack: string; scale: number; gridW: number; gridD: number }[] = [];

  for (const [, cfg] of Object.entries(modelConfigs)) {
    if (cfg.modelType === "road" || cfg.modelType === "tile") continue;
    if (cfg.tags.includes("detail")) continue;
    candidates.push({
      model: cfg.name,
      pack: cfg.pack,
      scale: cfg.scale || 1,
      gridW: Math.ceil(cfg.actualWidth || 1),
      gridD: Math.ceil(cfg.actualDepth || 1),
    });
  }

  candidates.sort((a, b) => (b.gridW * b.gridD) - (a.gridW * a.gridD));
  return candidates;
}

function hasRoad(x: number, z: number, map: CellType[][], sizeX: number, sizeZ: number): boolean {
  if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false;
  return map[x][z] === "road";
}

export const DEFAULT_CONFIG: CityConfig = {
  gridSizeX: 16,
  gridSizeZ: 16,
  cellSize: 1,
};

export class CityGenerator {
  config: CityConfig;
  modelConfigs: Record<string, ModelConfig>;
  objects: CityObject[] = [];
  private map: CellType[][] = [];

  constructor(config?: Partial<CityConfig>, modelConfigs?: Record<string, ModelConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.modelConfigs = modelConfigs || {};
  }

  generate(): CityObject[] {
    const { gridSizeX, gridSizeZ, cellSize } = this.config;
    const halfX = (gridSizeX * cellSize) / 2;
    const halfZ = (gridSizeZ * cellSize) / 2;

    for (let attempt = 0; attempt < 20; attempt++) {
      this.objects = [];
      this.map = Array.from({ length: gridSizeX }, () =>
        Array.from({ length: gridSizeZ }, () => "empty" as CellType)
      );

      const blocks = this.generateBlocks(gridSizeX, gridSizeZ);
      this.markRoadsAndBuildings(blocks, gridSizeX, gridSizeZ);

      if (this.canPlaceAllRoads(gridSizeX, gridSizeZ)) {
        this.placeObjects(gridSizeX, gridSizeZ, cellSize, halfX, halfZ, blocks);
        return this.objects;
      }
    }

    this.objects = [];
    this.map = Array.from({ length: gridSizeX }, () =>
      Array.from({ length: gridSizeZ }, () => "empty" as CellType)
    );
    const blocks = this.generateBlocks(gridSizeX, gridSizeZ);
    this.markRoadsAndBuildings(blocks, gridSizeX, gridSizeZ);
    this.placeObjects(gridSizeX, gridSizeZ, cellSize, halfX, halfZ, blocks);
    return this.objects;
  }

  private canPlaceAllRoads(sizeX: number, sizeZ: number): boolean {
    for (let x = 0; x < sizeX; x++) {
      for (let z = 0; z < sizeZ; z++) {
        if (this.map[x][z] !== "road") continue;
        const need: ConnDir = [
          hasRoad(x + 1, z, this.map, sizeX, sizeZ),
          hasRoad(x, z + 1, this.map, sizeX, sizeZ),
          hasRoad(x - 1, z, this.map, sizeX, sizeZ),
          hasRoad(x, z - 1, this.map, sizeX, sizeZ),
        ];
        if (!findRoadModel(need, this.modelConfigs)) return false;
      }
    }
    return true;
  }

  private generateBlocks(sizeX: number, sizeZ: number): Block[] {
    const blocks: Block[] = [];
    const minSize = 2;
    const maxSize = 4;
    const roadWidth = 1;

    let z = 0;
    while (z < sizeZ) {
      let x = 0;
      const blockH = Math.min(randInt(minSize, maxSize), sizeZ - z);

      while (x < sizeX) {
        const blockW = Math.min(randInt(minSize, maxSize), sizeX - x);
        blocks.push({ x, z, w: blockW, h: blockH });
        x += blockW + roadWidth;
      }

      z += blockH + roadWidth;
    }

    return blocks;
  }

  private markRoadsAndBuildings(blocks: Block[], sizeX: number, sizeZ: number): void {
    for (const block of blocks) {
      for (let bx = 0; bx < block.w; bx++) {
        for (let bz = 0; bz < block.h; bz++) {
          const gx = block.x + bx;
          const gz = block.z + bz;
          if (gx < sizeX && gz < sizeZ) {
            this.map[gx][gz] = "building";
          }
        }
      }

      for (let bx = -1; bx <= block.w; bx++) {
        for (let bz = -1; bz <= block.h; bz++) {
          const gx = block.x + bx;
          const gz = block.z + bz;
          if (gx < 0 || gx >= sizeX || gz < 0 || gz >= sizeZ) continue;
          if (this.map[gx][gz] === "building") continue;
          this.map[gx][gz] = "road";
        }
      }
    }
  }

  private placeObjects(sizeX: number, sizeZ: number, cellSize: number, halfX: number, halfZ: number, blocks: Block[]): void {
    for (let x = 0; x < sizeX; x++) {
      for (let z = 0; z < sizeZ; z++) {
        if (this.map[x][z] === "road") {
          this.placeRoad(x, z, sizeX, sizeZ, cellSize, halfX, halfZ);
        }
      }
    }

    for (const block of blocks) {
      this.placeBuildingsInBlock(block, cellSize, halfX, halfZ);
    }
  }

  private placeBuildingsInBlock(block: Block, cellSize: number, halfX: number, halfZ: number): void {
    const occupied: boolean[][] = Array.from({ length: block.w }, () =>
      Array.from({ length: block.h }, () => false)
    );

    const candidates = getBuildingCandidates(this.modelConfigs);
    if (candidates.length === 0) return;

    for (let bz = 0; bz < block.h; bz++) {
      for (let bx = 0; bx < block.w; bx++) {
        if (occupied[bx][bz]) continue;
        if (this.map[block.x + bx][block.z + bz] !== "building") continue;

        let placed = false;
        for (const cand of candidates) {
          const gw = cand.gridW;
          const gd = cand.gridD;

          if (bx + gw > block.w || bz + gd > block.h) continue;

          let fits = true;
          for (let dx = 0; dx < gw && fits; dx++) {
            for (let dz = 0; dz < gd && fits; dz++) {
              if (occupied[bx + dx][bz + dz]) fits = false;
              if (this.map[block.x + bx + dx][block.z + bz + dz] !== "building") fits = false;
            }
          }
          if (!fits) continue;

          for (let dx = 0; dx < gw; dx++) {
            for (let dz = 0; dz < gd; dz++) {
              occupied[bx + dx][bz + dz] = true;
            }
          }

          const centerX = block.x + bx + (gw - 1) / 2;
          const centerZ = block.z + bz + (gd - 1) / 2;
          const frontDir = this.findNearestRoadDir(block.x + bx, block.z + bz, gw, gd);

          this.objects.push({
            model: cand.model,
            pack: cand.pack,
            position: [
              (centerX + 0.5) * cellSize - halfX,
              0,
              (centerZ + 0.5) * cellSize - halfZ,
            ],
            rotation: 0,
            gridW: gw,
            gridD: gd,
            scale: cand.scale,
            connRight: false,
            connBack: false,
            connLeft: false,
            connFront: false,
            frontDir,
          });

          placed = true;
          break;
        }

        if (!placed) {
          occupied[bx][bz] = true;
        }
      }
    }
  }

  private findNearestRoadDir(bx: number, bz: number, gw: number, gd: number): "left" | "right" | "front" | "back" | "none" {
    const { gridSizeX, gridSizeZ } = this.config;
    let bestDist = Infinity;
    let bestDir: "left" | "right" | "front" | "back" | "none" = "none";

    const check = (x: number, z: number, dir: "left" | "right" | "front" | "back") => {
      if (x < 0 || x >= gridSizeX || z < 0 || z >= gridSizeZ) return;
      if (this.map[x][z] !== "road") return;
      const cx = bx + gw / 2;
      const cz = bz + gd / 2;
      const dist = (x - cx) ** 2 + (z - cz) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    };

    for (let dx = 0; dx < gw; dx++) {
      check(bx + dx, bz - 1, "front");
      check(bx + dx, bz + gd, "back");
    }
    for (let dz = 0; dz < gd; dz++) {
      check(bx - 1, bz + dz, "left");
      check(bx + gw, bz + dz, "right");
    }

    return bestDir;
  }

  private placeRoad(x: number, z: number, sizeX: number, sizeZ: number, cellSize: number, halfX: number, halfZ: number): void {
    const need: ConnDir = [
      hasRoad(x + 1, z, this.map, sizeX, sizeZ),
      hasRoad(x, z + 1, this.map, sizeX, sizeZ),
      hasRoad(x - 1, z, this.map, sizeX, sizeZ),
      hasRoad(x, z - 1, this.map, sizeX, sizeZ),
    ];

    const match = findRoadModel(need, this.modelConfigs);
    const localConns = match ? rotateConn(need, (4 - match.rotSteps) % 4) : need;

    this.objects.push({
      model: match?.model || "road-crossroad",
      pack: "roads",
      position: [x * cellSize + cellSize / 2 - halfX, 0, z * cellSize + cellSize / 2 - halfZ],
      rotation: match?.rotation || 0,
      gridW: 1,
      gridD: 1,
      scale: match?.scale || 1,
      connRight: localConns[0],
      connBack: localConns[1],
      connLeft: localConns[2],
      connFront: localConns[3],
    });
  }
}
