"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { LampOutlineComposer } from "../lib/LampOutlineComposer";
import { lampOutlineSelection } from "../lib/LampOutlineSelection";

export function LampOutlineEffect() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<LampOutlineComposer | null>(null);

  useEffect(() => () => {
    composerRef.current?.dispose();
    composerRef.current = null;
  }, []);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame((_, delta) => {
    if (!composerRef.current) composerRef.current = new LampOutlineComposer(gl, scene, camera, size.width, size.height);
    composerRef.current.render(delta, lampOutlineSelection.current);
  }, 1);

  return null;
}
