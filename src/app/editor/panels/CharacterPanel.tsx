import type { Dispatch, SetStateAction } from "react";
import { Slider, Button, Row, Col, Select, Space } from "antd";
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { NPC_BASE_HEIGHT } from "@/shared/engine/CityGenerator";
import { s, l, type ModelConfig } from "../constants";

export function CharacterPanel({ config, updateConfig, animList, effectiveAnim, setSelectedAnim, animPlaying, setAnimPlaying, setAnimKey, animSpeed, setAnimSpeed }: {
  config: ModelConfig;
  updateConfig: (updates: Partial<ModelConfig>) => void;
  animList: string[];
  effectiveAnim: string | null;
  setSelectedAnim: Dispatch<SetStateAction<string | null>>;
  animPlaying: boolean;
  setAnimPlaying: Dispatch<SetStateAction<boolean>>;
  setAnimKey: Dispatch<SetStateAction<number>>;
  animSpeed: number;
  setAnimSpeed: Dispatch<SetStateAction<number>>;
}) {
  return (
    <>
      <div style={s}>
        <label style={l}>Масштаб: {config.scale.toFixed(2)} (рост {(NPC_BASE_HEIGHT * config.scale).toFixed(2)})</label>
        <Slider min={0.1} max={3} step={0.05} value={config.scale} onChange={(v) => updateConfig({ scale: v })} />
        <Row gutter={4}>
          {[0.75, 1, 1.5, 2].map((v) => (
            <Col key={v}><Button size="small" type={Math.abs(config.scale - v) < 0.001 ? "primary" : "default"} onClick={() => updateConfig({ scale: v })}>{v}×</Button></Col>
          ))}
        </Row>
      </div>

      <div style={s}>
        <label style={l}>Скорость ходьбы: {(config.speed ?? 1).toFixed(2)} м/с</label>
        <Slider min={0.1} max={3} step={0.05} value={config.speed ?? 1} onChange={(v) => updateConfig({ speed: v })} />
      </div>

      <div style={s}>
        <label style={l}>Анимации ({animList.length})</label>
        <Select
          virtual={false}
          value={effectiveAnim ?? undefined}
          onChange={setSelectedAnim}
          placeholder="Загрузка модели..."
          style={{ width: "100%" }}
          showSearch
          optionFilterProp="label"
          options={animList.map((a) => ({ label: a, value: a }))}
        />
      </div>

      <div style={s}>
        <label style={l}>Воспроизведение</label>
        <Space>
          <Button
            type={animPlaying ? "primary" : "default"}
            icon={animPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            disabled={!effectiveAnim}
            onClick={() => setAnimPlaying((p) => !p)}
          >
            {animPlaying ? "Пауза" : "Запустить"}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={!effectiveAnim}
            onClick={() => { setAnimPlaying(true); setAnimKey((k) => k + 1); }}
          >
            Сначала
          </Button>
        </Space>
      </div>

      <div style={s}>
        <label style={l}>Скорость превью: {animSpeed.toFixed(2)}×</label>
        <Slider min={0.1} max={2} step={0.05} value={animSpeed} onChange={setAnimSpeed} />
      </div>

      <div style={{ ...s, padding: "8px 10px", borderRadius: 6, background: "#722ed115", border: "1px solid #722ed140", fontSize: 11, color: "#aaa", lineHeight: 1.8 }}>
        Модель нормализуется к базовому росту {NPC_BASE_HEIGHT}, затем × масштаб.
        <div style={{ color: "#666" }}>Зелёная шкала в сцене — рост NPC. Ячейка 2×2 — тротуар. Смещение Y и поворот — в «Трансформ».</div>
      </div>
    </>
  );
}
