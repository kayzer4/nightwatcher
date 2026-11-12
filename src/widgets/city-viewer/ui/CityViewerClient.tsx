"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createCityPlan, INITIAL_DISSATISFACTION } from "@/shared/game-core";
import { energyUsePerSecond, INITIAL_ENERGY } from "@/shared/game-core/session";
import { DEFAULT_CONFIG, type ModelConfig, type PlacedAttractor } from "@/shared/engine/CityGenerator";
import { greedySetCoverLamps, intersectionFirstLamps, criticalPathLamps, extractBuildingBoxes } from "../lib/lamp-placement";
import { debugVisibility } from "../lib/debug-visibility";
import { NPCManager } from "./NPCSystem";
import { RoadModel, extractWorldLamps, DEFAULT_VISUAL_LIGHT_DISTANCE } from "./CityModels";
import { EnvironmentSystem, formatTime, timeGlobals } from "./EnvironmentSystem";
import { CityCameraControls } from "./CityCameraControls";
import { GameSessionSystem } from "./GameSessionSystem";
import { PlayableDistrict, WorldBackdrop, WorldGround } from "./WorldBackdrop";
import { LampOutlineEffect } from "./LampOutlineEffect";
import { BackdropCityPlan } from "../lib/BackdropCityPlan";
import { prepareBackdropLOD } from "../lib/BackdropLODGeometry";

const CONNECTOR_COLOR = "#52c41a";
const ATTRACTOR_COLOR = "#fadb14";
const NPC_COUNT = 10;

function AttractorCube({ attr }: { attr: PlacedAttractor }) {
  const ref = useRef<THREE.Mesh>(null);
  const s = attr.scale;
  useFrame(() => {
    if (ref.current) ref.current.visible = debugVisibility.attractors;
  });
  return (
    <mesh
      ref={ref}
      position={[attr.position[0], attr.position[1] + s / 2, attr.position[2]]}
      rotation={[0, attr.rotation, 0]}
    >
      <boxGeometry args={[s, s, s]} />
      <meshStandardMaterial color={ATTRACTOR_COLOR} emissive={ATTRACTOR_COLOR} emissiveIntensity={0.45} />
    </mesh>
  );
}

const ALL_DIRS = [0, 45, 90, 135, 180, 225, 270, 315];

function VectorArrows({ attr }: { attr: PlacedAttractor }) {
  const ref = useRef<THREE.Group>(null);
  const arrows = useMemo(() => {
    const dirs = attr.dirs ?? ALL_DIRS;
    const cross = new Set(attr.crossDirs ?? []);
    return dirs.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return new THREE.ArrowHelper(
        new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)),
        new THREE.Vector3(attr.position[0], attr.position[1], attr.position[2]),
        0.5, cross.has(deg) ? "#52c41a" : "#1677ff", 0.16, 0.08,
      );
    });
  }, [attr]);
  useEffect(() => () => { arrows.forEach((a) => a.dispose()); }, [arrows]);
  useFrame(() => {
    if (ref.current) ref.current.visible = debugVisibility.vectors;
  });
  return (
    <group ref={ref} visible={debugVisibility.vectors}>
      {arrows.map((a, i) => <primitive key={i} object={a} />)}
    </group>
  );
}

