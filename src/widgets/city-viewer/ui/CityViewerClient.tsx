"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useState, useEffect } from "react";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import { useCityGenerator } from "@/shared/hooks/useCityGenerator";
import { CityObject, ModelConfig, DEFAULT_CONFIG } from "@/shared/engine/CityGenerator";

function CityObjectModel({ obj }: { obj: CityObject }) {
  const gltf = useUncachedGLTF(`/models/${obj.pack}/${obj.model}.glb`);
  if (!gltf) return null;

  const isRoad = obj.model.startsWith("road-");
  const isTileHigh = obj.model === "tile-high";
  const isTileLow = obj.model === "tile-low";
  const isBuilding = obj.pack === "Models";

  let scale: [number, number, number];
  if (isTileHigh) {
    scale = [1, 8, 1];
  } else if (isTileLow) {
    scale = [1, 1, 1];
  } else if (isRoad) {
    scale = [1.15, 1, 1.15];
  } else if (isBuilding) {
    const s = obj.scale || 1.1;
    scale = [s, s, s];
  } else {
    scale = [1, 1, 1];
  }

  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);

  const foundation = obj.foundation;

  return (
    <group>
      <group
        position={obj.position}
        rotation={[0, obj.rotation, 0]}
        scale={scale}
      >
        <primitive object={gltf.scene} />
      </group>
      {foundation && <FoundationModel model={foundation.model} scale={foundation.scale} offsetY={foundation.offsetY} position={obj.position} />}
    </group>
  );
}

function FoundationModel({ model, scale, offsetY, position }: { model: string; scale: number; offsetY: number; position: [number, number, number] }) {
  const gltf = useUncachedGLTF(`/models/roads/${model}.glb`);
  if (!gltf) return null;
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);
  return (
    <group position={[position[0], offsetY, position[2]]} scale={[scale, 1, scale]}>
      <primitive object={gltf.scene.clone()} />
    </group>
  );
}

function GeneratedCity({ seed, modelConfigs }: { seed: number; modelConfigs?: Record<string, ModelConfig> }) {
  const city = useCityGenerator(seed, modelConfigs);
  return (
    <group>
      {city.objects.map((obj, i) => (
        <CityObjectModel key={`${obj.model}-${i}`} obj={obj} />
      ))}
    </group>
  );
}

function Loader() {
  return (
    <mesh position={[0, 5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="gray" wireframe />
    </mesh>
  );
}

export function CityViewerClient() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const regenerate = () => setSeed(Math.floor(Math.random() * 100000));

  useEffect(() => {
    fetch("/api/model-configs")
      .then((r) => r.json())
      .then((data) => {
        if (data.configs) setModelConfigs(data.configs);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full h-screen relative">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={regenerate}
          className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-5 py-2.5 rounded-xl hover:bg-white/20 transition-all text-sm font-medium shadow-lg"
        >
          Новый город
        </button>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-white/60 text-center">
          {DEFAULT_CONFIG.gridSize}x{DEFAULT_CONFIG.gridSize} · seed: {seed}
        </div>
      </div>
      <Canvas camera={{ position: [30, 35, 30], fov: 45 }} shadows>
        <color attach="background" args={["#1a1a2e"]} />
        <fog attach="fog" args={["#1a1a2e", 40, 80]} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[20, 30, 15]}
          intensity={0.9}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Suspense fallback={<Loader />}>
          <GeneratedCity seed={seed} modelConfigs={modelConfigs} />
        </Suspense>
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.1}
          minDistance={10}
          maxDistance={80}
        />
      </Canvas>
    </div>
  );
}
