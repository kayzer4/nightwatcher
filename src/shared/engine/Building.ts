import { Entity } from "./Entity";

export type BuildingType = "commercial" | "skyscraper";

// Front face direction for each model at rotation 0
type FrontDir = "left" | "back";

const BUILDING_FRONT: Record<string, FrontDir> = {
  "building-a": "back",
  "building-b": "left",
  "building-c": "left",
  "building-d": "left",
  "building-e": "back",
  "building-f": "left",
  "building-g": "back",
  "building-h": "back",
  "building-i": "back",
  "building-j": "left",
  "building-k": "back",
  "building-l": "left",
  "building-m": "back",
  "building-n": "left",
  "building-skyscraper-a": "left",
  "building-skyscraper-b": "left",
  "building-skyscraper-c": "back",
  "building-skyscraper-d": "left",
  "building-skyscraper-e": "back",
};

const ROTATION_MAP: Record<string, Record<string, number>> = {
  left: { left: 0, back: Math.PI / 2, right: Math.PI, front: -Math.PI / 2 },
  back: { left: -Math.PI / 2, back: 0, right: Math.PI / 2, front: Math.PI },
};

export class Building extends Entity {
  model: string;
  scale: number;
  type: BuildingType;
  gridW: number;
  gridD: number;

  constructor(
    model: string,
    x: number,
    z: number,
    type: BuildingType = "commercial",
    gridW: number = 1,
    gridD: number = 1
  ) {
    super(x, 0, z);
    this.model = model;
    this.scale = 0.9;
    this.type = type;
    this.gridW = gridW;
    this.gridD = gridD;
  }

  update(_delta: number): void {}

  /**
   * Rotate to face nearest road
   */
  faceNearestRoad(roadPositions: { x: number; z: number }[]): void {
    if (roadPositions.length === 0) return;

    // Find nearest road
    let nearestDist = Infinity;
    let nearestRoad = roadPositions[0];
    for (const road of roadPositions) {
      const dist = this.distanceToPoint(road.x, road.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestRoad = road;
      }
    }

    // Calculate angle to face the road
    const dx = nearestRoad.x - this.position.x;
    const dz = nearestRoad.z - this.position.z;
    const angleToRoad = Math.atan2(dx, dz);

    // Building front at rotation 0 faces -Z (back)
    // So we need to rotate so front faces the road
    const frontAt0 = BUILDING_FRONT[this.model] || "left";

    // The front direction at rotation 0
    let frontAngle: number;
    if (frontAt0 === "left") frontAngle = -Math.PI / 2;  // -X
    else frontAngle = Math.PI;  // -Z

    // Rotation needed: angleToRoad - frontAngle
    this.rotation = angleToRoad - frontAngle;
  }
}
