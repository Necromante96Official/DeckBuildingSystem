import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cardDeckPower, effectTextKey } from "../lib/card-power.ts";
import { analyzeCardEffects } from "../lib/effect-analyzer.ts";
import { CARDS_JSON, EFFECT_TIERS_JSON } from "../lib/paths.ts";
import { enrichCardPower } from "../lib/power-tier.ts";
import type {
  CardsInventory,
  EffectTiersFile,
  PowerTier,
} from "../types/card.ts";

export function analyzeEffects(): CardsInventory {
  if (!fs.existsSync(CARDS_JSON)) {
    throw new Error(`Falta ${CARDS_JSON}. Corre npm run ingest primeiro.`);
  }
  const inventory = JSON.parse(
    fs.readFileSync(CARDS_JSON, "utf8"),
  ) as CardsInventory;

  let manual: EffectTiersFile = { tiers: {} };
  if (fs.existsSync(EFFECT_TIERS_JSON)) {
    manual = JSON.parse(
      fs.readFileSync(EFFECT_TIERS_JSON, "utf8"),
    ) as EffectTiersFile;
  }

  const porTier: Record<string, number> = {};
  for (const card of inventory.cartas) {
    const { effect_tags, effect_weight } = analyzeCardEffects(card);
    enrichCardPower(card, effect_tags, effect_weight);
    let manualTier: PowerTier | null = null;
    if (card.desc_pt) {
      const k = effectTextKey(card.desc_pt);
      const t = manual.tiers[k];
      if (t === 3 || t === 4 || t === 5) {
        manualTier = t;
        card.effect_tier_manual = t;
        card.effect_weight = t;
      }
    }
    card.card_power = cardDeckPower(card, manualTier);
    const pt = String(card.power_tier || 1);
    porTier[pt] = (porTier[pt] || 0) + 1;
  }

  inventory.gerado_em = new Date().toISOString();
  fs.writeFileSync(
    CARDS_JSON,
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );

  console.log(`Analyze effects: ${inventory.cartas.length} cartas enriquecidas`);
  console.log("Por power_tier:", porTier);
  return inventory;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    analyzeEffects();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
