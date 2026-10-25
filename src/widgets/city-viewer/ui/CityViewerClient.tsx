"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Billboard, Text as DreiText } from "@react-three/drei";
import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import { createSeededRandom } from "@/shared/hooks/useCityGenerator";
import type { RagdollSystem } from "../lib/ragdoll";
import {
  getCityColliderVersion, removeCityCollider, setCityCollider, setCityMeshCollider,
} from "../lib/city-colliders";
import {
  CityGenerator, CityObject, ModelConfig, PlacedAttractor,
  DEFAULT_CONFIG, DEFAULT_NPC_CONFIGS, NPC_BASE_HEIGHT,
} from "@/shared/engine/CityGenerator";
import {
  greedySetCoverLamps,
  intersectionFirstLamps,
  criticalPathLamps,
  extractBuildingBoxes,
  isLightOccludedByBuildings,
  DEFAULT_LAMP_DISTANCE,
  type BuildingBox2D,
} from "../lib/lamp-placement";

const CONNECTOR_COLOR = "#52c41a";
const ATTRACTOR_COLOR = "#fadb14";
const NPC_COUNT = 10;

let _showConnectors = typeof window !== "undefined" && localStorage.getItem("nw_showConnectors") === "true";
let _showAttractors = typeof window !== "undefined" && localStorage.getItem("nw_showAttractors") !== "false";
let _showNPCs = typeof window !== "undefined" && localStorage.getItem("nw_showNPCs") !== "false";
let _showVectors = typeof window !== "undefined" && localStorage.getItem("nw_showVectors") === "true";
let _showLightLevels = typeof window !== "undefined" ? localStorage.getItem("nw_showLightLevels") !== "false" : true;
let _showLightRays = typeof window !== "undefined" && localStorage.getItem("nw_showLightRays") === "true";

const FRONT_ROTATION: Record<string, number> = {
  front: 0,
  right: -Math.PI / 2,
  back: Math.PI,
  left: Math.PI / 2,
  none: 0,
};

function ConnectionCube({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = _showConnectors;
  });
  return (
    <mesh ref={ref} position={position} visible={false}>
      <boxGeometry args={[0.12, 0.12, 0.12]} />
      <meshStandardMaterial color={CONNECTOR_COLOR} emissive={CONNECTOR_COLOR} emissiveIntensity={0.6} />
    </mesh>
  );
}

function AttractorCube({ attr }: { attr: PlacedAttractor }) {
  const ref = useRef<THREE.Mesh>(null);
  const s = attr.scale;
  useFrame(() => {
    if (ref.current) ref.current.visible = _showAttractors;
  });
  return (
    <mesh
      ref={ref}
      position={[attr.position[0], attr.position[1] + s / 2, attr.position[2]]}
      rotation={[0, attr.rotation, 0]}
    >
      <boxGeometry args={[s, s, s]} />
      <meshStandardMaterial color={ATTRACTOR_COLOR} emissive={ATTRACTOR_COLOR} emissiveIntensity={0.45} />
    </mesh>
  );
}

const ALL_DIRS = [0, 45, 90, 135, 180, 225, 270, 315];

function VectorArrows({ attr }: { attr: PlacedAttractor }) {
  const ref = useRef<THREE.Group>(null);
  const arrows = useMemo(() => {
    const dirs = attr.dirs ?? ALL_DIRS;
    const cross = new Set(attr.crossDirs ?? []);
    return dirs.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return new THREE.ArrowHelper(
        new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)),
        new THREE.Vector3(attr.position[0], attr.position[1], attr.position[2]),
        0.5, cross.has(deg) ? "#52c41a" : "#1677ff", 0.16, 0.08,
      );
    });
  }, [attr]);
  useEffect(() => () => { arrows.forEach((a) => a.dispose()); }, [arrows]);
  useFrame(() => {
    if (ref.current) ref.current.visible = _showVectors;
  });
  return (
    <group ref={ref} visible={_showVectors}>
      {arrows.map((a, i) => <primitive key={i} object={a} />)}
    </group>
  );
}

interface NPCInstance {
  id: string;
  npcType: string;
  model: string;
  scale: number;
  color: string;
  speed: number;
  height: number;
  pos: THREE.Vector3;
  rotY: number;
  current: PlacedAttractor;
  target: PlacedAttractor | null;
  phase: "move" | "wait";
  waitUntil: number;
  state: "alive" | "ragdoll";
  downSince: number;
  lightLevel: number;
  isLit: boolean;
  // Populated by NPCCharacter once the skinned clone is ready.
  clone?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
}
const _moveDir = new THREE.Vector3();
const _boxSize = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Intrinsic fit scale per model URL. Measured once in the model's own local space
// (independent of the parent group's transform) so re-renders can't re-derive a
// different scale — the old per-render Box3 measured through a stale parent matrix
// and oscillated between two building sizes on every re-render.
const _buildingFitCache = new Map<string, number>();

export interface WorldLamp {
  id: string;
  cellKey: string;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  intensity: number;
  distance: number;
  color: string;
  angle: number;
  penumbra: number;
}

export function extractWorldLamps(objects: CityObject[], cellSize: number): WorldLamp[] {
  const lamps: WorldLamp[] = [];
  for (const obj of objects) {
    if (!obj.lights || obj.lights.length === 0) continue;
    const isBuilding = obj.pack === "Models";
    const fitScale = isBuilding
      ? (_buildingFitCache.get(`/models/${obj.pack}/${obj.model}.glb`) || cellSize)
      : (obj.pack === "props" ? (obj.scale || 1) : cellSize);
    const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;

    const tilePos = new THREE.Vector3(obj.position[0], obj.position[1], obj.position[2]);
    const tileEuler = new THREE.Euler(obj.rotationX || 0, obj.rotation + frontRot, 0, "YXZ");
    const cellKey = `${Math.round(obj.position[0])}_${Math.round(obj.position[2])}`;

    for (let i = 0; i < obj.lights.length; i++) {
      const l = obj.lights[i];
      const hasModel = l.lampModel && l.lampModel !== "none";
      const isDoubleOrCross = l.lampModel?.includes("double") || l.lampModel?.includes("cross");
      const bulbOffset = new THREE.Vector3(
        0,
        hasModel ? 0.63 : 0,
        hasModel ? (isDoubleOrCross ? 0 : -0.17) : 0
      );
      const s = l.scale || 1;
      const rotArr = Array.isArray(l.rotation)
        ? [(l.rotation[0] * Math.PI) / 180, (l.rotation[1] * Math.PI) / 180, (l.rotation[2] * Math.PI) / 180]
        : [0, ((l.rotation || 0) * Math.PI) / 180, 0];
      const lampEuler = new THREE.Euler(rotArr[0], rotArr[1], rotArr[2], "YXZ");

      const p = bulbOffset.clone();
      p.multiplyScalar(s);
      p.applyEuler(lampEuler);
      p.add(new THREE.Vector3(l.position[0], l.position[1], l.position[2]));
      p.multiplyScalar(fitScale);
      p.applyEuler(tileEuler);
      p.add(tilePos);

      // Compute world direction vector of the spotlight beam: pointing straight down for full 360-degree coverage
      const localDir = new THREE.Vector3(0, -1, 0).normalize();
      localDir.applyEuler(lampEuler);
      localDir.applyEuler(tileEuler);
      localDir.normalize();

      const lampId = `${obj.position[0].toFixed(1)}_${obj.position[2].toFixed(1)}_${l.id || i}`;

      lamps.push({
        id: lampId,
        cellKey,
        pos: p,
        dir: localDir,
        intensity: l.intensity ?? 3.5,
        distance: DEFAULT_VISUAL_LIGHT_DISTANCE,
        color: l.color || "#fff8e7",
        angle: Math.PI / 2.5,
        penumbra: 0.35,
      });
    }
  }
  return lamps;
}

