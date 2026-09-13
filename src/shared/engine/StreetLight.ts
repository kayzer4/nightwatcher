import { Entity } from "./Entity";

export class StreetLight extends Entity {
  isOn: boolean = true;

  constructor(x: number, z: number) {
    super(x, 0, z);
  }

  update(_delta: number): void {}

  toggle(): void {
    this.isOn = !this.isOn;
  }
}
