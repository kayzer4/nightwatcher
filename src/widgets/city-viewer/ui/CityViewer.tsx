"use client";

import dynamic from "next/dynamic";

const CityViewerClient = dynamic(
  () => import("./CityViewerClient").then((mod) => mod.CityViewerClient),
  { ssr: false, loading: () => <div className="flex h-screen w-full items-center justify-center bg-[#070b1c] text-amber-300">Nightwatcher · Загрузка игры…</div> }
);

export function CityViewer() {
  return <CityViewerClient />;
}
