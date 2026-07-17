/**
 * Ingere NPC-deck.xlsx e gera data/npc-calibration.json
 * com médias Equip/Trap/Spell por faixa fraco/médio/forte.
 *
 * Uso:
 *   npm run ingest-npc
 *
 * Fontes: data/source/NPC-deck.xlsx · ./NPC-deck.xlsx
 * Fallback: faixas fixas 6–9 / 6–9 / 3–6
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS_JSON, DATA_DIR, ROOT } from "../lib/paths.ts";
import type {
  Card,
  CardsInventory,
  NpcCalibration,
  NpcStrengthRow,
} from "../types/card.ts";

const require = createRequire(import.meta.url);

type XlsxModule = {
  readFile: (filename: string) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: <T>(
      sheet: unknown,
      opts?: { header?: number | string; defval?: string; raw?: boolean },
    ) => T[];
    encode_range?: (r: unknown) => string;
  };
};

function loadXlsx(): XlsxModule | null {
  try {
    return require("xlsx") as XlsxModule;
  } catch {
    return null;
  }
}

const EQUIP_MIN = 6;
const EQUIP_MAX = 9;
const TRAP_MIN = 6;
const TRAP_MAX = 9;
const SPELL_MIN = 3;
const SPELL_MAX = 6;
const MIN_CARDS_PER_DECK = 5;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function findWorkbook(): string | null {
  const candidates = [
    path.join(DATA_DIR, "source", "NPC-deck.xlsx"),
    path.join(ROOT, "NPC-deck.xlsx"),
    path.join(ROOT, "data", "NPC-deck.xlsx"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "3x Blue-Eyes" / "Blue-Eyes x3" / "×3 Blue Eyes" → { name, qty } */
function parseQtyName(raw: string): { name: string; qty: number } | null {
  const t = String(raw || "").trim();
  if (!t || t.length < 2) return null;
  let m = t.match(/^\s*(\d+)\s*[x×]\s*(.+)$/i);
  if (m) return { qty: Math.min(3, Number(m[1]) || 1), name: m[2]!.trim() };
  m = t.match(/^(.+?)\s*[x×]\s*(\d+)\s*$/i);
  if (m) return { qty: Math.min(3, Number(m[2]) || 1), name: m[1]!.trim() };
  return { qty: 1, name: t };
}

function loadCatalog(): {
  byName: Map<string, Card>;
  all: Card[];
} {
  const byName = new Map<string, Card>();
  if (!fs.existsSync(CARDS_JSON)) return { byName, all: [] };
  const inv = JSON.parse(fs.readFileSync(CARDS_JSON, "utf8")) as CardsInventory;
  for (const c of inv.cartas) {
    byName.set(normName(c.nome), c);
    byName.set(normName(c.nome_pt), c);
    byName.set(normName(c.slug.replace(/[_-]+/g, " ")), c);
    // short aliases without punctuation
    byName.set(normName(c.nome.replace(/\./g, "")), c);
  }
  return { byName, all: inv.cartas };
}

function fuzzyFind(name: string, byName: Map<string, Card>, all: Card[]): Card | null {
  const n = normName(name);
  if (!n) return null;
  const exact = byName.get(n);
  if (exact) return exact;
  // prefix / includes
  for (const c of all) {
    const keys = [normName(c.nome), normName(c.nome_pt), normName(c.slug.replace(/_/g, " "))];
    if (keys.some((k) => k === n || k.includes(n) || n.includes(k))) return c;
  }
  return null;
}

type Strength = "weak" | "medium" | "strong";

function strengthFromLabel(label: string): Strength | null {
  const t = normName(label);
  if (/fraco|weak|easy|iniciante|beginner|baixo|novato/.test(t)) return "weak";
  if (/forte|strong|hard|boss|elite|expert|alto|ultra|dificil/.test(t)) {
    return "strong";
  }
  if (/medio|medium|mid|normal|intermedi/.test(t)) return "medium";
  return null;
}

