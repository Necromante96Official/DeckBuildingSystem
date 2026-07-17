import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIST_DIR,
  PUBLIC_DIR,
  ROOT,
} from "../lib/paths.ts";
import { analyzeEffects } from "./analyze-effects.ts";
import { buildArchetypeIndex } from "./build-archetype-index.ts";
import { ingestCatalog } from "./ingest-catalog.ts";
import { ingestNpcDecks } from "./ingest-npc-decks.ts";
import { syncImages } from "./sync-images.ts";
import { validateInventory } from "./validate-inventory.ts";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function copyPublic(): void {
  ensureDir(DIST_DIR);
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    const src = path.join(PUBLIC_DIR, name);
    const dest = path.join(DIST_DIR, name);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

function copyDataAndAssets(): void {
  const dataDest = path.join(DIST_DIR, "data");
  const assetsDest = path.join(DIST_DIR, "assets", "cartas_grande");
  ensureDir(dataDest);
  ensureDir(assetsDest);

  for (const name of [
    "cards.json",
    "inventory-report.json",
    "archetypes.json",
    "archetype-index.json",
    "npc-calibration.json",
    "effect-tiers.json",
    "generation-bans.json",
    "saved-seeds.json",
  ]) {
    const src = path.join(ROOT, "data", name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dataDest, name));
    }
  }

  const assetsSrc = path.join(ROOT, "assets", "cartas_grande");
  if (!fs.existsSync(assetsSrc)) return;
  for (const name of fs.readdirSync(assetsSrc)) {
    if (!name.toLowerCase().endsWith(".webp")) continue;
    fs.copyFileSync(
      path.join(assetsSrc, name),
      path.join(assetsDest, name),
    );
  }
}

async function bundleApp(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src", "app", "main.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "app.js"),
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
    logLevel: "info",
  });
}

export async function build(options?: {
  skipDownload?: boolean;
  skipImages?: boolean;
}): Promise<void> {
  console.log("▶ ingest-catalog");
  ingestCatalog();

  if (!options?.skipImages) {
    console.log("▶ sync-images");
    await syncImages({
      downloadMissing: !options?.skipDownload,
    });
  } else {
    console.log("▶ sync-images (omitido)");
  }

  console.log("▶ analyze-effects");
  analyzeEffects();

  console.log("▶ build-archetype-index");
  buildArchetypeIndex();

  console.log("▶ ingest-npc-decks");
  try {
    ingestNpcDecks();
  } catch (err) {
    console.warn("ingest-npc-decks falhou (mantém calibration existente):", err);
  }

  console.log("▶ validate-inventory");
  validateInventory();

  console.log("▶ copiar public + data/assets → dist");
  copyPublic();
  copyDataAndAssets();

  console.log("▶ bundle app.js");
  await bundleApp();

  console.log(`Build OK → ${DIST_DIR}`);
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const skipDownload = process.argv.includes("--no-download");
  const skipImages = process.argv.includes("--skip-images");
  build({ skipDownload, skipImages }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
