"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import { CityGenerator, CityObject, ModelConfig, DEFAULT_CONFIG } from "@/shared/engine/CityGenerator";

const CONNECTOR_COLOR = "#52c41a";

let _showConnectors = typeof window !== "undefined" && localStorage.getItem("nw_showConnectors") === "true";

const FRONT_ROTATION: Record<string, number> = {
  front: 0,
  right: -Math.PI / 2,
  back: Math.PI,
  left: Math.PI / 2,
  none: 0,
};

function ConnectionCube({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = _showConnectors;
  });
  return (
    <mesh ref={ref} position={position} visible={false}>
      <boxGeometry args={[0.12, 0.12, 0.12]} />
      <meshStandardMaterial color={CONNECTOR_COLOR} emissive={CONNECTOR_COLOR} emissiveIntensity={0.6} />
    </mesh>
  );
}

function RoadModel({ obj }: { obj: CityObject }) {
  const gltf = useUncachedGLTF(`/models/${obj.pack}/${obj.model}.glb`);
  if (!gltf) return null;

  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);

  const isBuilding = obj.pack === "Models";
  const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;

  return (
    <group position={obj.position}>
      <group rotation={[obj.rotationX || 0, obj.rotation + frontRot, 0]} scale={[obj.scale, obj.scale, obj.scale]}>
        <primitive object={gltf.scene} />
        {obj.connRight && <ConnectionCube position={[0.5, 0.15, 0]} />}
        {obj.connBack && <ConnectionCube position={[0, 0.15, 0.5]} />}
        {obj.connLeft && <ConnectionCube position={[-0.5, 0.15, 0]} />}
        {obj.connFront && <ConnectionCube position={[0, 0.15, -0.5]} />}
      </group>
    </group>
  );
}

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh>;
}

export function CityViewerClient() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    setIsDev(process.env.NODE_ENV === "development");
  }, []);

  const fetchConfigs = useCallback(() => {
    fetch("/api/model-configs")
      .then((r) => r.json())
      .then((data) => {
        if (data.configs) setModelConfigs(data.configs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const generator = new CityGenerator(DEFAULT_CONFIG, modelConfigs);
  const objects = generator.generate();

  const roadCount = objects.filter((o) => o.pack === "roads").length;
  const buildingCount = objects.filter((o) => o.pack === "Models").length;

  return (
    <div className="w-full h-screen relative">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setSeed(Math.floor(Math.random() * 100000))}
          className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-5 py-2.5 rounded-xl hover:bg-white/20 transition-all text-sm font-medium shadow-lg"
        >
          Новый город
        </button>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-white/60 text-center">
          {DEFAULT_CONFIG.gridSizeX}x{DEFAULT_CONFIG.gridSizeZ} · seed: {seed}
        </div>
      </div>

      {isDev && (
        <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white text-sm min-w-[200px]">
          <div className="font-bold mb-3 text-white/80 text-xs uppercase tracking-wider">Dev Tools</div>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={_showConnectors}
              onChange={(e) => {
                _showConnectors = e.target.checked;
                localStorage.setItem("nw_showConnectors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-green-500"
            />
            <span>Show Connectors</span>
          </label>
          <div className="flex gap-2 mt-3 text-[10px] text-white/50">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background: CONNECTOR_COLOR}} />Connection</span>
          </div>
          <div className="mt-3 text-[10px] text-white/50 space-y-1">
            <div>Roads: {roadCount}</div>
            <div>Buildings: {buildingCount}</div>
            <div>Total: {objects.length}</div>
          </div>
        </div>
      )}
      <Canvas camera={{ position: [12, 16, 12], fov: 45 }} shadows>
        <color attach="background" args={["#1a1a2e"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[20, 30, 15]} intensity={0.9} castShadow />
        <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[DEFAULT_CONFIG.gridSizeX, DEFAULT_CONFIG.gridSizeZ]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <Suspense fallback={<Loader />}>
          {objects.map((obj, i) => (
            <RoadModel key={`${obj.model}-${i}`} obj={obj} />
          ))}
        </Suspense>
        <OrbitControls enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
