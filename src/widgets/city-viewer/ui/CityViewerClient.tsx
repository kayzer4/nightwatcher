"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
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

const CONNECTOR_COLOR = "#52c41a";
const ATTRACTOR_COLOR = "#fadb14";
const NPC_COUNT = 10;

let _showConnectors = typeof window !== "undefined" && localStorage.getItem("nw_showConnectors") === "true";
let _showAttractors = typeof window !== "undefined" && localStorage.getItem("nw_showAttractors") !== "false";
let _showNPCs = typeof window !== "undefined" && localStorage.getItem("nw_showNPCs") !== "false";
let _showVectors = typeof window !== "undefined" && localStorage.getItem("nw_showVectors") === "true";

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

function NPCManager({
  attractors, count, configs, dropAllNonce, reviveAllNonce, breakAccel, breakingEnabled,
}: {
  attractors: PlacedAttractor[];
  count: number;
  configs: Record<string, ModelConfig>;
  dropAllNonce: number;
  reviveAllNonce: number;
  breakAccel: number;
  breakingEnabled: boolean;
}) {
  const [npcList, setNpcList] = useState<NPCInstance[]>([]);
  const listRef = useRef<NPCInstance[]>([]);
  const mapRef = useRef<Map<string, PlacedAttractor>>(new Map());
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const systemRef = useRef<RagdollSystem | null>(null);
  const breakAccelRef = useRef(breakAccel);
  const cityCollidersVersionRef = useRef(-1);
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

    for (let i = 0; i < list.length; i++) {
      const npc = list[i];
      const g = groupRefs.current[i];
      if (!g) continue;
      g.visible = _showNPCs;
      if (!_showNPCs) continue;
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

    // Reconcile static building/road colliders whenever the registry changed.
    const cityVersion = getCityColliderVersion();
    if (cityVersion !== cityCollidersVersionRef.current) {
      cityCollidersVersionRef.current = cityVersion;
      system.syncCityColliders();
    }

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
  });

  if (npcList.length === 0) return null;

  return (
    <>
      {npcList.map((npc, i) => (
        <group key={npc.id} ref={(el) => { groupRefs.current[i] = el; }} position={npc.pos}>
          <NPCCharacter npc={npc} />
        </group>
      ))}
    </>
  );
}

function RoadModel({ obj, cellSize, colliderKey }: { obj: CityObject; cellSize: number; colliderKey: string }) {
  const gltf = useUncachedGLTF(`/models/${obj.pack}/${obj.model}.glb`);
  const outerRef = useRef<THREE.Group>(null);
  const colliderRegistered = useRef(false);
  const isBuilding = obj.pack === "Models";

  useFrame(() => {
    const g = outerRef.current;
    if (!g || colliderRegistered.current) return;
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
      const box = new THREE.Box3().setFromObject(g);
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
  })() : cellSize;

  const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;

  return (
    <group ref={outerRef} position={obj.position}>
      <group rotation={[obj.rotationX || 0, obj.rotation + frontRot, 0]} scale={[fitScale, fitScale, fitScale]}>
        <primitive object={gltf.scene} />
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

export function CityViewerClient() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [seedInput, setSeedInput] = useState(() => String(seed));
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const [isDev, setIsDev] = useState(false);
  const [dropAllNonce, setDropAllNonce] = useState(0);
  const [reviveAllNonce, setReviveAllNonce] = useState(0);
  const [breakAccel, setBreakAccel] = useState(600);
  const [breakingEnabled, setBreakingEnabled] = useState(false);

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
        <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white text-sm min-w-[200px]">
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
        <color attach="background" args={["#8aa0c8"]} />
        <hemisphereLight args={["#cfe8ff", "#44506a", 0.9]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[20, 30, 15]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={80}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <directionalLight position={[-18, 6, -12]} intensity={0.45} />
        <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[DEFAULT_CONFIG.gridSizeX * DEFAULT_CONFIG.cellSize, DEFAULT_CONFIG.gridSizeZ * DEFAULT_CONFIG.cellSize]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <Suspense fallback={<Loader />}>
          {objects.map((obj, i) => (
            <RoadModel key={`${obj.model}-${i}`} obj={obj} cellSize={DEFAULT_CONFIG.cellSize} colliderKey={`${obj.pack}-${i}`} />
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
          />
        </Suspense>
        <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
