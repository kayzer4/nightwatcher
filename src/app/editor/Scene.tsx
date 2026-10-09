"use client";

import { Text as DreiText, Billboard } from "@react-three/drei";
import { useRef, useMemo, useEffect } from "react";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import type { AttractorConfig } from "@/shared/engine/CityGenerator";
import { ATTRACTOR_COLORS, DIRECTION_DEGREES, NPC_BASE_HEIGHT } from "@/shared/engine/CityGenerator";

type Side = "left" | "right" | "front" | "back";
const SIDE_COLORS: Record<Side, string> = { left: "#1677ff", right: "#52c41a", front: "#ff4d4f", back: "#722ed1" };
const SIDE_OFFSETS: Record<Side, [number, number, number]> = { left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, -1], back: [0, 0, 1] };
const SIDE_ROTATIONS: Record<Side, number> = { left: Math.PI / 2, right: -Math.PI / 2, front: 0, back: Math.PI };

const snapFrac = (v: number) => Math.min(0.5, Math.max(-0.5, Math.round(v * 20) / 20));

function Label({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
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
      <mesh position={[0, 0.01, -1.8]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.06, 0.2, 4]} /><meshStandardMaterial color="#ff4d4f" /></mesh>
      <Label position={[0, 0.12, -2.05]} text="-Z" color="#ff4d4f" />
      <mesh position={[1.8, 0.01, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.06, 0.2, 4]} /><meshStandardMaterial color="#52c41a" /></mesh>
      <Label position={[2.05, 0.12, 0]} text="+X" color="#52c41a" />
      <mesh position={[-1.8, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.06, 0.2, 4]} /><meshStandardMaterial color="#1677ff" /></mesh>
      <Label position={[-2.05, 0.12, 0]} text="-X" color="#1677ff" />
      <mesh position={[0, 0.01, 1.8]} rotation={[Math.PI / 2, 0, Math.PI]}><coneGeometry args={[0.06, 0.2, 4]} /><meshStandardMaterial color="#722ed1" /></mesh>
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
        <mesh position={[0, 0, 0.15]}>
          <coneGeometry args={[0.06, 0.18, 3]} />
          <meshStandardMaterial color="#faad14" />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.25, 6]} />
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
        <mesh position={[0, 0, 0.08]}>
          <coneGeometry args={[0.06, 0.18, 3]} />
          <meshStandardMaterial color="#ff4d4f" />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2, 6]} />
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

function AttractorMarkers({ attractors, gridW, gridD, scale, selectedId, onCubeDown }: {
  attractors: AttractorConfig[];
  gridW: number;
  gridD: number;
  scale: number;
  selectedId?: string | null;
  onCubeDown?: (e: ThreeEvent<PointerEvent>, id: string) => void;
}) {
  const world = useMemo(
    () => attractors.map((a) => {
      const s = a.scale ?? 0.05;
      const pos: [number, number, number] = [a.position.x * gridW, (a.position.y + s / 2) / scale, a.position.z * gridD];
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
        const color = ATTRACTOR_COLORS[a.type];
        const selected = selectedId === a.id;
        return (
          <group key={a.id}>
            <mesh
              position={pos}
              onPointerDown={onCubeDown ? (e) => onCubeDown(e, a.id) : undefined}
            >
              <boxGeometry args={[s, s, s]} />
              <meshStandardMaterial color={color} emissive={selected ? color : "#000000"} emissiveIntensity={selected ? 0.5 : 0} />
            </mesh>
            <Label position={[pos[0], pos[1] + s / 2 + 0.1, pos[2]]} text={a.id} color={color} />
            {selected && dirs.map((d) => (
              <DirRay key={`${a.id}-d${d}`} ox={pos[0]} oy={pos[1]} oz={pos[2]} dirDeg={d} len={rayLen}
                color={(a.crossingDirections ?? []).includes(d) ? "#52c41a" : "#1677ff"} />
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
  mode?: "road" | "building" | "character";
  attractors?: AttractorConfig[];
  placing?: boolean;
  selectedId?: string | null;
  onPlace?: (x: number, z: number) => void;
  onMove?: (id: string, x: number, z: number) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string | null) => void;
  animName?: string | null;
  animPlaying?: boolean;
  animSpeed?: number;
  animKey?: number;
  onAnimations?: (names: string[]) => void;
}

export function EditorScene({
  selectedModel, selectedPack, rotation, scale, offsetY, gridW, gridD,
  connectLeft, connectRight, connectFront, connectBack,
  frontDir = "none", actualHeight = 1, actualWidth = 1, actualDepth = 1,
  foundation = "none", foundationScale = 1, foundationOffsetY = 0,
  mode = "road", attractors = [],
  placing = false, selectedId = null, onPlace, onMove, onDelete, onSelect,
  animName = null, animPlaying = true, animSpeed = 1, animKey = 0, onAnimations,
}: SceneProps) {
  const url = selectedModel ? `/models/${selectedPack}/${selectedModel}.glb` : "";
  const { gl, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const downRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const canvasDownRef = useRef(false);
  const movedRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const placeRef = useRef<{ x: number; z: number } | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hitPoint = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    gl.domElement.style.cursor = placing ? "crosshair" : "";
    return () => { gl.domElement.style.cursor = ""; };
  }, [placing, gl]);

  useEffect(() => {
    const el = gl.domElement;
    const onCanvasDown = () => { canvasDownRef.current = true; };
    const onWinMove = (ev: PointerEvent) => {
      const down = downRef.current;
      if (!down) return;
      if (Math.abs(ev.clientX - down.x) + Math.abs(ev.clientY - down.y) > 5) movedRef.current = true;
      if (!placing || dragIdRef.current !== down.id || !movedRef.current) return;
      const a = attractors.find((x) => x.id === down.id);
      if (!a || !groupRef.current || !onMove) return;
      const s = a.scale ?? 0.05;
      dragPlane.constant = -(offsetY + a.position.y + s / 2);
      const rect = el.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
      const local = groupRef.current.worldToLocal(hitPoint.clone());
      onMove(down.id, snapFrac(local.x / gridW), snapFrac(local.z / gridD));
    };
    const onWinUp = (ev: PointerEvent) => {
      const onCanvas = canvasDownRef.current;
      const down = downRef.current;
      const moved = movedRef.current;
      const place = placeRef.current;
      canvasDownRef.current = false;
      downRef.current = null;
      dragIdRef.current = null;
      movedRef.current = false;
      placeRef.current = null;
      if (!onCanvas || moved) return;
      if (down?.id === "place") {
        if (placing && place && !ev.shiftKey) onPlace?.(place.x, place.z);
        return;
      }
      if (down && placing && ev.shiftKey) {
        onDelete?.(down.id);
        onSelect?.(null);
        return;
      }
      onSelect?.(down ? down.id : null);
    };
    el.addEventListener("pointerdown", onCanvasDown);
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    return () => {
      el.removeEventListener("pointerdown", onCanvasDown);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
    };
  }, [placing, gl, camera, attractors, offsetY, gridW, gridD, onPlace, onMove, onDelete, onSelect]);

  const handleCubeDown = (e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    downRef.current = { id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    dragIdRef.current = placing ? id : null;
    movedRef.current = false;
  };

  const handlePlaneDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!groupRef.current) return;
    downRef.current = { id: "place", x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    dragIdRef.current = null;
    movedRef.current = false;
    const local = groupRef.current.worldToLocal(e.point.clone());
    placeRef.current = { x: snapFrac(local.x / gridW), z: snapFrac(local.z / gridD) };
  };

  return (
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
              onCubeDown={handleCubeDown}
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
    </group>
  );
}
