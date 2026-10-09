export interface CityConfig {
  gridSizeX: number;
  gridSizeZ: number;
  cellSize: number;
}

export type AttractorType = "spawn" | "walk" | "wait" | "exit" | "activity";
export type ActivityType = "idle" | "sit" | "stand" | "talk" | "eat" | "shop";
export type NPCTimeOfDay = "morning" | "day" | "evening" | "night";
export type NPCState = "idle" | "walking" | "waiting" | "doing_activity" | "exiting";

export interface AttractorCondition {
  timeOfDay?: NPCTimeOfDay[];
  npcType?: string[];
  randomChance?: number;
  minNPCs?: number;
  maxNPCs?: number;
}

export interface AttractorConfig {
  id: string;
  type: AttractorType;
  position: { x: number; y: number; z: number };
  rotation?: number;
  directions?: number[];
  crossingDirections?: number[];
  conditions?: AttractorCondition[];
  duration?: number;
  activity?: ActivityType;
  scale?: number;
}

// degrees in model-local frame: 0=+X, 90=+Z; a transition A→B is allowed
// when its angle is within ±22.5° of one of the listed directions
export const DIRECTION_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

export interface NPCConfig {
  id: string;
  type: string;
  model?: string;
  pack?: string;
  speed?: number;
  color?: string;
}

export interface NPCStateData {
  id: string;
  npcType: string;
  model?: string;
  pack?: string;
  color: string;
  position: [number, number, number];
  targetAttractorId: string | null;
  currentAttractorId: string | null;
  state: NPCState;
  speed: number;
  waitUntil: number;
  activity: ActivityType;
  rotation: number;
}

export interface PlacedAttractor {
  id: string;
  type: AttractorType;
  position: [number, number, number];
  rotation: number;
  next: string[];
  conditions?: AttractorCondition[];
  duration?: number;
  activity?: ActivityType;
  scale: number;
  cellX: number;
  cellZ: number;
  manualRouting?: boolean;
  dirs?: number[];
  crossDirs?: number[];
}

export const ATTRACTOR_COLORS: Record<AttractorType, string> = {
  spawn: "#52c41a",
  walk: "#fadb14",
  wait: "#1677ff",
  exit: "#ff4d4f",
  activity: "#722ed1",
};

export interface ModelConfig {
  name: string;
  pack: string;
  modelType: string;
  rotation: number;
  scale: number;
  offsetY: number;
  speed?: number; // NPC walking speed (m/s); game falls back to DEFAULT_NPC_CONFIGS per type
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
  attractors?: AttractorConfig[];
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

// Shared invariant: character GLBs are normalized to this height (world units)
// before the per-model `scale` from configs is applied — same in game and editor preview.
export const NPC_BASE_HEIGHT = 1.75;

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

function getBuildingCandidates(modelConfigs: Record<string, ModelConfig>): { model: string; pack: string; scale: number }[] {
  const candidates: { model: string; pack: string; scale: number }[] = [];

  for (const [, cfg] of Object.entries(modelConfigs)) {
    if (cfg.modelType === "road" || cfg.modelType === "tile" || cfg.modelType === "character") continue;
    if (cfg.pack === "characters") continue;
    if (cfg.tags.includes("detail")) continue;
    candidates.push({
      model: cfg.name,
      pack: cfg.pack,
      scale: cfg.scale || 1,
    });
  }

  return candidates;
}

function hasRoad(x: number, z: number, map: CellType[][], sizeX: number, sizeZ: number): boolean {
  if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false;
  return map[x][z] === "road";
}

export const DEFAULT_CONFIG: CityConfig = {
  gridSizeX: 6,
  gridSizeZ: 6,
  cellSize: 2,
};

export const DEFAULT_NPC_CONFIGS: Record<string, NPCConfig> = {
  citizen: { id: "citizen", type: "citizen", model: "/models/characters/cube_guy.glb", speed: 1.0 },
  worker: { id: "worker", type: "worker", model: "/models/characters/steve.glb", speed: 1.3 },
  tourist: { id: "tourist", type: "tourist", model: "/models/characters/cube_woman.glb", speed: 0.7 },
};

export class CityGenerator {
  config: CityConfig;
  modelConfigs: Record<string, ModelConfig>;
  objects: CityObject[] = [];
  attractors: PlacedAttractor[] = [];
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
      this.attractors = [];
      this.map = Array.from({ length: gridSizeX }, () =>
        Array.from({ length: gridSizeZ }, () => "empty" as CellType)
      );