function NPCLightIndicator({ npc }: { npc: NPCInstance }) {
  const textRef = useRef<any>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const lastPct = useRef<number>(-1);

  useFrame(() => {
    if (npc.state === "ragdoll") {
      if (textRef.current) textRef.current.visible = false;
      if (sphereRef.current) sphereRef.current.visible = false;
      return;
    }
    if (textRef.current && !textRef.current.visible) textRef.current.visible = true;
    if (sphereRef.current && !sphereRef.current.visible) sphereRef.current.visible = true;

    const pct = Math.round((npc.lightLevel ?? 1) * 100);
    if (pct !== lastPct.current) {
      lastPct.current = pct;
      const isLit = npc.isLit;
      if (textRef.current) {
        textRef.current.text = isLit ? `💡 ${pct}%` : `🌑 ${pct}%`;
        textRef.current.color = isLit ? "#ffea79" : "#8892b0";
        textRef.current.sync?.();
      }
      if (sphereRef.current) {
        const mat = sphereRef.current.material as THREE.MeshBasicMaterial;
        mat.color.set(isLit ? "#ffea79" : "#3b4252");
      }
    }
  });

  return (
    <group position={[0, npc.height + 0.35, 0]}>
      <mesh ref={sphereRef} position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#ffea79" />
      </mesh>
      <Billboard>
        <DreiText
          ref={textRef}
          fontSize={0.24}
          color="#ffea79"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.025}
          outlineColor="#000000"
        >
          {"💡 100%"}
        </DreiText>
      </Billboard>
    </group>
  );
}

/** Axis-aligned box of a model in its own local space, ignoring parent transforms. */
function measureLocalBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const rootInv = _m.copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    geo.computeBoundingBox();
    const local = geo.boundingBox;
    if (!local) return;
    _m.multiplyMatrices(rootInv, mesh.matrixWorld);
    tmp.copy(local).applyMatrix4(_m);
    box.union(tmp);
  });
  return box;
}

