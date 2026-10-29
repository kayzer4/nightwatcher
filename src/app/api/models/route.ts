import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const modelsDir = path.join(process.cwd(), "public", "models");

  const packs: { name: string; models: string[] }[] = [];

  // Ordered list of packs
  const packOrder = ["roads", "lamps", "buildings", "Models", "props", "characters", "suburban", "industrial"];
  const seen = new Set<string>();

  for (const packName of packOrder) {
    const packPath = path.join(modelsDir, packName);
    if (!fs.existsSync(packPath)) continue;

    const models = fs
      .readdirSync(packPath)
      .filter((f) => f.endsWith(".glb") && !f.includes("low-detail"))
      .map((f) => f.replace(".glb", ""))
      .sort();

    if (models.length > 0 && !seen.has(packName)) {
      seen.add(packName);
      packs.push({ name: packName, models });
    }
  }

  return NextResponse.json(packs);
}
