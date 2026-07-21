import type { Card, DeckEntry } from "../types/card.ts";
import { GOD_SLUGS } from "./effect-analyzer.ts";

export const DECK_SIZE = 40;
export const DEFAULT_COPY_LIMIT = 3;

export const MAX_TRAP = 15;
export const MAX_EQUIP = 15;
export const MAX_SPELL = 15;
export const MAX_FIELD = 0;

export const EQUIP_RANGE = { min: 0, max: 15 } as const;
export const TRAP_RANGE = { min: 0, max: 15 } as const;
export const SPELL_RANGE = { min: 0, max: 15 } as const;

const GOD_SET = new Set<string>(GOD_SLUGS);

export type SlotKind = "monster" | "spell" | "equip" | "field" | "trap";

export interface SlotTargets {
  equip: number;
  trap: number;
  spell: number;
  monster: number;
}

export function slotKind(card: Card): SlotKind {
  const t = card.card_type;
  if (t === "Trap") return "trap";
  if (t === "Equip") return "equip";
  if (t === "Field") return "field";
  if (t === "Spell") return "spell";
  return "monster";
}

/** Banlist ignorada: 3 cópias; deuses egípcios 1 cada. */
export function copyLimit(card: Card): number {
  if (GOD_SET.has(card.slug)) return 1;
  return DEFAULT_COPY_LIMIT;
}

export interface TypeCounts {
  monster: number;
  spell: number;
  equip: number;
  field: number;
  trap: number;
}

export interface DeckState {
  counts: Map<string, number>;
  typeCounts: TypeCounts;
  total: number;
  bombCopies: number;
}

export function emptyTypeCounts(): TypeCounts {
  return { monster: 0, spell: 0, equip: 0, field: 0, trap: 0 };
}

export function createDeckState(): DeckState {
  return {
    counts: new Map(),
    typeCounts: emptyTypeCounts(),
    total: 0,
    bombCopies: 0,
  };
}

function typeCap(kind: SlotKind): number | null {
  switch (kind) {
    case "trap":
      return MAX_TRAP;
    case "equip":
      return MAX_EQUIP;
    case "spell":
      return MAX_SPELL;
    case "field":
      return MAX_FIELD;
    default:
      return null;
  }
}

/**
 * Targets de Magia/Equip/Trap.
 * Se `exact` for passado, usa esses valores (clamp nas faixas).
 * `includeSpells === false` força Magia = 0.
 */
export function pickSlotTargets(
  deckTier: 3 | 4 | 5,
  rand: () => number,
  godsAlready: number,
  calibration?: { equip?: number; trap?: number; spell?: number },
  includeSpells = true,
  exact?: { equip?: number; trap?: number; spell?: number } | null,
): SlotTargets {
  if (exact) {
    let equip =
      exact.equip != null
        ? Math.min(EQUIP_RANGE.max, Math.max(EQUIP_RANGE.min, Math.round(exact.equip)))
        : EQUIP_RANGE.min;
    let trap =
      exact.trap != null
        ? Math.min(TRAP_RANGE.max, Math.max(TRAP_RANGE.min, Math.round(exact.trap)))
        : TRAP_RANGE.min;
    let spell =
      exact.spell != null
        ? Math.min(SPELL_RANGE.max, Math.max(SPELL_RANGE.min, Math.round(exact.spell)))
        : 0;
    if (!includeSpells) spell = 0;

    // Só reduz se a soma não couber no deck (gods ocupam slots)
    let support = equip + trap + spell;
    const maxSupport = Math.max(0, DECK_SIZE - Math.max(godsAlready, 0));
    while (support > maxSupport && support > 0) {
      if (spell > 0) spell -= 1;
      else if (equip >= trap && equip > 0) equip -= 1;
      else if (trap > 0) trap -= 1;
      else break;
      support = equip + trap + spell;
    }
    return {
      equip,
      trap,
      spell,
      monster: DECK_SIZE - equip - trap - spell,
    };
  }

  const biasHigh = deckTier === 5 ? 0.8 : deckTier === 4 ? 0.55 : 0.3;

  function pickRange(min: number, max: number, cal?: number): number {
    if (cal != null && cal >= min && cal <= max) {
      const j = Math.round((rand() - 0.5) * 2);
      return Math.min(max, Math.max(min, cal + j));
    }
    const span = max - min;
    return min + Math.round(span * (rand() * 0.35 + biasHigh * 0.65));
  }

  // Default "auto" legado: equips/traps na zona 6–9 (dentro do max 15)
  const autoEquipMin = 6;
  const autoTrapMin = 6;
  const autoEquipMax = 9;
  const autoTrapMax = 9;
  const autoSpellMax = 6;
  let equip = pickRange(autoEquipMin, autoEquipMax, calibration?.equip);
  let trap = pickRange(autoTrapMin, autoTrapMax, calibration?.trap);
  let spell = 0;
  if (includeSpells) {
    spell = pickRange(SPELL_RANGE.min, autoSpellMax, calibration?.spell);
    if (deckTier === 3 && rand() < 0.45) spell = 0;
    else if (deckTier === 4 && rand() < 0.2) spell = 0;
  }

  let support = equip + trap + spell;
  const maxSupport = DECK_SIZE - Math.max(godsAlready, 0) - 14;
  while (
    support > maxSupport &&
    (equip > autoEquipMin || trap > autoTrapMin || spell > SPELL_RANGE.min)
  ) {
    if (spell > SPELL_RANGE.min) spell -= 1;
    else if (equip >= trap && equip > autoEquipMin) equip -= 1;
    else if (trap > autoTrapMin) trap -= 1;
    else break;
    support = equip + trap + spell;
  }

  return {
    equip,
    trap,
    spell,
    monster: DECK_SIZE - equip - trap - spell,
  };
}

