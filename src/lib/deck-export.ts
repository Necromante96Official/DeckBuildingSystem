import * as XLSX from "xlsx";
import type {
  Card,
  DeckComposition,
  DeckEntry,
  PowerTier,
} from "../types/card.ts";
import { cardDeckPower, effectTextKey } from "./card-power.ts";

export interface DeckExportSummary {
  total: number;
  composition: DeckComposition;
  total_deck_power: number;
  average_power_tier: number;
  seed?: number;
  label?: string;
}

function manualTierForCard(
  card: Card,
  manualByEffectKey?: Map<string, PowerTier>,
): PowerTier | null {
  if (!manualByEffectKey || !card.desc_pt) return null;
  return manualByEffectKey.get(effectTextKey(card.desc_pt)) ?? null;
}

export function exportDeckToExcel(
  entries: DeckEntry[],
  bySlug: Map<string, Card>,
  summary: DeckExportSummary,
  manualByEffectKey?: Map<string, PowerTier>,
  filename = "deck-forbidden-legacy.xlsx",
): void {
  const rows = entries.map((e) => {
    const c = bySlug.get(e.slug);
    if (!c) {
      return {
        "Nome PT": e.slug,
        Slug: e.slug,
        Tipo: "",
        Raridade: "",
        Cópias: e.copies,
        "Power Tier": "",
        Poder: "",
      };
    }
    const manual = manualTierForCard(c, manualByEffectKey);
    const tier = manual ?? c.power_tier ?? 1;
    const unitPower = cardDeckPower(c, manual);
    return {
      "Nome PT": c.nome_pt || c.nome,
      Slug: c.slug,
      Tipo: c.card_type,
      Raridade: c.raridade,
      Cópias: e.copies,
      "Power Tier": tier,
      Poder: unitPower * e.copies,
    };
  });

  const wb = XLSX.utils.book_new();
  const wsCards = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsCards, "Cartas");

  const summaryRows = [
    { Campo: "Total de cartas", Valor: summary.total },
    { Campo: "Monstros", Valor: summary.composition.monster },
    { Campo: "Magias", Valor: summary.composition.spell },
    { Campo: "Equips", Valor: summary.composition.equip },
    { Campo: "Traps", Valor: summary.composition.trap },
    { Campo: "Poder total", Valor: summary.total_deck_power },
    { Campo: "Tier médio", Valor: summary.average_power_tier },
    ...(summary.seed != null
      ? [{ Campo: "Seed", Valor: summary.seed }]
      : []),
    ...(summary.label ? [{ Campo: "Etiqueta", Valor: summary.label }] : []),
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  XLSX.writeFile(wb, filename);
}
