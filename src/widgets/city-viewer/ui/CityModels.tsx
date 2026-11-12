"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useUncachedGLTF } from "@/shared/hooks/useUncachedGLTF";
import type { CityObject } from "@/shared/engine/CityGenerator";
import { buildingLightSeed, WindowLightTimeline, removeBuildingLightSource, setBuildingLightSource } from "@/shared/game-core/building-lights";
import { removeCityCollider, setCityCollider, setCityMeshCollider } from "../lib/city-colliders";
import { debugVisibility } from "../lib/debug-visibility";
import { LAMP_BASE_LIFT, type WorldLamp } from "../lib/world-lamp";
import { lampOutlineSelection } from "../lib/LampOutlineSelection";
import { timeGlobals } from "./EnvironmentSystem";

const CONNECTOR_COLOR = "#52c41a";

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
    if (ref.current) ref.current.visible = debugVisibility.connectors;
  });
  return (
    <mesh ref={ref} position={position} visible={false}>
      <boxGeometry args={[0.12, 0.12, 0.12]} />
      <meshStandardMaterial color={CONNECTOR_COLOR} emissive={CONNECTOR_COLOR} emissiveIntensity={0.6} />
    </mesh>
  );
}

const _boxSize = new THREE.Vector3();
const _lampHitPosition = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Intrinsic fit scale per model URL. Measured once in the model's own local space
// (independent of the parent group's transform) so re-renders can't re-derive a
// different scale — the old per-render Box3 measured through a stale parent matrix
// and oscillated between two building sizes on every re-render.
const _buildingFitCache = new Map<string, number>();
const _buildingBoundsCache = new Map<string, THREE.Box3>();

export function extractWorldLamps(
  objects: CityObject[],
  cellSize: number,
  visualDistance: number = DEFAULT_VISUAL_LIGHT_DISTANCE
): WorldLamp[] {
  const lamps: WorldLamp[] = [];
  for (const obj of objects) {
    if (!obj.lights || obj.lights.length === 0) continue;
    const isBuilding = obj.pack === "Models" || obj.pack === "buildings";
    const fitScale = isBuilding
      ? (_buildingFitCache.get(`/models/${obj.pack}/${obj.model}.glb`) || cellSize)
      : (obj.pack === "props" ? (obj.scale || 1) : cellSize);
    const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;

    const tilePos = new THREE.Vector3(obj.position[0], obj.position[1], obj.position[2]);
    const tileEuler = new THREE.Euler(obj.rotationX || 0, obj.rotation + frontRot, 0);
    const cellKey = `${Math.round(obj.position[0])}_${Math.round(obj.position[2])}`;

    for (let i = 0; i < obj.lights.length; i++) {
      const l = obj.lights[i];
      const hasModel = l.lampModel && l.lampModel !== "none";
      const isDoubleOrCross = l.lampModel?.includes("double") || l.lampModel?.includes("cross");
      const bulbOffset = new THREE.Vector3(
        0,
        hasModel ? 0.63 : 0,
        hasModel ? (isDoubleOrCross ? 0 : -0.17) : 0
      );
      const s = l.scale || 1;
      const rotArr = Array.isArray(l.rotation)
        ? [(l.rotation[0] * Math.PI) / 180, (l.rotation[1] * Math.PI) / 180, (l.rotation[2] * Math.PI) / 180]
        : [0, ((l.rotation || 0) * Math.PI) / 180, 0];
      const lampEuler = new THREE.Euler(rotArr[0], rotArr[1], rotArr[2]);

      const p = bulbOffset.clone();
      p.multiplyScalar(s);
      p.applyEuler(lampEuler);
      p.add(new THREE.Vector3(l.position[0], l.position[1] + (hasModel ? LAMP_BASE_LIFT : 0), l.position[2]));
      p.multiplyScalar(fitScale);
      p.applyEuler(tileEuler);
      p.add(tilePos);

      // Compute world direction vector of the spotlight beam: pointing straight down for full 360-degree coverage
      const localDir = new THREE.Vector3(0, -1, 0).normalize();
      localDir.applyEuler(lampEuler);
      localDir.applyEuler(tileEuler);
      localDir.normalize();

      const lampId = `${obj.position[0].toFixed(1)}_${obj.position[2].toFixed(1)}_${l.id || i}`;

      lamps.push({
        id: lampId,
        lampModel: l.lampModel || "default",
        cellKey,
        pos: p,
        dir: localDir,
        intensity: l.intensity ?? 3.5,
        distance: visualDistance,
        color: l.color || "#fff8e7",
        angle: (83 * Math.PI) / 180,
        penumbra: 0.25,
      });
    }
  }
  return lamps;
}

