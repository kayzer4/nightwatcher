import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const modelsDir = path.join(process.cwd(), "public", "models");

  const packs: { name: string; models: string[] }[] = [];

  // Models pack (buildings)
  const modelsPath = path.join(modelsDir, "Models");
  if (fs.existsSync(modelsPath)) {
    const models = fs
      .readdirSync(modelsPath)
      .filter((f) => f.endsWith(".glb") && !f.includes("low-detail") && !f.includes("detail-"))
      .map((f) => f.replace(".glb", ""))
      .sort();
    packs.push({ name: "Models", models });
  }

  // Roads pack
  const roadsPath = path.join(modelsDir, "roads");
  if (fs.existsSync(roadsPath)) {
    const models = fs
      .readdirSync(roadsPath)
      .filter((f) => f.endsWith(".glb") && !f.includes("barrier") && !f.includes("construction"))
      .map((f) => f.replace(".glb", ""))
      .sort();
    packs.push({ name: "roads", models });
  }

  // Characters pack (NPC models)
  const charsPath = path.join(modelsDir, "characters");
  if (fs.existsSync(charsPath)) {
    const models = fs
      .readdirSync(charsPath)
      .filter((f) => f.endsWith(".glb"))
      .map((f) => f.replace(".glb", ""))
      .sort();
    packs.push({ name: "characters", models });
  }

  return NextResponse.json(packs);
}
