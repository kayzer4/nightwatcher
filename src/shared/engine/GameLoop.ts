import { useFrame } from "@react-three/fiber";
import { TimeSystem } from "./TimeSystem";
import { eventBus, GAME_EVENTS } from "./EventBus";
import { useGameStore } from "@/shared/store/gameStore";
import { useRef } from "react";

export function GameLoop() {
  const timeRef = useRef(new TimeSystem());
  const setTime = useGameStore((s) => s.setTime);

  useFrame((_, delta) => {
    const time = timeRef.current;
    time.update(delta);
    setTime(time.hour);
    eventBus.emit(GAME_EVENTS.TIME_UPDATED, time.hour);
  });

  return null;
}
