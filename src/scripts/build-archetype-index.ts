import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHETYPE_INDEX_JSON,
  ARCHETYPES_JSON,
  CARDS_JSON,
} from "../lib/paths.ts";
import type {
  ArchetypeIndex,
  ArchetypeIndexEntry,
  ArchetypesFile,
  CardsInventory,
} from "../types/card.ts";

function norm(s: string): string {
  return s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesCard(
  card: {
    nome: string;
    nome_pt: string;
    slug: string;
    desc_pt?: string;
    desc_en?: string;
  },
  patterns: string[],
): boolean {
  const hay = norm(
    `${card.nome} ${card.nome_pt} ${card.slug} ${card.desc_pt || ""} ${card.desc_en || ""}`,
  );
  return patterns.some((p) => hay.includes(norm(p)));
}

export function buildArchetypeIndex(): ArchetypeIndex {
  if (!fs.existsSync(ARCHETYPES_JSON)) {
    throw new Error(`Falta ${ARCHETYPES_JSON}`);
  }
  if (!fs.existsSync(CARDS_JSON)) {
    throw new Error(`Falta ${CARDS_JSON}. Corre ingest + analyze primeiro.`);
  }

  const defs = JSON.parse(
    fs.readFileSync(ARCHETYPES_JSON, "utf8"),
  ) as ArchetypesFile;
  const inventory = JSON.parse(
    fs.readFileSync(CARDS_JSON, "utf8"),
  ) as CardsInventory;
  const bySlug = new Map(inventory.cartas.map((c) => [c.slug, c]));

  // First pass: resolve core + support slugs per arch
  const raw: Array<{
    def: (typeof defs.archetypes)[0];
    slugs: string[];
    support_slugs: string[];
  }> = [];

  for (const def of defs.archetypes) {
    if (def.livre) {
      raw.push({ def, slugs: [], support_slugs: [] });
      continue;
    }

    const slugs = new Set<string>();
    for (const s of def.seed_slugs || []) {
      if (bySlug.has(s)) slugs.add(s);
    }
    const patterns = def.match || [];
    if (patterns.length) {
      for (const card of inventory.cartas) {
        if (matchesCard(card, patterns)) slugs.add(card.slug);
      }
    }

    const support_slugs: string[] = [];
    for (const s of def.support_slugs || []) {
      if (bySlug.has(s) && !slugs.has(s)) support_slugs.push(s);
    }

    raw.push({
      def,
      slugs: [...slugs].sort(),
      support_slugs: support_slugs.sort(),
    });
  }

  // Second pass: cross-blacklist other archetype cores
  const entries: ArchetypeIndexEntry[] = raw.map((row) => {
    const other = new Set<string>();
    if (!row.def.livre) {
      for (const otherRow of raw) {
        if (otherRow.def.id === row.def.id || otherRow.def.livre) continue;
        for (const s of otherRow.slugs) other.add(s);
      }
      // Remove own cores from blacklist if overlap (shouldn't happen often)
      for (const s of row.slugs) other.delete(s);
      for (const s of row.support_slugs) other.delete(s);
    }

    return {
      id: row.def.id,
      label: row.def.label,
      livre: Boolean(row.def.livre),
      synergy_tipos: row.def.synergy_tipos || [],
      slugs: row.slugs,
      support_slugs: row.support_slugs,
      other_arch_slugs: [...other].sort(),
    };
  });

  const index: ArchetypeIndex = {
    gerado_em: new Date().toISOString(),
    entries,
  };

  fs.writeFileSync(
    ARCHETYPE_INDEX_JSON,
    JSON.stringify(index, null, 2) + "\n",
    "utf8",
  );

  for (const e of entries) {
    console.log(
      e.livre
        ? `Arquetípico ${e.label}: livre`
        : `Arquetípico ${e.label}: ${e.slugs.length} core, ${e.support_slugs.length} support, ${e.other_arch_slugs.length} blacklist`,
    );
  }
  console.log(`Index → ${ARCHETYPE_INDEX_JSON}`);
  return index;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    buildArchetypeIndex();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
