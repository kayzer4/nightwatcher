import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useState, useCallback } from "react";
import { Layout, Button } from "antd";
import { NPC_BASE_HEIGHT, ATTRACTOR_COLORS } from "@/shared/engine/CityGenerator";
import { EditorScene } from "./Scene";
import { ATTRACTOR_TYPES, SIDES, SIDE_LABELS, SIDE_COLORS, type EditorMode, type ModelConfig, type LightConfig, type GizmoMode } from "./constants";

const { Content } = Layout;

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="yellow" wireframe /></mesh>;
}

export function SceneSection({
  mode, selectedModel, selectedPack, config, placing, selectedAttractorId,
  onPlace, onMove, onDelete, onSelect,
  animName, animPlaying, animSpeed, animKey, onAnimations,
  selectedLightId, onSelectLight, onUpdateLight, gizmoMode = "translate", onGizmoModeChange,
  canUndo = false, canRedo = false, onUndo, onRedo, onDragStart, onDragEnd,
}: {
  mode: EditorMode;
  selectedModel: string;
  selectedPack: string;
  config: ModelConfig;
  placing: boolean;
  selectedAttractorId: string | null;
  onPlace: (x: number, z: number) => void;
  onMove: (id: string, x: number, y: number, z: number, rotation?: number | [number, number, number], scale?: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  animName: string | null;
  animPlaying: boolean;
  animSpeed: number;
  animKey: number;
  onAnimations: (names: string[]) => void;
  selectedLightId?: string | null;
  onSelectLight?: (id: string | null) => void;
  onUpdateLight?: (id: string, updates: Partial<LightConfig>) => void;
  gizmoMode?: GizmoMode;
  onGizmoModeChange?: (mode: GizmoMode) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [showLabels, setShowLabels] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("nw_editor_showLabels");
    return v !== null ? v === "true" : true;
  });

  const [showOverlay, setShowOverlay] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("nw_editor_showOverlay");
    return v !== null ? v === "true" : true;
  });

  const [isDraggingGizmo, setIsDraggingGizmo] = useState(false);

  const toggleLabels = useCallback(() => {
    setShowLabels((prev) => {
      const next = !prev;
      localStorage.setItem("nw_editor_showLabels", String(next));
      return next;
    });
  }, []);

  const toggleOverlay = useCallback(() => {
    setShowOverlay((prev) => {
      const next = !prev;
      localStorage.setItem("nw_editor_showOverlay", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && (e.key === "z" || e.key === "Z" || e.key === "я" || e.key === "Я")) {
        if (!isInput) {
          e.preventDefault();
          if (e.shiftKey) {
            onRedo?.();
          } else {
            onUndo?.();
          }
        }
        return;
      }

      if (isCtrlOrCmd && (e.key === "y" || e.key === "Y" || e.key === "н" || e.key === "Н")) {
        if (!isInput) {
          e.preventDefault();
          onRedo?.();
        }
        return;
      }

      if (isInput) return;

      if (e.key === "w" || e.key === "W" || e.key === "ц" || e.key === "Ц") {
        onGizmoModeChange?.("translate");
      } else if (e.key === "e" || e.key === "E" || e.key === "у" || e.key === "У") {
        onGizmoModeChange?.("rotate");
      } else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
        onGizmoModeChange?.("scale");
      } else if (e.key === "l" || e.key === "L" || e.key === "д" || e.key === "Д") {
        toggleLabels();
      } else if (e.key === "Escape") {
        if (selectedLightId) onSelectLight?.(null);
        if (selectedAttractorId) onSelect?.(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLightId, selectedAttractorId, onGizmoModeChange, onSelectLight, onSelect, onUndo, onRedo, toggleLabels]);

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
            lights={config.lights || []}
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
            selectedLightId={selectedLightId}
            onSelectLight={onSelectLight}
            onUpdateLight={onUpdateLight}
            gizmoMode={gizmoMode}
            onDragStart={() => {
              setIsDraggingGizmo(true);
              onDragStart?.();
            }}
            onDragEnd={() => {
              setIsDraggingGizmo(false);
              onDragEnd?.();
            }}
            showLabels={showLabels}
          />
        </Suspense>
        <OrbitControls makeDefault enabled={!isDraggingGizmo} />
      </Canvas>

      <div style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(20,20,20,0.88)",
        padding: "6px 12px",
        borderRadius: 8,
        display: "flex",
        gap: 6,
        alignItems: "center",
        border: "1px solid #444",
        zIndex: 10,
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)"
      }}>
        {(selectedLightId || selectedAttractorId) && (
          <span style={{ fontSize: 11, color: selectedLightId ? "#faad14" : "#52c41a", marginRight: 4, fontWeight: "bold" }}>
            {selectedLightId ? "Фонарь:" : `Аттрактор (${selectedAttractorId}):`}
          </span>
        )}
        <Button
          size="small"
          type={gizmoMode === "translate" ? "primary" : "default"}
          onClick={() => onGizmoModeChange?.("translate")}
          title="Перемещение (W)"
        >
          Двигать (W)
        </Button>
        <Button
          size="small"
          type={gizmoMode === "rotate" ? "primary" : "default"}
          onClick={() => onGizmoModeChange?.("rotate")}
          title="Вращение (E)"
        >
          Крутить (E)
        </Button>
        <Button
          size="small"
          type={gizmoMode === "scale" ? "primary" : "default"}
          onClick={() => onGizmoModeChange?.("scale")}
          title="Масштаб (R)"
        >
          Масштаб (R)
        </Button>

        <div style={{ width: 1, height: 16, background: "#444", margin: "0 4px" }} />

        <Button
          size="small"
          disabled={!canUndo}
          onClick={onUndo}
          title="Отменить действие (Ctrl+Z)"
        >
          Отмена (Ctrl+Z)
        </Button>
        <Button
          size="small"
          disabled={!canRedo}
          onClick={onRedo}
          title="Повторить действие (Ctrl+Y)"
        >
          Повтор (Ctrl+Y)
        </Button>

        <div style={{ width: 1, height: 16, background: "#444", margin: "0 4px" }} />

        <Button
          size="small"
          type={showLabels ? "default" : "dashed"}
          onClick={toggleLabels}
          title="Включить / отключить 3D-подписи на сцене (L)"
          style={{ color: showLabels ? "#faad14" : "#777" }}
        >
          {showLabels ? "Подписи: ВКЛ (L)" : "Подписи: ВЫКЛ (L)"}
        </Button>

        {(selectedLightId || selectedAttractorId) && (
          <Button
            size="small"
            type="text"
            danger
            onClick={() => {
              if (selectedLightId) onSelectLight?.(null);
              if (selectedAttractorId) onSelect?.(null);
            }}
          >
            Готово (Esc)
          </Button>
        )}
      </div>

      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
        {showOverlay ? (
          <div style={{ background: "rgba(0,0,0,0.8)", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#aaa", lineHeight: 1.8, border: "1px solid #333", minWidth: 200, backdropFilter: "blur(6px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Инфо</span>
              <Button
                size="small"
                type="text"
                style={{ color: "#888", padding: "0 4px", height: 20, fontSize: 11 }}
                onClick={toggleOverlay}
                title="Скрыть подсказки на экране"
              >
                ✕ Скрыть
              </Button>
            </div>
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
        ) : (
          <Button
            size="small"
            style={{ background: "rgba(0,0,0,0.6)", borderColor: "#444", color: "#aaa", backdropFilter: "blur(6px)" }}
            onClick={toggleOverlay}
            title="Показать подсказки на экране"
          >
            Инфо
          </Button>
        )}
      </div>
    </Content>
  );
}
