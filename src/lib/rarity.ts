import type { Rarity, RarityFile } from "../types/card.ts";

const RARITY_ORDER: Rarity[] = ["N", "R", "SR", "UR"];

const RARITY_LABELS: Record<string, string> = {
  N: "Comum",
  R: "Rara",
  SR: "Super Rara",
  UR: "Ultra Rara",
};

/** Badge de ficheiro: N → C (como no site) */
export function rarityToFile(raridade: string): RarityFile {
  if (raridade === "N") return "C";
  if (raridade === "R" || raridade === "SR" || raridade === "UR") {
    return raridade;
  }
  return "C";
}

export function rarityLabel(raridade: string): string {
  return RARITY_LABELS[raridade] ?? raridade;
}

export function sortRarities(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = RARITY_ORDER.indexOf(a as Rarity);
    const ib = RARITY_ORDER.indexOf(b as Rarity);
    const sa = ia === -1 ? 99 : ia;
    const sb = ib === -1 ? 99 : ib;
    return sa - sb || a.localeCompare(b);
  });
}

export { RARITY_LABELS, RARITY_ORDER };

