"use client";

import dynamic from "next/dynamic";

const CityViewerClient = dynamic(
  () => import("./CityViewerClient").then((mod) => mod.CityViewerClient),
  { ssr: false, loading: () => <div className="w-full h-screen bg-[#1a1a2e]" /> }
);

export function CityViewer() {
  return <CityViewerClient />;
}
