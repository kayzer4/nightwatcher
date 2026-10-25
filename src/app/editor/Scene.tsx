"use client";

import { Text as DreiText, Billboard, TransformControls } from "@react-three/drei";
import { useRef, useMemo, useEffect, useState, useCallback, createContext, useContext } from "react";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import type { AttractorConfig } from "@/shared/engine/CityGenerator";
import type { LightConfig, GizmoMode } from "./constants";
import { parseRotation } from "./constants";
import { ATTRACTOR_COLORS, DIRECTION_DEGREES, NPC_BASE_HEIGHT } from "@/shared/engine/CityGenerator";

type Side = "left" | "right" | "front" | "back";
const SIDE_COLORS: Record<Side, string> = { left: "#1677ff", right: "#52c41a", front: "#ff4d4f", back: "#722ed1" };
const SIDE_OFFSETS: Record<Side, [number, number, number]> = { left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, -1], back: [0, 0, 1] };
const SIDE_ROTATIONS: Record<Side, number> = { left: Math.PI / 2, right: -Math.PI / 2, front: 0, back: Math.PI };

const clampFrac = (v: number) => Math.min(0.5, Math.max(-0.5, Math.round(v * 1000) / 1000));
const snapPlaceFrac = (v: number) => Math.min(0.5, Math.max(-0.5, Math.round(v * 40) / 40));

const LabelsContext = createContext<boolean>(true);

function Label({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  const showLabels = useContext(LabelsContext);
  if (!showLabels) return null;
  return (
    <Billboard position={position}>
      <DreiText fontSize={0.14} color={color} anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">
        {text}
      </DreiText>
    </Billboard>
  );
}

function DirectionArrows() {
  return (
    <group>
      <mesh position={[0, 0.01, -1.8]} rotation={[-Math.PI / 2, 0, 0]}><coneGeometry args={[0.06, 0.2, 16]} /><meshStandardMaterial color="#ff4d4f" /></mesh>
      <Label position={[0, 0.12, -2.05]} text="-Z" color="#ff4d4f" />
      <mesh position={[1.8, 0.01, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.06, 0.2, 16]} /><meshStandardMaterial color="#52c41a" /></mesh>
      <Label position={[2.05, 0.12, 0]} text="+X" color="#52c41a" />
      <mesh position={[-1.8, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.06, 0.2, 16]} /><meshStandardMaterial color="#1677ff" /></mesh>
      <Label position={[-2.05, 0.12, 0]} text="-X" color="#1677ff" />
      <mesh position={[0, 0.01, 1.8]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.06, 0.2, 16]} /><meshStandardMaterial color="#722ed1" /></mesh>
      <Label position={[0, 0.12, 2.05]} text="+Z" color="#722ed1" />
    </group>
  );
}

function GridCell({ gridW, gridD }: { gridW: number; gridD: number }) {
  const planeGeo = useMemo(() => new THREE.PlaneGeometry(gridW, gridD), [gridW, gridD]);
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(planeGeo), [planeGeo]);
  return (
    <group>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={planeGeo}>
        <meshStandardMaterial color="#faad14" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments position={[0, 0.01, 0]} geometry={edgesGeo}>
        <lineBasicMaterial color="#faad14" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

function RoadConnector({ side, active }: { side: Side; active: boolean }) {
  const offset = 1.1;
  let pos: [number, number, number] = [0, 0.015, 0];
  let arrowRot = 0;
  switch (side) {
    case "left":   pos = [-offset, 0.015, 0]; arrowRot = Math.PI / 2; break;
    case "right":  pos = [offset, 0.015, 0];  arrowRot = -Math.PI / 2; break;
    case "front":  pos = [0, 0.015, -offset]; arrowRot = 0; break;
    case "back":   pos = [0, 0.015, offset];  arrowRot = Math.PI; break;
  }
  if (!active) return null;
  return (
    <group>
      <mesh position={pos} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.85, 0.85]} />
        <meshStandardMaterial color="#faad14" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group position={[pos[0], 0.12, pos[2]]} rotation={[0, arrowRot, 0]}>
        <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.16, 16]} />
          <meshStandardMaterial color="#faad14" />
        </mesh>
        <mesh position={[0, 0, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 16]} />
          <meshStandardMaterial color="#faad14" />
        </mesh>
      </group>
      <Label position={[pos[0], 0.28, pos[2]]} text="ДОРОГА" color="#faad14" />
    </group>
  );
}

