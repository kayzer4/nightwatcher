import { gameConfig } from "@/shared/config/game";

export class TimeSystem {
  private _hour: number;
  private _speed: number;
  private _lastTimestamp: number = 0;

  constructor(startHour: number = gameConfig.time.startHour) {
    this._hour = startHour;
    this._speed = gameConfig.time.defaultSpeed;
  }

  get hour(): number {
    return this._hour;
  }

  get speed(): number {
    return this._speed;
  }

  set speed(value: number) {
    this._speed = Math.max(0, Math.min(value, gameConfig.time.maxSpeed));
  }

  get progress(): number {
    const { startHour, endHour } = gameConfig.time;
    const range = endHour - startHour;
    return ((this._hour - startHour) % range) / range;
  }

  update(deltaSeconds: number) {
    const hoursPerSecond = this._speed / 60;
    this._hour += hoursPerSecond * deltaSeconds;

    const { startHour, endHour } = gameConfig.time;
    if (this._hour >= endHour) {
      this._hour = startHour + ((this._hour - endHour) % (endHour - startHour));
    }
  }

  reset() {
    this._hour = gameConfig.time.startHour;
  }
}
