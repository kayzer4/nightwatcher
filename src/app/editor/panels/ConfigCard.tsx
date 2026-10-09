import { Card, Space, Tag, Typography } from "antd";
import { NPC_BASE_HEIGHT } from "@/shared/engine/CityGenerator";
import { SIDE_LABELS, type ModelConfig } from "../constants";

const { Text } = Typography;

export function ConfigCard({ config, connCount }: { config: ModelConfig; connCount: number }) {
  return (
    <Card size="small" style={{ background: "#1a1a1a", border: "1px solid #303030" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
        <Text strong style={{ color: "#fff", fontSize: 12 }}>{config.name}</Text>
        <Space size={4} wrap>
          {config.modelType === "character" ? (
            <>
              <Tag color="purple">Персонаж</Tag>
              <Tag color="green">Рост {(NPC_BASE_HEIGHT * config.scale).toFixed(2)}</Tag>
              <Tag color="blue">Скорость {(config.speed ?? 1).toFixed(2)}</Tag>
            </>
          ) : config.modelType === "road" ? (
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
  );
}
