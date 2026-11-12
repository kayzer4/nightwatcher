import * as THREE from "three";
import type { CityObject, PlacedAttractor } from "@/shared/engine/CityGenerator";
import type { WorldLamp } from "./world-lamp";

export const DEFAULT_LAMP_DISTANCE = 10.5;

export interface BuildingBox2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Извлекает почти полный размер ячейки здания. В сцене модель подгоняется
 * по ширине к cellSize, поэтому большой отступ пропускал свет у фасада.
 */
export function extractBuildingBoxes(objects: CityObject[], cellSize: number): BuildingBox2D[] {
  const boxes: BuildingBox2D[] = [];
  const half = cellSize * 0.48;
  for (const obj of objects) {
    if (obj.pack === "Models" || obj.pack === "buildings") {
      boxes.push({
        minX: obj.position[0] - half,
        maxX: obj.position[0] + half,
        minZ: obj.position[2] - half,
        maxZ: obj.position[2] + half,
      });
    }
  }
  return boxes;
}

/**
 * Быстрый тест пересечения отрезка с 2D AABB коробкой здания (метод полос Liang-Barsky).
 */
export function segmentIntersectsBox2D(
  x1: number, z1: number,
  x2: number, z2: number,
  b: BuildingBox2D
): boolean {
  let tmin = 0;
  let tmax = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;

  if (Math.abs(dx) < 1e-6) {
    if (x1 < b.minX || x1 > b.maxX) return false;
  } else {
    const invDx = 1 / dx;
    let t1 = (b.minX - x1) * invDx;
    let t2 = (b.maxX - x1) * invDx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  if (Math.abs(dz) < 1e-6) {
    if (z1 < b.minZ || z1 > b.maxZ) return false;
  } else {
    const invDz = 1 / dz;
    let t1 = (b.minZ - z1) * invDz;
    let t2 = (b.maxZ - z1) * invDz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return true;
}

/**
 * Проверяет, блокируется ли прямая видимость света от фонаря до цели зданиями.
 */
export function isLightOccludedByBuildings(
  lampPos: { x: number; z: number },
  targetPos: { x: number; z: number },
  buildings: readonly BuildingBox2D[]
): boolean {
  const minSegX = Math.min(lampPos.x, targetPos.x);
  const maxSegX = Math.max(lampPos.x, targetPos.x);
  const minSegZ = Math.min(lampPos.z, targetPos.z);
  const maxSegZ = Math.max(lampPos.z, targetPos.z);

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (maxSegX < b.minX || minSegX > b.maxX || maxSegZ < b.minZ || minSegZ > b.maxZ) {
      continue;
    }
    if (segmentIntersectsBox2D(lampPos.x, lampPos.z, targetPos.x, targetPos.z, b)) {
      return true;
    }
  }
  return false;
}

/**
 * 1. ЖАДНЫЙ SET COVER (Greedy Maximum Coverage)
 * Правила:
 * - СТРОГО не более 1 фонаря на клетку (usedCells).
 * - Свет НЕ проходит сквозь здания (isLightOccludedByBuildings).
 * - Покрывает 98% доступных тротуаров минимальным числом фонарей.
 */
export function greedySetCoverLamps(
  worldLamps: WorldLamp[],
  attractors: PlacedAttractor[],
  buildings: BuildingBox2D[],
  coverageThreshold = 0.98
): Set<string> {
  const chosen = new Set<string>();
  const usedCells = new Set<string>();
  if (worldLamps.length === 0 || attractors.length === 0) return chosen;

  const targets = attractors.map((a) => ({
    id: a.id,
    pos: new THREE.Vector3(a.position[0], 0.9, a.position[2]),
  }));

  const totalTargets = targets.length;
  const targetCovered = new Uint8Array(totalTargets);
  let coveredCount = 0;

  // Предрассчитываем для каждого фонаря покрываемые точки с учетом препятствий
  const lampCoverage = new Map<string, number[]>();
  const r2 = DEFAULT_LAMP_DISTANCE * DEFAULT_LAMP_DISTANCE;
  for (const lamp of worldLamps) {
    const coveredIdxs: number[] = [];
    for (let i = 0; i < totalTargets; i++) {
      const tPos = targets[i].pos;
      if (lamp.pos.distanceToSquared(tPos) <= r2) {
        if (!isLightOccludedByBuildings(lamp.pos, tPos, buildings)) {
          coveredIdxs.push(i);
        }
      }
    }
    lampCoverage.set(lamp.id, coveredIdxs);
  }

  while (coveredCount / totalTargets < coverageThreshold) {
    let bestLamp: WorldLamp | null = null;
    let maxNew = 0;

    for (const lamp of worldLamps) {
      if (usedCells.has(lamp.cellKey) || chosen.has(lamp.id)) continue;
      const idxs = lampCoverage.get(lamp.id) || [];
      let newCount = 0;
      for (const idx of idxs) {
        if (!targetCovered[idx]) newCount++;
      }
      if (newCount > maxNew) {
        maxNew = newCount;
        bestLamp = lamp;
      }
    }

    if (!bestLamp || maxNew === 0) break;

    chosen.add(bestLamp.id);
    usedCells.add(bestLamp.cellKey);

    const idxs = lampCoverage.get(bestLamp.id)!;
    for (const idx of idxs) {
      if (!targetCovered[idx]) {
        targetCovered[idx] = 1;
        coveredCount++;
      }
    }
  }

  return chosen;
}

/**
 * 2. ГРАДОСТРОИТЕЛЬНЫЙ: ПЕРЕКРЕСТКИ + РЕБРА (Hierarchical Road-Network)
 * Правила:
 * - СТРОГО 1 фонарь на клетку перекрестка/поворота.
 * - Прямые участки закрывают оставшиеся темные зоны без дублирования на клетке.
 * - Учитывается окклюзия зданиями.
 */
export function intersectionFirstLamps(
  worldLamps: WorldLamp[],
  objects: CityObject[],
  attractors: PlacedAttractor[],
  buildings: BuildingBox2D[],
  cellSize = 8
): Set<string> {
  const chosen = new Set<string>();
  const usedCells = new Set<string>();
  if (worldLamps.length === 0) return chosen;

  const targets = attractors.map((a) => ({
    id: a.id,
    pos: new THREE.Vector3(a.position[0], 0.9, a.position[2]),
  }));
  const targetCovered = new Uint8Array(targets.length);

  const r2 = DEFAULT_LAMP_DISTANCE * DEFAULT_LAMP_DISTANCE;
  const markCoveredByLamp = (lamp: WorldLamp) => {
    for (let i = 0; i < targets.length; i++) {
      if (!targetCovered[i] && lamp.pos.distanceToSquared(targets[i].pos) <= r2) {
        if (!isLightOccludedByBuildings(lamp.pos, targets[i].pos, buildings)) {
          targetCovered[i] = 1;
        }
      }
    }
  };

  // Находим все клетки перекрестков и поворотов
  const intersectionCells = new Set<string>();
  for (const obj of objects) {
    if (obj.pack !== "roads") continue;
    const tileKey = `${Math.round(obj.position[0])}_${Math.round(obj.position[2])}`;
    const connCount = [obj.connRight, obj.connBack, obj.connLeft, obj.connFront].filter(Boolean).length;
    const isTurn = connCount === 2 && !(
      (obj.connLeft && obj.connRight) || (obj.connFront && obj.connBack)
    );
    if (connCount >= 3 || isTurn || obj.model.includes("cross") || obj.model.includes("corner")) {
      intersectionCells.add(tileKey);
    }
  }

  // Фаза 1: 1 фонарь на перекресток/поворот (выбираем лучший ракурс)
  for (const cellKey of intersectionCells) {
    const cellLamps = worldLamps.filter((l) => l.cellKey === cellKey);
    if (cellLamps.length > 0 && !usedCells.has(cellKey)) {
      let bestLamp = cellLamps[0];
      let maxCover = -1;
      for (const l of cellLamps) {
        let count = 0;
        for (const t of targets) {
          if (l.pos.distanceToSquared(t.pos) <= r2 && !isLightOccludedByBuildings(l.pos, t.pos, buildings)) {
            count++;
          }
        }
        if (count > maxCover) {
          maxCover = count;
          bestLamp = l;
        }
      }
      chosen.add(bestLamp.id);
      usedCells.add(cellKey);
      markCoveredByLamp(bestLamp);
    }
  }

  // Фаза 2: Закрываем оставшиеся темные участки (по 1 фонарю на клетку)
  let uncoveredRemaining = targetCovered.some((c) => c === 0);
  while (uncoveredRemaining) {
    let bestLamp: WorldLamp | null = null;
    let maxNew = 0;

    for (const lamp of worldLamps) {
      if (usedCells.has(lamp.cellKey) || chosen.has(lamp.id)) continue;
      let newCount = 0;
      for (let i = 0; i < targets.length; i++) {
        if (!targetCovered[i] && lamp.pos.distanceToSquared(targets[i].pos) <= r2) {
          if (!isLightOccludedByBuildings(lamp.pos, targets[i].pos, buildings)) {
            newCount++;
          }
        }
      }
      if (newCount > maxNew) {
        maxNew = newCount;
        bestLamp = lamp;
      }
    }

    if (!bestLamp || maxNew === 0) break;

    chosen.add(bestLamp.id);
    usedCells.add(bestLamp.cellKey);
    markCoveredByLamp(bestLamp);
    uncoveredRemaining = targetCovered.some((c) => c === 0);
  }

  return chosen;
}

/**
 * 3. МАРШРУТНЫЙ / КРИТИЧЕСКИЙ ПУТЬ (Critical Path: Spawn -> Exit)
 * Правила:
 * - СТРОГО 1 фонарь на клетку.
 * - Освещает маршруты от Spawn до Exit.
 * - Учитывает затенение зданиями.
 */
export function criticalPathLamps(
  worldLamps: WorldLamp[],
  attractors: PlacedAttractor[],
  buildings: BuildingBox2D[],
  maxDarkGap = 4.0
): Set<string> {
  const chosen = new Set<string>();
  const usedCells = new Set<string>();
  if (worldLamps.length === 0 || attractors.length === 0) return chosen;

  const map = new Map<string, PlacedAttractor>(attractors.map((a) => [a.id, a]));
  const spawns = attractors.filter((a) => a.type === "spawn");
  const exits = attractors.filter((a) => a.type === "exit");
  const goals = exits.length > 0 ? exits : attractors.filter((a) => a.type === "walk");

  const routePoints: THREE.Vector3[] = [];
  for (const start of spawns.slice(0, 10)) {
    const queue: { id: string; path: string[] }[] = [{ id: start.id, path: [start.id] }];
    const visited = new Set<string>([start.id]);
    let foundPath: string[] | null = null;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const node = map.get(curr.id);
      if (!node) continue;

      if (curr.path.length > 4 && (node.type === "exit" || goals.some((g) => g.id === node.id))) {
        foundPath = curr.path;
        break;
      }
      if (curr.path.length > 35) continue;

      for (const nextId of node.next) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, path: [...curr.path, nextId] });
        }
      }
    }

    if (foundPath) {
      for (const id of foundPath) {
        const a = map.get(id);
        if (a) routePoints.push(new THREE.Vector3(a.position[0], 0.9, a.position[2]));
      }
    }
  }

  if (routePoints.length === 0) {
    for (const a of spawns) {
      routePoints.push(new THREE.Vector3(a.position[0], 0.9, a.position[2]));
    }
  }

  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    let isLit = false;

    for (const lampId of chosen) {
      const lamp = worldLamps.find((l) => l.id === lampId);
      if (lamp && lamp.pos.distanceTo(pt) <= DEFAULT_LAMP_DISTANCE) {
        if (!isLightOccludedByBuildings(lamp.pos, pt, buildings)) {
          isLit = true;
          break;
        }
      }
    }

    if (!isLit) {
      let bestLamp: WorldLamp | null = null;
      let maxRouteLit = -1;

      for (const lamp of worldLamps) {
        if (usedCells.has(lamp.cellKey) || chosen.has(lamp.id)) continue;
        const d = lamp.pos.distanceTo(pt);
        if (d <= DEFAULT_LAMP_DISTANCE && !isLightOccludedByBuildings(lamp.pos, pt, buildings)) {
          let count = 0;
          for (let j = i; j < Math.min(i + 15, routePoints.length); j++) {
            if (lamp.pos.distanceTo(routePoints[j]) <= DEFAULT_LAMP_DISTANCE && !isLightOccludedByBuildings(lamp.pos, routePoints[j], buildings)) {
              count++;
            }
          }
          if (count > maxRouteLit) {
            maxRouteLit = count;
            bestLamp = lamp;
          }
        }
      }

      if (bestLamp) {
        chosen.add(bestLamp.id);
        usedCells.add(bestLamp.cellKey);
      }
    }
  }

  return chosen;
}
