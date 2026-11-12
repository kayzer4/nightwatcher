"use client";

import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DEFAULT_CONFIG, type CityObject } from "@/shared/engine/CityGenerator";
import { backdropLOD, type BackdropLOD, type BackdropModelGroup } from "../lib/BackdropCityPlan";
import { backdropGeometry } from "../lib/BackdropLODGeometry";
import { BackdropInstanceBatch } from "../lib/BackdropInstanceBatch";

const GROUND_SIZE = 200;
const FRONT_ROTATION: Record<string, number> = {
  front: 0,
  right: -Math.PI / 2,
  back: Math.PI,
  left: Math.PI / 2,
  none: 0,
};

/** A large flat surface follows the camera; fog hides its edge. */
export function WorldGround() {
  const groundRef = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (!groundRef.current) return;
    groundRef.current.position.x = camera.position.x;
    groundRef.current.position.z = camera.position.z;
  });
  return (
    <mesh ref={groundRef} position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial color="#20232c" roughness={1} />
    </mesh>
  );
}

/** The playable block keeps its own roadbed under the GLB streets. */
export function PlayableDistrict() {
  const halfX = DEFAULT_CONFIG.gridSizeX * DEFAULT_CONFIG.cellSize / 2;
  const halfZ = DEFAULT_CONFIG.gridSizeZ * DEFAULT_CONFIG.cellSize / 2;
  return (
    <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[halfX * 2, halfZ * 2]} />
      <meshStandardMaterial color="#3a3a3a" roughness={1} />
    </mesh>
  );
}

function modelMatrix(object: CityObject, fitScale: number): THREE.Matrix4 {
  const isBuilding = object.pack === "Models" || object.pack === "buildings";
  const frontRotation = isBuilding ? FRONT_ROTATION[object.frontDir || "none"] : 0;
  const modelScale = isBuilding ? fitScale * object.scale / DEFAULT_CONFIG.cellSize : fitScale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...object.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(object.rotationX || 0, object.rotation + frontRotation, 0)),
    new THREE.Vector3(modelScale, modelScale, modelScale),
  );
}

function TexturedBackdropModel({ group }: { group: BackdropModelGroup }) {
  const gltf = useGLTF(group.url);
  const elapsedRef = useRef(1);
  const lastCameraPositionRef = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));
  const partsRef = useRef<BackdropInstanceBatch[]>([]);
  const { root, parts, materials } = useMemo(() => {
    const source = gltf.scene;
    source.updateMatrixWorld(true);
    const sourceBox = new THREE.Box3().setFromObject(source);
    const sourceSize = sourceBox.getSize(new THREE.Vector3());
    const isBuilding = group.objects[0]?.pack === "Models" || group.objects[0]?.pack === "buildings";
    const fitScale = isBuilding
      ? Math.min(DEFAULT_CONFIG.cellSize / Math.max(sourceSize.x, 1e-6), DEFAULT_CONFIG.cellSize / Math.max(sourceSize.z, 1e-6))
      : DEFAULT_CONFIG.cellSize;
    const objectMatrices = group.objects.map((object) => modelMatrix(object, fitScale));
    const meshes: THREE.Mesh[] = [];
    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.geometry?.attributes.position) return;
      meshes.push(object);
    });
    const root = new THREE.Group();
    const materials: THREE.Material[] = [];
    const parts = meshes.map((mesh, meshIndex) => {
      const tinted = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        if ("color" in material && material.color instanceof THREE.Color) material.color.multiplyScalar(0.5);
        materials.push(material);
        return material;
      });
      const material = Array.isArray(mesh.material) ? tinted : tinted[0];
      const instances = [0, 1, 2].map((level) => {
        const geometry = backdropGeometry(group.url, meshIndex, level as 0 | 1 | 2, mesh.geometry);
        const instance = new THREE.InstancedMesh(geometry, material, group.objects.length);
        instance.visible = false;
        instance.frustumCulled = false;
        instance.castShadow = false;
        root.add(instance);
        return instance;
      }) as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
      return new BackdropInstanceBatch(instances, objectMatrices.map((matrix) => matrix.clone().multiply(mesh.matrixWorld)));
    });
    return { root, parts, materials };
  }, [gltf.scene, group]);

  useLayoutEffect(() => {
    partsRef.current = parts;
    return () => { partsRef.current = []; };
  }, [parts]);

  useEffect(() => () => {
    for (const part of parts) part.dispose();
    for (const material of materials) material.dispose();
  }, [parts, materials]);

  useFrame(({ camera }, delta) => {
    elapsedRef.current += delta;
    if (elapsedRef.current < 0.6) return;
    elapsedRef.current = 0;
    if (lastCameraPositionRef.current.distanceToSquared(camera.position) < 0.25) return;
    lastCameraPositionRef.current.copy(camera.position);
    const levels: BackdropLOD[] = group.objects.map((object) => {
      const dx = camera.position.x - object.position[0];
      const dy = camera.position.y - object.position[1];
      const dz = camera.position.z - object.position[2];
      return backdropLOD(Math.sqrt(dx * dx + dy * dy + dz * dz));
    });
    for (const part of partsRef.current) part.update(levels);
  });

  return <primitive object={root} />;
}

export function WorldBackdrop({ groups }: { groups: readonly BackdropModelGroup[] }) {
  return <group>{groups.map((group) => <TexturedBackdropModel key={group.url} group={group} />)}</group>;
}
