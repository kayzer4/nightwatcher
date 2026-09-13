"use client";

import { useEffect, useState } from "react";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";

export function useUncachedGLTF(url: string) {
  const [gltf, setGltf] = useState<GLTF | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    let cancelled = false;

    loader.load(url, (gltf) => {
      if (!cancelled) {
        setGltf(gltf);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return gltf;
}
