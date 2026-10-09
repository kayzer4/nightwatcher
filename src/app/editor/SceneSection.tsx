import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import { Layout } from "antd";
import { NPC_BASE_HEIGHT, ATTRACTOR_COLORS } from "@/shared/engine/CityGenerator";
import { EditorScene } from "./Scene";
import { ATTRACTOR_TYPES, SIDES, SIDE_LABELS, SIDE_COLORS, type EditorMode, type ModelConfig } from "./constants";

const { Content } = Layout;

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="yellow" wireframe /></mesh>;
}

export function SceneSection({
  mode, selectedModel, selectedPack, config, placing, selectedAttractorId,
  onPlace, onMove, onDelete, onSelect,
  animName, animPlaying, animSpeed, animKey, onAnimations,
}: {
  mode: EditorMode;
  selectedModel: string;
  selectedPack: string;
  config: ModelConfig;
  placing: boolean;
  selectedAttractorId: string | null;
  onPlace: (x: number, z: number) => void;
  onMove: (id: string, x: number, z: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  animName: string | null;
  animPlaying: boolean;
  animSpeed: number;
  animKey: number;
  onAnimations: (names: string[]) => void;
}) {
  return (
    <Content style={{ background: "#0a0a0a", position: "relative" }}>
      <Canvas camera={{ position: [4, 4, 4], fov: 50 }}>
        <color attach="background" args={["#0a0a0a"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={1.2} />
        <Suspense fallback={<Loader />}>
          <EditorScene
            selectedModel={selectedModel}
            selectedPack={selectedPack}
            rotation={config.rotation}
            scale={config.scale}
            offsetY={config.offsetY}
            gridW={config.gridW}
            gridD={config.gridD}
            connectLeft={config.roadConnectLeft}
            connectRight={config.roadConnectRight}
            connectFront={config.roadConnectFront}
            connectBack={config.roadConnectBack}
            frontDir={config.frontDir}
            actualHeight={config.actualHeight}
            actualWidth={config.actualWidth}
            actualDepth={config.actualDepth}
            foundation={config.foundation}
            foundationScale={config.foundationScale}
            foundationOffsetY={config.foundationOffsetY}
            mode={mode}
            attractors={config.attractors || []}
            placing={placing}
            selectedId={selectedAttractorId}
            onPlace={onPlace}
            onMove={onMove}
            onDelete={onDelete}
            onSelect={onSelect}
            animName={animName}
            animPlaying={animPlaying}
            animSpeed={animSpeed}
            animKey={animKey}
            onAnimations={onAnimations}
          />
        </Suspense>
        <OrbitControls enabled={!placing} />
      </Canvas>

      <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.75)", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#aaa", lineHeight: 1.8 }}>
        {placing && (
          <div style={{ color: "#faad14", fontWeight: 600, marginBottom: 4 }}>Размещение аттракторов (Esc — выход)</div>
        )}
        {mode === "character" ? (
          <>
            <div><span style={{ color: "#722ed1" }}>■</span> Персонаж</div>
            <div><span style={{ color: "#52c41a" }}>▮</span> Рост: <b>{(NPC_BASE_HEIGHT * config.scale).toFixed(2)}</b></div>
            <div><span style={{ color: "#faad14" }}>□</span> Ячейка 2×2 (тротуар)</div>
            <div style={{ marginTop: 4, color: "#666" }}>Анимации — в панели слева</div>
          </>
        ) : mode === "road" ? (
          <>
            <div><span style={{ color: "#faad14" }}>■</span> Дорожные коннекторы</div>
            <div><span style={{ color: "#faad14" }}>■</span> Сетка ячейки</div>
            <div style={{ marginTop: 4 }}>
              {ATTRACTOR_TYPES.map((t) => (
                <div key={t.value}><span style={{ color: ATTRACTOR_COLORS[t.value] }}>■</span> {t.label}</div>
              ))}
            </div>
            <div style={{ marginTop: 4 }}>
              {SIDES.map((side) => {
                const key = `roadConnect${side.charAt(0).toUpperCase() + side.slice(1)}` as keyof ModelConfig;
                return (
                  <div key={side}>
                    <span style={{ color: SIDE_COLORS[side] }}>{SIDE_LABELS[side]}</span>
                    {": "}
                    {config[key] ? "ЕСТЬ" : "—"}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div><span style={{ color: "#ff4d4f" }}>▼</span> Лицевая сторона</div>
            <div><span style={{ color: "#fff" }}>□</span> Размеры (W/H/D)</div>
            <div><span style={{ color: "#faad14" }}>□</span> Фундамент</div>
            <div><span style={{ color: "#faad14" }}>□</span> Сетка ячейки</div>
            <div style={{ marginTop: 4 }}>
              {config.frontDir !== "none" && <div>Лицо: <span style={{ color: "#ff4d4f" }}>{SIDE_LABELS[config.frontDir]}</span></div>}
              <div>Размер: <span style={{ color: "#52c41a" }}>{config.actualWidth}</span> x <span style={{ color: "#722ed1" }}>{config.actualDepth}</span> x <span style={{ color: "#1677ff" }}>{config.actualHeight}</span></div>
            </div>
          </>
        )}
      </div>
    </Content>
  );
}
