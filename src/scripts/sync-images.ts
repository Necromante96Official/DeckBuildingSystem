import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSETS_GRANDE,
  CARDS_JSON,
  PROD_IMAGE_BASE,
  TOOLS_GRANDE,
  imageFileName,
} from "../lib/paths.ts";
import type { CardsInventory } from "../types/card.ts";
import { ingestCatalog } from "./ingest-catalog.ts";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function loadInventory(): CardsInventory {
  if (!fs.existsSync(CARDS_JSON)) {
    return ingestCatalog();
  }
  return JSON.parse(fs.readFileSync(CARDS_JSON, "utf8")) as CardsInventory;
}

async function downloadTo(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return false;
    fs.writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

export interface SyncImagesResult {
  copied: number;
  downloaded: number;
  skipped: number;
  failed: string[];
}

export async function syncImages(options?: {
  downloadMissing?: boolean;
  force?: boolean;
}): Promise<SyncImagesResult> {
  const downloadMissing = options?.downloadMissing !== false;
  const force = options?.force === true;

  ensureDir(ASSETS_GRANDE);
  const inventory = loadInventory();
  const result: SyncImagesResult = {
    copied: 0,
    downloaded: 0,
    skipped: 0,
    failed: [],
  };

  const toolsExists = fs.existsSync(TOOLS_GRANDE);
  if (!toolsExists) {
    console.log(`Aviso: pasta local de artes não encontrada: ${TOOLS_GRANDE}`);
    if (downloadMissing) {
      console.log(`Fallback: download de ${PROD_IMAGE_BASE}/{slug}.webp`);
    }
  }

  for (const card of inventory.cartas) {
    const dest = path.join(ASSETS_GRANDE, imageFileName(card.slug));
    if (!force && fs.existsSync(dest)) {
      result.skipped += 1;
      continue;
    }

    const localSrc = path.join(TOOLS_GRANDE, imageFileName(card.slug));
    if (toolsExists && fs.existsSync(localSrc)) {
      fs.copyFileSync(localSrc, dest);
      result.copied += 1;
      continue;
    }

    if (downloadMissing) {
      const url = `${PROD_IMAGE_BASE}/${encodeURIComponent(card.slug)}.webp`;
      const ok = await downloadTo(url, dest);
      if (ok) {
        result.downloaded += 1;
        continue;
      }
    }

    result.failed.push(card.slug);
  }

  console.log(
    `Sync imagens: copiadas=${result.copied} baixadas=${result.downloaded} já existiam=${result.skipped} falhas=${result.failed.length}`,
  );
  if (result.failed.length && result.failed.length <= 20) {
    console.log("Falhas:", result.failed.join(", "));
  } else if (result.failed.length > 20) {
    console.log(
      `Falhas (primeiras 20): ${result.failed.slice(0, 20).join(", ")} …`,
    );
  }

  return result;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const force = process.argv.includes("--force");
  const noDownload = process.argv.includes("--no-download");
  syncImages({ force, downloadMissing: !noDownload })
    .then((r) => {
      process.exit(r.failed.length && r.copied + r.downloaded === 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
