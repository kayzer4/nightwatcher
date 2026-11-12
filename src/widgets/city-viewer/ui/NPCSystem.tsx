"use client";

import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { INITIAL_DISSATISFACTION, updateDissatisfaction } from "@/shared/game-core";
import { DEFAULT_NPC_CONFIGS, NPC_BASE_HEIGHT, type ModelConfig, type PlacedAttractor } from "@/shared/engine/CityGenerator";
import type { RagdollSystem } from "../lib/ragdoll";
import { getCityColliderVersion } from "../lib/city-colliders";
import type { BuildingBox2D } from "../lib/lamp-placement";
import { CitizenLightSystem } from "../lib/CitizenLightSystem";
import type { WorldLamp } from "../lib/world-lamp";
import { timeGlobals } from "./EnvironmentSystem";

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
  dissatisfaction: number;
  isLit: boolean;
  // Populated by NPCCharacter once the skinned clone is ready.
  clone?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
}
const _moveDir = new THREE.Vector3();
function NPCLightIndicator({ npc }: { npc: NPCInstance }) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const lastPct = useRef<number>(-1);
  const label = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    return { canvas, texture, material };
  }, []);
  useEffect(() => () => {
    label.material.dispose();
    label.texture.dispose();
  }, [label]);

  useFrame(() => {
    if (npc.state === "ragdoll") {
      if (spriteRef.current) spriteRef.current.visible = false;
      lastPct.current = -1;
      return;
    }
    if (spriteRef.current) spriteRef.current.visible = true;

    const pct = Math.round((npc.lightLevel ?? 1) * 100);
    const dissatisfaction = Math.round(npc.dissatisfaction * 100);
    const displayKey = pct * 101 + dissatisfaction;
    if (displayKey !== lastPct.current) {
      lastPct.current = displayKey;
      const ctx = label.canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = "rgba(16,20,38,0.82)";
        ctx.fillRect(0, 0, 512, 128);
        ctx.textAlign = "center";
        ctx.font = "bold 34px sans-serif";
        ctx.fillStyle = "#ffea79";
        ctx.fillText(`${npc.id}: свет ${pct}%`, 256, 52);
        ctx.fillStyle = dissatisfaction >= 50 ? "#ff9b8a" : "#ffea79";
        ctx.fillText(`недовольство ${dissatisfaction}%`, 256, 103);
        label.texture.needsUpdate = true;
      }
    }
  });

  return (
    <sprite ref={spriteRef} material={label.material} position={[0, npc.height + 0.35, 0]} scale={[1.1, 0.275, 1]} />
  );
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
const _npcNightMaterials = new WeakMap<THREE.Material, THREE.Material>();

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
    c.traverse((o) => {
      o.castShadow = true;
      // Animated skinned meshes self-shadow noisily under many spotlights.
      // They still cast silhouettes onto streets and buildings.
      o.receiveShadow = false;
      if (o instanceof THREE.Mesh) {
        const addNightVisibility = (source: THREE.Material): THREE.Material => {
          const cached = _npcNightMaterials.get(source);
          if (cached) return cached;
          const material = source.clone();
          if (material instanceof THREE.MeshStandardMaterial) {
            // Use the atlas for the small night glow too; a flat emissive color
            // washes the character texture out in the dark.
            material.emissive.setRGB(0.12, 0.12, 0.12);
            material.emissiveMap = material.map;
            material.emissiveIntensity = 0.45;
            material.metalness = 0;
          }
          _npcNightMaterials.set(source, material);
          return material;
        };
        o.material = Array.isArray(o.material)
          ? o.material.map(addNightVisibility)
          : addNightVisibility(o.material);
      }
    });
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

export function NPCManager({
  attractors, count, configs, dropAllNonce, reviveAllNonce, breakAccel, breakingEnabled,
  worldLamps, showNPCs, showLightLevels, showLightRays, buildingBoxes, onStatsUpdate,
  gameRunning,
}: {
  attractors: PlacedAttractor[];
  count: number;
  configs: Record<string, ModelConfig>;
  dropAllNonce: number;
  reviveAllNonce: number;
  breakAccel: number;
  breakingEnabled: boolean;
  worldLamps: WorldLamp[];
  gameRunning: boolean;
  showNPCs: boolean;
  showLightLevels: boolean;
  showLightRays?: boolean;
  buildingBoxes: BuildingBox2D[];
  onStatsUpdate?: (stats: { lit: number; dark: number; total: number; avg: number; dissatisfaction: number }) => void;
}) {
  const [npcList, setNpcList] = useState<NPCInstance[]>([]);
  const listRef = useRef<NPCInstance[]>([]);
  const mapRef = useRef<Map<string, PlacedAttractor>>(new Map());
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const debugGeoRef = useRef<THREE.BufferGeometry>(null);
  const rayPositionsBuffer = useMemo(() => new Float32Array(MAX_RAY_POINTS * 3), []);
  const rayColorsBuffer = useMemo(() => new Float32Array(MAX_RAY_POINTS * 3), []);
  const systemRef = useRef<RagdollSystem | null>(null);
  const lightingSystem = useRef(new CitizenLightSystem());
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
      // Match CharacterPreview: normalize to NPC_BASE_HEIGHT, then apply the
      // exact scale chosen in the editor.
      const scale = configs[cfgKey]?.scale ?? 1;
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
        dissatisfaction: INITIAL_DISSATISFACTION,
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
    if (!gameRunning) return;

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
    let totalDissatisfaction = 0;
    const _npcChest = new THREE.Vector3();
    const rayPositions: number[] = [];
    const rayColors: number[] = [];

    for (let i = 0; i < list.length; i++) {
      const npc = list[i];
      const g = groupRefs.current[i];
      if (!g) continue;
      g.visible = showNPCs;

      if (npc.state === "alive") {
        aliveCount++;
        _npcChest.set(npc.pos.x, npc.pos.y + npc.height * 0.6, npc.pos.z);

        const lampContribution = lightingSystem.current.sample(
          _npcChest, worldLamps, buildingBoxes, system, lampMultiplier,
          !!showLightRays, rayPositions, rayColors,
        );

        const totalLevel = THREE.MathUtils.clamp(dayFactor * 0.95 + lampContribution + 0.03, 0, 1);
        npc.lightLevel = totalLevel;
        npc.dissatisfaction = updateDissatisfaction(npc.dissatisfaction, totalLevel, dt);
        npc.isLit = totalLevel >= 0.05;
        if (npc.isLit) litCount++;
        totalLightSum += totalLevel;
        totalDissatisfaction += npc.dissatisfaction;
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
          dissatisfaction: totalDissatisfaction / aliveCount,
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
          {showLightLevels && showNPCs && (
            <Suspense fallback={null}><NPCLightIndicator npc={npc} /></Suspense>
          )}
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

