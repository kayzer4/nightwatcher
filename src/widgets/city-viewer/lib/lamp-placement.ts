import * as THREE from "three";
import type { CityObject, PlacedAttractor } from "@/shared/engine/CityGenerator";
import type { WorldLamp } from "../ui/CityViewerClient";

/**
 * 1. ЖАДНЫЙ SET COVER (Greedy Maximum Coverage)
 * Выбирает минимальное количество фонарей, чтобы покрыть максимальное
 * количество точек пешеходных тротуаров (аттракторов).
 */
export function greedySetCoverLamps(
  worldLamps: WorldLamp[],
  attractors: PlacedAttractor[],
  coverageThreshold = 0.95
): Set<string> {
  const chosen = new Set<string>();
  if (worldLamps.length === 0 || attractors.length === 0) return chosen;

  const targets = attractors.map((a) => ({
    id: a.id,
    pos: new THREE.Vector3(a.position[0], 0.9, a.position[2]),
  }));

  const totalTargets = targets.length;
  const targetCovered = new Uint8Array(totalTargets);
  let coveredCount = 0;

  // Предрассчитываем для каждого фонаря список индексов покрываемых точек
  const lampCoverage = new Map<string, number[]>();
  for (const lamp of worldLamps) {
    const coveredIdxs: number[] = [];
    const r2 = lamp.distance * lamp.distance;
    for (let i = 0; i < totalTargets; i++) {
      if (lamp.pos.distanceToSquared(targets[i].pos) <= r2) {
        coveredIdxs.push(i);
      }
    }
    lampCoverage.set(lamp.id, coveredIdxs);
  }

  const remainingLampIds = new Set(worldLamps.map((l) => l.id));

  while (remainingLampIds.size > 0 && coveredCount / totalTargets < coverageThreshold) {
    let bestLampId: string | null = null;
    let maxNew = 0;

    for (const lampId of remainingLampIds) {
      const idxs = lampCoverage.get(lampId) || [];
      let newCount = 0;
      for (const idx of idxs) {
        if (!targetCovered[idx]) newCount++;
      }
      if (newCount > maxNew) {
        maxNew = newCount;
        bestLampId = lampId;
      }
    }

    if (!bestLampId || maxNew === 0) break;

    chosen.add(bestLampId);
    remainingLampIds.delete(bestLampId);

    const idxs = lampCoverage.get(bestLampId)!;
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
 * Первым приоритетом зажигает фонари на перекрестках, развилках и поворотах.
 * Затем на прямых участках улиц закрывает оставшиеся темные промежутки с шагом.
 */
export function intersectionFirstLamps(
  worldLamps: WorldLamp[],
  objects: CityObject[],
  cellSize = 8
): Set<string> {
  const chosen = new Set<string>();
  if (worldLamps.length === 0) return chosen;

  const intersectionTiles = new Set<string>();

  for (const obj of objects) {
    if (obj.pack !== "roads") continue;
    const tileKey = `${obj.position[0].toFixed(1)}_${obj.position[2].toFixed(1)}`;
    const connCount = [obj.connRight, obj.connBack, obj.connLeft, obj.connFront].filter(Boolean).length;

    const isTurn = connCount === 2 && !(
      (obj.connLeft && obj.connRight) || (obj.connFront && obj.connBack)
    );
    const isIntersection = connCount >= 3 || isTurn || obj.model.includes("cross") || obj.model.includes("corner");

    if (isIntersection) {
      intersectionTiles.add(tileKey);
    }
  }

  // Фаза 1: Освещаем все перекрестки и повороты
  for (const lamp of worldLamps) {
    const lampTileKey = lamp.id.split("_").slice(0, 2).join("_");
    if (intersectionTiles.has(lampTileKey)) {
      chosen.add(lamp.id);
    }
  }

  // Фаза 2: На длинных прямых улицах добавляем фонари с шагом, если разрыв > 7.5м
  for (const lamp of worldLamps) {
    if (chosen.has(lamp.id)) continue;

    let minDistToActive = Infinity;
    for (const activeId of chosen) {
      const activeLamp = worldLamps.find((l) => l.id === activeId);
      if (activeLamp) {
        const d = lamp.pos.distanceTo(activeLamp.pos);
        if (d < minDistToActive) minDistToActive = d;
      }
    }

    if (minDistToActive > 7.5) {
      chosen.add(lamp.id);
    }
  }

  return chosen;
}

/**
 * 3. МАРШРУТНЫЙ / КРИТИЧЕСКИЙ ПУТЬ (Critical Path: Spawn -> Exit)
 * Ищет пути прохождения от точек Spawn до Exit (или дальних точек)
 * и расставляет фонари только вдоль этих коридоров.
 */
export function criticalPathLamps(
  worldLamps: WorldLamp[],
  attractors: PlacedAttractor[],
  maxDarkGap = 4.0
): Set<string> {
  const chosen = new Set<string>();
  if (worldLamps.length === 0 || attractors.length === 0) return chosen;

  const map = new Map<string, PlacedAttractor>(attractors.map((a) => [a.id, a]));
  const spawns = attractors.filter((a) => a.type === "spawn");
  const exits = attractors.filter((a) => a.type === "exit");
  const goals = exits.length > 0 ? exits : attractors.filter((a) => a.type === "walk");

  const routePoints: THREE.Vector3[] = [];

  for (const start of spawns.slice(0, 8)) {
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

      if (curr.path.length > 30) continue;

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

  // Освещаем точки маршрутов
  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    let isLit = false;

    for (const lampId of chosen) {
      const lamp = worldLamps.find((l) => l.id === lampId);
      if (lamp && lamp.pos.distanceTo(pt) <= lamp.distance) {
        isLit = true;
        break;
      }
    }

    if (!isLit) {
      let bestLamp: WorldLamp | null = null;
      let minD = Infinity;

      for (const lamp of worldLamps) {
        const d = lamp.pos.distanceTo(pt);
        if (d <= lamp.distance && d < minD) {
          minD = d;
          bestLamp = lamp;
        }
      }

      if (bestLamp) {
        chosen.add(bestLamp.id);
      }
    }
  }

  return chosen;
}
