import { TimeSystem } from "./TimeSystem";
import { eventBus, GAME_EVENTS } from "./EventBus";
import { Citizen } from "./Citizen";
import { StreetLight } from "./StreetLight";

export class GameEngine {
  time: TimeSystem;
  citizens: Citizen[] = [];
  streetLights: StreetLight[] = [];
  private _running: boolean = false;

  constructor() {
    this.time = new TimeSystem();
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    this._running = true;
  }

  stop(): void {
    this._running = false;
  }

  update(delta: number): void {
    if (!this._running) return;

    this.time.update(delta);
    eventBus.emit(GAME_EVENTS.TIME_UPDATED, this.time.hour);

    // Update citizens
    for (const citizen of this.citizens) {
      citizen.update(delta);
    }
  }

  addCitizen(citizen: Citizen): void {
    this.citizens.push(citizen);
  }

  removeCitizen(id: string): void {
    this.citizens = this.citizens.filter((c) => c.id !== id);
  }

  setStreetLights(lights: StreetLight[]): void {
    this.streetLights = lights;
  }

  toggleLight(id: string): void {
    const light = this.streetLights.find((l) => l.id === id);
    if (light) {
      light.toggle();
      eventBus.emit(GAME_EVENTS.TOGGLE_LIGHT, id, light.isOn);
    }
  }

  reset(): void {
    this.time.reset();
    this.citizens = [];
  }
}