/** Flat world-space triangle soup of a rendered subtree (indices implicit). */
function extractWorldTriangles(root: THREE.Object3D): number[] {
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const index = geo.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i++) {
      const vi = index ? index.getX(i) : i;
      v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

function meetsConditions(a: PlacedAttractor, npc: NPCInstance, all: NPCInstance[]): boolean {
  if (!a.conditions || a.conditions.length === 0) return true;
  return a.conditions.some((c) => {
    if (c.npcType && !c.npcType.includes(npc.npcType)) return false;
    if (c.randomChance !== undefined && Math.random() > c.randomChance) return false;
    if (c.minNPCs !== undefined || c.maxNPCs !== undefined) {
      const here = all.filter((n) => n.current.id === a.id).length;
      if (c.minNPCs !== undefined && here < c.minNPCs) return false;
      if (c.maxNPCs !== undefined && here > c.maxNPCs) return false;
    }
    return true;
  });
}

function chooseNext(npc: NPCInstance, map: Map<string, PlacedAttractor>, all: NPCInstance[]): PlacedAttractor | null {
  const options = npc.current.next
    .map((id) => map.get(id))
    .filter((a): a is PlacedAttractor => a !== undefined && a.id !== npc.current.id && meetsConditions(a, npc, all));
  if (options.length > 0) return options[Math.floor(Math.random() * options.length)];
  if (npc.current.manualRouting) return null;

  const walks = [...map.values()].filter((a) =>
    a.type === "walk" && a.id !== npc.current.id &&
    a.cellX === npc.current.cellX && a.cellZ === npc.current.cellZ);
  if (walks.length === 0) return null;

  let best: PlacedAttractor | null = null;
  let bestD = Infinity;
  for (const a of walks) {
    const dx = a.position[0] - npc.pos.x;
    const dz = a.position[2] - npc.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

const WALK_CLIP_SPEED = 1.2; // m/s the Walk clip advances at NPC_BASE_HEIGHT (scale 1) and timeScale 1

function NPCCharacter({ npc }: { npc: NPCInstance }) {
  const { scene, animations } = useGLTF(npc.model);
  const clone = useMemo(() => {
    // A freshly cloned skinned hierarchy has un-updated bone matrixWorlds, so its
    // Box3 height is garbage (orders of magnitude off). Updating the source scene
    // first makes the measurement deterministic, and scaling the clone root is
    // then linear, so rendered height = NPC_BASE_HEIGHT * scale with feet at 0.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    const total = (h > 0 ? NPC_BASE_HEIGHT / h : 1) * npc.scale;
    // SkeletonUtils.clone gives each NPC its own skeleton — plain clone() shares it
    const c = skeletonClone(scene);
    c.scale.setScalar(total);
    c.position.y = -box.min.y * total; // feet on the ground
    c.userData.basePosition = c.position.clone();
    c.userData.baseQuaternion = c.quaternion.clone();
    c.traverse((o) => { o.castShadow = true; });
    return c;
  }, [scene, npc.scale]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of animations) {
      // Quaternius names clips "Armature|Armature|Armature|Idle" — take the last segment
      const name = clip.name.split("|").pop() ?? clip.name;
      if (!map.has(name)) map.set(name, mixer.clipAction(clip));
    }
    return map;
  }, [animations, mixer]);
  const current = useRef<string | null>(null);
  useEffect(() => {
    // The ragdoll system needs the live clone + its bones once the shift to physics happens;
    // mutating the shared npc object avoids re-rendering every NPC on every frame.
    npc.clone = clone;
    npc.mixer = mixer;
    return () => {
      if (npc.clone === clone) npc.clone = undefined;
      if (npc.mixer === mixer) npc.mixer = undefined;
    };
  }, [clone, mixer, npc]);
  useFrame((_, dt) => {
    // Ragdolled NPCs are driven by physics (RagdollSystem.applyToBones); the mixer must not fight it.
    if (npc.state === "ragdoll") return;
    if (clone.userData.basePosition && !clone.position.equals(clone.userData.basePosition)) {
      clone.position.copy(clone.userData.basePosition);
    }
    const target = npc.phase === "move" ? "Walk" : "Idle";
    if (current.current !== target) {
      const next = actions.get(target);
      if (next) {
        next.reset();
        const prev = current.current ? actions.get(current.current) : undefined;
        if (prev) next.crossFadeFrom(prev, 0.25, false);
        next.play();
        current.current = target;
      }
    }
    const walk = actions.get("Walk");
    // Stride length is proportional to the character's height, so at the same
    // ground speed a smaller NPC must take faster steps: cadence ∝ speed/scale.
    // Without npc.scale here tiny characters crawl in slow motion while sliding.
    if (walk) walk.timeScale = npc.speed / (WALK_CLIP_SPEED * Math.max(0.05, npc.scale));
    mixer.update(dt);
  });
  return <primitive object={clone} />;
}

const RAGDOLL_LIFETIME_MS = 15000; // auto-revive so the city never ends up permanently dead
const MAX_RAY_POINTS = 600;

function NPCManager({
  attractors, count, configs, dropAllNonce, reviveAllNonce, breakAccel, breakingEnabled,
  worldLamps, showLightLevels, showLightRays, buildingBoxes, onStatsUpdate,
}: {
  attractors: PlacedAttractor[];
  count: number;
  configs: Record<string, ModelConfig>;
  dropAllNonce: number;
  reviveAllNonce: number;
  breakAccel: number;
  breakingEnabled: boolean;
  worldLamps: WorldLamp[];
  showLightLevels: boolean;
  showLightRays?: boolean;
  buildingBoxes: BuildingBox2D[];
  onStatsUpdate?: (stats: { lit: number; dark: number; total: number; avg: number }) => void;
}) {
  const [npcList, setNpcList] = useState<NPCInstance[]>([]);
  const listRef = useRef<NPCInstance[]>([]);
  const mapRef = useRef<Map<string, PlacedAttractor>>(new Map());
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const debugGeoRef = useRef<THREE.BufferGeometry>(null);
  const rayPositionsBuffer = useMemo(() => new Float32Array(MAX_RAY_POINTS * 3), []);
  const rayColorsBuffer = useMemo(() => new Float32Array(MAX_RAY_POINTS * 3), []);
  const systemRef = useRef<RagdollSystem | null>(null);
  const breakAccelRef = useRef(breakAccel);
  const cityCollidersVersionRef = useRef(-1);
  const lastStatsReportRef = useRef(0);
  breakAccelRef.current = breakAccel;

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const mod = await import("../lib/ragdoll");
        await mod.initRapier();
        if (!disposed) {
          systemRef.current = new mod.RagdollSystem();
          cityCollidersVersionRef.current = -1; // force the first sync on the next frame
        }
      } catch (e) {
        console.warn("[ragdoll] init failed:", e);
      }
    })();
    return () => {
      disposed = true;
      systemRef.current?.dispose();
      systemRef.current = null;
    };
  }, []);

  useEffect(() => {
    // NPCs are rebuilt from scratch here; drop any physics state tied to the old ids.
    systemRef.current?.clearAll();
    const map = new Map(attractors.map((a) => [a.id, a]));
    mapRef.current = map;

    const spawns = attractors.filter((a) => a.type === "spawn");
    const startPool = spawns.length > 0 ? spawns : attractors.filter((a) => a.type === "walk");
    if (startPool.length === 0) {
      listRef.current = [];
      setNpcList([]);
      return;
    }

    const types = Object.values(DEFAULT_NPC_CONFIGS);
    const now = performance.now();
    const created: NPCInstance[] = [];
    for (let i = 0; i < count; i++) {
      const cfg = types[i % types.length];
      const start = startPool[i % startPool.length];
      const model = cfg.model || "/models/characters/cube_guy.glb";
      // Config key is "characters/<file>" — same key the editor writes
      const cfgKey = model.replace("/models/", "").replace(/\.glb$/, "");
      const scale = configs[cfgKey]?.scale || 1;
      created.push({
        id: `npc-${i}`,
        npcType: cfg.type,
        model,
        scale,
        color: cfg.color || "#4a90d9",
        speed: configs[cfgKey]?.speed ?? cfg.speed ?? 1,
        height: NPC_BASE_HEIGHT * scale,
        pos: new THREE.Vector3(start.position[0], start.position[1], start.position[2]),
        rotY: 0,
        current: start,
        target: null,
        phase: "wait",
        waitUntil: now + i * 250,
        state: "alive",
        downSince: 0,
        lightLevel: 1.0,
        isLit: true,
      });
    }
    listRef.current = created;
    setNpcList(created);
  }, [attractors, count, configs]);

  const ragdollNpc = useCallback((npc: NPCInstance, dir?: { x: number; y: number; z: number }, strength = 0) => {
    const system = systemRef.current;
    if (!system || npc.state === "ragdoll" || !npc.clone) return;
    system.removeAlive(npc.id);
    const rag = system.createRagdoll(npc.id, npc.clone, npc.height);
    if (!rag) {
      // Non-humanoid model (or all group slots taken): keep the NPC as a standing collider.
      system.createAlive(npc.id, npc.pos.x, npc.pos.y, npc.pos.z, npc.height);
      return;
    }
    npc.state = "ragdoll";
    npc.downSince = performance.now();
    if (dir && strength > 0) system.applyImpulse(npc.id, dir, strength);
  }, []);

  const reviveNpc = useCallback((npc: NPCInstance) => {
    const system = systemRef.current;
    if (!system || npc.state !== "ragdoll") return;
    system.removeRagdoll(npc.id);
    const map = mapRef.current;
    const spawns = [...map.values()].filter((a) => a.type === "spawn");
    const pool = spawns.length > 0 ? spawns : [...map.values()].filter((a) => a.type === "walk");
    const start = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : npc.current;
    npc.pos.set(start.position[0], start.position[1], start.position[2]);
    npc.current = start;
    npc.target = null;
    npc.rotY = 0;
    npc.phase = "wait";
    npc.waitUntil = performance.now() + 400 + Math.random() * 1200;
    npc.state = "alive";
    npc.lightLevel = 1.0;
    npc.isLit = true;
    npc.mixer?.update(0);
    system.createAlive(npc.id, npc.pos.x, npc.pos.y, npc.pos.z, npc.height);
  }, []);

  useEffect(() => {
    if (!dropAllNonce) return;
    for (const npc of listRef.current) {
      if (npc.state !== "alive") continue;
      const angle = Math.random() * Math.PI * 2;
      ragdollNpc(npc, { x: Math.cos(angle) * 0.3, y: 0.35, z: Math.sin(angle) * 0.3 }, 1.0);
    }
  }, [dropAllNonce, ragdollNpc]);

  useEffect(() => {
    if (!reviveAllNonce) return;
    for (const npc of listRef.current) reviveNpc(npc);
  }, [reviveAllNonce, reviveNpc]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    const list = listRef.current;
    const map = mapRef.current;
    const system = systemRef.current;

    // Sync static building colliders before checking light occlusion
    if (system) {
      const cityVersion = getCityColliderVersion();
      if (cityVersion !== cityCollidersVersionRef.current) {
        cityCollidersVersionRef.current = cityVersion;
        system.syncCityColliders();
      }
    }

    const dayFactor = timeGlobals.dayFactor ?? 1;
    const isNight = timeGlobals.isNight;
    const lampMultiplier = isNight ? 1 : THREE.MathUtils.clamp((0.7 - dayFactor) / 0.3, 0, 1);

    let aliveCount = 0;
    let litCount = 0;
    let totalLightSum = 0;
    const _npcChest = new THREE.Vector3();
    const rayPositions: number[] = [];
    const rayColors: number[] = [];

    for (let i = 0; i < list.length; i++) {
      const npc = list[i];
      const g = groupRefs.current[i];
      if (!g) continue;
      g.visible = _showNPCs;
      if (!_showNPCs) continue;

      if (npc.state === "alive") {
        aliveCount++;
        _npcChest.set(npc.pos.x, 0.9, npc.pos.z);

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
                // 2. Physical 3D Raycast (Honest shadow test against buildings)
                let isOccluded = false;
                let hitDist = d;
                if (system && system.hasBuildingColliders) {
                  const occ = system.checkLightOcclusion(lamp.pos, _npcChest);
                  isOccluded = occ.blocked;
                  if (occ.hitDist != null) hitDist = occ.hitDist;
                } else if (buildingBoxes.length > 0) {
                  isOccluded = isLightOccludedByBuildings(lamp.pos, _npcChest, buildingBoxes);
                }

                const cosInner = Math.cos(lamp.angle * (1 - lamp.penumbra));
                const coneFactor = THREE.MathUtils.clamp((cosTheta - cosOuter) / (cosInner - cosOuter), 0, 1);
                const distFactor = Math.max(0, 1 - d / lamp.distance);
                const intensity = lamp.intensity ?? 3.5;
                const effCone = Math.pow(coneFactor, 0.45);
                const contrib = distFactor * effCone * (intensity / 1.5) * lampMultiplier;

                if (showLightRays && (contrib > 0.04 || isOccluded)) {
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

        const totalLevel = THREE.MathUtils.clamp(dayFactor * 0.95 + lampContribution + 0.03, 0, 1);
        npc.lightLevel = totalLevel;
        npc.isLit = totalLevel >= 0.20;
        if (npc.isLit) litCount++;
        totalLightSum += totalLevel;
      }

      // A ragdolled NPC is positioned in world space by the physics bodies; the group
      // stays frozen so the bone world->local solve in the system remains valid.
      if (npc.state === "ragdoll") continue;

      if (npc.phase === "wait") {
        if (now >= npc.waitUntil) {
          const next = chooseNext(npc, map, list);
          if (next) {
            npc.target = next;
            npc.phase = "move";
          } else {
            npc.waitUntil = now + 2000;
          }
        }
        g.position.copy(npc.pos);
        g.rotation.y = npc.rotY;
        continue;
      }

      if (!npc.target) {
        npc.phase = "wait";
        npc.waitUntil = now + 2000;
        continue;
      }

      _moveDir.set(
        npc.target.position[0] - npc.pos.x,
        0,
        npc.target.position[2] - npc.pos.z
      );
      const dist = _moveDir.length();

      if (dist < 0.06) {
        npc.pos.set(npc.target.position[0], npc.target.position[1], npc.target.position[2]);
        const arrived = npc.target;
        if (arrived.type === "exit") {
          const spawns = [...map.values()].filter((a) => a.type === "spawn");
          const pool = spawns.length > 0 ? spawns : [...map.values()].filter((a) => a.type === "walk");
          if (pool.length > 0) {
            const s = pool[Math.floor(Math.random() * pool.length)];
            npc.pos.set(s.position[0], s.position[1], s.position[2]);
            npc.current = s;
          } else {
            npc.current = arrived;
          }
        } else {
          npc.current = arrived;
        }
        npc.phase = "wait";
        npc.waitUntil = npc.current.type === "wait" || npc.current.type === "activity"
          ? now + (npc.current.duration ?? 2500)
          : now;
      } else {
        _moveDir.normalize();
        npc.pos.addScaledVector(_moveDir, npc.speed * dt);
        
        const targetRotY = Math.atan2(_moveDir.x, _moveDir.z);
        let diff = targetRotY - npc.rotY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.rotY += diff * Math.min(1, dt * 8);
      }

      g.position.copy(npc.pos);
      g.rotation.y = npc.rotY;
    }

    if (!system) return;

    for (const npc of list) {
      if (npc.state === "ragdoll" && now - npc.downSince > RAGDOLL_LIFETIME_MS) reviveNpc(npc);
    }

    for (const npc of list) {
      if (npc.state === "alive") system.createAlive(npc.id, npc.pos.x, npc.pos.y, npc.pos.z, npc.height);
    }

    const { impacts } = system.step(dt, breakingEnabled ? breakAccelRef.current : Number.POSITIVE_INFINITY);
    for (const impact of impacts) {
      const npc = list.find((n) => n.id === impact.npcId);
      if (npc && npc.state === "alive") ragdollNpc(npc, impact.dir, Math.min(1.2, impact.speed));
    }

    if (debugGeoRef.current) {
      if (showLightRays && rayPositions.length > 0) {
        const pointCount = Math.min(rayPositions.length / 3, MAX_RAY_POINTS);
        const posAttr = debugGeoRef.current.attributes.position as THREE.BufferAttribute;
        const colAttr = debugGeoRef.current.attributes.color as THREE.BufferAttribute;
        if (posAttr && colAttr) {
          (posAttr.array as Float32Array).set(rayPositions.slice(0, pointCount * 3));
          (colAttr.array as Float32Array).set(rayColors.slice(0, pointCount * 3));
          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
          debugGeoRef.current.setDrawRange(0, pointCount);
        }
      } else {
        debugGeoRef.current.setDrawRange(0, 0);
      }
    }

    if (now - lastStatsReportRef.current > 250) {
      lastStatsReportRef.current = now;
      if (onStatsUpdate && aliveCount > 0) {
        onStatsUpdate({
          lit: litCount,
          dark: aliveCount - litCount,
          total: aliveCount,
          avg: totalLightSum / aliveCount,
        });
      }
    }
  });

  if (npcList.length === 0) return null;

  return (
    <>
      {npcList.map((npc, i) => (
        <group key={npc.id} ref={(el) => { groupRefs.current[i] = el; }} position={npc.pos}>
          <NPCCharacter npc={npc} />
          {showLightLevels && <NPCLightIndicator npc={npc} />}
        </group>
      ))}
      <lineSegments visible={showLightRays}>
        <bufferGeometry ref={debugGeoRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[rayPositionsBuffer, 3]}
            usage={THREE.DynamicDrawUsage}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[rayColorsBuffer, 3]}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors depthTest={false} depthWrite={false} transparent opacity={0.85} />
      </lineSegments>
    </>
  );
}

