import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Row, Col, InputNumber, Switch, Space, Tag, Typography } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { AttractorConfig, AttractorType } from "@/shared/engine/CityGenerator";
import { ATTRACTOR_COLORS, DIRECTION_DEGREES } from "@/shared/engine/CityGenerator";
import { l, ATTRACTOR_TYPES, ACTIVITY_TYPES, DIR_GLYPH, COMPASS_ORDER } from "../constants";

const { Text } = Typography;

export function AttractorsPanel({
  placing, setPlacing,
  attractors, selectedAttractorId, setSelectedAttractorId,
  addAttractor, updateAttractor, toggleDirection, toggleCrossDirection, deleteAttractor, selectAttractor,
  lastAttractorType, setLastAttractorType,
  compassMode, setCompassMode, rotation,
}: {
  placing: boolean;
  setPlacing: Dispatch<SetStateAction<boolean>>;
  attractors: AttractorConfig[];
  selectedAttractorId: string | null;
  setSelectedAttractorId: Dispatch<SetStateAction<string | null>>;
  addAttractor: () => void;
  updateAttractor: (id: string, updates: Partial<AttractorConfig>) => void;
  toggleDirection: (id: string, deg: number) => void;
  toggleCrossDirection: (id: string, deg: number) => void;
  deleteAttractor: (id: string) => void;
  selectAttractor: (id: string | null) => void;
  lastAttractorType: AttractorType;
  setLastAttractorType: Dispatch<SetStateAction<AttractorType>>;
  compassMode: "walk" | "cross";
  setCompassMode: Dispatch<SetStateAction<"walk" | "cross">>;
  rotation: number;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <label style={{ ...l, marginBottom: 0 }}>Размещение в 3D</label>
        <Switch checked={placing} onChange={(v) => { setPlacing(v); if (!v) setSelectedAttractorId(null); }} />
      </div>
      {placing && (
        <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 6, background: "#faad1415", border: "1px solid #faad1440", fontSize: 11, color: "#faad14", lineHeight: 1.8 }}>
          Новый аттрактор: «{ATTRACTOR_TYPES.find((t) => t.value === lastAttractorType)?.label}»
          <div style={{ color: "#999" }}>Клик по ячейке — добавить · куб — перетащить · Shift+клик — удалить · Esc — выход</div>
        </div>
      )}
      {attractors.length === 0 && (
        <Text style={{ color: "#666", fontSize: 12, display: "block", marginBottom: 12 }}>
          Нет аттракторов. Добавьте точку спавна/прогулки для NPC.
        </Text>
      )}
      {attractors.map((a) => (
        <Card
          key={a.id}
          id={`attr-${a.id}`}
          size="small"
          onClick={() => setSelectedAttractorId(a.id)}
          style={{
            background: "#1a1a1a",
            border: `1px solid ${ATTRACTOR_COLORS[a.type]}${selectedAttractorId === a.id ? "" : "40"}`,
            outline: selectedAttractorId === a.id ? `1px solid ${ATTRACTOR_COLORS[a.type]}` : "none",
            marginBottom: 10,
            cursor: "pointer",
          }}
          styles={{ header: { padding: "6px 10px", minHeight: "auto", borderBottom: `1px solid ${ATTRACTOR_COLORS[a.type]}30` } }}
          title={
            <Space size={6}>
              <Tag color={ATTRACTOR_COLORS[a.type]} style={{ margin: 0 }}>{a.id}</Tag>
              <Text style={{ color: "#aaa", fontSize: 11 }}>{ATTRACTOR_TYPES.find((t) => t.value === a.type)?.label}</Text>
            </Space>
          }
          extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); deleteAttractor(a.id); }} />}
        >
          <div style={{ marginBottom: 8 }}>
            <label style={l}>Тип</label>
            <Row gutter={[4, 4]}>
              {ATTRACTOR_TYPES.map((t) => (
                <Col key={t.value}>
                  <Button size="small" type={a.type === t.value ? "primary" : "default"} onClick={() => { updateAttractor(a.id, { type: t.value }); setLastAttractorType(t.value); }}>
                    {t.label}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={l}>Позиция (доля ячейки: X/Z от -0.5 до 0.5, Y — высота)</label>
            <Row gutter={4}>
              <Col span={8}>
                <div style={{ fontSize: 10, color: "#666" }}>X</div>
                <InputNumber min={-0.5} max={0.5} step={0.05} value={a.position.x} onChange={(v) => updateAttractor(a.id, { position: { ...a.position, x: v ?? 0 } })} style={{ width: "100%" }} />
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 10, color: "#666" }}>Y</div>
                <InputNumber min={-1} max={3} step={0.05} value={a.position.y} onChange={(v) => updateAttractor(a.id, { position: { ...a.position, y: v ?? 0 } })} style={{ width: "100%" }} />
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 10, color: "#666" }}>Z</div>
                <InputNumber min={-0.5} max={0.5} step={0.05} value={a.position.z} onChange={(v) => updateAttractor(a.id, { position: { ...a.position, z: v ?? 0 } })} style={{ width: "100%" }} />
              </Col>
            </Row>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={l}>Размер куба</label>
            <InputNumber min={0.05} max={1} step={0.05} value={a.scale ?? 0.05} onChange={(v) => updateAttractor(a.id, { scale: v ?? 0.05 })} style={{ width: "100%" }} />
          </div>

          {a.type === "wait" || a.type === "activity" ? (
            <div style={{ marginBottom: 8 }}>
              <label style={l}>Длительность (мс)</label>
              <InputNumber min={500} max={60000} step={500} value={a.duration ?? 2500} onChange={(v) => updateAttractor(a.id, { duration: v ?? 2500 })} style={{ width: "100%" }} />
            </div>
          ) : null}

          {a.type === "activity" ? (
            <div style={{ marginBottom: 8 }}>
              <label style={l}>Активность</label>
              <Row gutter={[4, 4]}>
                {ACTIVITY_TYPES.map((act) => (
                  <Col key={act.value}>
                    <Button size="small" type={(a.activity ?? "idle") === act.value ? "primary" : "default"} onClick={() => updateAttractor(a.id, { activity: act.value })}>
                      {act.label}
                    </Button>
                  </Col>
                ))}
              </Row>
            </div>
          ) : null}

          <div>
            <label style={l}>Направления продолжения маршрута</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <Button size="small" type={compassMode === "walk" ? "primary" : "default"}
                onClick={() => setCompassMode("walk")}>Прогулка</Button>
              <Button size="small" type={compassMode === "cross" ? "primary" : "default"}
                style={compassMode === "cross" ? { background: "#52c41a", borderColor: "#52c41a" } : undefined}
                onClick={() => setCompassMode("cross")}>Переход</Button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 32px)",
                gap: 4,
                width: "fit-content",
                transform: `rotate(${-rotation}rad)`,
              }}
            >
              {COMPASS_ORDER.map((d) => {
                if (d < 0) return <span key="center" />;
                const isWalk = (a.directions ?? DIRECTION_DEGREES).includes(d);
                const isCross = (a.crossingDirections ?? []).includes(d);
                return (
                  <Button
                    key={d}
                    size="small"
                    type={isWalk || isCross ? "primary" : "default"}
                    style={{
                      width: 32, height: 32, padding: 0, fontSize: 14,
                      ...(isCross ? { background: "#52c41a", borderColor: "#52c41a" } : {}),
                    }}
                    onClick={() => {
                      selectAttractor(a.id);
                      if (compassMode === "cross") toggleCrossDirection(a.id, d);
                      else toggleDirection(a.id, d);
                    }}
                  >
                    {DIR_GLYPH[d]}
                  </Button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              Синяя = пройти всегда. Зелёная = переход (отмеченный вручную, без светофора).
              Обе точки пары должны видеть друг друга. Стрелки перехода ставятся
              в режиме «Переход». Снять все = NPC стоит на месте.
            </div>
          </div>
        </Card>
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={addAttractor}>Добавить аттрактор</Button>
    </>
  );
}
