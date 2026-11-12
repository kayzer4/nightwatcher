export const INITIAL_ENERGY = 100;

/** Energy units spent by one powered lamp per real second. */
export const LAMP_ENERGY_RATES: Record<string, number> = {
  "light-curved": 0.08,
  "light-square": 0.07,
  "light-curved-double": 0.13,
  "light-square-double": 0.12,
  "light-curved-cross": 0.16,
  "light-square-cross": 0.15,
  "construction-light": 0.18,
};

export function lampEnergyRate(model: string): number {
  const name = model.toLowerCase();
  if (LAMP_ENERGY_RATES[name] !== undefined) return LAMP_ENERGY_RATES[name];
  if (name.includes("double")) return 0.13;
  if (name.includes("cross")) return 0.16;
  if (name.includes("construction")) return 0.18;
  return 0.08;
}

export function energyUsePerSecond(lamps: readonly { lampModel: string }[]): number {
  return lamps.reduce((total, lamp) => total + lampEnergyRate(lamp.lampModel), 0);
}

export type GameOutcome = "playing" | "won" | "lost-energy" | "lost-dissatisfaction";

export function evaluateGameOutcome(hour: number, energy: number, averageDissatisfaction: number): GameOutcome {
  if (hour >= 6 && hour < 23) return "won";
  if (energy <= 0) return "lost-energy";
  if (averageDissatisfaction >= 1) return "lost-dissatisfaction";
  return "playing";
}

/** Mutable rules for one shift. React only observes its snapshots. */
export class NightSession {
  energy = INITIAL_ENERGY;
  outcome: GameOutcome = "playing";

  advance(seconds: number, lamps: readonly { lampModel: string }[], hour: number, dissatisfaction: number): GameOutcome {
    if (this.outcome !== "playing") return this.outcome;
    this.energy = Math.max(0, this.energy - energyUsePerSecond(lamps) * Math.max(0, seconds));
    this.outcome = evaluateGameOutcome(hour, this.energy, dissatisfaction);
    return this.outcome;
  }
}
