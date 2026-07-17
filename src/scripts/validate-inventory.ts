import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSETS_GRANDE, CARDS_JSON, REPORT_JSON } from "../lib/paths.ts";
import type {
  CardsInventory,
  ImageStatus,
  InventoryReport,
} from "../types/card.ts";
import { ingestCatalog } from "./ingest-catalog.ts";

function loadInventory(): CardsInventory {
  if (!fs.existsSync(CARDS_JSON)) {
    return ingestCatalog();
  }
  return JSON.parse(fs.readFileSync(CARDS_JSON, "utf8")) as CardsInventory;
}

function listWebpSlugs(dir: string): Set<string> {
  const set = new Set<string>();
  if (!fs.existsSync(dir)) return set;
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".webp")) continue;
    set.add(name.slice(0, -".webp".length));
  }
  return set;
}

export function validateInventory(): InventoryReport {
  const inventory = loadInventory();
  const onDisk = listWebpSlugs(ASSETS_GRANDE);
  const catalogSlugs = new Set(inventory.cartas.map((c) => c.slug));

  const por_raridade: Record<string, number> = {};
  const por_card_type: Record<string, number> = {};
  const por_power_tier: Record<string, number> = {};
  const missing_images: string[] = [];
  let com_efeito = 0;
  let sem_efeito = 0;
  let com_arte = 0;
  let sem_arte = 0;

  for (const card of inventory.cartas) {
    por_raridade[card.raridade] = (por_raridade[card.raridade] || 0) + 1;
    por_card_type[card.card_type] = (por_card_type[card.card_type] || 0) + 1;
    const pt = String(card.power_tier ?? "?");
    por_power_tier[pt] = (por_power_tier[pt] || 0) + 1;

    if (card.has_effect) com_efeito += 1;
    else sem_efeito += 1;

    const status: ImageStatus = onDisk.has(card.slug) ? "ok" : "missing";
    card.image_status = status;
    if (status === "ok") {
      com_arte += 1;
    } else {
      sem_arte += 1;
      missing_images.push(card.slug);
    }
  }

  const orphan_images = [...onDisk]
    .filter((slug) => !catalogSlugs.has(slug))
    .sort();

  // Reescreve cards.json com image_status atualizado
  fs.writeFileSync(CARDS_JSON, JSON.stringify(inventory, null, 2) + "\n", "utf8");

  const report: InventoryReport = {
    gerado_em: new Date().toISOString(),
    versao: inventory.versao,
    total_cartas: inventory.total,
    com_arte,
    sem_arte,
    com_efeito,
    sem_efeito,
    por_raridade,
    por_card_type,
    por_power_tier,
    missing_images,
    orphan_images,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("── Inventário ──");
  console.log(`Total: ${report.total_cartas}`);
  console.log(`Com arte: ${report.com_arte} | Sem arte: ${report.sem_arte}`);
  console.log(`Com efeito: ${report.com_efeito} | Sem efeito: ${report.sem_efeito}`);
  console.log("Por raridade:", report.por_raridade);
  console.log("Por tipo:", report.por_card_type);
  console.log("Por power_tier:", report.por_power_tier);
  console.log(`Órfãos em assets: ${report.orphan_images.length}`);
  console.log(`Relatório → ${REPORT_JSON}`);

  return report;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    validateInventory();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
