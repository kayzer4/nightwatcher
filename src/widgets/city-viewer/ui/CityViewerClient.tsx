"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import { createSeededRandom } from "@/shared/hooks/useCityGenerator";
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
  pos: THREE.Vector3;
  rotY: number;
  current: PlacedAttractor;
  target: PlacedAttractor | null;
  phase: "move" | "wait";
  waitUntil: number;
}
const _moveDir = new THREE.Vector3();

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
  useFrame((_, dt) => {
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

function NPCManager({ attractors, count, configs }: { attractors: PlacedAttractor[]; count: number; configs: Record<string, ModelConfig> }) {
  const [npcList, setNpcList] = useState<NPCInstance[]>([]);
  const listRef = useRef<NPCInstance[]>([]);
  const mapRef = useRef<Map<string, PlacedAttractor>>(new Map());
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => {
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
      created.push({
        id: `npc-${i}`,
        npcType: cfg.type,
        model,
        scale: configs[cfgKey]?.scale || 1,
        color: cfg.color || "#4a90d9",
        speed: configs[cfgKey]?.speed ?? cfg.speed ?? 1,
        pos: new THREE.Vector3(start.position[0], start.position[1], start.position[2]),
        rotY: 0,
        current: start,
        target: null,
        phase: "wait",
        waitUntil: now + i * 250,
      });
    }
    listRef.current = created;
    setNpcList(created);
  }, [attractors, count, configs]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    const list = listRef.current;
    const map = mapRef.current;

    for (let i = 0; i < list.length; i++) {
      const npc = list[i];
      const g = groupRefs.current[i];
      if (!g) continue;
      g.visible = _showNPCs;
      if (!_showNPCs) continue;

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
        npc.rotY = Math.atan2(_moveDir.x, _moveDir.z);
      }

      g.position.copy(npc.pos);
      g.rotation.y = npc.rotY;
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

function RoadModel({ obj, cellSize }: { obj: CityObject; cellSize: number }) {
  const gltf = useUncachedGLTF(`/models/${obj.pack}/${obj.model}.glb`);
  if (!gltf) return null;

  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);

  const isBuilding = obj.pack === "Models";

  const fitScale = isBuilding ? (() => {
    // Deterministic box: matrixWorld must reflect scale(1,1,1) first, otherwise
    // every re-render (e.g. any state change) measures a stale scale and resizes
    // the building — same trap as the skinned NPC measurement.
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    return Math.min(cellSize / size.x, cellSize / size.z);
  })() : cellSize;

  const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;

  return (
    <group position={obj.position}>
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
        <color attach="background" args={["#1a1a2e"]} />
        <ambientLight intensity={0.15} />
        <directionalLight position={[20, 30, 15]} intensity={0.5} castShadow />
        <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[DEFAULT_CONFIG.gridSizeX * DEFAULT_CONFIG.cellSize, DEFAULT_CONFIG.gridSizeZ * DEFAULT_CONFIG.cellSize]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <Suspense fallback={<Loader />}>
          {objects.map((obj, i) => (
            <RoadModel key={`${obj.model}-${i}`} obj={obj} cellSize={DEFAULT_CONFIG.cellSize} />
          ))}
        </Suspense>
        {attractors.map((attr) => (
          <AttractorCube key={attr.id} attr={attr} />
        ))}
        {attractors.map((attr) => (
          <VectorArrows key={`v-${attr.id}`} attr={attr} />
        ))}
        <Suspense fallback={null}>
          <NPCManager attractors={attractors} count={NPC_COUNT} configs={modelConfigs} />
        </Suspense>
        <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
