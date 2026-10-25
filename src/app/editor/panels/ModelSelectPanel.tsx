import { Select, Tag } from "antd";
import { s, l, type ModelConfig } from "../constants";

export function ModelSelectPanel({ selectedPack, selectedModel, models, configs, onSelect }: {
  selectedPack: string;
  selectedModel: string;
  models: string[];
  configs: Record<string, ModelConfig>;
  onSelect: (model: string) => void;
}) {
  return (
    <div style={s}>
      <label style={l}>Модель</label>
      <Select
        virtual={false}
        value={selectedModel || undefined}
        onChange={onSelect}
        style={{ width: "100%" }}
        showSearch
        optionFilterProp="label"
        options={models
          .map((m) => {
            const cfg = configs[`${selectedPack}/${m}`];
            const isRoad = cfg && (cfg.roadConnectLeft || cfg.roadConnectRight || cfg.roadConnectFront || cfg.roadConnectBack || cfg.roadType !== "none");
            const isBuilding = cfg && cfg.modelType === "building";
            const isLamp = cfg && (cfg.tags?.includes("lamp") || (cfg.lights && cfg.lights.length > 0));
            const configured = isRoad || isBuilding || isLamp;
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
  );
}