function FrontSideIndicator({ frontDir, rotation }: { frontDir: "left" | "right" | "front" | "back" | "none"; rotation: number }) {
  if (frontDir === "none") return null;

  const offset = 0.55;
  const basePos = SIDE_OFFSETS[frontDir];
  const wallPos: [number, number, number] = [basePos[0] * offset, 0.4, basePos[2] * offset];

  return (
    <group rotation={[0, rotation, 0]}>
      <mesh position={wallPos} rotation={[0, SIDE_ROTATIONS[frontDir], 0]}>
        <planeGeometry args={[0.85, 0.8]} />
        <meshStandardMaterial color="#ff4d4f" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group position={[wallPos[0], 0.85, wallPos[2]]} rotation={[0, SIDE_ROTATIONS[frontDir], 0]}>
        <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.16, 16]} />
          <meshStandardMaterial color="#ff4d4f" />
        </mesh>
        <mesh position={[0, 0, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 16]} />
          <meshStandardMaterial color="#ff4d4f" />
        </mesh>
      </group>
      <Label position={[wallPos[0], 1.05, wallPos[2]]} text="ЛИЦЕВАЯ" color="#ff4d4f" />
    </group>
  );
}

function DimensionBox({ width, height, depth }: { width: number; height: number; depth: number }) {
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)), [width, height, depth]);

  const labels: { pos: [number, number, number]; text: string; color: string }[] = [
    { pos: [width / 2 + 0.15, height / 2, 0], text: `W:${width.toFixed(1)}`, color: "#52c41a" },
    { pos: [0, height + 0.15, 0], text: `H:${height.toFixed(1)}`, color: "#1677ff" },
    { pos: [0, height / 2, depth / 2 + 0.15], text: `D:${depth.toFixed(1)}`, color: "#722ed1" },
  ];

  return (
    <group position={[0, height / 2, 0]}>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
      </lineSegments>
      {labels.map((l, i) => (
        <Label key={i} position={l.pos} text={l.text} color={l.color} />
      ))}
    </group>
  );
}

function FoundationVisualizer({ type, scale, offsetY, gridW, gridD }: { type: string; scale: number; offsetY: number; gridW: number; gridD: number }) {
  if (type === "none") return null;

  const h = type === "low" ? 0.08 : 0.25;
  const s = scale || 1;
  const w = gridW * s * 1.05;
  const d = gridD * s * 1.05;

  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);

  return (
    <group position={[0, offsetY - h / 2, 0]}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#8c8c8c" transparent opacity={0.5} wireframe />
      </mesh>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#faad14" transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

function PreviewModel({ url, onFit }: { url: string; onFit?: (pos: [number, number, number], target: [number, number, number]) => void }) {
  const gltf = useUncachedGLTF(url);
  const calledFit = useRef(false);
  if (!gltf) return null;
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);
  if (!calledFit.current && onFit) {
    calledFit.current = true;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;
    onFit([dist, dist * 0.8, dist], [center.x, center.y, center.z]);
  }
  return <primitive object={gltf.scene} />;
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

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="yellow" wireframe /></mesh>;
}

