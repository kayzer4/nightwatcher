import { Entity } from "./Entity";

export class Citizen extends Entity {
  speed: number;
  targetX: number | null = null;
  targetZ: number | null = null;
  path: { x: number; z: number }[] = [];
  pathIndex: number = 0;

  constructor(x: number, z: number, speed: number = 1.5) {
    super(x, 0, z);
    this.speed = speed;
  }

  update(delta: number): void {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) return;

    const target = this.path[this.pathIndex];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.path = [];
        this.pathIndex = 0;
      }
      return;
    }

    const move = this.speed * delta;
    this.position.x += (dx / dist) * move;
    this.position.z += (dz / dist) * move;
  }

  setPath(path: { x: number; z: number }[]): void {
    this.path = path;
    this.pathIndex = 0;
  }

  hasArrived(): boolean {
    return this.path.length === 0 || this.pathIndex >= this.path.length;
  }
}