      const blocks = this.generateBlocks(gridSizeX, gridSizeZ);
      this.markRoadsAndBuildings(blocks, gridSizeX, gridSizeZ);

      if (this.canPlaceAllRoads(gridSizeX, gridSizeZ)) {
        this.placeObjects(gridSizeX, gridSizeZ, cellSize, halfX, halfZ, blocks);
        this.linkAttractors();
        return this.objects;
      }
    }

    this.objects = [];
    this.attractors = [];
    this.map = Array.from({ length: gridSizeX }, () =>
      Array.from({ length: gridSizeZ }, () => "empty" as CellType)
    );
    const blocks = this.generateBlocks(gridSizeX, gridSizeZ);
    this.markRoadsAndBuildings(blocks, gridSizeX, gridSizeZ);
    this.placeObjects(gridSizeX, gridSizeZ, cellSize, halfX, halfZ, blocks);
    this.linkAttractors();
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
    const minSize = 3;
    const maxSize = 6;
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
    const candidates = getBuildingCandidates(this.modelConfigs);
    if (candidates.length === 0) return;

    for (let bz = 0; bz < block.h; bz++) {
      for (let bx = 0; bx < block.w; bx++) {
        if (this.map[block.x + bx][block.z + bz] !== "building") continue;

        const cand = candidates[Math.floor(Math.random() * candidates.length)];
        const gx = block.x + bx;
        const gz = block.z + bz;

        this.objects.push({
          model: cand.model, pack: cand.pack,
          position: [(gx + 0.5) * cellSize - halfX, 0, (gz + 0.5) * cellSize - halfZ],
          rotation: 0, gridW: 1, gridD: 1, scale: cellSize,
          connRight: false, connBack: false, connLeft: false, connFront: false,
          frontDir: this.findNearestRoadDir(gx, gz),
        });
      }
    }
  }

  private findNearestRoadDir(bx: number, bz: number): "left" | "right" | "front" | "back" | "none" {
    const { gridSizeX, gridSizeZ } = this.config;
    let bestDist = Infinity;
    let bestDir: "left" | "right" | "front" | "back" | "none" = "none";

    const check = (x: number, z: number, dir: "left" | "right" | "front" | "back") => {
      if (x < 0 || x >= gridSizeX || z < 0 || z >= gridSizeZ) return;
      if (this.map[x][z] !== "road") return;
      const dist = (x - bx) ** 2 + (z - bz) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    };

    check(bx, bz - 1, "front");
    check(bx, bz + 1, "back");
    check(bx - 1, bz, "left");
    check(bx + 1, bz, "right");

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
    this.placeAttractorsForCell(x, z, cellSize, halfX, halfZ, match?.rotation || 0, match?.model || "road-crossroad");
  }

  private placeAttractorsForCell(
    gx: number, gz: number, cellSize: number, halfX: number, halfZ: number,
    objectRotation: number, model: string,
  ): void {
    const cfg = this.modelConfigs[`roads/${model}`];
    if (!cfg?.attractors?.length) return;

    const cx = gx * cellSize + cellSize / 2 - halfX;
    const cz = gz * cellSize + cellSize / 2 - halfZ;
    const cos = Math.cos(objectRotation);
    const sin = Math.sin(objectRotation);
    // explicit directions anywhere in the model → transitions are opt-in, no same-cell fallback
    const manualRouting = cfg.attractors.some((a) => a.directions !== undefined);
    const phiDeg = (objectRotation * 180) / Math.PI;
    const hasCrossDirs = cfg.attractors.some((a) => (a.crossingDirections?.length ?? 0) > 0);

    for (const a of cfg.attractors) {
      const lx = a.position.x * cellSize;
      const lz = a.position.z * cellSize;
      const wx = cx + lx * cos + lz * sin;
      const wz = cz + (-lx * sin + lz * cos);
      this.attractors.push({
        id: `${gx}_${gz}:${a.id}`,
        type: a.type,
        position: [wx, a.position.y ?? 0.1, wz],
        rotation: objectRotation + (a.rotation || 0),
        next: [],
        conditions: a.conditions,
        duration: a.duration,
        activity: a.activity,
        scale: a.scale ?? 0.05,
        cellX: gx,
        cellZ: gz,
        manualRouting,
        dirs: a.directions?.map((d) => ((((d - phiDeg) % 360) + 360) % 360)),
        crossDirs: a.crossingDirections?.map((d) => ((((d - phiDeg) % 360) + 360) % 360)),
      });
    }
  }

  private linkAttractors(): void {
    // spawn is a source only — never link INTO spawn, it would form loops to origin
    const targetIds = new Set(
      this.attractors.filter((a) => a.type === "walk" || a.type === "exit").map((a) => a.id),
    );
    const sources = this.attractors.filter(
      (a) => a.type === "walk" || a.type === "exit" || a.type === "spawn",
    );

    const withinSector = (ang: number, dirs?: number[]): boolean => {
      if (!dirs || dirs.length === 0) return false;
      return dirs.some((d) => Math.abs((((ang - d) % 360) + 540) % 360 - 180) <= 22.5 + 1e-9);
    };
    const allows = (a: PlacedAttractor, b: PlacedAttractor): boolean => {
      if (!a.dirs) return true;
      const ang = (Math.atan2(b.position[2] - a.position[2], b.position[0] - a.position[0]) * 180) / Math.PI;
      return withinSector(ang, a.dirs);
    };
    const link = (a: PlacedAttractor, b: PlacedAttractor) => {
      if (a.id === b.id) return;
      // both ends must agree: the target accepts arrivals only via its opposite arrow
      if (targetIds.has(b.id) && allows(a, b) && allows(b, a) && !a.next.includes(b.id)) a.next.push(b.id);
    };

    // same-cell: every ordered pair, gated by each side's directions
    const byCell = new Map<string, PlacedAttractor[]>();
    for (const a of sources) {
      const key = `${a.cellX}_${a.cellZ}`;
      const list = byCell.get(key) ?? [];
      list.push(a);
      byCell.set(key, list);
    }
    for (const list of byCell.values()) {
      for (const a of list) {
        for (const b of list) link(a, b);
      }
    }

    // cross-cell: only orthogonally adjacent road cells on the same curb axis —
    // lateral offset would make NPCs cut across the road
    const curbTol = this.config.cellSize * 0.15;
    for (let i = 0; i < sources.length; i++) {
      for (let j = 0; j < sources.length; j++) {
        if (i === j) continue;
        const a = sources[i];
        const b = sources[j];
        if (a.cellX === b.cellX && a.cellZ === b.cellZ) continue;
        if (Math.abs(a.cellX - b.cellX) + Math.abs(a.cellZ - b.cellZ) !== 1) continue;
        if (this.map[a.cellX]?.[a.cellZ] !== "road" || this.map[b.cellX]?.[b.cellZ] !== "road") continue;
        const lateral = a.cellX !== b.cellX
          ? Math.abs(a.position[2] - b.position[2])
          : Math.abs(a.position[0] - b.position[0]);
        if (lateral > curbTol) continue;
        link(a, b);
      }
    }
  }
}
