import { gameConfig } from "@/shared/config/game";

export class TimeSystem {
  private _hour: number;
  private _speed: number;

  constructor(startHour: number = gameConfig.time.startHour) {
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

  /**
   * Progress of the night shift (23:00 to 06:00) from 0 to 1.
   */
  get progress(): number {
    const shift = this._hour >= 23 ? (this._hour - 23) : (this._hour + 1);
    return Math.min(1, Math.max(0, shift / 7));
  }

  update(deltaSeconds: number) {
    this._hour += this._speed * deltaSeconds;
    if (this._hour >= 24) {
      this._hour -= 24;
    }
    // Loop night: if it goes past endHour (6:00) and before startHour (23:00), wrap back to 23:00
    if (this._hour >= gameConfig.time.endHour && this._hour < gameConfig.time.startHour) {
      this._hour = gameConfig.time.startHour;
    }
  }

  reset() {
    this._hour = gameConfig.time.startHour;
  }
}
