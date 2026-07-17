import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSETS_GRANDE,
  CARDS_JSON,
  DATA_DIR,
  SOURCE_CATALOG,
  TOOLS_CATALOG,
  imageRelPath,
} from "../lib/paths.ts";
import { rarityToFile } from "../lib/rarity.ts";
import type {
  Card,
  CardsInventory,
  CatalogCardRaw,
  CatalogSource,
  ImageStatus,
} from "../types/card.ts";

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveCatalogPath(): string {
  if (fs.existsSync(SOURCE_CATALOG)) return SOURCE_CATALOG;
  if (fs.existsSync(TOOLS_CATALOG)) return TOOLS_CATALOG;
  throw new Error(
    `Catálogo não encontrado.\n  Esperado: ${SOURCE_CATALOG}\n  ou: ${TOOLS_CATALOG}`,
  );
}

function loadCatalog(): CatalogSource {
  const src = resolveCatalogPath();
  const raw = fs.readFileSync(src, "utf8");
  const data = JSON.parse(raw) as CatalogSource;
  if (!data || !Array.isArray(data.cartas)) {
    throw new Error(`JSON inválido em ${src}: falta array "cartas"`);
  }
  return data;
}

function ensureSourceCopy(data: CatalogSource, fromPath: string): void {
  ensureDir(path.dirname(SOURCE_CATALOG));
  if (path.resolve(fromPath) === path.resolve(SOURCE_CATALOG)) return;
  fs.writeFileSync(SOURCE_CATALOG, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Fonte copiada → ${SOURCE_CATALOG}`);
}

function imageStatusFor(slug: string): ImageStatus {
  const file = path.join(ASSETS_GRANDE, `${slug}.webp`);
  return fs.existsSync(file) ? "ok" : "missing";
}

function normalizeCard(raw: CatalogCardRaw): Card {
  if (!raw.slug || !raw.nome) {
    throw new Error(`Carta sem slug/nome: ${JSON.stringify(raw).slice(0, 120)}`);
  }

  const desc_pt = raw.desc_pt?.trim() || undefined;
  const desc_en = raw.desc_en?.trim() || undefined;
  const has_effect = Boolean(desc_pt || desc_en);

  const raridade = String(raw.raridade || "N");
  const raridade_arquivo = raw.raridade_arquivo
    ? String(raw.raridade_arquivo)
    : rarityToFile(raridade);

  const card: Card = {
    slug: raw.slug,
    nome: raw.nome,
    nome_pt: raw.nome_pt || raw.nome,
    card_type: String(raw.card_type || "Monster"),
    tipo: String(raw.tipo || ""),
    atributo: String(raw.atributo || ""),
    raridade,
    raridade_arquivo,
    has_effect,
    image: imageRelPath(raw.slug),
    image_status: imageStatusFor(raw.slug),
  };

  if (raw.icone_atributo) card.icone_atributo = raw.icone_atributo;
  if (raw.icone_tipo) card.icone_tipo = raw.icone_tipo;
  if (raw.nivel != null && raw.nivel !== "") card.nivel = String(raw.nivel);
  if (raw.atk != null && raw.atk !== "") card.atk = String(raw.atk);
  if (raw.def != null && raw.def !== "") card.def = String(raw.def);
  if (desc_pt) card.desc_pt = desc_pt;
  if (desc_en) card.desc_en = desc_en;

  return card;
}

export function ingestCatalog(): CardsInventory {
  const fromPath = resolveCatalogPath();
  const source = loadCatalog();
  ensureSourceCopy(source, fromPath);
  ensureDir(ASSETS_GRANDE);
  ensureDir(DATA_DIR);

  const cartas = source.cartas.map(normalizeCard);
  const slugs = new Set<string>();
  for (const c of cartas) {
    if (slugs.has(c.slug)) {
      throw new Error(`Slug duplicado no catálogo: ${c.slug}`);
    }
    slugs.add(c.slug);
  }

  const inventory: CardsInventory = {
    gerado_de: source.gerado_de || "Data/cartas_runtime.json",
    versao: String(source.versao || ""),
    fonte: path.relative(process.cwd(), SOURCE_CATALOG).replace(/\\/g, "/"),
    gerado_em: new Date().toISOString(),
    total: cartas.length,
    cartas,
  };

  fs.writeFileSync(CARDS_JSON, JSON.stringify(inventory, null, 2) + "\n", "utf8");
  console.log(`Ingest: ${cartas.length} cartas → ${CARDS_JSON}`);
  return inventory;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    ingestCatalog();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
