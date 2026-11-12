"use client";

import { Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { NightClock } from "@/shared/game-core/NightClock";

export const timeGlobals = {
  isNight: true,
  hour: 23,
  dayFactor: 0,
};

export function calculateDayFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  // Night shift from 23:00 to 06:00
  if (h >= 23 || h < 5) return 0.0;
  if (h >= 5 && h <= 6) return (h - 5) * 0.15; // subtle predawn ambient glow between 5 and 6
  if (h > 6 && h < 21) return 1.0;
  if (h >= 21 && h < 23) return 1.0 - (h - 21) / 2.0;
  return 0.0;
}

export function formatTime(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function EnvironmentSystem({
  hour,
  autoTime,
  onHourChange,
}: {
  hour: number;
  autoTime: boolean;
  onHourChange: (h: number) => void;
}) {
  const { scene } = useThree();
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const clockRef = useRef(new NightClock(hour));
  const lastReportRef = useRef(performance.now());

  useEffect(() => {
    const previousFog = scene.fog;
    scene.fog = new THREE.Fog("#050817", 18, 50);
    return () => { scene.fog = previousFog; };
  }, [scene]);

  useEffect(() => {
    clockRef.current.setHour(hour);
  }, [hour]);

  useFrame((_, dt) => {
    let currentHour = clockRef.current.hour;
    if (autoTime) {
      // A ten-minute window event lasts about 6.7 real seconds.
      currentHour = clockRef.current.advance(dt);
      const now = performance.now();
      if (currentHour === 6 || now - lastReportRef.current > 200) {
        lastReportRef.current = now;
        onHourChange(currentHour);
      }
    }

    const factor = calculateDayFactor(currentHour);
    timeGlobals.hour = currentHour;
    timeGlobals.dayFactor = factor;
    // Always night during the 23:00 - 06:00 shift
    timeGlobals.isNight = true;

    // Keep night fill dim so a building's spotlight shadow is visible in the scene.

    const skyColor = new THREE.Color().lerpColors(
      new THREE.Color("#050817"),
      new THREE.Color("#8aa0c8"),
      factor
    );
    scene.background = skyColor;
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(skyColor);

    if (hemiRef.current) {
      hemiRef.current.color.lerpColors(new THREE.Color("#2a3a5a"), new THREE.Color("#cfe8ff"), factor);
      hemiRef.current.groundColor.lerpColors(new THREE.Color("#050817"), new THREE.Color("#44506a"), factor);
      hemiRef.current.intensity = 0.08 + factor * 0.82;
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = 0.02 + factor * 0.53;
    }
    if (dirRef.current) {
      dirRef.current.intensity = 0.03 + factor * 1.57;
    }
  });

  return (
    <>
      <group visible={calculateDayFactor(hour) < 0.15}>
        <Stars radius={75} depth={25} count={2500} factor={2.4} saturation={0.08} fade speed={0} />
      </group>
      <hemisphereLight ref={hemiRef} />
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={dirRef}
        position={[20, 30, 15]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
    </>
  );
}