function strengthByIndex(i: number, total: number): Strength {
  if (total <= 1) return "medium";
  const t = i / (total - 1);
  if (t < 0.34) return "weak";
  if (t > 0.66) return "strong";
  return "medium";
}

interface DeckAcc {
  equip: number;
  trap: number;
  spell: number;
  bosses: number;
  total: number;
  label?: string;
}

function emptyAcc(label?: string): DeckAcc {
  return { equip: 0, trap: 0, spell: 0, bosses: 0, total: 0, label };
}

function addCardToAcc(acc: DeckAcc, card: Card, qty: number): void {
  for (let i = 0; i < qty; i++) {
    acc.total += 1;
    if (card.card_type === "Equip") acc.equip += 1;
    else if (card.card_type === "Trap") acc.trap += 1;
    else if (card.card_type === "Spell") acc.spell += 1;
    if ((card.power_tier || 1) >= 5) acc.bosses += 1;
  }
}

function isHeaderNoise(n: string): boolean {
  return /^(equip|trap|spell|magia|armadilha|monstro|monster|nome|card|carta|qty|qtd|deck|npc|nivel|level|forca|força|raridade|id|slot)$/.test(
    n,
  );
}

function resolveCell(
  raw: string,
  byName: Map<string, Card>,
  all: Card[],
): { card: Card; qty: number } | null {
  const parsed = parseQtyName(raw);
  if (!parsed) return null;
  const n = normName(parsed.name);
  if (!n || isHeaderNoise(n)) return null;
  const card = fuzzyFind(parsed.name, byName, all);
  if (!card) return null;
  return { card, qty: parsed.qty };
}

