/** Game time for one 23:00–06:00 shift. */
export class NightClock {
  private currentHour: number;

  constructor(hour = 23) {
    this.currentHour = hour;
  }

  get hour(): number {
    return this.currentHour;
  }

  setHour(hour: number): void {
    this.currentHour = hour;
  }

  advance(seconds: number): number {
    let nextHour = this.currentHour + Math.max(0, seconds) * 0.025;
    if (nextHour >= 24) nextHour -= 24;
    if (nextHour >= 6 && nextHour < 23) nextHour = 6;
    this.currentHour = nextHour;
    return nextHour;
  }
}
