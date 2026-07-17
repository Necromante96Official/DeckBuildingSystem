import type { Card, PowerTier, SelectableTier } from "../types/card.ts";

/** Peso de raridade para poder do deck (plano): N=1 R=2 SR=3 UR=4 */
export function deckRarityWeight(raridade: string): number {
  switch (raridade) {
    case "UR":
      return 4;
    case "SR":
      return 3;
    case "R":
      return 2;
    case "N":
    default:
      return 1;
  }
}

/** Normaliza texto de efeito para chave estável */
export function normalizeEffectText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function effectTextKey(desc_pt: string): string {
  return normalizeEffectText(desc_pt);
}

/**
 * Peso de efeito 3/4/5 para poder do deck.
 * Manual (effect-tiers.json) tem prioridade.
 */
export function deckEffectWeight(
  card: Card,
  manualTier?: PowerTier | null,
): number {
  if (!card.has_effect) return 0;
  if (manualTier === 3 || manualTier === 4 || manualTier === 5) {
    return manualTier;
  }
  const w = card.effect_weight || 1;
  if (w >= 5) return 5;
  if (w >= 4) return 4;
  if (w >= 3) return 3;
  // efeito fraco / soft → conta como 3
  if (card.effect_tags?.includes("vanilla")) return 0;
  return 3;
}

export function cardDeckPower(
  card: Card,
  manualEffectTier?: PowerTier | null,
): number {
  return (
    deckRarityWeight(card.raridade) + deckEffectWeight(card, manualEffectTier)
  );
}

export function deckTotalPower(
  entries: Array<{ slug: string; copies: number }>,
  bySlug: Map<string, Card>,
  manualByEffectKey?: Map<string, PowerTier>,
): number {
  let sum = 0;
  for (const e of entries) {
    const c = bySlug.get(e.slug);
    if (!c) continue;
    let manual: PowerTier | null = null;
    if (manualByEffectKey && c.desc_pt) {
      const k = effectTextKey(c.desc_pt);
      manual = manualByEffectKey.get(k) ?? null;
    }
    sum += cardDeckPower(c, manual) * e.copies;
  }
  return sum;
}

export interface PowerBand {
  min: number;
  max: number | null; // null = sem tecto
}

export function powerBandForTier(tier: SelectableTier): PowerBand {
  if (tier === 3) return { min: 140, max: 200 };
  if (tier === 4) return { min: 210, max: 280 };
  return { min: 300, max: null }; // Ultra Hard ≥300
}

export function powerInBand(total: number, band: PowerBand): boolean {
  if (total < band.min) return false;
  if (band.max != null && total > band.max) return false;
  return true;
}