function fallbackRow(strength: Strength): NpcStrengthRow {
  if (strength === "weak") {
    return {
      equip_avg: 6,
      trap_avg: 6,
      spell_avg: 3,
      equip_target: 6,
      trap_target: 6,
      spell_target: 3,
      boss_density: 0.05,
      sample_size: 0,
    };
  }
  if (strength === "strong") {
    return {
      equip_avg: 8,
      trap_avg: 8,
      spell_avg: 5,
      equip_target: 8,
      trap_target: 8,
      spell_target: 5,
      boss_density: 0.25,
      sample_size: 0,
    };
  }
  return {
    equip_avg: 7,
    trap_avg: 7,
    spell_avg: 4,
    equip_target: 7,
    trap_target: 7,
    spell_target: 4,
    boss_density: 0.12,
    sample_size: 0,
  };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface ExtractedDeck {
  strength: Strength;
  acc: DeckAcc;
}

function extractBlankRowBlocks(
  rows: (string | number)[][],
  byName: Map<string, Card>,
  all: Card[],
): { decks: DeckAcc[]; unmatched: string[]; matched: number; cells: number } {
  const decks: DeckAcc[] = [];
  const unmatched: string[] = [];
  let matched = 0;
  let cells = 0;
  let current = emptyAcc();
  let cardsInBlock = 0;

  const flush = () => {
    if (cardsInBlock >= MIN_CARDS_PER_DECK) decks.push({ ...current });
    current = emptyAcc();
    cardsInBlock = 0;
  };

  for (const row of rows) {
    const cellsInRow = row.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (!cellsInRow.length) {
      flush();
      continue;
    }
    // Label row?
    if (cellsInRow.length === 1) {
      const lab = strengthFromLabel(cellsInRow[0]!);
      if (lab) {
        flush();
        current = emptyAcc(cellsInRow[0]);
        continue;
      }
    }
    for (const cell of cellsInRow) {
      cells += 1;
      const hit = resolveCell(cell, byName, all);
      if (!hit) {
        if (cell.length > 2 && !isHeaderNoise(normName(cell))) {
          unmatched.push(cell);
        }
        continue;
      }
      matched += 1;
      cardsInBlock += hit.qty;
      addCardToAcc(current, hit.card, hit.qty);
    }
  }
  flush();
  return { decks, unmatched, matched, cells };
}

function extractColumnDecks(
  rows: (string | number)[][],
  byName: Map<string, Card>,
  all: Card[],
): { decks: DeckAcc[]; unmatched: string[]; matched: number } {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const decks: DeckAcc[] = [];
  const unmatched: string[] = [];
  let matched = 0;

  for (let col = 0; col < maxCols; col++) {
    const acc = emptyAcc(`col${col}`);
    let cards = 0;
    // Header may be strength label
    const header = String(rows[0]?.[col] ?? "").trim();
    if (header) {
      const lab = strengthFromLabel(header);
      if (lab) acc.label = header;
    }
    for (let r = 0; r < rows.length; r++) {
      const cell = String(rows[r]?.[col] ?? "").trim();
      if (!cell) continue;
      const hit = resolveCell(cell, byName, all);
      if (!hit) {
        if (r > 0 && cell.length > 2 && !isHeaderNoise(normName(cell))) {
          unmatched.push(cell);
        }
        continue;
      }
      matched += 1;
      cards += hit.qty;
      addCardToAcc(acc, hit.card, hit.qty);
    }
    if (cards >= MIN_CARDS_PER_DECK) decks.push(acc);
  }
  return { decks, unmatched, matched };
}

export function ingestNpcDecks(): NpcCalibration {
  const { byName, all } = loadCatalog();
  const wbPath = findWorkbook();
  const buckets: Record<Strength, DeckAcc[]> = {
    weak: [],
    medium: [],
    strong: [],
  };
  let notes = "";
  const debug: Record<string, unknown> = {
    catalog_size: all.length,
    workbook: wbPath,
    sheets: [] as unknown[],
  };

  if (!wbPath) {
    notes =
      "NPC-deck.xlsx não encontrado — a usar faixas fixas 6–9 / 6–9 / 3–6.";
    console.warn(notes);
  } else {
    const dest = path.join(DATA_DIR, "source", "NPC-deck.xlsx");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (path.resolve(wbPath) !== path.resolve(dest)) {
      fs.copyFileSync(wbPath, dest);
    }

    const XLSX = loadXlsx();
    if (!XLSX) {
      notes =
        "Pacote xlsx em falta (npm install) — a usar faixas fixas 6–9 / 6–9 / 3–6.";
      console.warn(notes);
    } else {
      try {
        const wb = XLSX.readFile(wbPath);
        const sheets = wb.SheetNames;
        notes = `Parseado ${sheets.length} folha(s) de ${path.basename(wbPath)}.`;

        const collected: ExtractedDeck[] = [];

        for (let si = 0; si < sheets.length; si++) {
          const name = sheets[si]!;
          const sheet = wb.Sheets[name]!;
          const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
            sheet,
            { header: 1, defval: "", raw: false },
          ) as (string | number)[][];

          const preview = rows
            .slice(0, 40)
            .map((r, i) => ({
              row: i + 1,
              cells: r.map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 10),
            }))
            .filter((r) => r.cells.length);

          const byBlank = extractBlankRowBlocks(rows, byName, all);
          const byCol = extractColumnDecks(rows, byName, all);

          // Prefer the layout that found more decks
          const useCol = byCol.decks.length > byBlank.decks.length;
          const chosen = useCol ? byCol.decks : byBlank.decks;
          const unmatched = (useCol ? byCol.unmatched : byBlank.unmatched).slice(
            0,
            40,
          );
          const matched = useCol ? byCol.matched : byBlank.matched;

          (debug.sheets as unknown[]).push({
            name,
            row_count: rows.length,
            preview,
            layout: useCol ? "columns" : "blank_row_blocks",
            decks_found: chosen.length,
            matched_cells: matched,
            unmatched_sample: unmatched,
            unmatched_rate:
              matched + unmatched.length
                ? unmatched.length / (matched + unmatched.length)
                : 1,
          });

          const sheetLabelStrength = strengthFromLabel(name);

          for (let di = 0; di < chosen.length; di++) {
            const acc = chosen[di]!;
            const fromLabel =
              (acc.label && strengthFromLabel(acc.label)) ||
              sheetLabelStrength ||
              strengthByIndex(di, chosen.length);
            // Multi-sheet: also use sheet order if no decks inside and single deck
            const strength =
              sheets.length > 1 && chosen.length === 1 && !acc.label
                ? strengthByIndex(si, sheets.length)
                : fromLabel;
            collected.push({ strength, acc });
          }

          // Sheet as one deck fallback
          if (!chosen.length && matched >= MIN_CARDS_PER_DECK) {
            const whole = emptyAcc(name);
            for (const row of rows) {
              for (const cell of row) {
                const hit = resolveCell(String(cell ?? ""), byName, all);
                if (!hit) continue;
                addCardToAcc(whole, hit.card, hit.qty);
              }
            }
            if (whole.total >= MIN_CARDS_PER_DECK) {
              collected.push({
                strength:
                  sheetLabelStrength || strengthByIndex(si, sheets.length),
                acc: whole,
              });
            }
          }
        }

        // Rebalance if everything landed in one bucket
        if (collected.length >= 3) {
          const onlyOne = (["weak", "medium", "strong"] as Strength[]).filter(
            (k) => collected.filter((c) => c.strength === k).length > 0,
          );
          if (onlyOne.length === 1) {
            collected.sort((a, b) => a.acc.total - b.acc.total);
            for (let i = 0; i < collected.length; i++) {
              collected[i]!.strength = strengthByIndex(i, collected.length);
            }
            notes += " Força redistribuída por índice (folha única).";
          }
        }

        for (const { strength, acc } of collected) {
          buckets[strength].push(acc);
        }

        notes += ` Decks extraídos: ${collected.length} (W${buckets.weak.length}/M${buckets.medium.length}/S${buckets.strong.length}).`;
        debug.extracted = collected.length;
      } catch (err) {
        notes = `Falha ao parsear xlsx (${String(err)}) — fallback fixo.`;
        console.warn(notes);
        debug.error = String(err);
      }
    }
  }

  const by_strength: Record<string, NpcStrengthRow> = {};
  for (const key of ["weak", "medium", "strong"] as Strength[]) {
    const list = buckets[key];
    if (!list.length) {
      by_strength[key] = fallbackRow(key);
      continue;
    }
    const equip_avg = avg(list.map((d) => d.equip));
    const trap_avg = avg(list.map((d) => d.trap));
    const spell_avg = avg(list.map((d) => d.spell));
    const boss_density = avg(
      list.map((d) => (d.total ? d.bosses / d.total : 0)),
    );
    by_strength[key] = {
      equip_avg: Math.round(equip_avg * 100) / 100,
      trap_avg: Math.round(trap_avg * 100) / 100,
      spell_avg: Math.round(spell_avg * 100) / 100,
      equip_target: clamp(
        equip_avg || fallbackRow(key).equip_target,
        EQUIP_MIN,
        EQUIP_MAX,
      ),
      trap_target: clamp(
        trap_avg || fallbackRow(key).trap_target,
        TRAP_MIN,
        TRAP_MAX,
      ),
      spell_target: clamp(
        spell_avg || fallbackRow(key).spell_target,
        SPELL_MIN,
        SPELL_MAX,
      ),
      boss_density: Math.round(boss_density * 1000) / 1000,
      sample_size: list.length,
    };
  }

  const calibration: NpcCalibration = {
    source: wbPath ? path.basename(wbPath) : "fallback",
    generated_at: new Date().toISOString(),
    notes,
    by_strength,
    tier_map: {
      "3": "weak",
      "4": "medium",
      "5": "strong",
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = path.join(DATA_DIR, "npc-calibration.json");
  fs.writeFileSync(out, `${JSON.stringify(calibration, null, 2)}\n`, "utf8");
  const debugOut = path.join(DATA_DIR, "npc-ingest-debug.json");
  fs.writeFileSync(
    debugOut,
    `${JSON.stringify({ ...debug, notes, by_strength }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${out}`);
  console.log(`Wrote ${debugOut}`);
  console.log(notes);
  return calibration;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMain()) {
  try {
    ingestNpcDecks();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
