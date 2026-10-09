import { Button, Row, Col, InputNumber } from "antd";
import { s, l, SIDE_LABELS, type ModelConfig } from "../constants";

export function BuildingPanel({ config, updateConfig }: {
  config: ModelConfig;
  updateConfig: (updates: Partial<ModelConfig>) => void;
}) {
  return (
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
    </>
  );
}