// Normalizes the character to NPC_BASE_HEIGHT (feet on ground), then plays the
// selected clip on a per-preview mixer; parent group applies config scale/offsetY.
function CharacterPreview({ url, rotation, animName, animPlaying, animSpeed, animKey, onAnimations }: {
  url: string;
  rotation: number;
  animName: string | null;
  animPlaying: boolean;
  animSpeed: number;
  animKey: number;
  onAnimations?: (names: string[]) => void;
}) {
  const gltf = useUncachedGLTF(url);
  const scene = gltf?.scene ?? null;
  const animations = useMemo(() => gltf?.animations ?? [], [gltf]);

  const root = useMemo(() => {
    if (!scene) return null;
    scene.rotation.set(0, 0, 0);
    scene.position.set(0, 0, 0);
    scene.scale.set(1, 1, 1);
    // Deterministic bind pose: without this, fresh skinned hierarchies have
    // un-updated bone matrixWorlds and the Box3 height is garbage.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    const s = h > 0 ? NPC_BASE_HEIGHT / h : 1;
    scene.scale.setScalar(s);
    scene.position.y = -box.min.y * s;
    return scene;
  }, [scene]);

  const mixer = useMemo(() => (root ? new THREE.AnimationMixer(root) : null), [root]);
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>();
    if (!mixer) return map;
    for (const clip of animations) {
      // Quaternius names clips "Armature|Armature|Armature|Idle" — take the last segment
      const name = clip.name.split("|").pop() ?? clip.name;
      if (!map.has(name)) map.set(name, mixer.clipAction(clip));
    }
    return map;
  }, [animations, mixer]);

  useEffect(() => {
    if (actions.size > 0) onAnimations?.([...actions.keys()]);
  }, [actions, onAnimations]);

  const current = useRef<string | null>(null);

  // (Re)start the selected clip — also fires on animKey bump («Сначала»)
  useEffect(() => {
    if (!animName) return;
    const a = actions.get(animName);
    if (!a) return;
    a.reset();
    a.play();
    current.current = animName;
  }, [actions, animName, animKey]);

  useFrame((_, dt) => {
    if (!mixer) return;
    const target = animName && actions.has(animName) ? animName : null;
    if (current.current !== target) {
      const next = target ? actions.get(target) : undefined;
      if (next) {
        next.reset();
        const prev = current.current ? actions.get(current.current) : undefined;
        if (prev) next.crossFadeFrom(prev, 0.2, false);
        next.play();
        current.current = target;
      }
    }
    mixer.timeScale = animPlaying ? animSpeed : 0;
    mixer.update(dt);
  });

  if (!root) return null;
  return <group rotation={[0, rotation, 0]}><primitive object={root} /></group>;
}

function HeightMarker({ height, offsetY }: { height: number; offsetY: number }) {
  const ticks = Math.floor(height / 0.5);
  return (
    <group position={[0.85, offsetY, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, height, 6]} />
        <meshStandardMaterial color="#52c41a" />
      </mesh>
      {Array.from({ length: ticks }, (_, i) => (
        <mesh key={i} position={[0, (i + 1) * 0.5, 0]}>
          <boxGeometry args={[0.08, 0.012, 0.012]} />
          <meshStandardMaterial color="#52c41a" />
        </mesh>
      ))}
      <Label position={[0, height + 0.14, 0]} text={`${height.toFixed(2)}`} color="#52c41a" />
      <Label position={[0, -0.12, 0]} text="рост NPC" color="#52c41a" />
    </group>
  );
}

function DirRay({ ox, oy, oz, dirDeg, len, color }: {
  ox: number; oy: number; oz: number; dirDeg: number; len: number; color: string;
}) {
  const arrow = useMemo(() => {
    const rad = (dirDeg * Math.PI) / 180;
    return new THREE.ArrowHelper(
      new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)),
      new THREE.Vector3(ox, oy, oz),
      len,
      color,
      Math.min(0.14, len * 0.4),
      Math.min(0.07, len * 0.25),
    );
  }, [ox, oy, oz, dirDeg, len, color]);
  useEffect(() => () => { arrow.dispose(); }, [arrow]);
  return <primitive object={arrow} />;
}