function LampMesh({ model }: { model: string }) {
  const gltf = useUncachedGLTF(`/models/props/${model}.glb`);
  const sceneClone = useMemo(() => {
    if (!gltf?.scene) return null;
    return gltf.scene.clone(true);
  }, [gltf]);
  if (!sceneClone) return null;
  return <primitive object={sceneClone} />;
}

export const DEFAULT_VISUAL_LIGHT_DISTANCE = 14.0;

function RoadLampLight({
  light,
  bulbOffset,
  isOn,
  visualDistance = DEFAULT_VISUAL_LIGHT_DISTANCE,
  isDoubleOrCross = false,
}: {
  light: any;
  bulbOffset: [number, number, number];
  isOn: boolean;
  visualDistance?: number;
  isDoubleOrCross?: boolean;
}) {
  const target = useMemo(() => {
    const obj = new THREE.Object3D();
    // Aiming straight down illuminates symmetrically in all directions (street and sidewalks)
    obj.position.set(0, -1, 0);
    return obj;
  }, []);

  const intensity = (light.intensity ?? 3.5) * 3.0;

  return (
    <group position={bulbOffset}>
      <primitive object={target} />
      {isOn && (
        <spotLight
          position={[0, 0, 0]}
          target={target}
          color={light.color || "#fff8e7"}
          intensity={intensity}
          distance={visualDistance}
          angle={Math.PI / 2.5}
          penumbra={0.35}
          decay={1.2}
        />
      )}
      {light.showSphere && (
        <mesh>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial
            color={isOn ? (light.color || "#fff8e7") : "#22252a"}
            emissive={isOn ? (light.color || "#ffea9f") : "#000000"}
            emissiveIntensity={isOn ? 3.5 : 0}
            roughness={isOn ? 0.1 : 0.8}
          />
        </mesh>
      )}
    </group>
  );
}

