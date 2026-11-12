"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DEFAULT_CONFIG } from "@/shared/engine/CityGenerator";
import { createCityCameraBounds } from "../lib/CameraBounds";

const MAX_PAN_X = (DEFAULT_CONFIG.gridSizeX - 1) * DEFAULT_CONFIG.cellSize / 2;
const MAX_PAN_Z = (DEFAULT_CONFIG.gridSizeZ - 1) * DEFAULT_CONFIG.cellSize / 2;

/** Left drag orbits, right drag pans in screen space, wheel smoothly dollies. */
export function CityCameraControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const desiredDistanceRef = useRef<number | null>(null);
  const boundsRef = useRef(createCityCameraBounds(MAX_PAN_X, MAX_PAN_Z));
  const adjustingBoundsRef = useRef(false);
  const { gl } = useThree();

  const keepCameraInBounds = () => {
    const controls = controlsRef.current;
    if (!controls || adjustingBoundsRef.current) return;
    if (!boundsRef.current.constrain(controls)) return;
    adjustingBoundsRef.current = true;
    controls.update();
    adjustingBoundsRef.current = false;
  };

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const desired = desiredDistanceRef.current;
    if (!controls || desired === null) return;
    const offset = controls.object.position.clone().sub(controls.target);
    const distance = offset.length();
    if (distance < 1e-6) return;
    const blend = 1 - Math.exp(-9 * Math.min(delta, 0.1));
    const nextDistance = Math.abs(desired - distance) < 0.01
      ? desired
      : THREE.MathUtils.lerp(distance, desired, blend);
    controls.object.position.copy(controls.target).addScaledVector(offset, nextDistance / distance);
    controls.update();
    if (nextDistance === desired) desiredDistanceRef.current = null;
  });

  useEffect(() => {
    const element = gl.domElement;
    const zoom = (event: WheelEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const distance = desiredDistanceRef.current ?? controls.object.position.distanceTo(controls.target);
      if (distance < 1e-6) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      desiredDistanceRef.current = THREE.MathUtils.clamp(distance * Math.exp(delta * 0.0012), 5, 18);
    };
    const stopMenu = (event: MouseEvent) => event.preventDefault();
    element.addEventListener("wheel", zoom, { passive: false, capture: true });
    element.addEventListener("contextmenu", stopMenu);
    return () => {
      element.removeEventListener("wheel", zoom, true);
      element.removeEventListener("contextmenu", stopMenu);
    };
  }, [gl]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      enableZoom
      enableRotate
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning
      minDistance={5}
      maxDistance={18}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI * 0.49}
      onChange={keepCameraInBounds}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
}
