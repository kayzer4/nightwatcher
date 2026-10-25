import type { AttractorConfig, AttractorType, ActivityType } from "@/shared/engine/CityGenerator";
import type { CSSProperties } from "react";

export type GizmoMode = "translate" | "rotate" | "scale";

export interface LightConfig {
  id: string;
  position: [number, number, number];
  rotation?: number | [number, number, number]; // degrees: number (around Y) or [x, y, z] Euler
  scale?: number; // uniform scale of the lamp
  lampModel?: string; // 3D model name, e.g. "light-curved", "light-square", or "none"
  color: string;
  intensity: number;
  distance: number;
  showSphere: boolean;
}

export function parseRotation(r?: number | [number, number, number]): [number, number, number] {
  if (Array.isArray(r)) return [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0];
  if (typeof r === "number") return [0, r, 0];
  return [0, 0, 0];
}

export const AVAILABLE_LAMP_MODELS = [
  { value: "none", label: "Без столба (только свет)" },
  { value: "light-curved", label: "Фонарь изогнутый (light-curved)" },
  { value: "light-square", label: "Фонарь прямой (light-square)" },
  { value: "light-curved-double", label: "Двойной изогнутый (light-curved-double)" },
  { value: "light-square-double", label: "Двойной прямой (light-square-double)" },
  { value: "light-curved-cross", label: "Крестовой изогнутый (light-curved-cross)" },
  { value: "light-square-cross", label: "Крестовой прямой (light-square-cross)" },
];

export interface ModelConfig {
  name: string; pack: string; modelType: string;
  rotation: number; scale: number; offsetY: number;
  speed?: number;
  gridW: number; gridD: number;
  roadConnectLeft: boolean; roadConnectRight: boolean;
  roadConnectFront: boolean; roadConnectBack: boolean;
  roadType: "straight" | "bend" | "intersection" | "crossroad" | "end" | "none";
  isTerminal: boolean; tags: string[]; notes: string;
  frontDir: "left" | "right" | "front" | "back" | "none";
  height: "low" | "medium" | "high";
  actualHeight: number; actualWidth: number; actualDepth: number;
  foundation: "none" | "low" | "high";
  foundationScale: number; foundationOffsetY: number;
  lights?: LightConfig[];
  attractors?: AttractorConfig[];
}

export type EditorMode = "road" | "building" | "character";

export const DEFAULT_CONFIG: Omit<ModelConfig, "name" | "pack" | "modelType"> = {
  rotation: 0, scale: 1, offsetY: 0, speed: 1, gridW: 1, gridD: 1,
  roadConnectLeft: false, roadConnectRight: false, roadConnectFront: false, roadConnectBack: false,
  roadType: "none", isTerminal: false, tags: [], notes: "",
  frontDir: "none", height: "low", actualHeight: 1, actualWidth: 1, actualDepth: 1,
  foundation: "none", foundationScale: 1, foundationOffsetY: 0,
  lights: [],
};

export const ATTRACTOR_TYPES: { value: AttractorType; label: string }[] = [
  { value: "spawn", label: "Спавн" },
  { value: "walk", label: "Прогулка" },
  { value: "wait", label: "Ожидание" },
  { value: "exit", label: "Выход" },
  { value: "activity", label: "Активность" },
];

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "idle", label: "Бездействие" },
  { value: "sit", label: "Сидеть" },
  { value: "stand", label: "Стоять" },
  { value: "talk", label: "Разговор" },
  { value: "eat", label: "Еда" },
  { value: "shop", label: "Покупка" },
];

// degrees → glyph, 0=+X, 90=+Z (screen-down in top view)
export const DIR_GLYPH: Record<number, string> = { 0: "→", 45: "↘", 90: "↓", 135: "↙", 180: "←", 225: "↖", 270: "↑", 315: "↗" };
export const COMPASS_ORDER = [225, 270, 315, 180, -1, 0, 135, 90, 45];

export type Side = "left" | "right" | "front" | "back";
export const SIDES: Side[] = ["left", "right", "front", "back"];
export const SIDE_LABELS: Record<Side, string> = { left: "Лево (-X)", right: "Право (+X)", front: "Перед (-Z)", back: "Зад (+Z)" };
export const SIDE_COLORS: Record<Side, string> = { left: "#1677ff", right: "#52c41a", front: "#ff4d4f", back: "#722ed1" };

export const ROAD_TYPES = [
  { value: "none", label: "Не дорожная", cc: 0 },
  { value: "end", label: "Тупик", cc: 1 },
  { value: "straight", label: "Прямая", cc: 2 },
  { value: "bend", label: "Поворот", cc: 2 },
  { value: "intersection", label: "Т-образная", cc: 3 },
  { value: "crossroad", label: "Перекрёсток", cc: 4 },
];

export const ROAD_TAGS = [
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

// shared form field styles
export const s: CSSProperties = { marginBottom: 16 };
export const l: CSSProperties = { fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" };
