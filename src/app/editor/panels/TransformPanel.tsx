import { Slider, Button, Row, Col, InputNumber, Tag, Space } from "antd";
import { s, l, SIDE_LABELS, type ModelConfig } from "../constants";

export function TransformPanel({ config, updateConfig, rotDeg }: {
  config: ModelConfig;
  updateConfig: (updates: Partial<ModelConfig>) => void;
  rotDeg: number;
}) {
  return (
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
  );
}
