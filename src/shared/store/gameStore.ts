import { create } from "zustand";
import { Citizen } from "@/shared/engine/Citizen";

export interface LightState {
  id: string;
  isOn: boolean;
}

interface GameState {
  time: number;
  speed: number;
  lights: LightState[];
  citizens: Citizen[];

  setTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  toggleLight: (id: string) => void;
  addCitizen: (citizen: Citizen) => void;
  moveCitizen: (id: string, x: number, z: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  time: 23,
  speed: 1,
  lights: [],
  citizens: [],

  setTime: (time) => set({ time }),
  setSpeed: (speed) => set({ speed }),

  toggleLight: (id) =>
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === id ? { ...l, isOn: !l.isOn } : l
      ),
    })),

  addCitizen: (citizen) =>
    set((state) => ({ citizens: [...state.citizens, citizen] })),

  moveCitizen: (id, x, z) =>
    set((state) => ({
      citizens: state.citizens.map((c) => {
        if (c.id === id) {
          c.position.x = x;
          c.position.z = z;
        }
        return c;
      }),
    })),
}));
