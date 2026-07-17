import type { Card, PowerTier } from "../types/card.ts";
import {
  TIER_OVERRIDES,
  hasAbsurdEffect,
} from "./effect-analyzer.ts";

/** Piso / teto por raridade */
export function rarityTierBand(raridade: string): {
  floor: PowerTier;
  ceil: PowerTier;
  rarity_floor: number;
} {
  switch (raridade) {
    case "UR":
      return { floor: 4, ceil: 5, rarity_floor: 4 };
    case "SR":
      return { floor: 2, ceil: 4, rarity_floor: 3 };
    case "R":
      return { floor: 1, ceil: 3, rarity_floor: 2 };
    case "N":
    default:
      return { floor: 1, ceil: 3, rarity_floor: 1 };
  }
}

export function rarityWeight(raridade: string): number {
  return rarityTierBand(raridade).rarity_floor;
}

export function bodyWeight(card: Card): number {
  if (card.card_type !== "Monster") return 1;
  const atk = Number.parseInt(card.atk || "0", 10) || 0;
  if (atk >= 3000) return 5;
  if (atk >= 2500) return 4;
  if (atk >= 2000) return 3;
  if (atk >= 1500) return 2;
  if (atk <= 1200) return 1;
  return 2;
}

function clampTo(n: number, floor: PowerTier, ceil: PowerTier): PowerTier {
  const r = Math.round(n);
  if (r < floor) return floor;
  if (r > ceil) return ceil;
  return r as PowerTier;
}

/**
 * Fórmula: round(0.55*effect + 0.30*rarity_floor + 0.15*body)
 * depois piso/teto por raridade.
 * UR: sempre 4 ou 5 (efeito absurdo / boss de arche → 5).
 */
export function computePowerTier(
  card: Card,
  effectWeight: PowerTier,
  rarityW: number,
  bodyW: number,
  effectTags: string[],
): PowerTier {
  const override = TIER_OVERRIDES[card.slug];
  if (override) return override;

  const band = rarityTierBand(card.raridade);
  const raw = 0.55 * effectWeight + 0.3 * rarityW + 0.15 * bodyW;
  let tier = clampTo(raw, band.floor, band.ceil);

  const atk = Number.parseInt(card.atk || "0", 10) || 0;
  const isBossBody =
    card.card_type === "Monster" && (atk >= 2800 || bodyW >= 5);
  const absurd = hasAbsurdEffect(effectTags, effectWeight);

  // UR: always 4 or 5 — bosses / absurd effects → 5
  if (card.raridade === "UR") {
    if (absurd || isBossBody) return 5;
    return 4;
  }

  // SR with absurd effect → up to 4
  if (card.raridade === "SR" && absurd) {
    tier = Math.max(tier, 4) as PowerTier;
    if (tier > 4) tier = 4;
  }

  // N/R: absurd effect can reach 3 (already ceil)
  if ((card.raridade === "N" || card.raridade === "R") && absurd) {
    tier = Math.max(tier, 3) as PowerTier;
  }

  // Typical R → prefer 2 when soft
  if (card.raridade === "R" && effectWeight <= 2 && tier > 2) {
    tier = 2;
  }

  // Typical N → prefer 1–2 when vanilla/soft
  if (card.raridade === "N" && effectWeight <= 1) {
    tier = Math.min(tier, 2) as PowerTier;
  }

  return clampTo(tier, band.floor, band.ceil);
}

export function enrichCardPower(
  card: Card,
  effect_tags: string[],
  effect_weight: PowerTier,
): void {
  const rarity_weight = rarityWeight(card.raridade);
  const body_weight = bodyWeight(card);
  const power_tier = computePowerTier(
    card,
    effect_weight,
    rarity_weight,
    body_weight,
    effect_tags,
  );
  card.effect_tags = effect_tags;
  card.effect_weight = effect_weight;
  card.rarity_weight = rarity_weight;
  card.body_weight = body_weight;
  card.power_tier = power_tier;
}
