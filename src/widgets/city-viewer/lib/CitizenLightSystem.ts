import * as THREE from "three";
import { getBuildingLightSources } from "@/shared/game-core/building-lights";
import type { RagdollSystem } from "../lib/ragdoll";
import { isLightOccludedByBuildings, type BuildingBox2D } from "./lamp-placement";
import type { WorldLamp } from "./world-lamp";

/** Samples street lamps and active windows for one resident, including occlusion. */
export class CitizenLightSystem {
  sample(
    _npcChest: THREE.Vector3,
    worldLamps: readonly WorldLamp[],
    buildingBoxes: readonly BuildingBox2D[],
    system: RagdollSystem | null,
    lampMultiplier: number,
    showLightRays: boolean,
    rayPositions: number[],
    rayColors: number[],
  ): number {
    let lampContribution = 0;
    if (lampMultiplier > 0 && worldLamps.length > 0) {
      for (const lamp of worldLamps) {
        const dx = _npcChest.x - lamp.pos.x;
        const dy = _npcChest.y - lamp.pos.y;
        const dz = _npcChest.z - lamp.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < lamp.distance) {
          // 1. Spotlight cone angle check
          const invD = 1 / d;
          const rayDirX = dx * invD;
          const rayDirY = dy * invD;
          const rayDirZ = dz * invD;
          const cosTheta = rayDirX * lamp.dir.x + rayDirY * lamp.dir.y + rayDirZ * lamp.dir.z;
          const cosOuter = Math.cos(lamp.angle);

          // Only if NPC is within the lamp cone
          if (cosTheta > cosOuter) {
            // Query only building colliders: roads and NPCs must not hide a building behind them.
            let isOccluded = false;
            let hitDist = d;
            if (system && system.hasBuildingColliders) {
              const occ = system.checkLightOcclusion(lamp.pos, _npcChest);
              isOccluded = occ.blocked;
              if (occ.hitDist != null) hitDist = occ.hitDist;
            }
            // A conservative footprint also covers gaps in decorative GLB meshes.
            if (!isOccluded && buildingBoxes.length > 0) {
              isOccluded = isLightOccludedByBuildings(lamp.pos, _npcChest, buildingBoxes);
            }

            const cosInner = Math.cos(lamp.angle * (1 - lamp.penumbra));
            // Exact Three.js spotlight smoothstep and distance cutoff attenuation (matching decay = 0)
            const spotAttenuation = THREE.MathUtils.smoothstep(cosTheta, cosOuter, cosInner);
            const ratio = THREE.MathUtils.clamp(d / lamp.distance, 0, 1);
            const distFalloff = Math.pow(Math.max(0, 1 - Math.pow(ratio, 4)), 2);
            const rawLight = spotAttenuation * distFalloff;
            const intensity = lamp.intensity ?? 3.5;
            const contrib = rawLight * (intensity / 1.0) * lampMultiplier;

            if (showLightRays && (!isOccluded || hitDist < d) && (contrib > 0.005 || (isOccluded && rawLight > 0.005))) {
              rayPositions.push(lamp.pos.x, lamp.pos.y, lamp.pos.z);
              if (isOccluded) {
                rayPositions.push(lamp.pos.x + rayDirX * hitDist, lamp.pos.y + rayDirY * hitDist, lamp.pos.z + rayDirZ * hitDist);
                rayColors.push(1.0, 0.2, 0.2, 1.0, 0.2, 0.2); // Red: blocked by building
              } else {
                rayPositions.push(_npcChest.x, _npcChest.y, _npcChest.z);
                rayColors.push(0.2, 1.0, 0.3, 0.2, 1.0, 0.3); // Bright green: reaches NPC
              }
            }

            if (!isOccluded) {
              lampContribution += contrib;
            }
          }
        }
      }
    }

    for (const windowLight of getBuildingLightSources()) {
      if (windowLight.intensity <= 0.01) continue;
      const dx = _npcChest.x - windowLight.x;
      const dy = _npcChest.y - windowLight.y;
      const dz = _npcChest.z - windowLight.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance >= windowLight.distance || distance < 1e-4) continue;
      const facing = (dx * windowLight.dirX + dy * windowLight.dirY + dz * windowLight.dirZ) / distance;
      if (facing <= Math.cos(0.85)) continue;
      if (isLightOccludedByBuildings(windowLight, _npcChest, buildingBoxes)) continue;
      const reach = 1 - distance / windowLight.distance;
      lampContribution += windowLight.intensity * reach * reach * THREE.MathUtils.smoothstep(facing, Math.cos(0.85), Math.cos(0.4));
    }

    return lampContribution;
  }
}