/** Axis-aligned box of a model in its own local space, ignoring parent transforms. */
function measureLocalBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const rootInv = _m.copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    geo.computeBoundingBox();
    const local = geo.boundingBox;
    if (!local) return;
    _m.multiplyMatrices(rootInv, mesh.matrixWorld);
    tmp.copy(local).applyMatrix4(_m);
    box.union(tmp);
  });
  return box;
}

/** Flat world-space triangle soup of a rendered subtree (indices implicit). */
function extractWorldTriangles(root: THREE.Object3D): number[] {
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const index = geo.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i++) {
      const vi = index ? index.getX(i) : i;
      v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

function LampMesh({ model, highlighted }: { model: string; highlighted: boolean }) {
  const gltf = useUncachedGLTF(`/models/lamps/${model}.glb`);
  const sceneClone = useMemo(() => gltf?.scene?.clone(true) ?? null, [gltf]);
  useEffect(() => {
    if (!highlighted || !sceneClone) return;
    lampOutlineSelection.select(sceneClone);
    return () => lampOutlineSelection.clear(sceneClone);
  }, [highlighted, sceneClone]);
  if (!sceneClone) return null;
  return <primitive object={sceneClone} />;
}

function BuildingWindowLights({ scene, bounds, fitScale, sourceId }: {
  scene: THREE.Object3D;
  bounds: THREE.Box3;
  fitScale: number;
  sourceId: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pointRef = useRef<THREE.SpotLight>(null);
  const sampleClockRef = useRef(0);
  const lastUpdateRef = useRef(-1);
  const size = useMemo(() => bounds.getSize(new THREE.Vector3()), [bounds]);
  const floors = Math.min(12, Math.max(1, Math.round(size.y * fitScale / 0.48)));
  const columns = sourceId.includes("skyscraper") ? 1 : 2;
  const windowCount = floors * columns * 4;
  const timeline = useMemo(() => new WindowLightTimeline(buildingLightSeed(sourceId), windowCount), [sourceId, windowCount]);
  const [hasActiveWindow, setHasActiveWindow] = useState(false);
  const glowUniforms = useRef({
    activeWindow: { value: -1 },
    glowLevel: { value: 0 },
    glowColor: { value: new THREE.Color("#ffd27a") },
    windowMin: { value: bounds.min.clone() },
    windowSize: { value: size.clone() },
    windowFloors: { value: floors },
    windowColumns: { value: columns },
  });
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    return object;
  }, []);

  useEffect(() => {
    const restored: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; replacements: THREE.Material[] }[] = [];
    glowUniforms.current.windowMin.value.copy(bounds.min);
    glowUniforms.current.windowSize.value.copy(size);
    glowUniforms.current.windowFloors.value = floors;
    glowUniforms.current.windowColumns.value = columns;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const materials = Array.isArray(original) ? original : [original];
      const replacements = materials.map((source) => {
        if (!(source instanceof THREE.MeshStandardMaterial) || !source.map) return source;
        const material = source.clone();
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, glowUniforms.current);
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vWindowPosition;\nvarying vec3 vWindowNormal;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWindowPosition = position;\nvWindowNormal = normal;");
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vWindowPosition;\nvarying vec3 vWindowNormal;\nuniform float activeWindow;\nuniform float glowLevel;\nuniform vec3 glowColor;\nuniform vec3 windowMin;\nuniform vec3 windowSize;\nuniform float windowFloors;\nuniform float windowColumns;")
            .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
              float blueGlass = smoothstep(0.18, 0.32, diffuseColor.b - diffuseColor.r)
                * smoothstep(0.12, 0.25, diffuseColor.b - diffuseColor.g)
                * smoothstep(0.55, 0.85, 1.0 - abs(vWindowNormal.y));
              float facade = abs(vWindowNormal.z) > abs(vWindowNormal.x)
                ? (vWindowNormal.z > 0.0 ? 0.0 : 1.0)
                : (vWindowNormal.x > 0.0 ? 2.0 : 3.0);
              float across = facade < 2.0
                ? (vWindowPosition.x - windowMin.x) / max(windowSize.x, 0.001)
                : (vWindowPosition.z - windowMin.z) / max(windowSize.z, 0.001);
              float column = floor(clamp(across, 0.0, 0.999) * windowColumns);
              float floorId = floor(clamp((vWindowPosition.y - windowMin.y) / max(windowSize.y, 0.001), 0.0, 0.999) * windowFloors);
              float windowId = facade * windowFloors * windowColumns + floorId * windowColumns + column;
              float selected = 1.0 - step(0.5, abs(windowId - activeWindow));
              totalEmissiveRadiance += blueGlass * selected * glowLevel * glowColor;
            `);
        };
        material.customProgramCacheKey = () => "nightwatcher-glass-v2";
        material.needsUpdate = true;
        return material;
      });
      object.material = Array.isArray(original) ? replacements : replacements[0];
      restored.push({ mesh: object, original, replacements: replacements.filter((material, index) => material !== materials[index]) });
    });
    return () => {
      for (const item of restored) {
        item.mesh.material = item.original;
        item.replacements.forEach((material) => material.dispose());
      }
    };
  }, [scene, bounds, size, floors, columns]);

  useEffect(() => () => removeBuildingLightSource(sourceId), [sourceId]);

  useFrame((_, dt) => {
    sampleClockRef.current += Math.min(dt, 0.05);
    if (sampleClockRef.current - lastUpdateRef.current < 0.1) return;
    lastUpdateRef.current = sampleClockRef.current;
    const state = timeline.at(timeGlobals.hour);
    const active = state.index >= 0 && state.level > 0.005;
    setHasActiveWindow((previous) => previous === active ? previous : active);
    glowUniforms.current.activeWindow.value = state.index;
    glowUniforms.current.glowLevel.value = state.level;
    glowUniforms.current.glowColor.value.set(state.computerLight ? "#8ecbff" : "#ffd27a");
    if (!active) {
      removeBuildingLightSource(sourceId);
    } else if (pointRef.current && groupRef.current) {
      const perFacade = floors * columns;
      const facade = state.index < 0 ? 0 : Math.floor(state.index / perFacade);
      const floor = state.index < 0 ? 0 : Math.floor((state.index % perFacade) / columns);
      const column = state.index < 0 ? 0 : state.index % columns;
      const fraction = (column + 0.5) / columns;
      const y = bounds.min.y + size.y * (floor + 0.5) / floors;
      const offset = 0.12 / fitScale;
      const position = new THREE.Vector3();
      const direction = new THREE.Vector3();
      if (facade === 0) { position.set(bounds.min.x + size.x * fraction, y, bounds.max.z + offset); direction.z = 1; }
      else if (facade === 1) { position.set(bounds.min.x + size.x * fraction, y, bounds.min.z - offset); direction.z = -1; }
      else if (facade === 2) { position.set(bounds.max.x + offset, y, bounds.min.z + size.z * fraction); direction.x = 1; }
      else { position.set(bounds.min.x - offset, y, bounds.min.z + size.z * fraction); direction.x = -1; }
      pointRef.current.position.copy(position);
      pointRef.current.color.copy(glowUniforms.current.glowColor.value);
      pointRef.current.intensity = 0.9 * state.level;
      target.position.copy(position).addScaledVector(direction, 1 / fitScale);
      groupRef.current.updateWorldMatrix(true, false);
      const world = groupRef.current.localToWorld(position.clone());
      const worldTarget = groupRef.current.localToWorld(target.position.clone());
      const worldDirection = worldTarget.sub(world).normalize();
      setBuildingLightSource(sourceId, { x: world.x, y: world.y, z: world.z, dirX: worldDirection.x, dirY: worldDirection.y, dirZ: worldDirection.z, intensity: pointRef.current.intensity, distance: 1.8 });
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={target} />
      {hasActiveWindow && <spotLight ref={pointRef} target={target} color="#ffd27a" intensity={0} distance={1.8} angle={0.85} penumbra={0.6} decay={2} />}
    </group>
  );
}

export const DEFAULT_VISUAL_LIGHT_DISTANCE = 16.0;

function RoadLampLight({
  light,
  bulbOffset,
  isOn,
  visualDistance = DEFAULT_VISUAL_LIGHT_DISTANCE,
  isDoubleOrCross = false,
  canCastShadow = true,
}: {
  light: NonNullable<CityObject["lights"]>[number];
  bulbOffset: [number, number, number];
  isOn: boolean;
  visualDistance?: number;
  isDoubleOrCross?: boolean;
  canCastShadow?: boolean;
}) {
  const target = useMemo(() => {
    const obj = new THREE.Object3D();
    // Aiming straight down illuminates symmetrically in all directions (street and sidewalks)
    obj.position.set(0, -1, 0);
    return obj;
  }, []);

  const intensity = (light.intensity ?? 3.5) * 1.0;

  return (
    <group position={bulbOffset}>
      <primitive object={target} />
      {isOn && (
        <spotLight
          position={[0, 0, 0]}
          target={target}
          color={light.color || "#fff8e7"}
          intensity={intensity}
          distance={visualDistance}
          angle={(83 * Math.PI) / 180}
          penumbra={0.25}
          decay={0}
          castShadow={canCastShadow}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0005}
          shadow-normalBias={0.035}
          shadow-radius={2}
          shadow-camera-near={0.5}
          shadow-camera-far={visualDistance}
        />
      )}
      {light.showSphere && !isDoubleOrCross && (
        <mesh>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial
            color={isOn ? (light.color || "#fff8e7") : "#22252a"}
            emissive={isOn ? (light.color || "#ffea9f") : "#000000"}
            emissiveIntensity={isOn ? 3.5 : 0}
            roughness={isOn ? 0.1 : 0.8}
          />
        </mesh>
      )}
    </group>
  );
}

function InteractiveRoadLamp({
  id, light, rotation, scale, bulbOffset, isOn, canCastShadow, visualDistance, onToggle,
}: {
  id: string;
  light: NonNullable<CityObject["lights"]>[number];
  rotation: [number, number, number];
  scale: number;
  bulbOffset: [number, number, number];
  isOn: boolean;
  canCastShadow: boolean;
  visualDistance: number;
  onToggle: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTargetRef = useRef<THREE.Mesh>(null);
  const hasModel = Boolean(light.lampModel && light.lampModel !== "none");
  const isDoubleOrCross = Boolean(light.lampModel?.includes("double") || light.lampModel?.includes("cross"));
  useEffect(() => () => { document.body.style.cursor = "auto"; }, []);

  return (
    <group
      position={[light.position[0], light.position[1] + (hasModel ? LAMP_BASE_LIFT : 0), light.position[2]]}
      rotation={rotation}
      scale={[scale, scale, scale]}
      onClick={(event) => { event.stopPropagation(); onToggle(id); }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      {hasModel && <LampMesh model={light.lampModel!} highlighted={hovered} />}
      <RoadLampLight
        light={light}
        bulbOffset={bulbOffset}
        isOn={isOn}
        visualDistance={visualDistance}
        isDoubleOrCross={isDoubleOrCross}
        canCastShadow={canCastShadow}
      />
      <mesh
        ref={hoverTargetRef}
        position={[0, 0.35, isDoubleOrCross ? 0 : -0.07]}
        userData={{ outlineIgnore: true }}
        onBeforeRender={(_, __, camera) => {
          const mesh = hoverTargetRef.current;
          if (!mesh) return;
          // Keep the transparent hover target hittable when the lamp is far away.
          const distance = camera.position.distanceTo(mesh.getWorldPosition(_lampHitPosition));
          mesh.scale.setScalar(THREE.MathUtils.clamp(distance / 16, 1, 2.5));
        }}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.75, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function RoadModel({
  obj,
  cellSize,
  colliderKey,
  placedLampIds,
  disabledLampIds,
  shadowLampIds,
  onToggleLamp,
  onBuildingReady,
  visualDistance = DEFAULT_VISUAL_LIGHT_DISTANCE,
}: {
  obj: CityObject;
  cellSize: number;
  colliderKey: string;
  placedLampIds: Set<string>;
  disabledLampIds: Set<string>;
  shadowLampIds?: Set<string>;
  onToggleLamp: (id: string) => void;
  onBuildingReady: (modelUrl: string) => void;
  visualDistance?: number;
}) {
  const gltf = useUncachedGLTF(`/models/${obj.pack}/${obj.model}.glb`);
  const outerRef = useRef<THREE.Group>(null);
  const colliderRegistered = useRef(false);
  const isBuilding = obj.pack === "Models" || obj.pack === "buildings";

  useFrame(() => {
    const g = outerRef.current;
    if (!g || colliderRegistered.current || !gltf?.scene) return;
    // Force the full subtree world matrices: R3F applies element props in commit, but
    // matrixWorld is only recomputed at render, so measure them ourselves here.
    g.updateWorldMatrix(true, true);
    if (isBuilding) {
      // Exact triangle soup of the facade — ragdolls hit the real geometry, not a box.
      const positions = extractWorldTriangles(g);
      if (positions.length < 9) return;
      colliderRegistered.current = true;
      setCityMeshCollider({ key: colliderKey, positions });
    } else {
      // Measure ONLY the road geometry, not the 5.4m tall street lamps mounted on it
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(_boxSize);
      if (size.x < 1e-4 || size.z < 1e-4) return;
      colliderRegistered.current = true;
      setCityCollider({
        key: colliderKey,
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      });
    }
  });

  useEffect(() => {
    colliderRegistered.current = false;
    return () => {
      colliderRegistered.current = false;
      removeCityCollider(colliderKey);
    };
  }, [colliderKey]);

  useEffect(() => {
    if (!gltf?.scene) return;
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = isBuilding;
        child.receiveShadow = true;
      }
    });
  }, [gltf, isBuilding]);

  useEffect(() => {
    if (isBuilding && gltf?.scene) onBuildingReady(`/models/${obj.pack}/${obj.model}.glb`);
  }, [isBuilding, gltf, obj.pack, obj.model, onBuildingReady]);

  if (!gltf) return null;

  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.position.set(0, 0, 0);
  gltf.scene.scale.set(1, 1, 1);

  const fitScale = isBuilding ? (() => {
    // Measured once per model in the model's own local space and cached, so a re-render
    // (e.g. the revive-all button, dev sliders) can't re-derive a different scale —
    // measuring through the parent group's stale matrix made buildings grow/shrink.
    const modelUrl = `/models/${obj.pack}/${obj.model}.glb`;
    const cached = _buildingFitCache.get(modelUrl);
    if (cached !== undefined) return cached;
    const box = measureLocalBox(gltf.scene);
    const size = box.getSize(_boxSize);
    const fs = Math.min(cellSize / Math.max(size.x, 1e-6), cellSize / Math.max(size.z, 1e-6));
    if (fs > 0 && fs < 1e4) _buildingFitCache.set(modelUrl, fs);
    return fs;
  })() : obj.pack === "props" ? (obj.scale || 1) : cellSize;

  const frontRot = isBuilding ? (FRONT_ROTATION[obj.frontDir || "none"] || 0) : 0;
  const shadowBox = isBuilding ? (() => {
    const modelUrl = `/models/${obj.pack}/${obj.model}.glb`;
    const cached = _buildingBoundsCache.get(modelUrl);
    if (cached) return cached;
    const bounds = measureLocalBox(gltf.scene);
    _buildingBoundsCache.set(modelUrl, bounds);
    return bounds;
  })() : null;
  const shadowSize = shadowBox?.getSize(new THREE.Vector3());
  const shadowCenter = shadowBox?.getCenter(new THREE.Vector3());

  return (
    <group ref={outerRef} position={obj.position}>
      <group rotation={[obj.rotationX || 0, obj.rotation + frontRot, 0]} scale={[fitScale, fitScale, fitScale]}>
        <primitive object={gltf.scene} />
        {shadowSize && shadowCenter && shadowSize.y > 0 && (
          <mesh position={[shadowCenter.x, shadowCenter.y, shadowCenter.z]} castShadow>
            <boxGeometry args={[shadowSize.x * 0.96, shadowSize.y, shadowSize.z * 0.96]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
        )}
        {shadowBox && <BuildingWindowLights scene={gltf.scene} bounds={shadowBox} fitScale={fitScale} sourceId={colliderKey} />}
        {obj.lights && obj.lights.map((l, i) => {
          const hasModel = l.lampModel && l.lampModel !== "none";
          const isDoubleOrCross = l.lampModel?.includes("double") || l.lampModel?.includes("cross");
          const bulbOffset: [number, number, number] = hasModel
            ? [0, 0.63, isDoubleOrCross ? 0 : -0.17]
            : [0, 0, 0];
          const rot = Array.isArray(l.rotation)
            ? [(l.rotation[0] * Math.PI) / 180, (l.rotation[1] * Math.PI) / 180, (l.rotation[2] * Math.PI) / 180] as [number, number, number]
            : [0, ((l.rotation || 0) * Math.PI) / 180, 0] as [number, number, number];

          const s = l.scale || 1;
          const lampId = `${obj.position[0].toFixed(1)}_${obj.position[2].toFixed(1)}_${l.id || i}`;
          const isPlaced = placedLampIds.has(lampId);
          const isOn = !disabledLampIds.has(lampId);

          // Не спавним фонарь, если алгоритм не выделил это место
          if (!isPlaced) return null;

          return <InteractiveRoadLamp
            key={lampId}
            id={lampId}
            light={l}
            rotation={rot}
            scale={s}
            bulbOffset={bulbOffset}
            isOn={isOn}
            canCastShadow={isOn && (!shadowLampIds || shadowLampIds.has(lampId))}
            visualDistance={visualDistance}
            onToggle={onToggleLamp}
          />;
        })}
        {obj.connRight && <ConnectionCube position={[0.5, 0.15, 0]} />}
        {obj.connBack && <ConnectionCube position={[0, 0.15, 0.5]} />}
        {obj.connLeft && <ConnectionCube position={[-0.5, 0.15, 0]} />}
        {obj.connFront && <ConnectionCube position={[0, 0.15, -0.5]} />}
      </group>
    </group>
  );
}

