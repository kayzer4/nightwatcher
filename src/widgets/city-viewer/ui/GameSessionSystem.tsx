"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { NightSession, type GameOutcome } from "@/shared/game-core/session";
import { timeGlobals } from "./EnvironmentSystem";

export function GameSessionSystem({ running, lamps, dissatisfaction, onEnergyChange, onOutcome }: {
  running: boolean;
  lamps: readonly { lampModel: string }[];
  dissatisfaction: number;
  onEnergyChange: (energy: number) => void;
  onOutcome: (outcome: GameOutcome) => void;
}) {
  const sessionRef = useRef(new NightSession());
  const lastReportRef = useRef(0);

  useFrame((_, rawDt) => {
    if (!running || sessionRef.current.outcome !== "playing") return;
    const outcome = sessionRef.current.advance(Math.min(rawDt, 0.05), lamps, timeGlobals.hour, dissatisfaction);
    const now = performance.now();
    if (outcome !== "playing" || now - lastReportRef.current >= 200) {
      lastReportRef.current = now;
      onEnergyChange(sessionRef.current.energy);
    }
    if (outcome !== "playing") {
      onOutcome(outcome);
    }
  });
  return null;
}

