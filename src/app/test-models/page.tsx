"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text as DreiText, Billboard } from "@react-three/drei";
import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import {
  Layout, Select, Slider, Button, Checkbox, Radio, Input, Card,
  Space, Typography, Divider, Tag, ConfigProvider, theme, Row, Col, InputNumber, Switch, Collapse,
} from "antd";
import { DownloadOutlined, SettingOutlined, BuildOutlined, AppstoreOutlined, BulbOutlined, DeploymentUnitOutlined, CloseOutlined } from "@ant-design/icons";

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

type ModelType = "building" | "road" | "tile" | "streetlight" | "other";
type Side = "left" | "right" | "front" | "back";

function detectModelType(name: string): ModelType {
  if (!name) return "other";
  if (name.startsWith("building")) return "building";
  if (name.startsWith("road")) return "road";
  if (name.startsWith("tile")) return "tile";
  if (name.startsWith("streetlight") || name.startsWith("lamp") || name.startsWith("light")) return "streetlight";
  return "other";
}

function getModelTypeLabel(t: ModelType): string {
  return { building: "Здание", road: "Дорога", tile: "Плита", streetlight: "Фонарь", other: "Другое" }[t];
}

function getModelTypeColor(t: ModelType): string {
  return { building: "#1677ff", road: "#faad14", tile: "#52c41a", streetlight: "#fadb14", other: "#666" }[t];
}

const SIDE_LABELS: Record<Side, string> = { left: "Лево (-X)", right: "Право (+X)", front: "Перед (-Z)", back: "Зад (+Z)" };
const SIDE_COLORS: Record<Side, string> = { left: "#1677ff", right: "#52c41a", front: "#ff4d4f", back: "#722ed1" };

const GAME_MODELS = new Set([
  "building-a", "building-b", "building-c", "building-d", "building-e",
  "building-f", "building-g", "building-h", "building-i", "building-j",
  "building-k", "building-l", "building-m", "building-n",
  "building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c",
  "building-skyscraper-d", "building-skyscraper-e",
  "road-straight", "road-bend", "road-crossroad", "road-intersection", "road-end",
  "tile-low", "tile-high", "tile-slant", "tile-slantHigh",
  "streetlight-a", "streetlight-b", "streetlight-c",
]);

function isModelInGame(name: string): boolean {
  return GAME_MODELS.has(name);
}

function isModelConfigured(config: ModelConfig): boolean {
  return config.frontDir !== "none" || config.foundation !== "tile-low" || config.scale !== 0.9;
}

const FOUNDATIONS = [
  { name: "none", label: "Без фундамента", model: "", height: 0 },
  { name: "tile-low", label: "Плита низкая", model: "tile-low", height: 0.02 },
  { name: "tile-high", label: "Плита высокая", model: "tile-high", height: 0.25 },
  { name: "tile-slant", label: "Скошенная", model: "tile-slant", height: 0.27 },
  { name: "tile-slantHigh", label: "Высокая скошенная", model: "tile-slantHigh", height: 0.52 },
  { name: "road-square", label: "Дорожная плита", model: "road-square", height: 0.02 },
  { name: "road-square-barrier", label: "Дорожная с бортиком", model: "road-square-barrier", height: 0.08 },
  { name: "road-bend-square", label: "Угловая плита", model: "road-bend-square", height: 0.02 },
  { name: "road-bend-square-barrier", label: "Угловая с бортиком", model: "road-bend-square-barrier", height: 0.08 },
  { name: "road-curve-pavement", label: "Плита 2x2", model: "road-curve-pavement", height: 0.02 },
];

const ROAD_TYPES = [
  { value: "none", label: "Не дорожная", desc: "Обычный объект", cc: 0 },
  { value: "end", label: "Тупик", desc: "1 соединение", cc: 1 },
  { value: "straight", label: "Прямая", desc: "2 соединения (180°)", cc: 2 },
  { value: "bend", label: "Поворот", desc: "2 соединения (90°)", cc: 2 },
  { value: "intersection", label: "Т-образная", desc: "3 соединения", cc: 3 },
  { value: "crossroad", label: "Перекрёсток", desc: "4 соединения", cc: 4 },
];

interface NeighborEntry {
  model: string;
  rotation: number;
  allowedSides: Side[];
}

interface ModelConfig {
  name: string; pack: string; modelType: ModelType;
  rotation: number; frontDir: "left"|"right"|"front"|"back"|"none";
  height: "low"|"medium"|"tall"|"skyscraper";
  actualHeight: number; actualWidth: number; actualDepth: number;
  foundation: string; foundationScale: number; foundationOffsetY: number;
  gridW: number; gridD: number;
  neighborModelsLeft: NeighborEntry[]; neighborModelsRight: NeighborEntry[];
  neighborModelsFront: NeighborEntry[]; neighborModelsBack: NeighborEntry[];
  roadConnectLeft: boolean; roadConnectRight: boolean; roadConnectFront: boolean; roadConnectBack: boolean;
  roadType: "straight"|"bend"|"intersection"|"crossroad"|"end"|"none"; isTerminal: boolean;
  lightRadius: number; lightColor: string; lightOnByDefault: boolean;
  scale: number; offsetY: number; tags: string[]; notes: string;
}

function getModelColor(name: string): string {
  return getModelTypeColor(detectModelType(name));
}

function ModelPreview({ name }: { name: string }) {
  const color = getModelColor(name);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 24, height: 24, borderRadius: 4, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
        {getModelTypeLabel(detectModelType(name)).charAt(0)}
      </div>
      <span>{name}</span>
    </div>
  );
}

function ModelTag({ name }: { name: string }) {
  const color = getModelColor(name);
  return (
    <Tag style={{ margin: "2px", display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 4, padding: "1px 6px" }}>
      <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: color, color: "#fff", fontSize: 8, fontWeight: 700, textAlign: "center", lineHeight: "14px" }}>
        {getModelTypeLabel(detectModelType(name)).charAt(0)}
      </span>
      {name}
    </Tag>
  );
}