export interface AddCopyOpts {
  maxBombs?: number;
  /** Permite deck com mais de DECK_SIZE cartas (edição manual). */
  allowOverSize?: boolean;
}

export function canAddCopy(
  card: Card,
  state: DeckState,
  opts?: AddCopyOpts,
): boolean {
  if (card.card_type === "Field") return false;
  if (!opts?.allowOverSize && state.total >= DECK_SIZE) return false;
  const current = state.counts.get(card.slug) || 0;
  if (current >= copyLimit(card)) return false;

  const kind = slotKind(card);
  const cap = typeCap(kind);
  if (cap != null && state.typeCounts[kind] + 1 > cap) return false;

  const maxBombs = opts?.maxBombs;
  if (
    maxBombs != null &&
    (card.power_tier || 1) >= 5 &&
    state.bombCopies + 1 > maxBombs
  ) {
    return false;
  }

  return true;
}

export function addCopy(
  card: Card,
  state: DeckState,
  opts?: AddCopyOpts,
): boolean {
  if (!canAddCopy(card, state, opts)) return false;
  state.counts.set(card.slug, (state.counts.get(card.slug) || 0) + 1);
  state.total += 1;
  state.typeCounts[slotKind(card)] += 1;
  if ((card.power_tier || 1) >= 5) state.bombCopies += 1;
  return true;
}

/** Remove uma cópia; opcionalmente protege mins de Equip/Trap do target. */
export function removeCopy(
  card: Card,
  state: DeckState,
  opts?: {
    protectSupportMins?: boolean;
    minEquip?: number;
    minTrap?: number;
  },
): boolean {
  const current = state.counts.get(card.slug) || 0;
  if (current < 1) return false;
  const kind = slotKind(card);
  if (opts?.protectSupportMins !== false) {
    const minEquip = opts?.minEquip ?? 0;
    const minTrap = opts?.minTrap ?? 0;
    if (kind === "equip" && state.typeCounts.equip <= minEquip) {
      return false;
    }
    if (kind === "trap" && state.typeCounts.trap <= minTrap) {
      return false;
    }
  }
  if (current === 1) state.counts.delete(card.slug);
  else state.counts.set(card.slug, current - 1);
  state.total -= 1;
  state.typeCounts[kind] -= 1;
  if ((card.power_tier || 1) >= 5) {
    state.bombCopies = Math.max(0, state.bombCopies - 1);
  }
  return true;
}

export function stateToEntries(state: DeckState): DeckEntry[] {
  return [...state.counts.entries()]
    .map(([slug, copies]) => ({ slug, copies }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Reconstrói DeckState a partir de entradas (ex.: após geração ou carregar deck). */
export function entriesToDeckState(
  entries: DeckEntry[],
  bySlug: Map<string, Card>,
  opts?: AddCopyOpts,
): DeckState {
  const state = createDeckState();
  for (const e of entries) {
    const card = bySlug.get(e.slug);
    if (!card) continue;
    for (let i = 0; i < e.copies; i++) {
      addCopy(card, state, opts);
    }
  }
  return state;
}

/** Remove todas as cópias de uma carta do deck. */
export function removeAllCopies(card: Card, state: DeckState): boolean {
  const current = state.counts.get(card.slug) || 0;
  if (current < 1) return false;
  for (let i = 0; i < current; i++) {
    removeCopy(card, state, { protectSupportMins: false });
  }
  return true;
}

/** Define quantidade exacta (0 remove a carta). Respeita copyLimit. */
export function setCopyCount(
  card: Card,
  state: DeckState,
  target: number,
  opts?: AddCopyOpts,
): boolean {
  const limit = copyLimit(card);
  const clamped = Math.max(0, Math.min(limit, Math.round(target)));
  const current = state.counts.get(card.slug) || 0;
  if (clamped === current) return true;
  if (clamped > current) {
    for (let i = current; i < clamped; i++) {
      if (!addCopy(card, state, opts)) return false;
    }
    return true;
  }
  for (let i = current; i > clamped; i--) {
    if (!removeCopy(card, state, { protectSupportMins: false })) return false;
  }
  return true;
}

export function isMonster(card: Card): boolean {
  return slotKind(card) === "monster";
}

export function needsSupportSlot(
  kind: SlotKind,
  state: DeckState,
  targets: SlotTargets,
): boolean {
  if (kind === "equip") return state.typeCounts.equip < targets.equip;
  if (kind === "trap") return state.typeCounts.trap < targets.trap;
  if (kind === "spell") return state.typeCounts.spell < targets.spell;
  if (kind === "monster") return state.typeCounts.monster < targets.monster;
  return false;
}
