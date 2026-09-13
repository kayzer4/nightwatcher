"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useState } from "react";
import { Button } from "@/shared/ui";

const AVAILABLE_MODELS = [
  "building-a",
  "building-b",
  "building-c",
  "building-d",
  "building-e",
];

interface PlacedBuilding {
  id: string;
  name: string;
  position: [number, number, number];
}

function PlacedBuilding({ name, position }: { name: string; position: [number, number, number] }) {
  const { scene } = useGLTF(`/models/Models/${name}.glb`);
  return <primitive object={scene.clone()} position={position} />;
}

export function CityEditor() {
  const [placed, setPlaced] = useState<PlacedBuilding[]>([]);
  const [selected, setSelected] = useState(AVAILABLE_MODELS[0]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    const x = Math.round((Math.random() - 0.5) * 20);
    const z = Math.round((Math.random() - 0.5) * 20);
    setPlaced((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: selected, position: [x, 0, z] },
    ]);
  };

  return (
    <div className="flex h-screen">
      <div className="w-64 bg-zinc-900 p-4 flex flex-col gap-2">
        <h2 className="text-lg font-bold text-white mb-2">Здания</h2>
        {AVAILABLE_MODELS.map((m) => (
          <button
            key={m}
            onClick={() => setSelected(m)}
            className={`text-left px-3 py-2 rounded ${
              selected === m ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {m}
          </button>
        ))}
        <Button
          variant="ghost"
          className="mt-auto"
          onClick={() => setPlaced([])}
        >
          Очистить
        </Button>
      </div>
      <div className="flex-1" onClick={handleCanvasClick}>
        <Canvas camera={{ position: [15, 20, 30], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 20, 10]} intensity={1} />
          <Suspense fallback={null}>
            {placed.map((b) => (
              <PlacedBuilding key={b.id} name={b.name} position={b.position} />
            ))}
          </Suspense>
          <OrbitControls />
          <gridHelper args={[50, 50, "#444", "#222"]} />
        </Canvas>
      </div>
    </div>
  );
}
