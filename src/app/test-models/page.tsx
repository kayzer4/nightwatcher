"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useState, useEffect, useRef, useMemo } from "react";
import { RoadScene } from "./RoadScene";
import {
  Layout, Select, Slider, Button, Card, Space, Typography, Divider,
  Tag, ConfigProvider, theme, Row, Col, InputNumber, Switch, Collapse,
} from "antd";
import { DownloadOutlined, SettingOutlined, DeploymentUnitOutlined, HomeOutlined } from "@ant-design/icons";

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

type Side = "left" | "right" | "front" | "back";
const SIDES: Side[] = ["left", "right", "front", "back"];
const SIDE_LABELS: Record<Side, string> = { left: "Лево (-X)", right: "Право (+X)", front: "Перед (-Z)", back: "Зад (+Z)" };
const SIDE_COLORS: Record<Side, string> = { left: "#1677ff", right: "#52c41a", front: "#ff4d4f", back: "#722ed1" };

const ROAD_TYPES = [
  { value: "none", label: "Не дорожная", cc: 0 },
  { value: "end", label: "Тупик", cc: 1 },
  { value: "straight", label: "Прямая", cc: 2 },
  { value: "bend", label: "Поворот", cc: 2 },
  { value: "intersection", label: "Т-образная", cc: 3 },
  { value: "crossroad", label: "Перекрёсток", cc: 4 },
];

const ROAD_TAGS = [
  { value: "crosswalk", label: "Переход", icon: "🚶", color: "#faad14" },
  { value: "barrier", label: "Бордюр", icon: "🧱", color: "#8c8c8c" },
  { value: "lane-marking", label: "Разметка", icon: "▬", color: "#fff" },
  { value: "speed-bump", label: "Лежачий полицейский", icon: "⚠", color: "#ff4d4f" },
  { value: "tram", label: "Трамвайные пути", icon: "🚃", color: "#722ed1" },
  { value: "bus-lane", label: "Автобусная полоса", icon: "🚌", color: "#1677ff" },
  { value: "bike-lane", label: "Велодорожка", icon: "🚴", color: "#52c41a" },
  { value: "parking", label: "Парковка", icon: "🅿", color: "#13c2c2" },
  { value: "bridge", label: "Мост", icon: "🌉", color: "#eb2f96" },
  { value: "tunnel", label: "Тоннель", icon: "🚇", color: "#2f54eb" },
  { value: "roundabout", label: "Кольцо", icon: "🔄", color: "#fa8c16" },
  { value: "dead-end", label: "Тупик", icon: "🚫", color: "#f5222d" },
];

interface ModelConfig {
  name: string; pack: string; modelType: string;
  rotation: number; scale: number; offsetY: number;
  gridW: number; gridD: number;
  roadConnectLeft: boolean; roadConnectRight: boolean;
  roadConnectFront: boolean; roadConnectBack: boolean;
  roadType: "straight"|"bend"|"intersection"|"crossroad"|"end"|"none";
  isTerminal: boolean; tags: string[]; notes: string;
  frontDir: "left"|"right"|"front"|"back"|"none";
  height: "low"|"medium"|"high";
  actualHeight: number; actualWidth: number; actualDepth: number;
  foundation: "none"|"low"|"high";
  foundationScale: number; foundationOffsetY: number;
  lightRadius: number; lightColor: string; lightOnByDefault: boolean;
}

const DEFAULT_CONFIG: Omit<ModelConfig, "name"|"pack"|"modelType"> = {
  rotation: 0, scale: 1, offsetY: 0, gridW: 1, gridD: 1,
  roadConnectLeft: false, roadConnectRight: false, roadConnectFront: false, roadConnectBack: false,
  roadType: "none", isTerminal: false, tags: [], notes: "",
  frontDir: "none", height: "low", actualHeight: 1, actualWidth: 1, actualDepth: 1,
  foundation: "none", foundationScale: 1, foundationOffsetY: 0,
  lightRadius: 0, lightColor: "#fffbe6", lightOnByDefault: true,
};

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="yellow" wireframe /></mesh>;
}

