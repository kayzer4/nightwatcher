import { Button, Col, Input, InputNumber, Row, Select, Switch } from "antd";
import { s, l, type ModelConfig, type LightConfig, AVAILABLE_LAMP_MODELS, parseRotation } from "../constants";

export function LightsPanel({ config, updateConfig, selectedLightId, onSelectLight }: {
  config: ModelConfig;
  updateConfig: (updates: Partial<ModelConfig>) => void;
  selectedLightId?: string | null;
  onSelectLight?: (id: string | null) => void;
}) {
  const lights = config.lights || [];

  const addLight = () => {
    const newId = crypto.randomUUID().split("-")[0];
    updateConfig({
      lights: [
        ...lights,
        {
          id: newId,
          lampModel: "light-curved",
          position: [0.75, 0, 0],
          rotation: 0,
          color: "#fffbe6",
          intensity: 2,
          distance: 6,
          showSphere: true,
        },
      ],
    });
    onSelectLight?.(newId);
  };

  const removeLight = (id: string) => {
    updateConfig({ lights: lights.filter((l) => l.id !== id) });
  };

  const updateLight = (id: string, updates: Partial<LightConfig>) => {
    updateConfig({
      lights: lights.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    });
  };

  return (
    <div style={s}>
      <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
        <Col><label style={{ ...l, marginBottom: 0 }}>Фонари и свет ({lights.length})</label></Col>
        <Col><Button size="small" type="primary" onClick={addLight}>+ Фонарь</Button></Col>
      </Row>

      {lights.length === 0 && (
        <div style={{ fontSize: 11, color: "#666" }}>Нет добавленных фонарей на этой модели</div>
      )}

      {lights.map((light, i) => {
        const isSelected = light.id === selectedLightId;
        return (
          <div
            key={light.id}
            onClick={() => onSelectLight?.(light.id)}
            style={{
              background: isSelected ? "#222014" : "#1a1a1a",
              border: isSelected ? "1px solid #faad14" : "1px solid #333",
              borderRadius: 4,
              padding: 8,
              marginBottom: 10,
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
            }}
          >
            <Row align="middle" justify="space-between" style={{ marginBottom: 6 }}>
              <Col>
                <div style={{ fontSize: 11, color: isSelected ? "#faad14" : "#ccc", fontWeight: "bold", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Фонарь #{i + 1}</span>
                  {isSelected && <span style={{ fontSize: 10, background: "#faad14", color: "#000", padding: "0 4px", borderRadius: 2 }}>ВЫБРАН В 3D</span>}
                </div>
              </Col>
              <Col>
                <Button
                  size="small"
                  danger
                  type="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLight(light.id);
                  }}
                >
                  Удалить
                </Button>
              </Col>
            </Row>

          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Модель фонаря (столба)</div>
            <Select
              size="small"
              value={light.lampModel || "none"}
              onChange={(v) => updateLight(light.id, { lampModel: v })}
              options={AVAILABLE_LAMP_MODELS}
              style={{ width: "100%" }}
            />
          </div>

          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={8}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>X</div>
              <InputNumber size="small" step={0.05} value={light.position[0]} onChange={(v) => updateLight(light.id, { position: [v ?? 0, light.position[1], light.position[2]] })} style={{ width: "100%" }} />
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Y (высота)</div>
              <InputNumber size="small" step={0.05} value={light.position[1]} onChange={(v) => updateLight(light.id, { position: [light.position[0], v ?? 0, light.position[2]] })} style={{ width: "100%" }} />
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Z</div>
              <InputNumber size="small" step={0.05} value={light.position[2]} onChange={(v) => updateLight(light.id, { position: [light.position[0], light.position[1], v ?? 0] })} style={{ width: "100%" }} />
            </Col>
          </Row>

          {(() => {
            const rot = parseRotation(light.rotation);
            return (
              <Row gutter={8} style={{ marginBottom: 6 }}>
                <Col span={8}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Поворот X°</div>
                  <InputNumber
                    size="small"
                    step={5}
                    value={rot[0]}
                    onChange={(v) => updateLight(light.id, { rotation: [v ?? 0, rot[1], rot[2]] })}
                    style={{ width: "100%" }}
                  />
                </Col>
                <Col span={8}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Поворот Y°</div>
                  <InputNumber
                    size="small"
                    step={5}
                    value={rot[1]}
                    onChange={(v) => updateLight(light.id, { rotation: [rot[0], v ?? 0, rot[2]] })}
                    style={{ width: "100%" }}
                  />
                </Col>
                <Col span={8}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Поворот Z°</div>
                  <InputNumber
                    size="small"
                    step={5}
                    value={rot[2]}
                    onChange={(v) => updateLight(light.id, { rotation: [rot[0], rot[1], v ?? 0] })}
                    style={{ width: "100%" }}
                  />
                </Col>
              </Row>
            );
          })()}

          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={8}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Масштаб</div>
              <InputNumber size="small" min={0.1} max={10} step={0.1} value={light.scale ?? 1} onChange={(v) => updateLight(light.id, { scale: v ?? 1 })} style={{ width: "100%" }} />
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Яркость</div>
              <InputNumber size="small" min={0} max={20} step={0.2} value={light.intensity} onChange={(v) => updateLight(light.id, { intensity: v ?? 1 })} style={{ width: "100%" }} />
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Радиус света</div>
              <InputNumber size="small" min={1} max={50} step={0.5} value={light.distance} onChange={(v) => updateLight(light.id, { distance: v ?? 6 })} style={{ width: "100%" }} />
            </Col>
          </Row>

          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={12}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Цвет</div>
              <Input type="color" size="small" value={light.color} onChange={(e) => updateLight(light.id, { color: e.target.value })} style={{ width: "100%", padding: 0, height: 24 }} />
            </Col>
            <Col span={12}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>Сфера в центре</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}>
                <Switch size="small" checked={light.showSphere} onChange={(v) => updateLight(light.id, { showSphere: v })} />
              </div>
            </Col>
          </Row>
        </div>
      );})}
    </div>
  );
}
