let nextId = 0;

export abstract class Entity {
  readonly id: string;
  position: { x: number; y: number; z: number };
  rotation: number;

  constructor(
    x: number = 0,
    y: number = 0,
    z: number = 0,
    rotation: number = 0
  ) {
    this.id = `entity_${nextId++}`;
    this.position = { x, y, z };
    this.rotation = rotation;
  }

  abstract update(delta: number): void;

  distanceTo(other: Entity): number {
    const dx = this.position.x - other.position.x;
    const dz = this.position.z - other.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  distanceToPoint(x: number, z: number): number {
    const dx = this.position.x - x;
    const dz = this.position.z - z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
