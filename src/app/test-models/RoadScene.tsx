"use client";

import { Text as DreiText, Billboard } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";

type Side = "left" | "right" | "front" | "back";
const SIDE_COLORS: Record<Side, string> = { left: "#1677ff", right: "#52c41a", front: "#ff4d4f", back: "#722ed1" };
const SIDE_OFFSETS: Record<Side, [number, number, number]> = { left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, -1], back: [0, 0, 1] };
const SIDE_ROTATIONS: Record<Side, number> = { left: Math.PI / 2, right: -Math.PI / 2, front: 0, back: Math.PI };

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

  const wallRotation: [number, number, number] = frontDir === "front" || frontDir === "back"
    ? [0, SIDE_ROTATIONS[frontDir], 0]
    : [0, SIDE_ROTATIONS[frontDir], 0];

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
  mode?: "road" | "building";
}

export function RoadScene({
  selectedModel, selectedPack, rotation, scale, offsetY, gridW, gridD,
  connectLeft, connectRight, connectFront, connectBack,
  frontDir = "none", actualHeight = 1, actualWidth = 1, actualDepth = 1,
  foundation = "none", foundationScale = 1, foundationOffsetY = 0,
  mode = "road",
}: SceneProps) {
  const url = selectedModel ? `/models/${selectedPack}/${selectedModel}.glb` : "";
  return (
    <group>
      <group scale={[scale, scale, scale]} position={[0, offsetY, 0]}>
        {url ? <PreviewModel url={url} /> : null}
        {mode === "road" && (
          <group rotation={[0, rotation, 0]}>
            <RoadConnector side="left" active={connectLeft} />
            <RoadConnector side="right" active={connectRight} />
            <RoadConnector side="front" active={connectFront} />
            <RoadConnector side="back" active={connectBack} />
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
      <GridCell gridW={gridW} gridD={gridD} />
      <DirectionArrows />
    </group>
  );
}
