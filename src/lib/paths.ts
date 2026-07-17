import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Raiz do projeto criação-de-deck */
export const ROOT = path.resolve(__dirname, "../..");

/** Raiz do repositório forbidden-legacy-releases */
export const REPO_ROOT = path.resolve(ROOT, "..");

export const DATA_DIR = path.join(ROOT, "data");
export const SOURCE_CATALOG = path.join(DATA_DIR, "source", "catalogo.json");
export const SOURCE_DECKBUILDER = path.join(DATA_DIR, "source", "deckbuilder.json");
export const TOOLS_CATALOG = path.join(REPO_ROOT, "Tools", "data", "catalogo.json");
export const TOOLS_DECKBUILDER = path.join(
  REPO_ROOT,
  "Tools",
  "data",
  "deckbuilder.json",
);
export const CARDS_JSON = path.join(DATA_DIR, "cards.json");
export const REPORT_JSON = path.join(DATA_DIR, "inventory-report.json");
export const ARCHETYPES_JSON = path.join(DATA_DIR, "archetypes.json");
export const ARCHETYPE_INDEX_JSON = path.join(DATA_DIR, "archetype-index.json");
export const NPC_CALIBRATION_JSON = path.join(DATA_DIR, "npc-calibration.json");
export const EFFECT_TIERS_JSON = path.join(DATA_DIR, "effect-tiers.json");
export const GENERATION_BANS_JSON = path.join(DATA_DIR, "generation-bans.json");
export const SAVED_SEEDS_JSON = path.join(DATA_DIR, "saved-seeds.json");
export const SOURCE_NPC_XLSX = path.join(DATA_DIR, "source", "NPC-deck.xlsx");

export const ASSETS_GRANDE = path.join(ROOT, "assets", "cartas_grande");
export const TOOLS_GRANDE = path.join(REPO_ROOT, "Tools", "img", "cartas_grande");

export const PUBLIC_DIR = path.join(ROOT, "public");
/** Pasta publicada no GitHub Pages (Settings → Pages → /docs) */
export const DIST_DIR = path.join(ROOT, "docs");

export const PROD_IMAGE_BASE =
  "https://forbiddenlegacy.com.br/img/cartas_grande";

export function imageRelPath(slug: string): string {
  return `assets/cartas_grande/${slug}.webp`;
}

export function imageFileName(slug: string): string {
  return `${slug}.webp`;
}