function Loader() {
  return <mesh position={[0, 0.5, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh>;
}

export function CityViewerClient() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [seedInput, setSeedInput] = useState(() => String(seed));
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [gamePhase, setGamePhase] = useState<"loading" | "ready" | "playing" | "error" | "won" | "lost-energy" | "lost-dissatisfaction">("loading");
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadMessage, setLoadMessage] = useState("Загрузка конфигурации города");
  const [modelFitVersion, setModelFitVersion] = useState(0);
  const readyBuildingModels = useRef(new Set<string>());
  const onBuildingReady = useCallback((modelUrl: string) => {
    if (readyBuildingModels.current.has(modelUrl)) return;
    readyBuildingModels.current.add(modelUrl);
    setModelFitVersion((version) => version + 1);
  }, []);
  const [isDev, setIsDev] = useState(false);
  const [dropAllNonce, setDropAllNonce] = useState(0);
  const [reviveAllNonce, setReviveAllNonce] = useState(0);
  const [breakAccel, setBreakAccel] = useState(600);
  const [breakingEnabled, setBreakingEnabled] = useState(false);
  const [timeHour, setTimeHour] = useState(23);
  const [autoTime, setAutoTime] = useState(false);
  const [showLightLevels, setShowLightLevels] = useState(debugVisibility.lightLevels);
  const [showNPCs, setShowNPCs] = useState(true);
  const [showLightRays, setShowLightRays] = useState(() => debugVisibility.lightRays);
  const [lightStats, setLightStats] = useState({ lit: 0, dark: 0, total: 0, avg: 1, dissatisfaction: INITIAL_DISSATISFACTION });
  const [energy, setEnergy] = useState(INITIAL_ENERGY);
  const [sessionId, setSessionId] = useState(0);

  useEffect(() => {
    setIsDev(process.env.NODE_ENV === "development");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setConfigsLoaded(false);
    setLoadMessage("Загрузка конфигурации города");
    fetch("/api/model-configs")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setModelConfigs(data.configs ?? {});
        setConfigsLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadMessage(`Не удалось загрузить конфигурацию: ${String(error)}`);
        setGamePhase("error");
      });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const cityPlan = useMemo(
    () => configsLoaded ? createCityPlan(seed, modelConfigs) : { objects: [], attractors: [], assetUrls: [] },
    [seed, modelConfigs, configsLoaded],
  );
  const backdropPlan = useMemo(
    () => configsLoaded ? new BackdropCityPlan(seed, modelConfigs).generate() : { groups: [], assetUrls: [], layers: [] },
    [seed, modelConfigs, configsLoaded],
  );
  const { objects, attractors } = cityPlan;

  useEffect(() => {
    if (!configsLoaded) return;
    let cancelled = false;
    setGamePhase("loading");
    setLoadProgress(5);
    setLoadMessage("Город и маршруты готовы. Загружаем модели");
    const loader = new GLTFLoader();
    const urls = [...new Set([...cityPlan.assetUrls, ...backdropPlan.assetUrls])];
    const loadedScenes = new Map<string, THREE.Object3D>();
    let completed = 0;
    (async () => {
      try {
        await Promise.all(urls.map(async (url) => {
          const model = await loader.loadAsync(url);
          if (cancelled) return;
          loadedScenes.set(url, model.scene);
          completed++;
          setLoadProgress(5 + Math.round((completed / Math.max(1, urls.length)) * 85));
          setLoadMessage(`Загружено моделей: ${completed} / ${urls.length}`);
        }));
        if (cancelled) return;
        setLoadMessage("Создаём уровни детализации районов");
        await Promise.all(backdropPlan.assetUrls.map((url) => {
          const scene = loadedScenes.get(url);
          return scene ? prepareBackdropLOD(url, scene) : Promise.resolve();
        }));
        if (cancelled) return;
        setLoadProgress(95);
        setLoadMessage("Подготовка физики и освещения");
        const ragdoll = await import("../lib/ragdoll");
        await ragdoll.initRapier();
        if (cancelled) return;
        setLoadProgress(100);
        setLoadMessage("Город готов к ночной смене");
        setGamePhase("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadMessage(`Ошибка подготовки: ${String(error)}`);
        setGamePhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [cityPlan, backdropPlan, configsLoaded, loadAttempt]);

  const [lampVisualDistance, setLampVisualDistance] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nw_lampVisualDistance");
      if (saved) {
        const val = Number(saved);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return DEFAULT_VISUAL_LIGHT_DISTANCE;
  });

  const worldLamps = useMemo(() => {
    // modelFitVersion invalidates the positions after building GLBs populate the fit cache.
    return extractWorldLamps(objects, DEFAULT_CONFIG.cellSize, lampVisualDistance);
  }, [objects, lampVisualDistance, modelFitVersion]);

  const buildingBoxes = useMemo(() => {
    return extractBuildingBoxes(objects, DEFAULT_CONFIG.cellSize);
  }, [objects]);

  type PlacementMode = "greedy" | "intersection" | "path" | "all" | "none" | "custom";
  const [placementMode, setPlacementMode] = useState<PlacementMode>("greedy");
  const [placedLampIds, setPlacedLampIds] = useState<Set<string>>(() => new Set());
  const [disabledLampIds, setDisabledLampIds] = useState<Set<string>>(() => new Set());

  const shadowLampIds = useMemo(() => {
    const arr = Array.from(placedLampIds).filter((id) => !disabledLampIds.has(id));
    // Keep up to 14 shadow-casting lamps to ensure WebGL 2 max texture limits are never exceeded
    return new Set(arr.slice(0, 14));
  }, [placedLampIds, disabledLampIds]);

  const applyPlacement = useCallback(
    (mode: PlacementMode) => {
      setPlacementMode(mode);
      if (mode === "greedy") {
        setPlacedLampIds(greedySetCoverLamps(worldLamps, attractors, buildingBoxes));
      } else if (mode === "intersection") {
        setPlacedLampIds(intersectionFirstLamps(worldLamps, objects, attractors, buildingBoxes, DEFAULT_CONFIG.cellSize));
      } else if (mode === "path") {
        setPlacedLampIds(criticalPathLamps(worldLamps, attractors, buildingBoxes));
      } else if (mode === "all") {
        setPlacedLampIds(new Set(worldLamps.map((l) => l.id)));
      } else if (mode === "none") {
        setPlacedLampIds(new Set());
      }
    },
    [worldLamps, attractors, objects, buildingBoxes]
  );

  const toggleLampPower = useCallback((id: string) => {
    setDisabledLampIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Recalculate lamp placement when city or algorithm changes
  useEffect(() => {
    if (worldLamps.length > 0) {
      applyPlacement(placementMode);
    }
  }, [worldLamps, attractors, objects, buildingBoxes]);

  const activeWorldLamps = useMemo(() => {
    return worldLamps.filter((l) => placedLampIds.has(l.id) && !disabledLampIds.has(l.id));
  }, [worldLamps, placedLampIds, disabledLampIds]);
  const energyUse = useMemo(() => energyUsePerSecond(activeWorldLamps), [activeWorldLamps]);

  const resetSession = () => {
    setAutoTime(false);
    setTimeHour(23);
    timeGlobals.hour = 23;
    setEnergy(INITIAL_ENERGY);
    setLightStats({ lit: 0, dark: 0, total: 0, avg: 1, dissatisfaction: INITIAL_DISSATISFACTION });
    setDisabledLampIds(new Set());
    setSessionId((id) => id + 1);
  };

  const roadCount = objects.filter((o) => o.pack === "roads").length;
  const buildingCount = objects.filter((o) => o.pack === "Models" || o.pack === "buildings").length;

  const newCity = () => {
    let s = Math.floor(Math.random() * 100000);
    if (s === seed) s = (seed + 1) % 100000;
    setGamePhase("loading");
    resetSession();
    setSeed(s);
    setSeedInput(String(s));
  };

  const onSeedInput = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 7);
    setSeedInput(digits);
    if (digits) {
      const nextSeed = parseInt(digits, 10);
      if (nextSeed === seed) return;
      setGamePhase("loading");
      resetSession();
      setSeed(nextSeed);
    }
  };

  return (
    <div className="w-full h-screen relative">
      {gamePhase !== "playing" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#070b1c]/95 text-white">
          <div className="w-full max-w-md rounded-2xl border border-indigo-300/20 bg-[#111a32] p-8 shadow-2xl text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300">Nightwatcher</div>
            <h1 className="mt-3 text-3xl font-semibold">{gamePhase === "won" ? "Город встретил рассвет" : gamePhase.startsWith("lost") ? "Смена окончена" : "Ночная смена"}</h1>
            <p className="mt-3 text-sm text-slate-300">{gamePhase === "won" ? "Вы продержались до 06:00." : gamePhase === "lost-energy" ? "Энергия закончилась." : gamePhase === "lost-dissatisfaction" ? "Среднее недовольство жителей достигло 100%." : "Управляйте фонарями с 23:00 до 06:00 и следите за жителями города."}</p>
            {!gamePhase.startsWith("lost") && gamePhase !== "won" && <>
              <div className="mt-7 text-left text-xs text-slate-300">{loadMessage}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${loadProgress}%` }} />
              </div>
              <div className="mt-2 text-right text-xs text-slate-400">{loadProgress}%</div>
            </>}
            {gamePhase === "ready" && (
              <button className="mt-6 rounded-lg bg-amber-400 px-8 py-3 font-semibold text-slate-950 hover:bg-amber-300" onClick={() => { setGamePhase("playing"); setAutoTime(true); }}>
                Начать игру
              </button>
            )}
            {gamePhase === "error" && (
              <button className="mt-6 rounded-lg border border-amber-400 px-6 py-2 text-amber-300" onClick={() => { setGamePhase("loading"); setLoadProgress(0); setLoadAttempt((value) => value + 1); }}>
                Повторить загрузку
              </button>
            )}
            {(gamePhase === "won" || gamePhase.startsWith("lost")) && (
              <button className="mt-6 rounded-lg bg-amber-400 px-8 py-3 font-semibold text-slate-950 hover:bg-amber-300" onClick={() => { resetSession(); setGamePhase("ready"); }}>
                Повторить смену
              </button>
            )}
          </div>
        </div>
      )}
      {gamePhase === "playing" && (
        <div className="absolute bottom-4 left-4 z-20 rounded-xl border border-white/20 bg-[#0b1125]/85 p-4 text-sm text-white shadow-xl backdrop-blur-sm">
          <div className="font-semibold text-amber-300">{formatTime(timeHour)} · До рассвета 06:00</div>
          <div className="mt-2">Энергия: {energy.toFixed(1)} / {INITIAL_ENERGY}</div>
          <div className="text-xs text-slate-300">Расход: {energyUse.toFixed(2)} ед./с · фонарей: {activeWorldLamps.length}</div>
          <div className="mt-1">Среднее недовольство: {Math.round(lightStats.dissatisfaction * 100)}%</div>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={newCity}
          className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-7 py-3.5 rounded-xl hover:bg-white/20 transition-all text-sm font-medium shadow-lg"
        >
          Новый город
        </button>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-white/60">
          <span>{DEFAULT_CONFIG.gridSizeX}x{DEFAULT_CONFIG.gridSizeZ}</span>
          <span className="text-white/40">seed</span>
          <input
            value={seedInput}
            onChange={(e) => onSeedInput(e.target.value)}
            inputMode="numeric"
            className="w-[72px] bg-white/10 rounded px-2 py-0.5 text-white text-xs text-center outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>
      </div>

      {isDev && (
        <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white text-sm min-w-[220px] max-h-[90vh] overflow-y-auto">
          <div className="font-bold mb-3 text-white/80 text-xs uppercase tracking-wider">Dev Tools</div>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={debugVisibility.connectors}
              onChange={(e) => {
                debugVisibility.connectors = e.target.checked;
                localStorage.setItem("nwdebugVisibility.connectors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-green-500"
            />
            <span>Show Connectors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={debugVisibility.attractors}
              onChange={(e) => {
                debugVisibility.attractors = e.target.checked;
                localStorage.setItem("nwdebugVisibility.attractors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-yellow-400"
            />
            <span>Show Attractors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showNPCs}
              onChange={(e) => setShowNPCs(e.target.checked)}
              className="w-4 h-4 accent-blue-400"
            />
            <span>Show NPCs</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              defaultChecked={debugVisibility.vectors}
              onChange={(e) => {
                debugVisibility.vectors = e.target.checked;
                localStorage.setItem("nwdebugVisibility.vectors", String(e.target.checked));
              }}
              className="w-4 h-4 accent-blue-600"
            />
            <span>Show Vectors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showLightLevels}
              onChange={(e) => {
                setShowLightLevels(e.target.checked);
                debugVisibility.lightLevels = e.target.checked;
                localStorage.setItem("nwdebugVisibility.lightLevels", String(e.target.checked));
              }}
              className="w-4 h-4 accent-amber-400"
            />
            <span>Show Light Levels (NPC)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
              type="checkbox"
              checked={showLightRays}
              onChange={(e) => {
                setShowLightRays(e.target.checked);
                debugVisibility.lightRays = e.target.checked;
                localStorage.setItem("nwdebugVisibility.lightRays", String(e.target.checked));
              }}
              className="w-4 h-4 accent-amber-500"
            />
            <span>Show Light Rays (Лучи света к NPC)</span>
          </label>

          {/* Time & Lighting Controls */}
          <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold">Ночная смена (23:00 – 06:00)</div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => { setTimeHour(23); setAutoTime(false); }}
                className={`px-1.5 py-1 text-[11px] rounded border transition-colors ${
                  Math.abs(timeHour - 23) < 0.5
                    ? "bg-indigo-500/40 border-indigo-400 text-indigo-100 font-semibold"
                    : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                }`}
              >
                🌙 23:00
              </button>
              <button
                onClick={() => { setTimeHour(2.5); setAutoTime(false); }}
                className={`px-1.5 py-1 text-[11px] rounded border transition-colors ${
                  Math.abs(timeHour - 2.5) < 0.5
                    ? "bg-indigo-500/40 border-indigo-400 text-indigo-100 font-semibold"
                    : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                }`}
              >
                🌌 02:30
              </button>
              <button
                onClick={() => { setTimeHour(5.5); setAutoTime(false); }}
                className={`px-1.5 py-1 text-[11px] rounded border transition-colors ${
                  Math.abs(timeHour - 5.5) < 0.5
                    ? "bg-indigo-500/40 border-indigo-400 text-indigo-100 font-semibold"
                    : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                }`}
              >
                🕯️ 05:30
              </button>
            </div>
            <div className="flex flex-col gap-1 text-[10px] text-white/60">
              <div className="flex justify-between items-center">
                <span>Время: <strong className="text-white font-mono">{formatTime(timeHour)}</strong></span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  🏮 Ночь (Фонари ВКЛ)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={7}
                step={0.25}
                value={timeHour >= 23 ? timeHour - 23 : timeHour + 1}
                onChange={(e) => {
                  const shift = Number(e.target.value);
                  const h = (23 + shift) % 24;
                  setTimeHour(h);
                  setAutoTime(false);
                }}
                className="w-full accent-indigo-400"
              />
              <div className="flex justify-between text-[9px] text-white/40">
                <span>23:00</span>
                <span>02:30</span>
                <span>06:00</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[10px] text-white/60">
              <input
                type="checkbox"
                checked={autoTime}
                onChange={(e) => setAutoTime(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-400"
              />
              <span>Ход ночного времени (23:00 → 06:00)</span>
            </label>

            {/* Visual Light Distance Control */}
            <div className="flex flex-col gap-1 text-[10px] text-white/60 bg-white/5 p-2 rounded-lg border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-amber-200">🏮 Дальность света в игре:</span>
                <span className="text-amber-300 font-mono font-bold">{lampVisualDistance}м</span>
              </div>
              <input
                type="range"
                min={10}
                max={32}
                step={0.5}
                value={lampVisualDistance}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLampVisualDistance(val);
                  localStorage.setItem("nw_lampVisualDistance", String(val));
                }}
                className="w-full accent-amber-400"
              />
              <div className="flex justify-between text-[9px] text-white/40">
                <span>10м</span>
                <span>18м (дефолт)</span>
                <span>32м</span>
              </div>
              <div className="text-[9px] text-white/40 italic">
                * Визуальная дальность рендера. Не влияет на алгоритм расстановки (10.5м).
              </div>
            </div>

            {/* Lamp Placement Controls */}
            <div className="bg-white/5 rounded-lg p-2.5 text-[10px] space-y-2 border border-white/10 mt-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
                  Расстановка фонарей
                </span>
                <span className="font-mono text-xs font-bold text-amber-300">
                  {activeWorldLamps.length} / {worldLamps.length}
                </span>
              </div>
              <div className="text-[9px] text-white/50 leading-tight">
                Выберите алгоритм расстановки физических фонарей на улицах:
              </div>

              {/* 3 Abstract Algorithm Presets */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => applyPlacement("greedy")}
                  className={`w-full text-left rounded px-2 py-1.5 text-[10px] transition-all flex justify-between items-center border ${
                    placementMode === "greedy"
                      ? "bg-amber-500/30 border-amber-400 text-amber-100 font-semibold shadow-sm"
                      : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>📐</span>
                    <span>1. Жадный Set Cover</span>
                  </span>
                  <span className="text-[9px] text-amber-300/80 font-mono">Минимум ламп</span>
                </button>

                <button
                  onClick={() => applyPlacement("intersection")}
                  className={`w-full text-left rounded px-2 py-1.5 text-[10px] transition-all flex justify-between items-center border ${
                    placementMode === "intersection"
                      ? "bg-amber-500/30 border-amber-400 text-amber-100 font-semibold shadow-sm"
                      : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏛️</span>
                    <span>2. Перекрестки + Ребра</span>
                  </span>
                  <span className="text-[9px] text-amber-300/80 font-mono">Городской</span>
                </button>

                <button
                  onClick={() => applyPlacement("path")}
                  className={`w-full text-left rounded px-2 py-1.5 text-[10px] transition-all flex justify-between items-center border ${
                    placementMode === "path"
                      ? "bg-amber-500/30 border-amber-400 text-amber-100 font-semibold shadow-sm"
                      : "bg-white/5 border-white/10 hover:bg-white/15 text-white/70"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🚶</span>
                    <span>3. Маршруты (Spawn→Exit)</span>
                  </span>
                  <span className="text-[9px] text-amber-300/80 font-mono">Крит. путь</span>
                </button>
              </div>

              {/* Utility actions */}
              <div className="flex gap-1.5 pt-1 border-t border-white/10">
                <button
                  onClick={() => applyPlacement("all")}
                  className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors border ${
                    placementMode === "all"
                      ? "bg-amber-500/30 border-amber-400 text-amber-200"
                      : "bg-white/5 border-white/15 hover:bg-white/10 text-white/60"
                  }`}
                >
                  🌐 Все слоты
                </button>
                <button
                  onClick={() => applyPlacement("none")}
                  className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors border ${
                    placementMode === "none"
                      ? "bg-red-500/30 border-red-400 text-red-200"
                      : "bg-white/5 border-white/15 hover:bg-white/10 text-white/60"
                  }`}
                >
                  🚫 Без фонарей
                </button>
              </div>
            </div>

            {/* Live Stats */}
            <div className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1 border border-white/10 mt-1">
              <div className="text-[10px] uppercase tracking-wider text-amber-300/70 font-semibold mb-1">
                Чувствительность к свету
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">💡 Освещены:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {lightStats.lit} / {lightStats.total} ({lightStats.total > 0 ? Math.round((lightStats.lit / lightStats.total) * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">🌑 В темноте:</span>
                <span className="text-indigo-300 font-mono font-bold">
                  {lightStats.dark} / {lightStats.total} ({lightStats.total > 0 ? Math.round((lightStats.dark / lightStats.total) * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">🏮 Фонарей на карте:</span>
                <span className="text-amber-200 font-mono font-bold">
                  {activeWorldLamps.length} / {worldLamps.length} ({worldLamps.length > 0 ? Math.round((activeWorldLamps.length / worldLamps.length) * 100) : 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Ср. освещенность:</span>
                <span className="text-white font-mono font-bold">{Math.round((lightStats.avg || 0) * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Ragdoll</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDropAllNonce((n) => n + 1)}
                className="flex-1 bg-red-500/20 border border-red-400/40 hover:bg-red-500/30 text-red-200 rounded px-2 py-1 text-xs transition-colors"
              >
                Уронить всех
              </button>
              <button
                onClick={() => setReviveAllNonce((n) => n + 1)}
                className="flex-1 bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500/30 text-emerald-200 rounded px-2 py-1 text-xs transition-colors"
              >
                Поднять всех
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[10px] text-white/50">
              <input
                type="checkbox"
                checked={breakingEnabled}
                onChange={(e) => setBreakingEnabled(e.target.checked)}
                className="w-4 h-4 accent-orange-400"
              />
              <span>Ломать кости</span>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-white/50" style={{ opacity: breakingEnabled ? 1 : 0.4 }}>
              <span>Хрупкость костей: {breakAccel}</span>
              <input
                type="range"
                min={80}
                max={4000}
                step={20}
                value={breakAccel}
                disabled={!breakingEnabled}
                onChange={(e) => setBreakAccel(Number(e.target.value))}
                className="w-full accent-orange-400"
              />
            </label>
          </div>
          <div className="flex gap-2 mt-3 text-[10px] text-white/50 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background: CONNECTOR_COLOR}} />Connection</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background: ATTRACTOR_COLOR}} />Attractor</span>
          </div>
          <div className="mt-3 text-[10px] text-white/50 space-y-1">
            <div>Roads: {roadCount}</div>
            <div>Buildings: {buildingCount}</div>
            <div>Attractors: {attractors.length}</div>
            <div>NPCs: {attractors.length > 0 ? NPC_COUNT : 0}</div>
            <div>Total: {objects.length}</div>
          </div>
        </div>
      )}
      <Canvas camera={{ position: [8, 5.5, 9], fov: 60 }} shadows>
        <EnvironmentSystem hour={timeHour} autoTime={autoTime && gamePhase === "playing"} onHourChange={setTimeHour} />
        <GameSessionSystem
          key={sessionId}
          running={gamePhase === "playing" && autoTime}
          lamps={activeWorldLamps}
          dissatisfaction={lightStats.dissatisfaction}
          onEnergyChange={setEnergy}
          onOutcome={(outcome) => { setAutoTime(false); setGamePhase(outcome); }}
        />
        <WorldGround />
        <PlayableDistrict />
        {loadProgress === 100 && gamePhase !== "loading" && gamePhase !== "error" && (
          <Suspense fallback={null}>
            <WorldBackdrop groups={backdropPlan.groups} />
          </Suspense>
        )}
        <Suspense fallback={<Loader />}>
          {objects.map((obj, i) => (
            <RoadModel
              key={`${obj.model}-${i}`}
              obj={obj}
              cellSize={DEFAULT_CONFIG.cellSize}
              colliderKey={`${obj.pack}-${i}-${obj.position.join("_")}-${obj.rotation}-${obj.rotationX ?? 0}`}
              placedLampIds={placedLampIds}
              disabledLampIds={disabledLampIds}
              shadowLampIds={shadowLampIds}
              onToggleLamp={toggleLampPower}
              onBuildingReady={onBuildingReady}
              visualDistance={lampVisualDistance}
            />
          ))}
        </Suspense>
        {attractors.map((attr) => (
          <AttractorCube key={attr.id} attr={attr} />
        ))}
        {attractors.map((attr) => (
          <VectorArrows key={`v-${attr.id}`} attr={attr} />
        ))}
        <Suspense fallback={null}>
          <NPCManager
            key={sessionId}
            attractors={attractors}
            count={NPC_COUNT}
            configs={modelConfigs}
            dropAllNonce={dropAllNonce}
            reviveAllNonce={reviveAllNonce}
            breakAccel={breakAccel}
            breakingEnabled={breakingEnabled}
            worldLamps={activeWorldLamps}
            gameRunning={gamePhase === "playing"}
            showNPCs={showNPCs}
            showLightLevels={showLightLevels}
            showLightRays={showLightRays}
            buildingBoxes={buildingBoxes}
            onStatsUpdate={setLightStats}
          />
        </Suspense>
        <CityCameraControls />
        <LampOutlineEffect />
      </Canvas>
    </div>
  );
}