function Label({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  return (
    <Billboard position={position}>
      <DreiText fontSize={0.14} color={color} anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">
        {text}
      </DreiText>
    </Billboard>
  );
}

function FaceIndicator({ dir, rotation }: { dir: string; rotation: number }) {
  if (dir === "none") return null;
  const offset = 0.52;
  let pos: [number, number, number] = [0, 0.5, 0];
  let rot: [number, number, number] = [0, 0, 0];
  switch (dir) {
    case "left":   pos = [-offset, 0.5, 0]; rot = [0, Math.PI / 2, 0]; break;
    case "right":  pos = [offset, 0.5, 0];  rot = [0, -Math.PI / 2, 0]; break;
    case "front":  pos = [0, 0.5, -offset]; rot = [0, 0, 0]; break;
    case "back":   pos = [0, 0.5, offset];  rot = [0, Math.PI, 0]; break;
  }
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshStandardMaterial).opacity = 0.35 + Math.sin(clock.getElapsedTime() * 3) * 0.15;
    }
  });
  return (
    <group rotation={[0, rotation, 0]}>
      <mesh ref={meshRef} position={pos} rotation={rot}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshStandardMaterial color="#ff4d4f" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Label position={[pos[0], pos[1] + 0.65, pos[2]]} text="ЛИЦО" color="#ff4d4f" />
    </group>
  );
}

function GridCell({ gridW, gridD }: { gridW: number; gridD: number }) {
  return (
    <group>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[gridW, gridD]} />
        <meshStandardMaterial color="#1677ff" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments position={[0, 0.01, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(gridW, gridD)]} />
        <lineBasicMaterial color="#1677ff" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

const SIDES: Side[] = ["left", "right", "front", "back"];

function getSidePosition(side: Side, offset: number): [number, number, number] {
  switch (side) {
    case "left":   return [-offset, 0, 0];
    case "right":  return [offset, 0, 0];
    case "front":  return [0, 0, -offset];
    case "back":   return [0, 0, offset];
  }
}

function NeighborCell({ side, isActive, hasModels, onClick }: { side: Side; isActive: boolean; hasModels: boolean; onClick: () => void }) {
  const offset = 1.0;
  const pos = getSidePosition(side, offset);
  const color = isActive ? "#fff" : hasModels ? "#52c41a" : "#3a3a3a";
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = clock.getElapsedTime();
      meshRef.current.position.y = 0.15 + Math.sin(t * 2) * 0.05;
      (meshRef.current.material as THREE.MeshStandardMaterial).opacity = isActive ? 0.5 : 0.25 + Math.sin(t * 3) * 0.1;
    }
  });
  return (
    <group onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh ref={meshRef} position={[pos[0], 0.15, pos[2]]} onPointerOver={(e) => { e.stopPropagation(); (document.body as HTMLElement).style.cursor = "pointer"; }} onPointerOut={() => { (document.body as HTMLElement).style.cursor = "default"; }}>
        <boxGeometry args={[0.9, 0.3, 0.9]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} />
      </mesh>
      <lineSegments position={[pos[0], 0.15, pos[2]]} onPointerOver={(e) => e.stopPropagation()}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.9, 0.3, 0.9)]} />
        <lineBasicMaterial color={color} opacity={isActive ? 1 : 0.8} />
      </lineSegments>
      <Label position={[pos[0], 0.5, pos[2]]} text={isActive ? "▶ ВЫБОР" : hasModels ? "✓ ЕСТЬ" : "СОСЕД"} color={color} />
    </group>
  );
}

function NeighborModelViewer({ url, pack, side, rotation }: { url: string; pack: string; side: Side; rotation: number }) {
  const fullUrl = `/models/${pack}/${url}.glb`;
  const gltf = useUncachedGLTF(fullUrl);
  if (!gltf) return null;
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);
  const offset = 1.0;
  const pos = getSidePosition(side, offset);
  return (
    <group position={[pos[0], 0, pos[2]]} rotation={[0, rotation, 0]}>
      <group scale={[0.8, 0.8, 0.8]}>
        <primitive object={gltf.scene.clone()} />
      </group>
    </group>
  );
}

function RoadConnector({ side, active }: { side: Side; active: boolean }) {
  if (!active) return null;
  const offset = 1.1;
  let pos: [number, number, number] = [0, 0.015, 0];
  let arrowRot = 0;
  switch (side) {
    case "left":   pos = [-offset, 0.015, 0]; arrowRot = Math.PI / 2; break;
    case "right":  pos = [offset, 0.015, 0];  arrowRot = -Math.PI / 2; break;
    case "front":  pos = [0, 0.015, -offset]; arrowRot = 0; break;
    case "back":   pos = [0, 0.015, offset];  arrowRot = Math.PI; break;
  }
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshStandardMaterial).opacity = 0.3 + Math.sin(clock.getElapsedTime() * 4) * 0.15;
    }
  });
  return (
    <group>
      <mesh ref={meshRef} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
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

function DirectionArrows() {
  return (
    <group>
      <mesh position={[0, 0.01, -2.3]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.08, 0.25, 4]} /><meshStandardMaterial color="#ff4d4f" /></mesh>
      <Label position={[0, 0.15, -2.6]} text="-Z Перед" color="#ff4d4f" />
      <mesh position={[2.3, 0.01, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.08, 0.25, 4]} /><meshStandardMaterial color="#52c41a" /></mesh>
      <Label position={[2.6, 0.15, 0]} text="+X Право" color="#52c41a" />
      <mesh position={[-2.3, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.08, 0.25, 4]} /><meshStandardMaterial color="#1677ff" /></mesh>
      <Label position={[-2.6, 0.15, 0]} text="-X Лево" color="#1677ff" />
      <mesh position={[0, 0.01, 2.3]} rotation={[Math.PI / 2, 0, Math.PI]}><coneGeometry args={[0.08, 0.25, 4]} /><meshStandardMaterial color="#722ed1" /></mesh>
      <Label position={[0, 0.15, 2.6]} text="+Z Зад" color="#722ed1" />
      <mesh position={[0, 3, 0]}><coneGeometry args={[0.08, 0.25, 4]} /><meshStandardMaterial color="#eb2f96" /></mesh>
      <Label position={[0, 3.3, 0]} text="+Y Вверх" color="#eb2f96" />
      <mesh position={[0, -0.15, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.08, 0.25, 4]} /><meshStandardMaterial color="#f5222d" /></mesh>
      <Label position={[0, -0.4, 0]} text="-Y Вниз" color="#f5222d" />
    </group>
  );
}