export default function RoadEditorPage() {
  const [packs, setPacks] = useState<{ name: string; models: string[] }[]>([]);
  const [selectedPack, setSelectedPack] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"road" | "building">("road");
  const [collapseActiveKeys, setCollapseActiveKeys] = useState<string[]>(["select", "road"]);

  useEffect(() => { setMounted(true); }, []);

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

  const switchMode = (newMode: "road" | "building") => {
    setMode(newMode);
    const targetPack = newMode === "road" ? "roads" : "Models";
    const pack = packs.find((p) => p.name === targetPack);
    if (pack) {
      setSelectedPack(pack.name);
      if (pack.models.length) setSelectedModel(pack.models[0]);
    }
    setCollapseActiveKeys(newMode === "road" ? ["select", "road"] : ["select", "building"]);
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
    const isBuilding = selectedPack === "Models";
    return { name: selectedModel, pack: selectedPack, modelType: isBuilding ? "building" : "road", ...DEFAULT_CONFIG };
  };

  const updateConfig = (updates: Partial<ModelConfig>) => {
    const current = getConfig();
    setConfigs((prev) => ({ ...prev, [configKey]: { ...current, ...updates } }));
  };

  const toggleConnection = (side: Side) => {
    const key = `roadConnect${side.charAt(0).toUpperCase() + side.slice(1)}` as keyof ModelConfig;
    updateConfig({ [key]: !getConfig()[key] });
  };

  const config = getConfig();
  const rotDeg = Math.round((config.rotation * 180) / Math.PI);
  const connCount = [config.roadConnectLeft, config.roadConnectRight, config.roadConnectFront, config.roadConnectBack].filter(Boolean).length;
  const expectedType = ROAD_TYPES.find((rt) => rt.cc === connCount && rt.value !== "none");

  const exportConfigs = () => {
    const json = JSON.stringify({ gridSizeX: 8, gridSizeZ: 8, configs }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "model-configs.json"; a.click(); URL.revokeObjectURL(url);
  };

  const s: React.CSSProperties = { marginBottom: 16 };
  const l: React.CSSProperties = { fontSize: 11, color: "#888", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6, display: "block" };

  if (!mounted) return <div style={{ height: "100vh", background: "#0a0a0a" }} />;

  const collapseItems = [
    {
      key: "select",
      label: <span style={{ color: "#fff" }}><SettingOutlined /> Выбор модели</span>,
      children: (
        <>
          <div style={{ ...s, display: "flex", gap: 6 }}>
            <button onClick={() => switchMode("road")}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: mode === "road" ? "2px solid #faad14" : "2px solid #303030",
                background: mode === "road" ? "#faad1420" : "#1a1a1a",
                color: mode === "road" ? "#faad14" : "#555", transition: "all 0.15s",
              }}>
              <DeploymentUnitOutlined /> Дороги
            </button>
            <button onClick={() => switchMode("building")}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: mode === "building" ? "2px solid #52c41a" : "2px solid #303030",
                background: mode === "building" ? "#52c41a20" : "#1a1a1a",
                color: mode === "building" ? "#52c41a" : "#555", transition: "all 0.15s",
              }}>
              <HomeOutlined /> Здания
            </button>
          </div>
          <div style={s}>
            <label style={l}>Модель</label>
            <Select
              value={selectedModel || undefined}
              onChange={setSelectedModel}
              style={{ width: "100%" }}
              showSearch
              optionFilterProp="label"
              options={(currentPack?.models || []).map((m) => {
                const key = `${selectedPack}/${m}`;
                const cfg = configs[key];
                const isRoad = cfg && (cfg.roadConnectLeft || cfg.roadConnectRight || cfg.roadConnectFront || cfg.roadConnectBack || cfg.roadType !== "none");
                const isBuilding = cfg && cfg.modelType === "building";
                const configured = isRoad || isBuilding;
                return {
                  label: (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                      <span>{m}</span>
                      {configured ? <Tag color="blue" style={{ fontSize: 9, padding: "0 4px", margin: 0 }}>✓</Tag> : null}
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
    ...(mode === "road" ? [{
      key: "road",
      label: <span style={{ color: "#fff" }}><DeploymentUnitOutlined /> Дорога</span>,
      children: (
        <>
          <div style={s}>
            <label style={l}>Тип дороги</label>
            <Row gutter={[4, 4]}>
              {ROAD_TYPES.map((rt) => (
                <Col key={rt.value}>
                  <Button size="small" type={config.roadType === rt.value ? "primary" : "default"}
                    onClick={() => updateConfig({ roadType: rt.value as ModelConfig["roadType"] })}>
                    {rt.label}
                  </Button>
                </Col>
              ))}
            </Row>
            {expectedType && config.roadType !== expectedType.value ? (
              <div style={{ marginTop: 6 }}><Tag color="warning">Для {connCount} соединений → «{expectedType.label}»</Tag></div>
            ) : null}
          </div>

          <div style={s}>
            <label style={l}>Соединения ({connCount}/4)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {SIDES.map((side) => {
                const key = `roadConnect${side.charAt(0).toUpperCase() + side.slice(1)}` as keyof ModelConfig;
                const active = !!config[key];
                return (
                  <button key={side} onClick={() => toggleConnection(side)}
                    style={{
                      padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                      border: active ? `2px solid ${SIDE_COLORS[side]}` : "2px solid #303030",
                      background: active ? `${SIDE_COLORS[side]}20` : "#1a1a1a",
                      color: active ? SIDE_COLORS[side] : "#555", fontSize: 11, fontWeight: 600, textAlign: "center",
                    }}>
                    <div>{active ? "●" : "○"} {SIDE_LABELS[side]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={s}>
            <Row align="middle" justify="space-between">
              <Col><label style={l}>Тупик (конечный)</label></Col>
              <Col><Switch checked={config.isTerminal} onChange={(v) => updateConfig({ isTerminal: v })} /></Col>
            </Row>
          </div>
        </>
      ),
    }] : []),
    ...(mode === "building" ? [{
      key: "building",
      label: <span style={{ color: "#fff" }}><HomeOutlined /> Здания</span>,
      children: (
        <>
          <div style={s}>
            <label style={l}>Лицевая сторона</label>
            <Row gutter={[4, 4]}>
              {(["none", "left", "right", "front", "back"] as const).map((dir) => (
                <Col key={dir}>
                  <Button size="small" type={config.frontDir === dir ? "primary" : "default"}
                    onClick={() => updateConfig({ frontDir: dir })}>
                    {dir === "none" ? "Нет" : SIDE_LABELS[dir]}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>

          <div style={s}>
            <label style={l}>Высота</label>
            <Row gutter={[4, 4]}>
              {(["low", "medium", "high"] as const).map((h) => (
                <Col key={h}>
                  <Button size="small" type={config.height === h ? "primary" : "default"}
                    onClick={() => updateConfig({ height: h })}>
                    {h === "low" ? "Низкое" : h === "medium" ? "Среднее" : "Высокое"}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>

          <div style={s}>
            <label style={l}>Реальные размеры</label>
            <Row gutter={8}>
              <Col span={8}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Высота</div>
                <InputNumber min={0.1} max={20} step={0.1} value={config.actualHeight}
                  onChange={(v) => updateConfig({ actualHeight: v || 1 })} style={{ width: "100%" }} />
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Ширина</div>
                <InputNumber min={0.1} max={10} step={0.1} value={config.actualWidth}
                  onChange={(v) => updateConfig({ actualWidth: v || 1 })} style={{ width: "100%" }} />
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Глубина</div>
                <InputNumber min={0.1} max={10} step={0.1} value={config.actualDepth}
                  onChange={(v) => updateConfig({ actualDepth: v || 1 })} style={{ width: "100%" }} />
              </Col>
            </Row>
          </div>

          <div style={s}>
            <label style={l}>Фундамент</label>
            <Row gutter={[4, 4]}>
              {(["none", "low", "high"] as const).map((f) => (
                <Col key={f}>
                  <Button size="small" type={config.foundation === f ? "primary" : "default"}
                    onClick={() => updateConfig({ foundation: f })}>
                    {f === "none" ? "Нет" : f === "low" ? "Низкий" : "Высокий"}
                  </Button>
                </Col>
              ))}
            </Row>
            {config.foundation !== "none" && (
              <div style={{ marginTop: 8 }}>
                <Row gutter={8}>
                  <Col span={12}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Масштаб</div>
                    <InputNumber min={0.1} max={3} step={0.1} value={config.foundationScale}
                      onChange={(v) => updateConfig({ foundationScale: v || 1 })} style={{ width: "100%" }} />
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Смещение Y</div>
                    <InputNumber min={-2} max={2} step={0.05} value={config.foundationOffsetY}
                      onChange={(v) => updateConfig({ foundationOffsetY: v || 0 })} style={{ width: "100%" }} />
                  </Col>
                </Row>
              </div>
            )}
          </div>

          <div style={s}>
            <label style={l}>Освещение</label>
            <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
              <Col><span style={{ fontSize: 11, color: "#999" }}>Включено</span></Col>
              <Col><Switch checked={config.lightOnByDefault} onChange={(v) => updateConfig({ lightOnByDefault: v })} /></Col>
            </Row>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Радиус: {config.lightRadius}</div>
              <Slider min={0} max={20} step={1} value={config.lightRadius}
                onChange={(v) => updateConfig({ lightRadius: v })} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Цвет</div>
              <input type="color" value={config.lightColor || "#fffbe6"}
                onChange={(e) => updateConfig({ lightColor: e.target.value })}
                style={{ width: "100%", height: 28, border: "1px solid #303030", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
            </div>
          </div>
        </>
      ),
    }] : []),
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
          </div>
          <div style={s}>
            <label style={l}>Сетка</label>
            <Row gutter={16}>
              <Col span={12}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>Ш</Tag><InputNumber min={1} max={4} value={config.gridW} onChange={(v) => updateConfig({ gridW: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
              <Col span={12}><Space.Compact><Tag style={{ margin: 0, lineHeight: "30px" }}>Г</Tag><InputNumber min={1} max={4} value={config.gridD} onChange={(v) => updateConfig({ gridD: v || 1 })} style={{ width: "100%" }} /></Space.Compact></Col>
            </Row>
          </div>
        </>
      ),
    },
    {
      key: "tags",
      label: <span style={{ color: "#fff" }}>Теги</span>,
      children: (
        <>
          <div style={s}>
            <label style={l}>Теги модели</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {ROAD_TAGS.map((tag) => {
                const active = config.tags.includes(tag.value);
                return (
                  <button key={tag.value} onClick={() => {
                    const newTags = active ? config.tags.filter((t) => t !== tag.value) : [...config.tags, tag.value];
                    updateConfig({ tags: newTags });
                  }}
                    style={{
                      padding: "4px 10px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 500,
                      border: active ? `1px solid ${tag.color}` : "1px solid #303030",
                      background: active ? `${tag.color}20` : "#1a1a1a",
                      color: active ? tag.color : "#666",
                      transition: "all 0.15s",
                    }}>
                    {tag.icon} {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={s}>
            <label style={l}>Свои теги</label>
            <Select mode="tags" value={config.tags.filter((t) => !ROAD_TAGS.find((rt) => rt.value === t))} onChange={(customTags) => {
              const presetTags = config.tags.filter((t) => ROAD_TAGS.find((rt) => rt.value === t));
              updateConfig({ tags: [...presetTags, ...customTags] });
            }} placeholder="Добавить..." style={{ width: "100%" }} />
          </div>
        </>
      ),
    },
  ];

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#faad14", colorBgContainer: "#1f1f1f", colorBgElevated: "#262626", colorText: "#e8e8e8", colorTextSecondary: "#999", colorBorder: "#303030" } }}>
      <style>{`*::-webkit-scrollbar{display:none}*{scrollbar-width:none}`}</style>
      <Layout style={{ height: "100vh", background: "#0a0a0a" }}>
        <Sider width={400} theme="dark" style={{ background: "#141414", borderRight: "1px solid #303030", overflow: "auto" }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid #303030" }}>
              <Title level={4} style={{ margin: 0, color: "#faad14" }}>Редактор дорог</Title>
              <Button type="primary" icon={<DownloadOutlined />} onClick={exportConfigs}>Экспорт</Button>
            </div>
            <Collapse activeKey={collapseActiveKeys} onChange={(keys) => setCollapseActiveKeys(keys as string[])} ghost style={{ background: "transparent" }} items={collapseItems} />
            <Divider style={{ margin: "12px 0" }} />
            <Card size="small" style={{ background: "#1a1a1a", border: "1px solid #303030" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                <Text strong style={{ color: "#fff", fontSize: 12 }}>{config.name}</Text>
                <Space size={4} wrap>
                  {config.modelType === "road" ? (
                    <>
                      <Tag color="gold">{connCount} конн.</Tag>
                      <Tag color={config.roadType !== "none" ? "blue" : "default"}>{config.roadType}</Tag>
                      {config.isTerminal ? <Tag color="red">Тупик</Tag> : null}
                    </>
                  ) : (
                    <>
                      <Tag color="green">Здание</Tag>
                      {config.frontDir !== "none" ? <Tag color="cyan">Лицо: {SIDE_LABELS[config.frontDir]}</Tag> : null}
                      <Tag>{config.height}</Tag>
                    </>
                  )}
                  <Tag>{config.gridW}x{config.gridD}</Tag>
                </Space>
              </div>
            </Card>
          </div>
        </Sider>

        <Content style={{ background: "#0a0a0a", position: "relative" }}>
          <Canvas camera={{ position: [4, 4, 4], fov: 50 }}>
            <color attach="background" args={["#0a0a0a"]} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 5]} intensity={1.2} />
            <Suspense fallback={<Loader />}>
              <RoadScene
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
              />
            </Suspense>
            <OrbitControls />
          </Canvas>

          <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.75)", padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#aaa", lineHeight: 1.8 }}>
            {mode === "road" ? (
              <>
                <div><span style={{ color: "#faad14" }}>■</span> Дорожные коннекторы</div>
                <div><span style={{ color: "#faad14" }}>■</span> Сетка ячейки</div>
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
                  {config.foundation !== "none" && <div>Фундамент: <span style={{ color: "#faad14" }}>{config.foundation}</span></div>}
                </div>
              </>
            )}
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