function RoadModel({
  obj,
  cellSize,
  colliderKey,
  placedLampIds,
  onToggleLamp,
  visualDistance = DEFAULT_VISUAL_LIGHT_DISTANCE,
}: {
  obj: CityObject;
  cellSize: number;
  colliderKey: string;
  placedLampIds: Set<string>;
  onToggleLamp: (id: string) => void;
  visualDistance?: number;
}) {
  const gltf = useUncachedGLTF(`/models/${obj.pack}/${obj.model}.glb`);
  const outerRef = useRef<THREE.Group>(null);
  const colliderRegistered = useRef(false);
  const isBuilding = obj.pack === "Models";

  useFrame(() => {
    const g = outerRef.current;
    if (!g || colliderRegistered.current || !gltf?.scene) return;
    // Force the full subtree world matrices: R3F applies element props in commit, but
    // matrixWorld is only recomputed at render, so measure them ourselves here.
    g.updateWorldMatrix(true, true);
    if (isBuilding) {
      // Exact triangle soup of the facade — ragdolls hit the real geometry, not a box.
      const positions = extractWorldTriangles(g);
      if (positions.length < 9) return;
      colliderRegistered.current = true;
      setCityMeshCollider({ key: colliderKey, positions });
    } else {
      // Measure ONLY the road geometry, not the 5.4m tall street lamps mounted on it
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(_boxSize);
      if (size.x < 1e-4 || size.z < 1e-4) return;
      colliderRegistered.current = true;
      setCityCollider({
        key: colliderKey,
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      });
    }
  });

  useEffect(() => {
    colliderRegistered.current = false;
    return () => {
      colliderRegistered.current = false;
      removeCityCollider(colliderKey);
    };
  }, [colliderKey]);

  useEffect(() => {
    if (!gltf?.scene) return;
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = isBuilding;
        child.receiveShadow = true;
      }
    });
  }, [gltf, isBuilding]);

  if (!gltf) return null;

  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);

  const fitScale = isBuilding ? (() => {
    // Measured once per model in the model's own local space and cached, so a re-render
    // (e.g. the revive-all button, dev sliders) can't re-derive a different scale —
    // measuring through the parent group's stale matrix made buildings grow/shrink.
    const modelUrl = `/models/${obj.pack}/${obj.model}.glb`;
    const cached = _buildingFitCache.get(modelUrl);
    if (cached !== undefined) return cached;
    const box = measureLocalBox(gltf.scene);
    const size = box.getSize(_boxSize);
    const fs = Math.min(cellSize / Math.max(size.x, 1e-6), cellSize / Math.max(size.z, 1e-6));
    if (fs > 0 && fs < 1e4) _buildingFitCache.set(modelUrl, fs);
    return fs;
  })() : obj.pack === "props" ? (obj.scale || 1) : cellSize;

  const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;

  return (
    <group ref={outerRef} position={obj.position}>
      <group rotation={[obj.rotationX || 0, obj.rotation + frontRot, 0]} scale={[fitScale, fitScale, fitScale]}>
        <primitive object={gltf.scene} />
        {obj.lights && obj.lights.map((l, i) => {
          const hasModel = l.lampModel && l.lampModel !== "none";
          const isDoubleOrCross = l.lampModel?.includes("double") || l.lampModel?.includes("cross");
          const bulbOffset: [number, number, number] = hasModel
            ? [0, 0.63, isDoubleOrCross ? 0 : -0.17]
            : [0, 0, 0];
          const rot = Array.isArray(l.rotation)
            ? [(l.rotation[0] * Math.PI) / 180, (l.rotation[1] * Math.PI) / 180, (l.rotation[2] * Math.PI) / 180] as [number, number, number]
            : [0, ((l.rotation || 0) * Math.PI) / 180, 0] as [number, number, number];

          const s = l.scale || 1;
          const lampId = `${obj.position[0].toFixed(1)}_${obj.position[2].toFixed(1)}_${l.id || i}`;
          const isPlaced = placedLampIds.has(lampId);

          // Не спавним фонарь, если алгоритм не выделил это место
          if (!isPlaced) return null;

          return (
            <group
              key={lampId}
              position={[l.position[0], l.position[1], l.position[2]]}
              rotation={rot}
              scale={[s, s, s]}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLamp(lampId);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto";
              }}
            >
              {hasModel && <LampMesh model={l.lampModel!} />}
              <RoadLampLight
                light={l}
                bulbOffset={bulbOffset}
                isOn={true}
                visualDistance={visualDistance}
                isDoubleOrCross={isDoubleOrCross}
              />
              {/* Click target helper */}
              <mesh position={[0, 0.35, isDoubleOrCross ? 0 : -0.07]}>
                <cylinderGeometry args={[0.16, 0.16, 0.75, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          );
        })}
        {obj.connRight && <ConnectionCube position={[0.5, 0.15, 0]} />}
        {obj.connBack && <ConnectionCube position={[0, 0.15, 0.5]} />}
        {obj.connLeft && <ConnectionCube position={[-0.5, 0.15, 0]} />}
        {obj.connFront && <ConnectionCube position={[0, 0.15, -0.5]} />}
      </group>
    </group>
  );
}

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh>;
}

