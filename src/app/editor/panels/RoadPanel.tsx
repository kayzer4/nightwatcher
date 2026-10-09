import { Button, Row, Col, Switch, Tag } from "antd";
import { s, l, ROAD_TYPES, SIDES, SIDE_LABELS, SIDE_COLORS, type Side, type ModelConfig } from "../constants";

export function RoadPanel({ config, updateConfig, toggleConnection, connCount, expectedType }: {
  config: ModelConfig;
  updateConfig: (updates: Partial<ModelConfig>) => void;
  toggleConnection: (side: Side) => void;
  connCount: number;
  expectedType?: (typeof ROAD_TYPES)[number];
}) {
  return (
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
  );
}