function AttractorMarkers({
  attractors,
  gridW,
  gridD,
  scale,
  selectedId,
  isDragging = false,
  onCubeDown,
  registerRef,
}: {
  attractors: AttractorConfig[];
  gridW: number;
  gridD: number;
  scale: number;
  selectedId?: string | null;
  isDragging?: boolean;
  onCubeDown?: (e: ThreeEvent<PointerEvent>, id: string) => void;
  registerRef: (id: string, node: THREE.Group | null) => void;
}) {
  const world = useMemo(
    () =>
      attractors.map((a) => {
        const s = a.scale ?? 0.05;
        const pos: [number, number, number] = [
          a.position.x * gridW,
          (a.position.y + s / 2) / scale,
          a.position.z * gridD,
        ];
        const dirs = a.directions === undefined ? DIRECTION_DEGREES : a.directions;
        return { a, pos, dirs, rayLen: 0.35 * ((gridW + gridD) / 2) };
      }),
    [attractors, gridW, gridD, scale],
  );

  if (!attractors.length) return null;

  return (
    <group>
      {world.map(({ a, pos, dirs, rayLen }) => {
        const s = a.scale ?? 0.05;
        const relativeScale = s / 0.05;
        const color = ATTRACTOR_COLORS[a.type];
        const selected = selectedId === a.id;
        const isSelfDragging = selected && isDragging;
        const [rx, ry, rz] = parseRotation(a.rotation);
        const rotRad: [number, number, number] = [
          (rx * Math.PI) / 180,
          (ry * Math.PI) / 180,
          (rz * Math.PI) / 180,
        ];
        return (
          <group
            key={a.id}
            ref={(node) => registerRef(a.id, node)}
            {...(!isSelfDragging ? {
              position: pos,
              rotation: rotRad,
              scale: [relativeScale, relativeScale, relativeScale] as [number, number, number],
            } : {})}
          >
            <mesh onPointerDown={onCubeDown ? (e) => onCubeDown(e, a.id) : undefined}>
              <boxGeometry args={[0.05, 0.05, 0.05]} />
              <meshStandardMaterial
                color={color}
                emissive={selected ? color : "#000000"}
                emissiveIntensity={selected ? 0.6 : 0}
              />
            </mesh>
            {/* Click target helper for easy picking */}
            <mesh onPointerDown={onCubeDown ? (e) => onCubeDown(e, a.id) : undefined}>
              <boxGeometry args={[0.11, 0.11, 0.11]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Label position={[0, 0.025 + 0.1, 0]} text={a.id} color={color} />
            {selected &&
              dirs.map((d) => (
                <DirRay
                  key={`${a.id}-d${d}`}
                  ox={0}
                  oy={0}
                  oz={0}
                  dirDeg={d}
                  len={rayLen}
                  color={(a.crossingDirections ?? []).includes(d) ? "#52c41a" : "#1677ff"}
                />
              ))}
          </group>
        );
      })}
    </group>
  );
}

function PlacementPlane({ gridW, gridD, onDown }: { gridW: number; gridD: number; onDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(gridW, gridD), [gridW, gridD]);
  return (
    <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geo} onPointerDown={onDown}>
      <meshBasicMaterial color="#faad14" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function MovableLamp({
  light,
  isSelected,
  isDragging = false,
  onSelect,
  registerRef,
}: {
  light: LightConfig;
  isSelected: boolean;
  isDragging?: boolean;
  onSelect: () => void;
  registerRef: (id: string, node: THREE.Group | null) => void;
}) {
  const hasModel = light.lampModel && light.lampModel !== "none";
  const isDoubleOrCross = light.lampModel?.includes("double") || light.lampModel?.includes("cross");
  const bulbOffset: [number, number, number] = hasModel
    ? [0, 0.62, isDoubleOrCross ? 0 : -0.15]
    : [0, 0, 0];

  const [rx, ry, rz] = parseRotation(light.rotation);
  const rotRad: [number, number, number] = [
    (rx * Math.PI) / 180,
    (ry * Math.PI) / 180,
    (rz * Math.PI) / 180,
  ];
  const s = light.scale || 1;
  const isSelfDragging = isSelected && isDragging;

  return (
    <group
      ref={(node) => registerRef(light.id, node)}
      {...(!isSelfDragging ? {
        position: [light.position[0], light.position[1], light.position[2]] as [number, number, number],
        rotation: rotRad,
        scale: [s, s, s] as [number, number, number],
      } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Invisible hit cylinder to make picking easy even on thin poles */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.85, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection ring on ground */}
      {isSelected && (
        <group position={[0, 0.015, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.12, 0.16, 32]} />
            <meshBasicMaterial color="#faad14" side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.12, 32]} />
            <meshBasicMaterial color="#faad14" transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {/* 3D Lamp Mesh or fallback */}
      {hasModel ? (
        <LampMesh model={light.lampModel!} />
      ) : (
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={light.color} emissive={light.color} emissiveIntensity={0.6} wireframe={!isSelected} />
        </mesh>
      )}

      {/* Bulb & light source */}
      <group position={bulbOffset}>
        <pointLight color={light.color} intensity={light.intensity} distance={light.distance} />
        {light.showSphere && (
          <mesh>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color={light.color} />
          </mesh>
        )}
      </group>
    </group>
  );
}

interface SceneProps {
  selectedModel: string;
  selectedPack: string;
  rotation: number;
  scale: number;
  offsetY: number;
  gridW: number;
  gridD: number;
  connectLeft: boolean;
  connectRight: boolean;
  connectFront: boolean;
  connectBack: boolean;
  frontDir?: "left" | "right" | "front" | "back" | "none";
  actualHeight?: number;
  actualWidth?: number;
  actualDepth?: number;
  foundation?: "none" | "low" | "high";
  foundationScale?: number;
  foundationOffsetY?: number;
  lights?: LightConfig[];
  mode?: "road" | "building" | "character" | "prop";
  attractors?: AttractorConfig[];
  placing?: boolean;
  selectedId?: string | null;
  onPlace?: (x: number, z: number) => void;
  onMove?: (id: string, x: number, y: number, z: number, rotation?: number | [number, number, number], scale?: number) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string | null) => void;
  animName?: string | null;
  animPlaying?: boolean;
  animSpeed?: number;
  animKey?: number;
  onAnimations?: (names: string[]) => void;
  selectedLightId?: string | null;
  onSelectLight?: (id: string | null) => void;
  onUpdateLight?: (id: string, updates: Partial<LightConfig>) => void;
  gizmoMode?: GizmoMode;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  showLabels?: boolean;
}

export function EditorScene({
  selectedModel, selectedPack, rotation, scale, offsetY, gridW, gridD,
  connectLeft, connectRight, connectFront, connectBack,
  frontDir = "none", actualHeight = 1, actualWidth = 1, actualDepth = 1,
  foundation = "none", foundationScale = 1, foundationOffsetY = 0,
  lights = [],
  mode = "road", attractors = [],
  placing = false, selectedId = null, onPlace, onMove, onDelete, onSelect,
  animName = null, animPlaying = true, animSpeed = 1, animKey = 0, onAnimations,
  selectedLightId = null, onSelectLight, onUpdateLight, gizmoMode = "translate",
  onDragStart, onDragEnd,
  showLabels = true,
}: SceneProps) {
  const url = selectedModel ? `/models/${selectedPack}/${selectedModel}.glb` : "";
  const groupRef = useRef<THREE.Group>(null);
  const isDraggingRef = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);

  const lampRefs = useRef<Map<string, THREE.Group>>(new Map());
  const attractorRefs = useRef<Map<string, THREE.Group>>(new Map());

  // Determine active target for root-level TransformControls
  const [activeTarget, setActiveTarget] = useState<THREE.Group | null>(null);

  const registerLampRef = useCallback((id: string, node: THREE.Group | null) => {
    if (node) {
      lampRefs.current.set(id, node);
      if (selectedLightId === id) setActiveTarget(node);
    } else {
      lampRefs.current.delete(id);
      if (selectedLightId === id) setActiveTarget(null);
    }
  }, [selectedLightId]);

  const registerAttractorRef = useCallback((id: string, node: THREE.Group | null) => {
    if (node) {
      attractorRefs.current.set(id, node);
      if (selectedId === id) setActiveTarget(node);
    } else {
      attractorRefs.current.delete(id);
      if (selectedId === id) setActiveTarget(null);
    }
  }, [selectedId]);

  // Synchronize lamp transforms from props when NOT actively dragging
  useEffect(() => {
    if (isDraggingRef.current) return;
    for (const l of lights) {
      const g = lampRefs.current.get(l.id);
      if (g) {
        g.position.set(l.position[0], l.position[1], l.position[2]);
        const [rx, ry, rz] = parseRotation(l.rotation);
        g.rotation.set(
          (rx * Math.PI) / 180,
          (ry * Math.PI) / 180,
          (rz * Math.PI) / 180
        );
        const s = l.scale || 1;
        g.scale.set(s, s, s);
      }
    }
  }, [lights]);

  // Synchronize attractor transforms from props when NOT actively dragging
  useEffect(() => {
    if (isDraggingRef.current) return;
    for (const a of attractors) {
      const g = attractorRefs.current.get(a.id);
      if (g) {
        const s = a.scale ?? 0.05;
        g.position.set(a.position.x * gridW, (a.position.y + s / 2) / scale, a.position.z * gridD);
        const [rx, ry, rz] = parseRotation(a.rotation);
        g.rotation.set(
          (rx * Math.PI) / 180,
          (ry * Math.PI) / 180,
          (rz * Math.PI) / 180
        );
        const relativeScale = s / 0.05;
        g.scale.set(relativeScale, relativeScale, relativeScale);
      }
    }
  }, [attractors, gridW, gridD, scale]);

  useEffect(() => {
    if (selectedLightId) {
      setActiveTarget(lampRefs.current.get(selectedLightId) ?? null);
    } else if (selectedId) {
      setActiveTarget(attractorRefs.current.get(selectedId) ?? null);
    } else {
      setActiveTarget(null);
    }
  }, [selectedLightId, selectedId]);

  const rafId = useRef<number | null>(null);

  const doSyncObjectChange = useCallback(() => {
    if (selectedLightId) {
      const g = lampRefs.current.get(selectedLightId);
      if (!g) return;
      const pos = g.position;
      const degX = Math.round(THREE.MathUtils.radToDeg(g.rotation.x) * 10) / 10;
      const degY = Math.round(THREE.MathUtils.radToDeg(g.rotation.y) * 10) / 10;
      const degZ = Math.round(THREE.MathUtils.radToDeg(g.rotation.z) * 10) / 10;
      const normRot: [number, number, number] = [
        Math.round((((degX % 360) + 360) % 360) * 10) / 10,
        Math.round((((degY % 360) + 360) % 360) * 10) / 10,
        Math.round((((degZ % 360) + 360) % 360) * 10) / 10,
      ];
      const uniformScale = Math.round(Math.max(0.1, (g.scale.x + g.scale.y + g.scale.z) / 3) * 1000) / 1000;
      onUpdateLight?.(selectedLightId, {
        position: [
          Math.round(pos.x * 1000) / 1000,
          Math.round(pos.y * 1000) / 1000,
          Math.round(pos.z * 1000) / 1000,
        ],
        rotation: normRot,
        scale: uniformScale,
      });
    } else if (selectedId) {
      const g = attractorRefs.current.get(selectedId);
      if (!g) return;
      const a = attractors.find((x) => x.id === selectedId);
      const curS = a?.scale ?? 0.05;
      const ax = clampFrac(g.position.x / gridW);
      const ay = Math.round((g.position.y * scale - curS / 2) * 1000) / 1000;
      const az = clampFrac(g.position.z / gridD);
      const degX = Math.round(THREE.MathUtils.radToDeg(g.rotation.x) * 10) / 10;
      const degY = Math.round(THREE.MathUtils.radToDeg(g.rotation.y) * 10) / 10;
      const degZ = Math.round(THREE.MathUtils.radToDeg(g.rotation.z) * 10) / 10;
      const normRot: [number, number, number] = [
        Math.round((((degX % 360) + 360) % 360) * 10) / 10,
        Math.round((((degY % 360) + 360) % 360) * 10) / 10,
        Math.round((((degZ % 360) + 360) % 360) * 10) / 10,
      ];
      const avgScale = (g.scale.x + g.scale.y + g.scale.z) / 3;
      const newScale = Math.round(Math.max(0.01, avgScale * 0.05) * 1000) / 1000;
      onMove?.(selectedId, ax, ay, az, normRot, newScale);
    }
  }, [selectedLightId, selectedId, gridW, scale, gridD, attractors, onUpdateLight, onMove]);

  const handleObjectChange = useCallback(() => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      doSyncObjectChange();
    });
  }, [doSyncObjectChange]);

  const handleDragEnd = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    doSyncObjectChange();
    isDraggingRef.current = false;
    setIsDraggingState(false);
    onDragEnd?.();
  }, [doSyncObjectChange, onDragEnd]);

  const handleCubeDown = (e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    if (e.shiftKey) {
      onDelete?.(id);
      if (selectedId === id) onSelect?.(null);
    } else {
      if (selectedLightId) onSelectLight?.(null);
      onSelect?.(id);
    }
  };

  const handleSelectLamp = (id: string) => {
    if (selectedId) onSelect?.(null);
    onSelectLight?.(id);
  };

  const handlePlaneDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!groupRef.current || !onPlace) return;
    const local = groupRef.current.worldToLocal(e.point.clone());
    onPlace(snapPlaceFrac(local.x / gridW), snapPlaceFrac(local.z / gridD));
  };

  return (
    <LabelsContext.Provider value={showLabels}>
      <group>
      <group scale={[scale, scale, scale]} position={[0, offsetY, 0]}>
        {url ? (
          mode === "character" ? (
            <CharacterPreview
              url={url}
              rotation={rotation}
              animName={animName}
              animPlaying={animPlaying}
              animSpeed={animSpeed}
              animKey={animKey}
              onAnimations={onAnimations}
            />
          ) : (
            <PreviewModel url={url} />
          )
        ) : null}
        {lights.map((l, i) => (
          <MovableLamp
            key={l.id || i}
            light={l}
            isSelected={selectedLightId === l.id}
            isDragging={isDraggingState}
            onSelect={() => handleSelectLamp(l.id)}
            registerRef={registerLampRef}
          />
        ))}
        {mode === "road" && (
          <group rotation={[0, rotation, 0]} ref={groupRef}>
            <RoadConnector side="left" active={connectLeft} />
            <RoadConnector side="right" active={connectRight} />
            <RoadConnector side="front" active={connectFront} />
            <RoadConnector side="back" active={connectBack} />
            <AttractorMarkers
              attractors={attractors}
              gridW={gridW}
              gridD={gridD}
              scale={scale}
              selectedId={selectedId}
              isDragging={isDraggingState}
              onCubeDown={handleCubeDown}
              registerRef={registerAttractorRef}
            />
            {placing && <PlacementPlane gridW={gridW} gridD={gridD} onDown={handlePlaneDown} />}
          </group>
        )}
        {mode === "building" && (
          <group>
            <FrontSideIndicator frontDir={frontDir} rotation={rotation} />
            <DimensionBox width={actualWidth} height={actualHeight} depth={actualDepth} />
            <FoundationVisualizer type={foundation} scale={foundationScale} offsetY={foundationOffsetY} gridW={gridW} gridD={gridD} />
          </group>
        )}
      </group>
      {mode === "character" ? (
        <>
          <GridCell gridW={2} gridD={2} />
          <HeightMarker height={NPC_BASE_HEIGHT * scale} offsetY={offsetY} />
        </>
      ) : (
        <GridCell gridW={gridW} gridD={gridD} />
      )}
      <DirectionArrows />

      {/* Root-level TransformControls: NO double-scale or offset drift, 100% exact alignment */}
      {activeTarget && (
        <TransformControls
          object={activeTarget}
          mode={gizmoMode}
          space={gizmoMode === "rotate" ? "local" : "world"}
          size={0.7}
          showX={true}
          showY={true}
          showZ={true}
          translationSnap={null}
          rotationSnap={null}
          scaleSnap={null}
          onMouseDown={() => {
            isDraggingRef.current = true;
            setIsDraggingState(true);
            onDragStart?.();
          }}
          onMouseUp={handleDragEnd}
          onObjectChange={handleObjectChange}
        />
      )}
    </group>
    </LabelsContext.Provider>
  );
}
