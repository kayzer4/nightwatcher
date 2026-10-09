import { Select } from "antd";
import { s, l, ROAD_TAGS, type ModelConfig } from "../constants";

export function TagsPanel({ config, updateConfig }: {
  config: ModelConfig;
  updateConfig: (updates: Partial<ModelConfig>) => void;
}) {
  return (
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
        <Select virtual={false} mode="tags" value={config.tags.filter((t) => !ROAD_TAGS.find((rt) => rt.value === t))} onChange={(customTags) => {
          const presetTags = config.tags.filter((t) => ROAD_TAGS.find((rt) => rt.value === t));
          updateConfig({ tags: [...presetTags, ...customTags] });
        }} placeholder="Добавить..." style={{ width: "100%" }} />
      </div>
    </>
  );
}
