import { gameConfig } from "@/shared/config/game";

export class TimeSystem {
  private _hour: number;
  private _speed: number;

  constructor(startHour: number = 12) {
    this._hour = startHour;
    this._speed = 1;
  }

  get hour(): number {
    return this._hour;
  }

  get speed(): number {
    return this._speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  get progress(): number {
    return this._hour / 24;
  }

  update(deltaSeconds: number) {
    // default speed: 1 hour game time = 10 seconds real time?
    // Let's say speed = 1 means 1 game hour per second.
    this._hour += this._speed * deltaSeconds;
    if (this._hour >= 24) {
      this._hour -= 24;
    }
  }

  reset() {
    this._hour = 12;
  }
}
