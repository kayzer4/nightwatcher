"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Layout, Collapse, Button, Divider, ConfigProvider, theme, Typography, Segmented } from "antd";
import { DownloadOutlined, SettingOutlined, AimOutlined, DeploymentUnitOutlined, HomeOutlined, UserOutlined } from "@ant-design/icons";
import type { AttractorConfig, AttractorType } from "@/shared/engine/CityGenerator";
import { DIRECTION_DEGREES } from "@/shared/engine/CityGenerator";
import { type EditorMode, type ModelConfig, type Side, type LightConfig, type GizmoMode, DEFAULT_CONFIG, ROAD_TYPES } from "./constants";
import { ModelSelectPanel } from "./panels/ModelSelectPanel";
import { RoadPanel } from "./panels/RoadPanel";
import { BuildingPanel } from "./panels/BuildingPanel";
import { CharacterPanel } from "./panels/CharacterPanel";
import { AttractorsPanel } from "./panels/AttractorsPanel";
import { TransformPanel } from "./panels/TransformPanel";
import { TagsPanel } from "./panels/TagsPanel";
import { LightsPanel } from "./panels/LightsPanel";
import { ConfigCard } from "./panels/ConfigCard";
import { SceneSection } from "./SceneSection";

const { Sider } = Layout;
const { Title } = Typography;

