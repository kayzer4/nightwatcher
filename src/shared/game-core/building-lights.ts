/** Stable per-building variation without touching the city's seeded RNG. */
export function buildingLightSeed(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export interface WindowLightEvent {
  id: string;
  kind: "window-light";
  windowIndex: number;
  startsAt: number;
  endsAt: number;
  intensity: number;
  computerLight: boolean;
}

export interface BuildingWindowState {
  index: number;
  level: number;
  computerLight: boolean;
}

/** Time elapsed since 23:00, in game hours. */
export function nightShiftHours(hour: number): number {
  const normalizedHour = ((hour % 24) + 24) % 24;
  return normalizedHour >= 23 ? normalizedHour - 23 : normalizedHour + 1;
}

/** Deterministic, sparse ten-minute window events for one building and shift. */
export function createWindowLightEvents(seed: number, windowCount: number): WindowLightEvent[] {
  if (windowCount <= 0) return [];
  const events: WindowLightEvent[] = [];
  for (let slot = 0; slot < 42; slot++) {
    const random = (salt: number) => {
    let value = Math.imul(seed ^ Math.imul(slot + 1, 1597334677) ^ salt, 2246822519);
    value ^= value >>> 13;
    value = Math.imul(value, 3266489917);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    };
    const shiftHours = slot / 6;
    const chance = shiftHours >= 3 && shiftHours <= 5 ? 0.07 : 0.16;
    if (random(11) >= chance) continue;
    events.push({
      id: `${seed}-${slot}`,
      kind: "window-light",
      windowIndex: Math.floor(random(29) * windowCount),
      startsAt: shiftHours,
      endsAt: (slot + 1) / 6,
      intensity: 0.25 + random(71) * 0.75,
      computerLight: random(47) < 0.28,
    });
  }
  return events;
}

export function activeWindowState(events: readonly WindowLightEvent[], hour: number): BuildingWindowState {
  const elapsed = nightShiftHours(hour);
  const event = events.find((candidate) => elapsed >= candidate.startsAt && elapsed < candidate.endsAt);
  if (!event) return { index: -1, level: 0, computerLight: false };
  const fraction = (elapsed - event.startsAt) / (event.endsAt - event.startsAt);
  const fadeIn = Math.min(1, fraction / 0.1);
  const fadeOut = Math.min(1, (1 - fraction) / 0.1);
  const fade = Math.max(0, Math.min(fadeIn, fadeOut));
  return {
    index: event.windowIndex,
    level: event.intensity * fade * fade * (3 - 2 * fade),
    computerLight: event.computerLight,
  };
}

/** One building's event schedule; the scene asks for its state at the current hour. */
export class WindowLightTimeline {
  readonly events: readonly WindowLightEvent[];

  constructor(seed: number, windowCount: number) {
    this.events = createWindowLightEvents(seed, windowCount);
  }

  at(hour: number): BuildingWindowState {
    return activeWindowState(this.events, hour);
  }
}

export interface BuildingLightSource {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  intensity: number;
  distance: number;
}

const buildingLightSources = new Map<string, BuildingLightSource>();

export function setBuildingLightSource(id: string, source: BuildingLightSource): void {
  buildingLightSources.set(id, source);
}

export function removeBuildingLightSource(id: string): void {
  buildingLightSources.delete(id);
}

export function getBuildingLightSources(): Iterable<BuildingLightSource> {
  return buildingLightSources.values();
}