function ModelViewer({ url, config }: { url: string; config: ModelConfig }) {
  const gltf = useUncachedGLTF(url);
  if (!gltf) return null;
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);
  return <group rotation={[0, config.rotation, 0]}><primitive object={gltf.scene} /></group>;
}

function FoundationViewer({ url, scale, offsetY }: { url: string; scale: number; offsetY: number }) {
  if (!url) return null;
  const gltf = useUncachedGLTF(url);
  if (!gltf) return null;
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, offsetY, 0);
  gltf.scene.scale.set(1, 1, 1);
  return <group scale={[scale, 1, scale]}><primitive object={gltf.scene} /></group>;
}

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="yellow" wireframe /></mesh>;
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

function SidePreviewCanvas({ side, hoveredModel, models, packs }: { side: Side; hoveredModel: { name: string; pack: string } | null; models: NeighborEntry[]; packs: { name: string; models: string[] }[] }) {
  const [camPos, setCamPos] = useState<[number, number, number]>([3, 3, 3]);
  const [camTarget, setCamTarget] = useState<[number, number, number]>([0, 0, 0]);
  const url = hoveredModel?.name || (models[0]?.model || "");
  const pack = hoveredModel?.pack || packs.find((p) => p.models.includes(url))?.name || "Models";
  const key = `${side}-${url}-${pack}`;
  if (!url || url === "undefined") return (
    <div style={{ width: "100%", height: 160, display: "flex", alignItems: "center", justifyContent: "center", background: "#111", borderRadius: 8, color: "#555", fontSize: 12, border: "1px solid #303030" }}>
      Наведи на модель
    </div>
  );
  const fullUrl = `/models/${pack}/${url}.glb`;
  return (
    <div style={{ width: "100%", height: 160, background: "#111", borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #303030" }}>
      <Canvas key={key} camera={{ position: camPos, fov: 35 }} style={{ width: "100%", height: "100%" }}>
        <color attach="background" args={["#111"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          <PreviewModel url={fullUrl} onFit={(pos, target) => { setCamPos(pos); setCamTarget(target); }} />
        </Suspense>
        <OrbitControls target={camTarget} enableZoom={false} enablePan={false} />
      </Canvas>
      <div style={{ position: "absolute", bottom: 6, left: 6, fontSize: 11, color: "#aaa", background: "rgba(0,0,0,0.7)", padding: "2px 8px", borderRadius: 4 }}>{url}</div>
    </div>
  );
}

function PreviewCanvas({ url, pack }: { url: string; pack: string }) {
  const [camPos, setCamPos] = useState<[number, number, number]>([3, 3, 3]);
  const [camTarget, setCamTarget] = useState<[number, number, number]>([0, 0, 0]);
  const key = url + pack;
  if (!url || url === "undefined") return <div style={{ width: "100%", height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "#111", borderRadius: 8, color: "#555", fontSize: 12, border: "1px solid #303030" }}>Наведи на модель</div>;
  const fullUrl = `/models/${pack}/${url}.glb`;
  return (
    <div style={{ width: "100%", height: 200, background: "#111", borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #303030" }}>
      <Canvas key={key} camera={{ position: camPos, fov: 35 }} style={{ width: "100%", height: "100%" }}>
        <color attach="background" args={["#111"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          <PreviewModel url={fullUrl} onFit={(pos, target) => { setCamPos(pos); setCamTarget(target); }} />
        </Suspense>
        <OrbitControls target={camTarget} enableZoom={false} enablePan={false} />
      </Canvas>
      <div style={{ position: "absolute", bottom: 6, left: 6, fontSize: 11, color: "#aaa", background: "rgba(0,0,0,0.7)", padding: "2px 8px", borderRadius: 4 }}>{url}</div>
    </div>
  );
}

const DEFAULT_CONFIG: Omit<ModelConfig, "name"|"pack"|"modelType"> = {
  rotation: 0, frontDir: "none", height: "medium", actualHeight: 2, actualWidth: 1, actualDepth: 1,
  foundation: "tile-low", foundationScale: 1, foundationOffsetY: -0.01,
  gridW: 1, gridD: 1,
  neighborModelsLeft: [], neighborModelsRight: [], neighborModelsFront: [], neighborModelsBack: [],
  roadConnectLeft: false, roadConnectRight: false, roadConnectFront: false, roadConnectBack: false,
  roadType: "none", isTerminal: false,
  lightRadius: 3, lightColor: "#fffbe6", lightOnByDefault: true,
  scale: 0.9, offsetY: 0, tags: [], notes: "",
};

export default function ModelTestPage() {
  const [packs, setPacks] = useState<{ name: string; models: string[] }[]>([]);
  const [selectedPack, setSelectedPack] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
  const [gridSize, setGridSize] = useState(16);
  const [showFoundation, setShowFoundation] = useState(true);
  const [hoveredModel, setHoveredModel] = useState<{ name: string; pack: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [editingSide, setEditingSide] = useState<Side | null>(null);
  const [collapseActiveKeys, setCollapseActiveKeys] = useState<string[]>(["select", "transform"]);
  const [hoveredNeighbor, setHoveredNeighbor] = useState<{ model: string; pack: string } | null>(null);
  const [sideHoverModels, setSideHoverModels] = useState<Record<Side, { name: string; pack: string } | null>>({ left: null, right: null, front: null, back: null });
  const [hoveredAllowedSide, setHoveredAllowedSide] = useState<{ side: Side; allowedSide: Side } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHover = useCallback((name: string, pack: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredModel({ name, pack });
  }, []);

  const handleHoverEnd = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setHoveredModel(null), 100);
  }, []);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((data) => {
      setPacks(data);
      if (data.length > 0) { setSelectedPack(data[0].name); if (data[0].models.length) setSelectedModel(data[0].models[0]); }
    }).catch(() => {
      setPacks([
        { name: "Models", models: ["building-a", "building-b", "building-c", "building-d", "building-e", "building-f", "building-g", "building-h", "building-i", "building-j", "building-k", "building-l", "building-m", "building-n", "building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d", "building-skyscraper-e"] },
        { name: "roads", models: ["road-straight", "road-bend", "road-crossroad", "road-intersection", "road-end", "road-square", "tile-low", "tile-high"] },
      ]);
      setSelectedPack("Models"); setSelectedModel("building-a");
    });
    fetch("/api/model-configs").then((r) => r.json()).then((data) => {
      if (data.configs && Object.keys(data.configs).length > 0) {
        setConfigs(data.configs);
        if (data.gridSize) setGridSize(data.gridSize);
      }
    }).catch(() => {});
  }, []);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      fetch("/api/model-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gridSize, configs }),
      }).catch(() => {});
    }, 500);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [configs, gridSize, mounted]);

  const allModels = packs.flatMap((p) => p.models);
  const currentPack = packs.find((p) => p.name === selectedPack);
  const modelUrl = selectedModel ? `/models/${selectedPack}/${selectedModel}.glb` : "";
  const configKey = `${selectedPack}/${selectedModel}`;
  const modelType = detectModelType(selectedModel);

  const getConfig = (): ModelConfig => {
    if (configs[configKey]) return configs[configKey];
    return { name: selectedModel, pack: selectedPack, modelType, ...DEFAULT_CONFIG };
  };

  const updateConfig = (updates: Partial<ModelConfig>) => {
    const current = getConfig();
    setConfigs((prev) => ({ ...prev, [configKey]: { ...current, ...updates } }));
  };

  const getSideModels = (side: Side): NeighborEntry[] => {
    const c = getConfig();
    let raw: string[] | NeighborEntry[];
    switch (side) {
      case "left": raw = c.neighborModelsLeft; break;
      case "right": raw = c.neighborModelsRight; break;
      case "front": raw = c.neighborModelsFront; break;
      case "back": raw = c.neighborModelsBack; break;
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((e: any) => typeof e === "string"
      ? { model: e, rotation: 0, allowedSides: ["left", "right", "front", "back"] as Side[] }
      : { ...e, allowedSides: e.allowedSides || ["left", "right", "front", "back"] as Side[] }
    );
  };

  const setSideModels = (side: Side, entries: NeighborEntry[]) => {
    switch (side) {
      case "left": updateConfig({ neighborModelsLeft: entries }); break;
      case "right": updateConfig({ neighborModelsRight: entries }); break;
      case "front": updateConfig({ neighborModelsFront: entries }); break;
      case "back": updateConfig({ neighborModelsBack: entries }); break;
    }
  };

  const toggleSideModel = (side: Side, modelName: string) => {
    const current = getSideModels(side);
    const exists = current.find((e) => e.model === modelName);
    if (exists) {
      setSideModels(side, current.filter((e) => e.model !== modelName));
    } else {
      setSideModels(side, [...current, { model: modelName, rotation: 0, allowedSides: ["left", "right", "front", "back"] }]);
    }
  };

  const updateSideModelRotation = (side: Side, modelName: string, rotation: number) => {
    const current = getSideModels(side);
    setSideModels(side, current.map((e) => e.model === modelName ? { ...e, rotation } : e));
  };

  const toggleAllowedSide = (side: Side, modelName: string, allowedSide: Side) => {
    const current = getSideModels(side);
    setSideModels(side, current.map((e) => {
      if (e.model !== modelName) return e;
      const has = e.allowedSides.includes(allowedSide);
      return { ...e, allowedSides: has ? e.allowedSides.filter((s) => s !== allowedSide) : [...e.allowedSides, allowedSide] };
    }));
  };

  const allFilteredModels = useMemo(() => {
    return packs.flatMap((p) =>
      p.models.map((m) => ({ name: m, pack: p.name }))
    );
  }, [packs]);

  const getModelChecks = (name: string, pack: string): { label: string; done: boolean }[] => {
    const key = `${pack}/${name}`;
    const cfg = configs[key];
    const mt = detectModelType(name);
    if (mt === "building") {
      return [
        { label: "Лицевая", done: cfg ? cfg.frontDir !== "none" : false },
        { label: "Фундамент", done: cfg ? cfg.foundation !== "tile-low" : false },
        { label: "Высота", done: cfg ? cfg.height !== "medium" : false },
        { label: "Сетка", done: cfg ? cfg.gridW !== 1 || cfg.gridD !== 1 : false },
        { label: "Масштаб", done: cfg ? cfg.scale !== 0.9 : false },
      ];
    }
    if (mt === "road") {
      const cc = cfg ? [cfg.roadConnectLeft, cfg.roadConnectRight, cfg.roadConnectFront, cfg.roadConnectBack].filter(Boolean).length : 0;
      return [
        { label: "Коннекторы", done: cc > 0 },
        { label: "Тип", done: cfg ? cfg.roadType !== "none" : false },
      ];
    }
    if (mt === "streetlight") {
      return [
        { label: "Радиус", done: cfg ? cfg.lightRadius !== 3 : false },
      ];
    }
    return [];
  };

  const configuredCount = allFilteredModels.filter((m) => {
    return getModelChecks(m.name, m.pack).every((c) => c.done);
  }).length;

  const config = getConfig();
  const rotDeg = Math.round((config.rotation * 180) / Math.PI);
  const foundation = FOUNDATIONS.find((f) => f.name === config.foundation) || FOUNDATIONS[0];

  const roadConnectCount = [config.roadConnectLeft, config.roadConnectRight, config.roadConnectFront, config.roadConnectBack].filter(Boolean).length;
  const expectedRoadType = ROAD_TYPES.find((rt) => rt.cc === roadConnectCount && rt.value !== "none");

  const exportConfigs = () => {
    const json = JSON.stringify({ gridSize, configs }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "model-configs.json";     a.click(); URL.revokeObjectURL(url);
  };

  const neighborModelOptions = allModels.map((m) => ({ label: <ModelPreview name={m} />, value: m }));

  const s: React.CSSProperties = { marginBottom: 16 };
  const l: React.CSSProperties = { fontSize: 11, color: "#888", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6, display: "block" };

  if (!mounted) return <div style={{ height: "100vh", background: "#0a0a0a" }} />;

  const typeColor = getModelTypeColor(modelType);
  const typeLabel = getModelTypeLabel(modelType);

  const collapseItems = [
    {
      key: "select",
      label: <span style={{ color: "#fff" }}><AppstoreOutlined /> Выбор модели</span>,
      children: (
        <>
          <div style={s}>
            <label style={l}>Пак</label>
            <Select value={selectedPack} onChange={(v) => { setSelectedPack(v); const pack = packs.find((p) => p.name === v); if (pack?.models.length) setSelectedModel(pack.models[0]); }} options={packs.map((p) => ({ label: `${p.name} (${p.models.length})`, value: p.name }))} style={{ width: "100%" }} />
          </div>
          <div style={s}>
            <label style={l}>Превью</label>
            <div onMouseLeave={handleHoverEnd}>
              <PreviewCanvas url={hoveredModel?.name || selectedModel} pack={hoveredModel?.pack || selectedPack} />
            </div>
          </div>
          <div style={s}>
            <label style={l}>Модель <Tag color={typeColor} style={{ marginLeft: 4 }}>{typeLabel}</Tag></label>
            <Select value={selectedModel} onChange={setSelectedModel} style={{ width: "100%" }} showSearch optionFilterProp="label" optionLabelProp="label"
              options={(currentPack?.models || []).map((m) => {
                const inGame = isModelInGame(m);
                const key = `${selectedPack}/${m}`;
                const cfg = configs[key];
                const configured = cfg && isModelConfigured(cfg);
                return {
                  label: (
                    <div onMouseEnter={() => handleHover(m, selectedPack)} style={{ padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
                      <ModelPreview name={m} />
                      <Tag color={inGame ? "green" : "default"} style={{ marginLeft: "auto", fontSize: 9, lineHeight: "14px", padding: "0 4px", margin: 0 }}>
                        {inGame ? "ИГРА" : "ТЕСТ"}
                      </Tag>
                      {configured && <Tag color="blue" style={{ fontSize: 9, lineHeight: "14px", padding: "0 4px", margin: 0 }}>✓</Tag>}
                    </div>
                  ),
                  value: m,
                };
              })}
            />
          </div>
        </>
      ),
    },
    {
      key: "transform",
      label: <span style={{ color: "#fff" }}><SettingOutlined /> Трансформ</span>,
      children: (
        <>
          <div style={s}>
            <label style={l}>Поворот: {rotDeg}°</label>
            <Slider min={-180} max={180} step={15} value={rotDeg} onChange={(v) => updateConfig({ rotation: (v * Math.PI) / 180 })} marks={{ "-180": "-180°", "-90": "-90°", "0": "0°", "90": "90°", "180": "180°" }} />
            <Row gutter={4} style={{ marginTop: 6 }}>
              {[-180, -90, -45, 0, 45, 90, 180].map((d) => (
                <Col key={d}><Button size="small" type={rotDeg === d ? "primary" : "default"} onClick={() => updateConfig({ rotation: (d * Math.PI) / 180 })}>{d}°</Button></Col>
              ))}
            </Row>
          </div>
          <div style={s}>
            <label style={l}>Масштаб: {config.scale.toFixed(2)}</label>
            <Slider min={0.1} max={2} step={0.05} value={config.scale} onChange={(v) => updateConfig({ scale: v })} />
          </div>
          <div style={s}>
            <label style={l}>Смещение Y: {config.offsetY.toFixed(2)}</label>
            <Slider min={-1} max={2} step={0.05} value={config.offsetY} onChange={(v) => updateConfig({ offsetY: v })} />
            <Row gutter={4} style={{ marginTop: 6 }}>
              {[-0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.5].map((d) => (
                <Col key={d}><Button size="small" type={Math.abs(config.offsetY - d) < 0.025 ? "primary" : "default"} onClick={() => updateConfig({ offsetY: d })}>{d > 0 ? "+" : ""}{d}</Button></Col>
              ))}
            </Row>
          </div>
          <div style={s}>
            <label style={l}>Лицевая сторона (при повороте 0)</label>
            <Radio.Group value={config.frontDir} onChange={(e) => updateConfig({ frontDir: e.target.value })} buttonStyle="solid">
              <Row gutter={[6, 6]}>
                <Col span={8}><Radio.Button value="left" style={{ width: "100%" }}>← Лево</Radio.Button></Col>
                <Col span={8}><Radio.Button value="right" style={{ width: "100%" }}>→ Право</Radio.Button></Col>
                <Col span={8}><Radio.Button value="front" style={{ width: "100%" }}>↓ Перед</Radio.Button></Col>
                <Col span={8}><Radio.Button value="back" style={{ width: "100%" }}>↑ Зад</Radio.Button></Col>
                <Col span={16}><Radio.Button value="none" style={{ width: "100%" }}>— Нет</Radio.Button></Col>
              </Row>
            </Radio.Group>
          </div>
        </>
      ),
    },
  ];

  if (modelType === "building") {
    collapseItems.push({
      key: "building",
      label: <span style={{ color: "#fff" }}><BuildOutlined /> Здание</span>,
      children: (
        <>
          <div style={s}>
            <Row align="middle" justify="space-between">
              <Col><label style={l}>Показать фундамент</label></Col>
              <Col><Switch checked={showFoundation} onChange={setShowFoundation} /></Col>
            </Row>
          </div>
          {showFoundation && (
            <>
              <div style={s}>
                <label style={l}>Тип фундамента</label>
                <Select value={config.foundation} onChange={(v) => updateConfig({ foundation: v })} options={FOUNDATIONS.map((f) => ({ label: f.label, value: f.name }))} style={{ width: "100%" }} />
              </div>
              <div style={s}>
                <label style={l}>Масштаб: {config.foundationScale.toFixed(2)}</label>
                <Slider min={0.5} max={2} step={0.05} value={config.foundationScale} onChange={(v) => updateConfig({ foundationScale: v })} />
              </div>
              <div style={s}>
                <label style={l}>Смещение Y: {config.foundationOffsetY.toFixed(2)}</label>
                <Slider min={-0.5} max={0.5} step={0.01} value={config.foundationOffsetY} onChange={(v) => updateConfig({ foundationOffsetY: v })} />
              </div>
            </>
          )}
          <div style={s}>
            <label style={l}>Высота</label>
            <Radio.Group value={config.height} onChange={(e) => updateConfig({ height: e.target.value })} buttonStyle="solid">
              <Radio.Button value="low">Низкое</Radio.Button>
              <Radio.Button value="medium">Среднее</Radio.Button>
              <Radio.Button value="tall">Высокое</Radio.Button>
              <Radio.Button value="skyscraper">Небоскрёб</Radio.Button>
            </Radio.Group>
          </div>
          <div style={s}>
            <label style={l}>Сетка ячейки</label>
            <Row gutter={16}>
              <Col span={8}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>Ш</Tag><InputNumber min={1} max={4} value={config.gridW} onChange={(v) => updateConfig({ gridW: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
              <Col span={8}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>Г</Tag><InputNumber min={1} max={4} value={config.gridD} onChange={(v) => updateConfig({ gridD: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
            </Row>
          </div>
          <div style={s}>
            <label style={l}>Размеры (Ш/В/Г)</label>
            <Row gutter={8}>
              <Col span={8}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>Ш</Tag><InputNumber min={0.1} max={10} step={0.1} value={config.actualWidth} onChange={(v) => updateConfig({ actualWidth: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
              <Col span={8}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>В</Tag><InputNumber min={0.1} max={10} step={0.1} value={config.actualHeight} onChange={(v) => updateConfig({ actualHeight: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
              <Col span={8}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>Г</Tag><InputNumber min={0.1} max={10} step={0.1} value={config.actualDepth} onChange={(v) => updateConfig({ actualDepth: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
            </Row>
          </div>
        </>
      ),
    });
  }

  if (modelType === "road") {
    collapseItems.push({
      key: "road",
      label: <span style={{ color: "#fff" }}><DeploymentUnitOutlined /> Дорога</span>,
      children: (
        <>
          <div style={s}>
            <label style={l}>Тип дороги</label>
            <Radio.Group value={config.roadType} onChange={(e) => updateConfig({ roadType: e.target.value })} buttonStyle="solid">
              <Row gutter={[4, 4]}>
                {ROAD_TYPES.map((rt) => <Col key={rt.value}><Radio.Button value={rt.value}>{rt.label}</Radio.Button></Col>)}
              </Row>
            </Radio.Group>
            {expectedRoadType && config.roadType !== expectedRoadType.value && (
              <div style={{ marginTop: 6 }}><Tag color="warning">Подсказка: для {roadConnectCount} соединений → «{expectedRoadType.label}»</Tag></div>
            )}
          </div>
          <div style={s}>
            <label style={l}>Коннекторы ({roadConnectCount}/4)</label>
            <Row gutter={[16, 10]}>
              <Col span={12}><Checkbox checked={config.roadConnectLeft} onChange={(e) => updateConfig({ roadConnectLeft: e.target.checked })}>← Лево (-X)</Checkbox></Col>
              <Col span={12}><Checkbox checked={config.roadConnectRight} onChange={(e) => updateConfig({ roadConnectRight: e.target.checked })}>→ Право (+X)</Checkbox></Col>
              <Col span={12}><Checkbox checked={config.roadConnectFront} onChange={(e) => updateConfig({ roadConnectFront: e.target.checked })}>↓ Перед (-Z)</Checkbox></Col>
              <Col span={12}><Checkbox checked={config.roadConnectBack} onChange={(e) => updateConfig({ roadConnectBack: e.target.checked })}>↑ Зад (+Z)</Checkbox></Col>
            </Row>
          </div>
          <div style={s}>
            <Row align="middle" justify="space-between">
              <Col><label style={l}>Конечный узел</label></Col>
              <Col><Switch checked={config.isTerminal} onChange={(v) => updateConfig({ isTerminal: v })} /></Col>
            </Row>
            <Text style={{ fontSize: 11, color: "#666" }}>Тупик = конец цепочки</Text>
          </div>
        </>
      ),
    });
  }

  if (modelType === "streetlight") {
    collapseItems.push({
      key: "streetlight",
      label: <span style={{ color: "#fff" }}><BulbOutlined /> Фонарь</span>,
      children: (
        <>
          <div style={s}>
            <Row align="middle" justify="space-between">
              <Col><label style={l}>Включён по умолчанию</label></Col>
              <Col><Switch checked={config.lightOnByDefault} onChange={(v) => updateConfig({ lightOnByDefault: v })} /></Col>
            </Row>
          </div>
          <div style={s}>
            <label style={l}>Радиус света: {config.lightRadius.toFixed(1)}</label>
            <Slider min={1} max={10} step={0.5} value={config.lightRadius} onChange={(v) => updateConfig({ lightRadius: v })} />
          </div>
          <div style={s}>
            <label style={l}>Цвет света</label>
            <input type="color" value={config.lightColor} onChange={(e) => updateConfig({ lightColor: e.target.value })} style={{ width: "100%", height: 32, border: "1px solid #303030", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
          </div>
        </>
      ),
    });
  }

  collapseItems.push({
    key: "notes",
    label: <span style={{ color: "#fff" }}>Заметки и теги</span>,
    children: (
      <>
        <div style={s}>
          <label style={l}>Теги</label>
          <Select mode="tags" value={config.tags} onChange={(v) => updateConfig({ tags: v })} placeholder="Добавить теги..." style={{ width: "100%" }} />
        </div>
        <div style={s}>
          <label style={l}>Заметки</label>
          <TextArea value={config.notes} onChange={(e) => updateConfig({ notes: e.target.value })} placeholder="Наблюдения..." rows={4} />
        </div>
      </>
    ),
  });

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#1677ff", colorBgContainer: "#1f1f1f", colorBgElevated: "#262626", colorText: "#e8e8e8", colorTextSecondary: "#999", colorBorder: "#303030" } }}>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .hide-scrollbar{scrollbar-width:none}
        *::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
      `}</style>
      <Layout style={{ height: "100vh", background: "#0a0a0a" }}>
        <Sider width={540} theme="dark" className="hide-scrollbar" style={{ background: "#141414", borderRight: "1px solid #303030", overflow: "auto" }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid #303030" }}>
              <Title level={4} style={{ margin: 0, color: "#fff" }}>Инспектор</Title>
              <Space>
                <Tag color={typeColor} style={{ fontSize: 12, padding: "2px 8px" }}>{typeLabel}</Tag>
                <Button type="primary" icon={<DownloadOutlined />} onClick={exportConfigs} style={{ background: "#52c41a", borderColor: "#52c41a" }}>Экспорт</Button>
              </Space>
            </div>
            <Collapse activeKey={collapseActiveKeys} onChange={(keys) => setCollapseActiveKeys(keys as string[])} ghost style={{ background: "transparent" }} items={collapseItems} />
            <Divider style={{ margin: "12px 0" }} />
            <Card size="small" style={{ background: "#1a1a1a", border: "1px solid #303030" }}>
              <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                <Text strong style={{ color: "#fff", fontSize: 13 }}>{config.name}</Text>
                <Space size={4} wrap>
                  <Tag color={isModelInGame(selectedModel) ? "green" : "default"}>{isModelInGame(selectedModel) ? "ИГРА" : "ТЕСТ"}</Tag>
                  <Tag color={typeColor}>{typeLabel}</Tag>
                  <Tag color="blue">Лицо: {config.frontDir}</Tag>
                  <Tag color="cyan">Сетка: {config.gridW}x{config.gridD}</Tag>
                  <Tag color="magenta">Масштаб: {config.scale.toFixed(2)}</Tag>
                </Space>
                {config.tags.length > 0 && <Space size={4} wrap>{config.tags.map((t) => <Tag key={t}>{t}</Tag>)}</Space>}
              </Space>
            </Card>
            <Text style={{ fontSize: 11, color: "#444", marginTop: 10, display: "block" }}>Настроено: {Object.keys(configs).length} моделей | Сетка: {gridSize}x{gridSize}</Text>
          </div>
        </Sider>

        <Content style={{ background: "#0a0a0a", position: "relative" }}>
          <Canvas camera={{ position: [4, 4, 4], fov: 50 }}>
            <color attach="background" args={["#0a0a0a"]} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 5]} intensity={1.2} />
            <pointLight position={[0, 5, 0]} intensity={0.4} color="#4096ff" />
            <Suspense fallback={<Loader />}>
              <group scale={[config.scale, config.scale, config.scale]} position={[0, config.offsetY, 0]}>
                {modelUrl && <ModelViewer url={modelUrl} config={config} />}
              </group>
              {showFoundation && foundation.model && modelType === "building" && (
                <FoundationViewer url={`/models/roads/${foundation.model}.glb`} scale={config.foundationScale} offsetY={config.foundationOffsetY} />
              )}
              <group>
                <GridCell gridW={config.gridW} gridD={config.gridD} />
                <FaceIndicator dir={config.frontDir} rotation={config.rotation} />
                {modelType === "building" && (
                  <group rotation={[0, config.rotation, 0]}>
                    {SIDES.map((side) => (
                      <NeighborCell
                        key={side}
                        side={side}
                        isActive={editingSide === side}
                        hasModels={getSideModels(side).length > 0}
                        onClick={() => setEditingSide(editingSide === side ? null : side)}
                      />
                    ))}
                    {SIDES.map((side) => {
                      const entries = getSideModels(side);
                      const previewRotation = (hoveredAllowedSide && hoveredAllowedSide.side === side)
                        ? (() => {
                            const map: Record<Side, number> = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
                            return map[hoveredAllowedSide.allowedSide];
                          })()
                        : null;
                      const display = hoveredNeighbor && editingSide === side
                        ? { model: hoveredNeighbor.model, pack: hoveredNeighbor.pack, rotation: 0 }
                        : entries.length > 0
                          ? { model: entries[entries.length - 1].model, pack: packs.find((p) => p.models.includes(entries[entries.length - 1].model))?.name || "Models", rotation: previewRotation ?? entries[entries.length - 1].rotation }
                          : null;
                      if (!display) return null;
                      return (
                        <NeighborModelViewer
                          key={`${side}-${display.model}`}
                          url={display.model}
                          pack={display.pack}
                          side={side}
                          rotation={display.rotation}
                        />
                      );
                    })}
                  </group>
                )}
                {modelType === "road" && (
                  <group>
                    <RoadConnector side="left" active={config.roadConnectLeft} />
                    <RoadConnector side="right" active={config.roadConnectRight} />
                    <RoadConnector side="front" active={config.roadConnectFront} />
                    <RoadConnector side="back" active={config.roadConnectBack} />
                  </group>
                )}
                <DirectionArrows />
              </group>
            </Suspense>
            <OrbitControls />
          </Canvas>

          <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.75)", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#aaa", lineHeight: 1.8 }}>
            <div><span style={{ color: "#ff4d4f" }}>■</span> Лицевая сторона</div>
            <div><span style={{ color: "#52c41a" }}>■</span> Соседние ячейки</div>
            <div><span style={{ color: "#faad14" }}>■</span> Дорожные коннекторы</div>
            <div><span style={{ color: "#1677ff" }}>■</span> Занимаемая ячейка</div>
          </div>

          <div style={{ position: "absolute", bottom: 20, left: 20, background: "rgba(0,0,0,0.7)", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#aaa" }}>
            <div><span style={{ color: "#ff4d4f" }}>▼</span> -Z Перед</div>
            <div><span style={{ color: "#52c41a" }}>▶</span> +X Право</div>
            <div><span style={{ color: "#1677ff" }}>◀</span> -X Лево</div>
            <div><span style={{ color: "#722ed1" }}>▲</span> +Z Зад</div>
            <div><span style={{ color: "#eb2f96" }}>▲</span> +Y Вверх</div>
            <div><span style={{ color: "#f5222d" }}>▼</span> -Y Вниз</div>
          </div>

          {modelType === "building" && editingSide && (
            <div style={{ position: "absolute", top: 16, right: 16, width: 360, maxHeight: "calc(100vh - 32px)", overflow: "auto", background: "rgba(20,20,20,0.92)", backdropFilter: "blur(12px)", border: `1px solid ${SIDE_COLORS[editingSide]}60`, borderRadius: 12, padding: 16, zIndex: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: SIDE_COLORS[editingSide] }}>{SIDE_LABELS[editingSide]}</span>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setEditingSide(null)} style={{ color: "#999" }} />
              </div>

              <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden" }}>
                <SidePreviewCanvas
                  side={editingSide}
                  hoveredModel={sideHoverModels[editingSide]}
                  models={getSideModels(editingSide)}
                  packs={packs}
                />
              </div>

              <label style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>Добавить модель</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12, maxHeight: 140, overflow: "auto" }}>
                {allModels.map((m) => {
                  const added = getSideModels(editingSide).some((e) => e.model === m);
                  const mPack = packs.find((p) => p.models.includes(m))?.name || "Models";
                  return (
                    <div
                      key={m}
                      onClick={() => toggleSideModel(editingSide, m)}
                      onMouseEnter={() => { setSideHoverModels((prev) => ({ ...prev, [editingSide]: { name: m, pack: mPack } })); setHoveredNeighbor({ model: m, pack: mPack }); }}
                      onMouseLeave={() => { setSideHoverModels((prev) => ({ ...prev, [editingSide]: null })); setHoveredNeighbor(null); }}
                      style={{
                        padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                        background: added ? "#52c41a20" : "#1a1a1a",
                        border: added ? "1px solid #52c41a60" : "1px solid #303030",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: getModelColor(m), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {getModelTypeLabel(detectModelType(m)).charAt(0)}
                      </div>
                      <span style={{ fontSize: 10, color: added ? "#52c41a" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</span>
                      {added && <span style={{ color: "#52c41a", fontSize: 10, marginLeft: "auto" }}>✓</span>}
                    </div>
                  );
                })}
              </div>

              {getSideModels(editingSide).length > 0 && (
                <div>
                  <label style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>Настройки ({getSideModels(editingSide).length})</label>
                  {getSideModels(editingSide).map((entry) => {
                    const rotDeg = Math.round((entry.rotation * 180) / Math.PI);
                    return (
                      <div
                        key={entry.model}
                        onMouseEnter={() => { const p = packs.find((pk) => pk.models.includes(entry.model))?.name || "Models"; setSideHoverModels((prev) => ({ ...prev, [editingSide]: { name: entry.model, pack: p } })); setHoveredNeighbor({ model: entry.model, pack: p }); }}
                        onMouseLeave={() => { setSideHoverModels((prev) => ({ ...prev, [editingSide]: null })); setHoveredNeighbor(null); }}
                        style={{ marginBottom: 8, padding: "8px 10px", background: "#262626", borderRadius: 8, cursor: "default" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <div style={{ width: 16, height: 16, borderRadius: 3, background: getModelColor(entry.model), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {getModelTypeLabel(detectModelType(entry.model)).charAt(0)}
                          </div>
                          <Text style={{ color: "#e8e8e8", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.model}</Text>
                          <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => toggleSideModel(editingSide, entry.model)} style={{ color: "#666", padding: 0, width: 16, height: 16 }} />
                        </div>

                        <div style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                            <span style={{ fontSize: 9, color: "#666" }}>Поворот</span>
                            <span style={{ fontSize: 9, color: "#888", marginLeft: "auto" }}>{rotDeg}°</span>
                          </div>
                          <Slider
                            min={-180} max={180} step={15}
                            value={rotDeg}
                            onChange={(v) => updateSideModelRotation(editingSide, entry.model, (v * Math.PI) / 180)}
                          />
                        </div>

                        <div>
                          <span style={{ fontSize: 9, color: "#666", display: "block", marginBottom: 4 }}>Может стоять стороной</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {SIDES.map((s) => {
                              const active = entry.allowedSides.includes(s);
                              return (
                                <div
                                  key={s}
                                  onClick={() => toggleAllowedSide(editingSide, entry.model, s)}
                                  onMouseEnter={() => setHoveredAllowedSide({ side: editingSide, allowedSide: s })}
                                  onMouseLeave={() => setHoveredAllowedSide(null)}
                                  style={{
                                    padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 9, fontWeight: 600,
                                    background: active ? `${SIDE_COLORS[s]}30` : "#1a1a1a",
                                    border: active ? `1px solid ${SIDE_COLORS[s]}80` : "1px solid #303030",
                                    color: active ? SIDE_COLORS[s] : "#555",
                                  }}
                                >
                                  {SIDE_LABELS[s].split(" ")[0]}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {getSideModels(editingSide).length === 0 && (
                <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: "12px 0" }}>Выбери модель из списка выше</div>
              )}
            </div>
          )}

          <div style={{ position: "absolute", top: 16, left: 16, width: 260, maxHeight: "calc(100vh - 32px)", overflow: "auto", background: "rgba(20,20,20,0.88)", backdropFilter: "blur(12px)", borderRadius: 10, border: "1px solid #303030", zIndex: 10, padding: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text strong style={{ color: "#52c41a", fontSize: 12 }}>Прогресс</Text>
              <Text style={{ color: "#666", fontSize: 11 }}>{configuredCount}/{allFilteredModels.length}</Text>
            </div>
            <div style={{ height: 4, background: "#303030", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${allFilteredModels.length > 0 ? (configuredCount / allFilteredModels.length) * 100 : 0}%`, background: "linear-gradient(90deg, #52c41a, #73d13d)", borderRadius: 2, transition: "width 0.3s" }} />
            </div>

            <div style={{ maxHeight: 300, overflow: "auto" }}>
              {allFilteredModels.map((m) => {
                const checks = getModelChecks(m.name, m.pack);
                const allDone = checks.every((c) => c.done);
                const isSelected = m.name === selectedModel && m.pack === selectedPack;
                return (
                  <div
                    key={`${m.pack}/${m.name}`}
                    onClick={() => { setSelectedPack(m.pack); setSelectedModel(m.name); }}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 4,
                      marginBottom: 2,
                      cursor: "pointer",
                      background: isSelected ? "#ffffff10" : "transparent",
                      border: isSelected ? "1px solid #ffffff20" : "1px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 2, background: getModelColor(m.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {getModelTypeLabel(detectModelType(m.name)).charAt(0)}
                      </div>
                      <Text style={{ color: allDone ? "#52c41a" : "#ccc", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</Text>
                      {allDone && <span style={{ color: "#52c41a", fontSize: 9 }}>✓</span>}
                      {!allDone && checks.length > 0 && <span style={{ color: "#faad14", fontSize: 9 }}>{checks.filter((c) => c.done).length}/{checks.length}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