export const timeGlobals = {
  isNight: true,
  hour: 23,
  dayFactor: 0,
};

export function calculateDayFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  // Night shift from 23:00 to 06:00
  if (h >= 23 || h < 5) return 0.0;
  if (h >= 5 && h <= 6) return (h - 5) * 0.15; // subtle predawn ambient glow between 5 and 6
  if (h > 6 && h < 21) return 1.0;
  if (h >= 21 && h < 23) return 1.0 - (h - 21) / 2.0;
  return 0.0;
}

function formatTime(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

import { TimeSystem } from "@/shared/engine/TimeSystem";

function EnvironmentSystem({
  hour,
  autoTime,
  onHourChange,
}: {
  hour: number;
  autoTime: boolean;
  onHourChange: (h: number) => void;
}) {
  const { scene } = useThree();
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const hourRef = useRef(hour);
  const lastReportRef = useRef(performance.now());

  useEffect(() => {
    hourRef.current = hour;
  }, [hour]);

  useFrame((_, dt) => {
    let currentHour = hourRef.current;
    if (autoTime) {
      currentHour = currentHour + dt * 0.4;
      if (currentHour >= 24) currentHour -= 24;
      // Loop night: if it goes past 06:00, wrap back to 23:00
      if (currentHour >= 6 && currentHour < 23) {
        currentHour = 23;
      }
      hourRef.current = currentHour;
      const now = performance.now();
      if (now - lastReportRef.current > 200) {
        lastReportRef.current = now;
        onHourChange(currentHour);
      }
    }

    const factor = calculateDayFactor(currentHour);
    timeGlobals.hour = currentHour;
    timeGlobals.dayFactor = factor;
    // Always night during the 23:00 - 06:00 shift
    timeGlobals.isNight = true;

    // Day: bg #8aa0c8, hemi #cfe8ff/#44506a (0.9), ambient 0.55, dir 1.6
    // Night: bg #0a0e29, hemi #2a3a5a/#0a0e29 (0.4), ambient 0.1, dir 0.2

    scene.background = new THREE.Color().lerpColors(
      new THREE.Color("#0a0e29"),
      new THREE.Color("#8aa0c8"),
      factor
    );

    if (hemiRef.current) {
      hemiRef.current.color.lerpColors(new THREE.Color("#2a3a5a"), new THREE.Color("#cfe8ff"), factor);
      hemiRef.current.groundColor.lerpColors(new THREE.Color("#0a0e29"), new THREE.Color("#44506a"), factor);
      hemiRef.current.intensity = 0.4 + factor * 0.5;
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = 0.1 + factor * 0.45;
    }
    if (dirRef.current) {
      dirRef.current.intensity = 0.2 + factor * 1.4;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} />
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={dirRef}
        position={[20, 30, 15]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
    </>
  );
}

export function CityViewerClient() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [seedInput, setSeedInput] = useState(() => String(seed));
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const [isDev, setIsDev] = useState(false);
  const [dropAllNonce, setDropAllNonce] = useState(0);
  const [reviveAllNonce, setReviveAllNonce] = useState(0);
  const [breakAccel, setBreakAccel] = useState(600);
  const [breakingEnabled, setBreakingEnabled] = useState(false);
  const [timeHour, setTimeHour] = useState(23);
  const [autoTime, setAutoTime] = useState(false);
  const [showLightLevels, setShowLightLevels] = useState(_showLightLevels);
  const [showLightRays, setShowLightRays] = useState(() => _showLightRays);
  const [lightStats, setLightStats] = useState({ lit: 0, dark: 0, total: 0, avg: 1 });

  useEffect(() => {
    setIsDev(process.env.NODE_ENV === "development");
  }, []);

  const fetchConfigs = useCallback(() => {
    fetch("/api/model-configs")
      .then((r) => r.json())
      .then((data) => {
        if (data.configs) setModelConfigs(data.configs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const { objects, attractors } = useMemo(() => {
    const origRandom = Math.random;
    Math.random = createSeededRandom(seed);
    try {
      const generator = new CityGenerator(DEFAULT_CONFIG, modelConfigs);
      const objs = generator.generate();
      return { objects: objs, attractors: generator.attractors };
    } finally {
      Math.random = origRandom;
    }
  }, [seed, modelConfigs]);

  const [lampVisualDistance, setLampVisualDistance] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nw_lampVisualDistance");
      if (saved) {
        const val = Number(saved);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return DEFAULT_VISUAL_LIGHT_DISTANCE;
  });

  const worldLamps = useMemo(() => {
    return extractWorldLamps(objects, DEFAULT_CONFIG.cellSize);
  }, [objects]);

  const buildingBoxes = useMemo(() => {
    return extractBuildingBoxes(objects, DEFAULT_CONFIG.cellSize);
  }, [objects]);

  type PlacementMode = "greedy" | "intersection" | "path" | "all" | "none" | "custom";
  const [placementMode, setPlacementMode] = useState<PlacementMode>("greedy");
  const [placedLampIds, setPlacedLampIds] = useState<Set<string>>(() => new Set());

  const applyPlacement = useCallback(
    (mode: PlacementMode) => {
      setPlacementMode(mode);
      if (mode === "greedy") {
        setPlacedLampIds(greedySetCoverLamps(worldLamps, attractors, buildingBoxes));
      } else if (mode === "intersection") {
        setPlacedLampIds(intersectionFirstLamps(worldLamps, objects, attractors, buildingBoxes, DEFAULT_CONFIG.cellSize));
      } else if (mode === "path") {
        setPlacedLampIds(criticalPathLamps(worldLamps, attractors, buildingBoxes));
      } else if (mode === "all") {
        setPlacedLampIds(new Set(worldLamps.map((l) => l.id)));
      } else if (mode === "none") {
        setPlacedLampIds(new Set());
      }
    },
    [worldLamps, attractors, objects, buildingBoxes]
  );

  const toggleLampPlacement = useCallback((id: string) => {
    setPlacementMode("custom");
    setPlacedLampIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Recalculate lamp placement when city or algorithm changes
  useEffect(() => {
    if (worldLamps.length > 0) {
      applyPlacement(placementMode);
    }
  }, [worldLamps, attractors, objects, buildingBoxes]);

  const activeWorldLamps = useMemo(() => {
    return worldLamps.filter((l) => placedLampIds.has(l.id));
  }, [worldLamps, placedLampIds]);

  const roadCount = objects.filter((o) => o.pack === "roads").length;
  const buildingCount = objects.filter((o) => o.pack === "Models").length;

  const newCity = () => {
    const s = Math.floor(Math.random() * 100000);
    setSeed(s);
    setSeedInput(String(s));
  };

  const onSeedInput = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 7);
    setSeedInput(digits);
    if (digits) setSeed(parseInt(digits, 10));
  };

  return (
    <div className="w-full h-screen relative">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={newCity}
          className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-7 py-3.5 rounded-xl hover:bg-white/20 transition-all text-sm font-medium shadow-lg"
        >
          Новый город
        </button>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-white/60">
          <span>{DEFAULT_CONFIG.gridSizeX}x{DEFAULT_CONFIG.gridSizeZ}</span>
          <span className="text-white/40">seed</span>
          <input
            value={seedInput}
            onChange={(e) => onSeedInput(e.target.value)}
            inputMode="numeric"
            className="w-[72px] bg-white/10 rounded px-2 py-0.5 text-white text-xs text-center outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>
      </div>

      {isDev && (
        <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white text-sm min-w-[220px] max-h-[90vh] overflow-y-auto">
          <div className="font-bold mb-3 text-white/80 text-xs uppercase tracking-wider">Dev Tools</div>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={_showConnectors}
              onChange={(e) => {
                _showConnectors = e.target.checked;
                localStorage.setItem("nw_showConnectors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-green-500"
            />
            <span>Show Connectors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={_showAttractors}
              onChange={(e) => {
                _showAttractors = e.target.checked;
                localStorage.setItem("nw_showAttractors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-yellow-400"
            />
            <span>Show Attractors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={_showNPCs}
              onChange={(e) => {
                _showNPCs = e.target.checked;
                localStorage.setItem("nw_showNPCs", String(e.target.checked));
              }}
              className="w-4 h-4 accent-blue-400"
            />
            <span>Show NPCs</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={_showVectors}
              onChange={(e) => {
                _showVectors = e.target.checked;
                localStorage.setItem("nw_showVectors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-blue-600"
            />
            <span>Show Vectors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showLightLevels}
              onChange={(e) => {
                setShowLightLevels(e.target.checked);
                _showLightLevels = e.target.checked;
                localStorage.setItem("nw_showLightLevels", String(e.target.checked));
              }}
              className="w-4 h-4 accent-amber-400"
            />
            <span>Show Light Levels (NPC)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showLightRays}
              onChange={(e) => {
                setShowLightRays(e.target.checked);
                _showLightRays = e.target.checked;
                localStorage.setItem("nw_showLightRays", String(e.target.checked));
              }}
              className="w-4 h-4 accent-amber-500"
            />
            <span>Show Light Rays (Лучи света к NPC)</span>
          </label>

          {/* Time & Lighting Controls */}
          <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold">Ночная смена (23:00 – 06:00)</div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => { setTimeHour(23); setAutoTime(false); }}
                className={`px-1.5 py-1 text-[11px] rounded border transition-colors ${
                  Math.abs(timeHour - 23) < 0.5
                    ? "bg-indigo-500/40 border-indigo-400 text-indigo-100 font-semibold"
                    : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                }`}
              >
                🌙 23:00
              </button>
              <button
                onClick={() => { setTimeHour(2.5); setAutoTime(false); }}
                className={`px-1.5 py-1 text-[11px] rounded border transition-colors ${
                  Math.abs(timeHour - 2.5) < 0.5
                    ? "bg-indigo-500/40 border-indigo-400 text-indigo-100 font-semibold"
                    : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                }`}
              >
                🌌 02:30
              </button>
              <button
                onClick={() => { setTimeHour(5.5); setAutoTime(false); }}
                className={`px-1.5 py-1 text-[11px] rounded border transition-colors ${
                  Math.abs(timeHour - 5.5) < 0.5
                    ? "bg-indigo-500/40 border-indigo-400 text-indigo-100 font-semibold"
                    : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                }`}
              >
                🕯️ 05:30
              </button>
            </div>
            <div className="flex flex-col gap-1 text-[10px] text-white/60">
              <div className="flex justify-between items-center">
                <span>Время: <strong className="text-white font-mono">{formatTime(timeHour)}</strong></span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  🏮 Ночь (Фонари ВКЛ)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={7}
                step={0.25}
                value={timeHour >= 23 ? timeHour - 23 : timeHour + 1}
                onChange={(e) => {
                  const shift = Number(e.target.value);
                  const h = (23 + shift) % 24;
                  setTimeHour(h);
                  setAutoTime(false);
                }}
                className="w-full accent-indigo-400"
              />
              <div className="flex justify-between text-[9px] text-white/40">
                <span>23:00</span>
                <span>02:30</span>
                <span>06:00</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[10px] text-white/60">
              <input
                type="checkbox"
                checked={autoTime}
                onChange={(e) => setAutoTime(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-400"
              />
              <span>Ход ночного времени (23:00 → 06:00)</span>
            </label>

            {/* Visual Light Distance Control */}
            <div className="flex flex-col gap-1 text-[10px] text-white/60 bg-white/5 p-2 rounded-lg border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-amber-200">🏮 Дальность света в игре:</span>
                <span className="text-amber-300 font-mono font-bold">{lampVisualDistance}м</span>
              </div>
              <input
                type="range"
                min={10}
                max={32}
                step={0.5}
                value={lampVisualDistance}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLampVisualDistance(val);
                  localStorage.setItem("nw_lampVisualDistance", String(val));
                }}
                className="w-full accent-amber-400"
              />
              <div className="flex justify-between text-[9px] text-white/40">
                <span>10м</span>
                <span>18м (дефолт)</span>
                <span>32м</span>
              </div>
              <div className="text-[9px] text-white/40 italic">
                * Визуальная дальность рендера. Не влияет на алгоритм расстановки (10.5м).
              </div>
            </div>

            {/* Lamp Placement Controls */}
            <div className="bg-white/5 rounded-lg p-2.5 text-[10px] space-y-2 border border-white/10 mt-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
                  Расстановка фонарей
                </span>
                <span className="font-mono text-xs font-bold text-amber-300">
                  {placedLampIds.size} / {worldLamps.length}
                </span>
              </div>
              <div className="text-[9px] text-white/50 leading-tight">
                Выберите алгоритм расстановки физических фонарей на улицах:
              </div>

              {/* 3 Abstract Algorithm Presets */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => applyPlacement("greedy")}
                  className={`w-full text-left rounded px-2 py-1.5 text-[10px] transition-all flex justify-between items-center border ${
                    placementMode === "greedy"
                      ? "bg-amber-500/30 border-amber-400 text-amber-100 font-semibold shadow-sm"
                      : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>📐</span>
                    <span>1. Жадный Set Cover</span>
                  </span>
                  <span className="text-[9px] text-amber-300/80 font-mono">Минимум ламп</span>
                </button>

                <button
                  onClick={() => applyPlacement("intersection")}
                  className={`w-full text-left rounded px-2 py-1.5 text-[10px] transition-all flex justify-between items-center border ${
                    placementMode === "intersection"
                      ? "bg-amber-500/30 border-amber-400 text-amber-100 font-semibold shadow-sm"
                      : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏛️</span>
                    <span>2. Перекрестки + Ребра</span>
                  </span>
                  <span className="text-[9px] text-amber-300/80 font-mono">Городской</span>
                </button>

                <button
                  onClick={() => applyPlacement("path")}
                  className={`w-full text-left rounded px-2 py-1.5 text-[10px] transition-all flex justify-between items-center border ${
                    placementMode === "path"
                      ? "bg-amber-500/30 border-amber-400 text-amber-100 font-semibold shadow-sm"
                      : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🚶</span>
                    <span>3. Маршруты (Spawn→Exit)</span>
                  </span>
                  <span className="text-[9px] text-amber-300/80 font-mono">Крит. путь</span>
                </button>
              </div>

              {/* Utility actions */}
              <div className="flex gap-1.5 pt-1 border-t border-white/10">
                <button
                  onClick={() => applyPlacement("all")}
                  className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors border ${
                    placementMode === "all"
                      ? "bg-amber-500/30 border-amber-400 text-amber-200"
                      : "bg-white/5 border-white/15 hover:bg-white/10 text-white/60"
                  }`}
                >
                  🌐 Все слоты
                </button>
                <button
                  onClick={() => applyPlacement("none")}
                  className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors border ${
                    placementMode === "none"
                      ? "bg-red-500/30 border-red-400 text-red-200"
                      : "bg-white/5 border-white/15 hover:bg-white/10 text-white/60"
                  }`}
                >
                  🚫 Без фонарей
                </button>
              </div>
            </div>

            {/* Live Stats */}
            <div className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1 border border-white/10 mt-1">
              <div className="text-[10px] uppercase tracking-wider text-amber-300/70 font-semibold mb-1">
                Чувствительность к свету
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">💡 Освещены:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {lightStats.lit} / {lightStats.total} ({lightStats.total > 0 ? Math.round((lightStats.lit / lightStats.total) * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">🌑 В темноте:</span>
                <span className="text-indigo-300 font-mono font-bold">
                  {lightStats.dark} / {lightStats.total} ({lightStats.total > 0 ? Math.round((lightStats.dark / lightStats.total) * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">🏮 Фонарей на карте:</span>
                <span className="text-amber-200 font-mono font-bold">
                  {placedLampIds.size} / {worldLamps.length} ({worldLamps.length > 0 ? Math.round((placedLampIds.size / worldLamps.length) * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Ср. освещенность:</span>
                <span className="text-white font-mono font-bold">{Math.round((lightStats.avg || 0) * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Ragdoll</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDropAllNonce((n) => n + 1)}
                className="flex-1 bg-red-500/20 border border-red-400/40 hover:bg-red-500/30 text-red-200 rounded px-2 py-1 text-xs transition-colors"
              >
                Уронить всех
              </button>
              <button
                onClick={() => setReviveAllNonce((n) => n + 1)}
                className="flex-1 bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500/30 text-emerald-200 rounded px-2 py-1 text-xs transition-colors"
              >
                Поднять всех
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[10px] text-white/50">
              <input
                type="checkbox"
                checked={breakingEnabled}
                onChange={(e) => setBreakingEnabled(e.target.checked)}
                className="w-4 h-4 accent-orange-400"
              />
              <span>Ломать кости</span>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-white/50" style={{ opacity: breakingEnabled ? 1 : 0.4 }}>
              <span>Хрупкость костей: {breakAccel}</span>
              <input
                type="range"
                min={80}
                max={4000}
                step={20}
                value={breakAccel}
                disabled={!breakingEnabled}
                onChange={(e) => setBreakAccel(Number(e.target.value))}
                className="w-full accent-orange-400"
              />
            </label>
          </div>
          <div className="flex gap-2 mt-3 text-[10px] text-white/50 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background: CONNECTOR_COLOR}} />Connection</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background: ATTRACTOR_COLOR}} />Attractor</span>
          </div>
          <div className="mt-3 text-[10px] text-white/50 space-y-1">
            <div>Roads: {roadCount}</div>
            <div>Buildings: {buildingCount}</div>
            <div>Attractors: {attractors.length}</div>
            <div>NPCs: {attractors.length > 0 ? NPC_COUNT : 0}</div>
            <div>Total: {objects.length}</div>
          </div>
        </div>
      )}
      <Canvas camera={{ position: [12, 16, 12], fov: 45 }} shadows>
        <EnvironmentSystem hour={timeHour} autoTime={autoTime} onHourChange={setTimeHour} />
        <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[DEFAULT_CONFIG.gridSizeX * DEFAULT_CONFIG.cellSize, DEFAULT_CONFIG.gridSizeZ * DEFAULT_CONFIG.cellSize]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <Suspense fallback={<Loader />}>
          {objects.map((obj, i) => (
            <RoadModel
              key={`${obj.model}-${i}`}
              obj={obj}
              cellSize={DEFAULT_CONFIG.cellSize}
              colliderKey={`${obj.pack}-${i}`}
              placedLampIds={placedLampIds}
              onToggleLamp={toggleLampPlacement}
              visualDistance={lampVisualDistance}
            />
          ))}
        </Suspense>
        {attractors.map((attr) => (
          <AttractorCube key={attr.id} attr={attr} />
        ))}
        {attractors.map((attr) => (
          <VectorArrows key={`v-${attr.id}`} attr={attr} />
        ))}
        <Suspense fallback={null}>
          <NPCManager
            attractors={attractors}
            count={NPC_COUNT}
            configs={modelConfigs}
            dropAllNonce={dropAllNonce}
            reviveAllNonce={reviveAllNonce}
            breakAccel={breakAccel}
            breakingEnabled={breakingEnabled}
            worldLamps={activeWorldLamps}
            showLightLevels={showLightLevels}
            showLightRays={showLightRays}
            buildingBoxes={buildingBoxes}
            onStatsUpdate={setLightStats}
          />
        </Suspense>
        <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