export default function ModelEditorPage() {
  const [packs, setPacks] = useState<{ name: string; models: string[] }[]>([]);
  const [selectedPack, setSelectedPack] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<EditorMode>("road");
  const [collapseActiveKeys, setCollapseActiveKeys] = useState<string[]>(["select", "road"]);
  const [placing, setPlacing] = useState(false);
  const [selectedAttractorId, setSelectedAttractorId] = useState<string | null>(null);
  const [lastAttractorType, setLastAttractorType] = useState<AttractorType>("walk");
  const [compassMode, setCompassMode] = useState<"walk" | "cross">("walk");
  const [animList, setAnimList] = useState<string[]>([]);
  const [selectedAnim, setSelectedAnim] = useState<string | null>(null);
  const [animPlaying, setAnimPlaying] = useState(true);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [animKey, setAnimKey] = useState(0);
  const [siderWidth, setSiderWidth] = useState(400);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const isResizing = useRef(false);

  const undoStack = useRef<Record<string, ModelConfig>[]>([]);
  const redoStack = useRef<Record<string, ModelConfig>[]>([]);
  const [historyCount, setHistoryCount] = useState({ undo: 0, redo: 0 });
  const isDraggingGizmo = useRef(false);
  const snapshotBeforeDrag = useRef<Record<string, ModelConfig> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Sider is on the left, so clientX corresponds to the new width
      const newWidth = Math.max(300, Math.min(e.clientX, 800));
      setSiderWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((data) => {
      setPacks(data);
      const roadPack = data.find((p: { name: string; models: string[] }) => p.name === "roads");
      if (roadPack) { setSelectedPack(roadPack.name); if (roadPack.models.length) setSelectedModel(roadPack.models[0]); }
      else if (data.length > 0) { setSelectedPack(data[0].name); if (data[0].models.length) setSelectedModel(data[0].models[0]); }
    }).catch(() => {});
    fetch("/api/model-configs").then((r) => r.json()).then((data) => {
      if (data.configs) setConfigs(data.configs);
      loaded.current = true;
    }).catch(() => {});
  }, []);

  const switchMode = (newMode: EditorMode) => {
    setMode(newMode);
    setPlacing(false);
    const targetPack = newMode === "road" ? "roads" : newMode === "building" ? "Models" : "characters";
    const pack = packs.find((p) => p.name === targetPack);
    if (pack) {
      setSelectedPack(pack.name);
      if (pack.models.length) setSelectedModel(pack.models[0]);
      else setSelectedModel("");
    }
    setCollapseActiveKeys(
      newMode === "road" ? ["select", "road"] : newMode === "building" ? ["select", "building"] : ["select", "character"],
    );
  };

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    if (!loaded.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      fetch("/api/model-configs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gridSizeX: 8, gridSizeZ: 8, configs }),
      }).catch(() => {});
    }, 500);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [configs, mounted]);

  const currentPack = packs.find((p) => p.name === selectedPack);
  const configKey = `${selectedPack}/${selectedModel}`;

  const getConfig = (): ModelConfig => {
    if (configs[configKey]) return configs[configKey];
    const modelType = selectedPack === "Models" ? "building" : selectedPack === "characters" ? "character" : "road";
    return { name: selectedModel, pack: selectedPack, modelType, ...DEFAULT_CONFIG };
  };

  const configsRef = useRef(configs);
  configsRef.current = configs;

  const pushUndoSnapshot = useCallback(() => {
    undoStack.current.push(configsRef.current);
    if (undoStack.current.length > 50) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    setHistoryCount({ undo: undoStack.current.length, redo: 0 });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const previous = undoStack.current.pop()!;
    redoStack.current.push(configsRef.current);
    setConfigs(previous);
    setHistoryCount({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(configsRef.current);
    setConfigs(next);
    setHistoryCount({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingGizmo.current = true;
    snapshotBeforeDrag.current = configsRef.current;
  }, []);

  const handleDragEnd = useCallback(() => {
    if (isDraggingGizmo.current && snapshotBeforeDrag.current) {
      undoStack.current.push(snapshotBeforeDrag.current);
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      setHistoryCount({ undo: undoStack.current.length, redo: 0 });
      snapshotBeforeDrag.current = null;
    }
    isDraggingGizmo.current = false;
  }, []);

  const updateConfig = (updates: Partial<ModelConfig>) => {
    if (!isDraggingGizmo.current) {
      pushUndoSnapshot();
    }
    const current = getConfig();
    setConfigs((prev) => ({ ...prev, [configKey]: { ...current, ...updates } }));
  };

  const toggleConnection = (side: Side) => {
    const key = `roadConnect${side.charAt(0).toUpperCase() + side.slice(1)}` as keyof ModelConfig;
    updateConfig({ [key]: !getConfig()[key] });
  };

  const getAttractors = (): AttractorConfig[] => getConfig().attractors ?? [];

  const setAttractors = (attractors: AttractorConfig[]) => updateConfig({ attractors });

  const nextAttractorId = (list: AttractorConfig[]) => {
    const used = new Set(list.map((a) => a.id));
    let idx = list.length + 1;
    while (used.has(`a${idx}`)) idx++;
    return `a${idx}`;
  };

  const addAttractor = () => {
    const list = getAttractors();
    const id = nextAttractorId(list);
    setAttractors([...list, { id, type: lastAttractorType, position: { x: 0, y: 0.1, z: 0 } }]);
  };

  const updateAttractor = (id: string, updates: Partial<AttractorConfig>) => {
    setAttractors(getAttractors().map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const toggleDirection = (id: string, deg: number) => {
    setAttractors(
      getAttractors().map((a) => {
        if (a.id !== id) return a;
        const cur = a.directions ?? [...DIRECTION_DEGREES];
        const next = cur.includes(deg) ? cur.filter((d) => d !== deg) : [...cur, deg].sort((x, y) => x - y);
        const cross = a.crossingDirections ? a.crossingDirections.filter((d) => next.includes(d)) : undefined;
        return { ...a, directions: next, ...(cross ? { crossingDirections: cross } : {}) };
      }),
    );
  };

  const toggleCrossDirection = (id: string, deg: number) => {
    setAttractors(
      getAttractors().map((a) => {
        if (a.id !== id) return a;
        const cross = a.crossingDirections ?? [];
        const nextCross = cross.includes(deg) ? cross.filter((d) => d !== deg) : [...cross, deg].sort((x, y) => x - y);
        const dirs = a.directions ?? [...DIRECTION_DEGREES];
        const nextDirs = nextCross.includes(deg) && !dirs.includes(deg)
          ? [...dirs, deg].sort((x, y) => x - y)
          : dirs;
        return { ...a, directions: nextDirs, crossingDirections: nextCross };
      }),
    );
  };

  const removeAttractor = (id: string) => {
    setAttractors(getAttractors().filter((a) => a.id !== id));
  };

  const selectAttractor = (id: string | null) => {
    setSelectedAttractorId(id);
    if (!id) return;
    setCollapseActiveKeys((keys) => (keys.includes("attractors") ? keys : [...keys, "attractors"]));
    window.setTimeout(() => {
      document.getElementById(`attr-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
  };

  const placeAttractor = (x: number, z: number) => {
    const list = getAttractors();
    const id = nextAttractorId(list);
    setAttractors([...list, { id, type: lastAttractorType, position: { x, y: 0.1, z } }]);
    selectAttractor(id);
  };

  const moveAttractor = (id: string, x: number, y: number, z: number, rotation?: number | [number, number, number], scale?: number) => {
    setAttractors(
      getAttractors().map((a) =>
        a.id === id
          ? {
              ...a,
              position: { ...a.position, x, y: y !== undefined ? y : a.position.y, z },
              ...(rotation !== undefined ? { rotation } : {}),
              ...(scale !== undefined ? { scale } : {}),
            }
          : a,
      ),
    );
  };

  const deleteAttractor = (id: string) => {
    removeAttractor(id);
    if (selectedAttractorId === id) setSelectedAttractorId(null);
  };

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlacing(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  useEffect(() => {
    setSelectedAttractorId(null);
    setSelectedLightId(null);
  }, [configKey]);

  const updateLight = (id: string, updates: Partial<LightConfig>) => {
    const lights = config.lights || [];
    updateConfig({
      lights: lights.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    });
  };

  const config = getConfig();
  // Derived: fall back to Idle (or first clip) when nothing valid is selected
  const effectiveAnim = selectedAnim && animList.includes(selectedAnim)
    ? selectedAnim
    : (animList.find((a) => a.toLowerCase() === "idle") ?? animList[0] ?? null);
  const rotDeg = Math.round((config.rotation * 180) / Math.PI);
  const connCount = [config.roadConnectLeft, config.roadConnectRight, config.roadConnectFront, config.roadConnectBack].filter(Boolean).length;
  const expectedType = ROAD_TYPES.find((rt) => rt.cc === connCount && rt.value !== "none");

  const exportConfigs = () => {
    const json = JSON.stringify({ gridSizeX: 8, gridSizeZ: 8, configs }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "model-configs.json"; a.click(); URL.revokeObjectURL(url);
  };

  if (!mounted) return <div style={{ height: "100vh", background: "#0a0a0a" }} />;

  const collapseItems = [
    {
      key: "select",
      label: <span style={{ color: "#fff" }}><SettingOutlined /> Выбор модели</span>,
      children: (
        <ModelSelectPanel
          selectedPack={selectedPack}
          selectedModel={selectedModel}
          models={currentPack?.models || []}
          configs={configs}
          onSelect={setSelectedModel}
        />
      ),
    },
    ...(mode === "road" ? [{
      key: "road",
      label: <span style={{ color: "#fff" }}><DeploymentUnitOutlined /> Дорога</span>,
      children: (
        <RoadPanel
          config={config}
          updateConfig={updateConfig}
          toggleConnection={toggleConnection}
          connCount={connCount}
          expectedType={expectedType}
        />
      ),
    }] : []),
    ...(mode === "building" ? [{
      key: "building",
      label: <span style={{ color: "#fff" }}><HomeOutlined /> Здание</span>,
      children: <BuildingPanel config={config} updateConfig={updateConfig} />,
    }] : []),
    ...(mode === "character" ? [{
      key: "character",
      label: <span style={{ color: "#fff" }}><UserOutlined /> Персонаж</span>,
      children: (
        <CharacterPanel
          config={config}
          updateConfig={updateConfig}
          animList={animList}
          effectiveAnim={effectiveAnim}
          setSelectedAnim={setSelectedAnim}
          animPlaying={animPlaying}
          setAnimPlaying={setAnimPlaying}
          setAnimKey={setAnimKey}
          animSpeed={animSpeed}
          setAnimSpeed={setAnimSpeed}
        />
      ),
    }] : []),
    ...(mode === "road" ? [{
      key: "attractors",
      label: <span style={{ color: "#fff" }}><AimOutlined /> Аттракторы NPC ({getAttractors().length})</span>,
      children: (
        <AttractorsPanel
          placing={placing}
          setPlacing={setPlacing}
          attractors={getAttractors()}
          selectedAttractorId={selectedAttractorId}
          setSelectedAttractorId={setSelectedAttractorId}
          addAttractor={addAttractor}
          updateAttractor={updateAttractor}
          toggleDirection={toggleDirection}
          toggleCrossDirection={toggleCrossDirection}
          deleteAttractor={deleteAttractor}
          selectAttractor={selectAttractor}
          lastAttractorType={lastAttractorType}
          setLastAttractorType={setLastAttractorType}
          compassMode={compassMode}
          setCompassMode={setCompassMode}
          rotation={config.rotation}
        />
      ),
    }] : []),
    {
      key: "lights",
      label: <span style={{ color: "#fff" }}><SettingOutlined /> Освещение ({config.lights?.length || 0})</span>,
      children: (
        <LightsPanel
          config={config}
          updateConfig={updateConfig}
          selectedLightId={selectedLightId}
          onSelectLight={setSelectedLightId}
        />
      ),
    },
    {
      key: "transform",
      label: <span style={{ color: "#fff" }}><SettingOutlined /> Трансформ</span>,
      children: <TransformPanel config={config} updateConfig={updateConfig} rotDeg={rotDeg} />,
    },
    ...(mode !== "character" ? [{
      key: "tags",
      label: <span style={{ color: "#fff" }}>Теги</span>,
      children: <TagsPanel config={config} updateConfig={updateConfig} />,
    }] : []),
  ];

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#faad14", colorBgContainer: "#1f1f1f", colorBgElevated: "#262626", colorText: "#e8e8e8", colorTextSecondary: "#999", colorBorder: "#303030" } }}>
      <style>{`*::-webkit-scrollbar{display:none}*{scrollbar-width:none}`}</style>
      <Layout style={{ height: "100vh", background: "#0a0a0a" }}>
        <Sider width={siderWidth} theme="dark" style={{ background: "#141414", borderRight: "1px solid #303030", overflow: "auto" }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Title level={4} style={{ margin: 0, color: "#faad14" }}>Редактор моделей</Title>
              <Button type="primary" icon={<DownloadOutlined />} onClick={exportConfigs}>Экспорт</Button>
            </div>
            <Segmented
              block
              value={mode}
              onChange={(v) => switchMode(v as EditorMode)}
              options={[
                { value: "road", label: <span><DeploymentUnitOutlined /> Дороги</span> },
                { value: "building", label: <span><HomeOutlined /> Здания</span> },
                { value: "character", label: <span><UserOutlined /> Персонажи</span> },
              ]}
              style={{ marginBottom: 16 }}
            />
            <Collapse activeKey={collapseActiveKeys} onChange={(keys) => setCollapseActiveKeys(keys as string[])} ghost style={{ background: "transparent" }} items={collapseItems} />
            <Divider style={{ margin: "12px 0" }} />
            <ConfigCard config={config} connCount={connCount} />
          </div>
        </Sider>
        
        <div
          onMouseDown={() => {
            isResizing.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          style={{
            width: 4,
            cursor: "col-resize",
            backgroundColor: "transparent",
            zIndex: 10,
            position: "relative",
            left: -2,
          }}
        />

        <SceneSection
          mode={mode}
          selectedModel={selectedModel}
          selectedPack={selectedPack}
          config={config}
          placing={placing}
          selectedAttractorId={selectedAttractorId}
          onPlace={placeAttractor}
          onMove={moveAttractor}
          onDelete={deleteAttractor}
          onSelect={selectAttractor}
          animName={effectiveAnim}
          animPlaying={animPlaying}
          animSpeed={animSpeed}
          animKey={animKey}
          onAnimations={setAnimList}
          selectedLightId={selectedLightId}
          onSelectLight={setSelectedLightId}
          onUpdateLight={updateLight}
          gizmoMode={gizmoMode}
          onGizmoModeChange={setGizmoMode}
          canUndo={historyCount.undo > 0}
          canRedo={historyCount.redo > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </Layout>
    </ConfigProvider>
  );
}
