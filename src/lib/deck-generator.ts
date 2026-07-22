import type {
  ArchetypeIndex,
  ArchetypeIndexEntry,
  Card,
  DeckResult,
  GodsMode,
  NpcCalibration,
  SelectableTier,
} from "../types/card.ts";
import {
  cardDeckPower,
  deckTotalPower,
  effectTextKey,
  powerBandForTier,
  powerInBand,
} from "./card-power.ts";
import {
  DECK_SIZE,
  addCopy,
  canAddCopy,
  copyLimit,
  createDeckState,
  needsSupportSlot,
  pickSlotTargets,
  removeCopy,
  slotKind,
  stateToEntries,
  type SlotKind,
  type SlotTargets,
} from "./deck-rules.ts";
import {
  GOD_SLUGS,
  extractRequiresTags,
  extractTribalAndEquipTags,
  isAttrKey,
  isTypeKey,
  parseTaggedValue,
} from "./effect-analyzer.ts";

export interface GenerateDeckOptions {
  cards: Card[];
  archetypes: ArchetypeIndex;
  /** Um ou mais arquétipos; use ["livre"] para Por tipo. */
  archetypeIds: string[];
  targetTier: SelectableTier;
  godsMode?: GodsMode;
  seed?: number;
  /** Calibração NPC (opcional); se ausente, usa faixas fixas */
  npcCalibration?: NpcCalibration | null;
  /** Tiers manuais de efeito (chave = effectTextKey) */
  effectTiers?: Record<string, 3 | 4 | 5> | null;
  /** Modo Por tipo: raça obrigatória 100% (ex. "Dragon") */
  monsterTipo?: string | null;
  /** Modo Por atributo: WATER/FIRE/… (nunca Divine) */
  monsterAtributo?: string | null;
  /** Se false, força 0 magias */
  includeSpells?: boolean;
  /** Quotas exactas (Magia/Equip/Trap 0–15). Se omitido, Auto. */
  slotTargets?: { equip?: number; trap?: number; spell?: number } | null;
  /** Slugs banidos para a config raça|atributo actual */
  bannedSlugs?: string[] | null;
}

const GOD_SET = new Set<string>(GOD_SLUGS);

const USEFUL_SUPPORT_TAGS = new Set([
  "board_wipe",
  "attack_boost",
  "attack_boost_high",
  "attacker_lock",
  "removal_control",
  "burn_direct",
  "burn_recurring",
  "tutor_summon",
  "backrow_wipe",
  "spell_negation",
  "attack_negation",
  "strong_immunity",
  "explosive_equip",
  "virus_wipe",
  "win_condition",
]);

const T5_STAPLE_SLUGS: { slug: string; kind: SlotKind }[] = [
  { slug: "dark_hole", kind: "spell" },
  { slug: "megamorph", kind: "equip" },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveArchetype(
  index: ArchetypeIndex,
  id: string,
): ArchetypeIndexEntry {
  const found = index.entries.find((e) => e.id === id);
  if (found) return found;
  const livre = index.entries.find((e) => e.livre);
  if (livre) return livre;
  throw new Error(`Arquetípico desconhecido: ${id}`);
}

/** Livre = entry livre real (sem auto-pick de arquetípico). */
export function resolveTheme(
  index: ArchetypeIndex,
  requestedIds: string[],
): {
  arch: ArchetypeIndexEntry;
  isLivre: boolean;
  activeIds: Set<string>;
} {
  const unique = [...new Set(requestedIds.length ? requestedIds : ["livre"])];
  if (unique.includes("livre") || unique.length === 0) {
    const livre = resolveArchetype(index, "livre");
    return { arch: livre, isLivre: true, activeIds: new Set(["livre"]) };
  }
  if (unique.length === 1) {
    const arch = resolveArchetype(index, unique[0]!);
    return { arch, isLivre: false, activeIds: new Set(unique) };
  }
  const entries = unique.map((id) => resolveArchetype(index, id));
  const mergedSlugs = new Set(entries.flatMap((e) => e.slugs));
  const mergedSupport = new Set(entries.flatMap((e) => e.support_slugs));
  const other = new Set<string>();
  for (const e of index.entries) {
    if (e.livre || unique.includes(e.id)) continue;
    for (const s of e.slugs) {
      if (!mergedSlugs.has(s) && !mergedSupport.has(s)) other.add(s);
    }
  }
  const merged: ArchetypeIndexEntry = {
    id: unique.join("+"),
    label: entries.map((e) => e.label).join(" + "),
    livre: false,
    synergy_tipos: [...new Set(entries.flatMap((e) => e.synergy_tipos))],
    slugs: [...mergedSlugs],
    support_slugs: [...mergedSupport],
    other_arch_slugs: [...other].sort(),
  };
  return { arch: merged, isLivre: false, activeIds: new Set(unique) };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function cardText(c: Card): string {
  return norm(
    `${c.nome} ${c.nome_pt} ${c.slug} ${c.desc_pt || ""} ${c.desc_en || ""}`,
  );
}

function referencesCore(card: Card, core: Card[]): boolean {
  const text = cardText(card);
  for (const c of core) {
    if (c.nome && text.includes(norm(c.nome))) return true;
    if (c.nome_pt && text.includes(norm(c.nome_pt))) return true;
    if (c.slug && text.includes(norm(c.slug))) return true;
  }
  return false;
}

function mentionsArchetype(card: Card, arch: ArchetypeIndexEntry): boolean {
  if (arch.livre) return false;
  const text = cardText(card);
  const keys = [arch.label, arch.id.replace(/_/g, " "), ...arch.synergy_tipos];
  if (arch.id.includes("red_eyes")) keys.push("red-eyes", "red eyes");
  if (arch.id.includes("blue_eyes")) keys.push("blue-eyes", "blue eyes");
  if (arch.id.includes("dark_magician")) {
    keys.push("dark magician", "dark magic");
  }
  if (arch.id.includes("black_luster")) {
    keys.push("black luster", "super soldier", "envoy of the beginning");
  }
  return keys.some((k) => k && text.includes(norm(k)));
}

function mentionsForeignArchetype(
  card: Card,
  arch: ArchetypeIndexEntry,
  allEntries: ArchetypeIndexEntry[],
  activeArchIds?: Set<string>,
): boolean {
  const text = cardText(card);
  for (const other of allEntries) {
    if (other.livre || other.id === arch.id) continue;
    if (activeArchIds?.has(other.id)) continue;
    const keys = [other.label, other.id.replace(/_/g, " ")];
    if (other.id.includes("red_eyes")) keys.push("red-eyes", "red eyes");
    if (other.id.includes("blue_eyes")) keys.push("blue-eyes", "blue eyes");
    if (other.id.includes("dark_magician")) {
      keys.push("dark magician", "dark magic");
    }
    if (other.id.includes("black_luster")) {
      keys.push("black luster", "envoy of the beginning");
    }
    if (keys.some((k) => k && text.includes(norm(k)))) {
      // Allow if it also clearly mentions OUR arch
      if (mentionsArchetype(card, arch) || referencesCore(card, [])) {
        continue;
      }
      return true;
    }
  }
  return false;
}

function maxBombsForTier(tier: SelectableTier): number {
  if (tier === 3) return 2;
  if (tier === 4) return 10;
  return 40;
}

function godsCount(mode: GodsMode): number {
  if (mode === "gods_1") return 1;
  if (mode === "gods_2") return 2;
  if (mode === "gods_3") return 3;
  return 0;
}

interface BuiltPool {
  core: Card[];
  support: Card[];
  fillerMonsters: Card[];
}

function buildLivrePool(
  cards: Card[],
  monsterTipo?: string | null,
  monsterAtributo?: string | null,
): BuiltPool {
  const core: Card[] = [];
  const support: Card[] = [];
  const fillerMonsters: Card[] = [];
  const wantTipo = monsterTipo ? normTipo(monsterTipo) : null;
  const wantAttr = monsterAtributo ? normTipo(monsterAtributo) : null;
  for (const c of cards) {
    if (c.card_type === "Field") continue;
    if (c.card_type === "Monster") {
      if (wantTipo && normTipo(c.tipo) !== wantTipo) continue;
      if (wantAttr && normTipo(c.atributo) !== wantAttr) continue;
      // Divine só via Dos Deuses
      if (normTipo(c.atributo).includes("divine")) continue;
      fillerMonsters.push(c);
    } else {
      support.push(c);
    }
  }
  return { core, support, fillerMonsters };
}

function buildPool(
  cards: Card[],
  arch: ArchetypeIndexEntry,
  allEntries: ArchetypeIndexEntry[],
  monsterTipo?: string | null,
  monsterAtributo?: string | null,
  activeArchIds?: Set<string>,
): BuiltPool {
  if (arch.livre) return buildLivrePool(cards, monsterTipo, monsterAtributo);

  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  const coreSlugs = new Set(arch.slugs);
  const supportSlugs = new Set(arch.support_slugs || []);
  const otherArch = new Set(arch.other_arch_slugs || []);
  const synergy = new Set(arch.synergy_tipos.map((t) => t.toLowerCase()));

  const core: Card[] = [];
  const support: Card[] = [];
  const fillerMonsters: Card[] = [];
  const noField = (c: Card) => c.card_type !== "Field";

  for (const slug of coreSlugs) {
    const c = bySlug.get(slug);
    if (c && noField(c) && !otherArch.has(c.slug)) core.push(c);
  }

  for (const slug of supportSlugs) {
    const c = bySlug.get(slug);
    if (!c || !noField(c) || coreSlugs.has(c.slug) || otherArch.has(c.slug)) {
      continue;
    }
    support.push(c);
  }

  for (const c of cards) {
    if (!noField(c)) continue;
    if (coreSlugs.has(c.slug) || supportSlugs.has(c.slug)) continue;
    if (otherArch.has(c.slug)) continue;
    if (mentionsForeignArchetype(c, arch, allEntries, activeArchIds) && !referencesCore(c, core)) {
      continue;
    }

    if (referencesCore(c, core) || mentionsArchetype(c, arch)) {
      support.push(c);
      continue;
    }

    if (
      c.card_type === "Spell" ||
      c.card_type === "Equip" ||
      c.card_type === "Trap"
    ) {
      const tags = c.effect_tags || [];
      if (tags.some((t) => USEFUL_SUPPORT_TAGS.has(t))) support.push(c);
      continue;
    }

    if (
      c.card_type === "Monster" &&
      synergy.has((c.tipo || "").toLowerCase())
    ) {
      fillerMonsters.push(c);
    }
  }

  return { core, support, fillerMonsters };
}

function buildMergedPool(
  cards: Card[],
  ids: string[],
  allEntries: ArchetypeIndexEntry[],
  monsterTipo?: string | null,
  monsterAtributo?: string | null,
): BuiltPool {
  const active = new Set(ids);
  const coreMap = new Map<string, Card>();
  const supportMap = new Map<string, Card>();
  const fillerMap = new Map<string, Card>();
  for (const id of ids) {
    const arch = resolveArchetype(
      { entries: allEntries, gerado_em: "" },
      id,
    );
    const pool = buildPool(
      cards,
      arch,
      allEntries,
      monsterTipo,
      monsterAtributo,
      active,
    );
    for (const c of pool.core) coreMap.set(c.slug, c);
    for (const c of pool.support) supportMap.set(c.slug, c);
    for (const c of pool.fillerMonsters) fillerMap.set(c.slug, c);
  }
  return {
    core: [...coreMap.values()],
    support: [...supportMap.values()],
    fillerMonsters: [...fillerMap.values()],
  };
}

function normTipo(t: string | undefined): string {
  return (t || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^beast warrior$/, "beastwarrior")
    .replace(/^winged beast$/, "winged beast");
}

function dominantKeys(
  deck: Card[],
  field: "tipo" | "atributo",
): { key: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const c of deck) {
    if (c.card_type !== "Monster" || GOD_SET.has(c.slug)) continue;
    const k = normTipo(field === "tipo" ? c.tipo : c.atributo);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

function countRaceInDeck(deck: Card[], raceKey: string): number {
  const want = normTipo(raceKey.replace(/_/g, " "));
  return deck.filter(
    (c) =>
      c.card_type === "Monster" &&
      !GOD_SET.has(c.slug) &&
      normTipo(c.tipo) === want,
  ).length;
}

function countAttrInDeck(deck: Card[], attrKey: string): number {
  const want = normTipo(attrKey.replace(/_/g, " "));
  return deck.filter(
    (c) =>
      c.card_type === "Monster" &&
      !GOD_SET.has(c.slug) &&
      normTipo(c.atributo) === want,
  ).length;
}

/** Compat: wipe keys podem ser raça ou atributo */
function countTipoInDeck(deck: Card[], tipoSlug: string): number {
  if (isAttrKey(tipoSlug)) return countAttrInDeck(deck, tipoSlug);
  return countRaceInDeck(deck, tipoSlug);
}

function hasTipoHost(
  deck: Card[],
  key: string,
  themeTipo?: string | null,
): boolean {
  const want = normTipo(key.replace(/_/g, " "));
  if (themeTipo && normTipo(themeTipo) === want) return true;
  return countRaceInDeck(deck, key) > 0;
}

function hasAttrHost(
  deck: Card[],
  key: string,
  themeAttr?: string | null,
): boolean {
  const want = normTipo(key.replace(/_/g, " "));
  if (themeAttr && normTipo(themeAttr) === want) return true;
  return countAttrInDeck(deck, key) > 0;
}

/**
 * Suporte (Equip/Spell/Trap) com restrição tribal que bate com o tema UI.
 * Genéricos (sem only/buffs tribal) → false.
 */
function isThemeCoherentSupport(
  card: Card,
  themeTipo?: string | null,
  themeAtributo?: string | null,
): boolean {
  if (!themeTipo && !themeAtributo) return false;
  if (
    card.card_type !== "Equip" &&
    card.card_type !== "Spell" &&
    card.card_type !== "Trap"
  ) {
    return false;
  }
  const tags = cardEffectTags(card);
  const onlyTipo = [
    ...parseTaggedValue(tags, "equip_only_tipo"),
    ...parseTaggedValue(tags, "equip_only").filter((k) => isTypeKey(k)),
  ];
  const onlyAttr = [
    ...parseTaggedValue(tags, "equip_only_attr"),
    ...parseTaggedValue(tags, "equip_only").filter((k) => isAttrKey(k)),
  ];
  const buffsTipo = parseTaggedValue(tags, "buffs_tipo");
  const buffsAttr = parseTaggedValue(tags, "buffs_attr");
  const restricted =
    onlyTipo.length + onlyAttr.length + buffsTipo.length + buffsAttr.length > 0;
  if (!restricted) return false;

  const emptyDeck: Card[] = [];
  return (
    onlyTipo.some((k) => hasTipoHost(emptyDeck, k, themeTipo)) ||
    onlyAttr.some((k) => hasAttrHost(emptyDeck, k, themeAtributo)) ||
    buffsTipo.some((k) => hasTipoHost(emptyDeck, k, themeTipo)) ||
    buffsAttr.some((k) => hasAttrHost(emptyDeck, k, themeAtributo))
  );
}

/**
 * Hard gate: rejeita auto-prejuízo e dependências órfãs.
 * Equips: só genéricos ou com hosts de tipo/atributo compatíveis.
 */
function rejectsAntiSynergy(
  candidate: Card,
  deck: Card[],
  themeTipo?: string | null,
  themeAtributo?: string | null,
): boolean {
  const tags = cardEffectTags(candidate);
  const themeRace = themeTipo ? normTipo(themeTipo) : null;
  const themeAttr = themeAtributo ? normTipo(themeAtributo) : null;
  const monCount = deck.filter(
    (c) => c.card_type === "Monster" && !GOD_SET.has(c.slug),
  ).length;

  for (const tribal of parseTaggedValue(tags, "mass_tipo_wipe_global")) {
    if (themeRace && normTipo(tribal) === themeRace) return true;
    if (themeAttr && isAttrKey(tribal) && normTipo(tribal) === themeAttr) {
      return true;
    }
    if (countTipoInDeck(deck, tribal) >= 3) return true;
  }

  for (const tribal of parseTaggedValue(tags, "mass_tipo_wipe_opp")) {
    if (themeRace && normTipo(tribal) === themeRace) return true;
    if (themeAttr && isAttrKey(tribal) && normTipo(tribal) === themeAttr) {
      return true;
    }
    if (!themeRace && !themeAttr && countTipoInDeck(deck, tribal) >= 4) {
      return true;
    }
  }

  if (candidate.card_type === "Equip") {
    const onlyTipo = [
      ...parseTaggedValue(tags, "equip_only_tipo"),
      ...parseTaggedValue(tags, "equip_only").filter((k) => isTypeKey(k)),
    ];
    const onlyAttr = [
      ...parseTaggedValue(tags, "equip_only_attr"),
      ...parseTaggedValue(tags, "equip_only").filter((k) => isAttrKey(k)),
    ];
    const buffsTipo = parseTaggedValue(tags, "buffs_tipo");
    const buffsAttr = parseTaggedValue(tags, "buffs_attr");

    let rejectReason: string | null = null;

    // Tema explícito: só aceita equips cujo onlyTipo/onlyAttr bate com o filtro UI
    if (!rejectReason && themeRace && onlyTipo.length > 0) {
      if (!onlyTipo.some((k) => normTipo(k.replace(/_/g, " ")) === themeRace)) {
        rejectReason = `onlyTipo_theme_mismatch:${onlyTipo.join(",")}`;
      }
    }
    if (!rejectReason && themeAttr && onlyAttr.length > 0) {
      if (!onlyAttr.some((k) => normTipo(k.replace(/_/g, " ")) === themeAttr)) {
        rejectReason = `onlyAttr_theme_mismatch:${onlyAttr.join(",")}`;
      }
    }

    for (const k of onlyTipo) {
      if (rejectReason) break;
      if (!hasTipoHost(deck, k, themeTipo)) {
        rejectReason = `onlyTipo_no_host:${k}`;
        break;
      }
    }
    if (!rejectReason) {
      for (const k of onlyAttr) {
        if (!hasAttrHost(deck, k, themeAtributo)) {
          rejectReason = `onlyAttr_no_host:${k}`;
          break;
        }
      }
    }

    // Buffs restritivos sem exclusividade: precisa de pelo menos 1 host (OR)
    if (
      !rejectReason &&
      (buffsTipo.length > 0 || buffsAttr.length > 0) &&
      onlyTipo.length === 0 &&
      onlyAttr.length === 0
    ) {
      const okBuff =
        buffsTipo.some((k) => hasTipoHost(deck, k, themeTipo)) ||
        buffsAttr.some((k) => hasAttrHost(deck, k, themeAtributo));
      if (!okBuff) rejectReason = "buffs_no_host";
    }

    // Legado equip_only sem classificação
    if (!rejectReason) {
      for (const only of parseTaggedValue(tags, "equip_only")) {
        if (isTypeKey(only) || isAttrKey(only)) continue;
        if (
          themeRace &&
          normTipo(only) !== themeRace &&
          themeAttr &&
          normTipo(only) !== themeAttr
        ) {
          rejectReason = `legacy_only:${only}`;
          break;
        }
        if (
          !themeRace &&
          !themeAttr &&
          countTipoInDeck(deck, only) === 0 &&
          monCount >= 4
        ) {
          rejectReason = `legacy_orphan:${only}`;
          break;
        }
      }
    }

    if (rejectReason) return true;
  }

  if (tags.includes("requires_pack:exodia")) {
    return true;
  }

  for (const nameKey of parseTaggedValue(tags, "requires_name")) {
    if (!deckSatisfiesRequire(nameKey, deck)) return true;
  }

  for (const tribe of parseTaggedValue(tags, "requires_tribe")) {
    if (themeRace && normTipo(tribe) !== themeRace) return true;
    if (countRaceInDeck(deck, tribe) === 0 && deck.length >= 6) return true;
  }

  return false;
}

function cardEffectTags(card: Card): string[] {
  const base = card.effect_tags || [];
  const text = `${card.desc_pt || ""} ${card.desc_en || ""}`;
  const live = [
    ...extractTribalAndEquipTags(text, card.slug),
    ...extractRequiresTags(text, card.slug),
  ];
  if (!live.length) return base;
  return [...new Set([...base, ...live])];
}

function matchesRequireName(key: string, card: Card): boolean {
  const blob = `${card.slug} ${card.nome} ${card.nome_pt}`.toLowerCase();
  switch (key) {
    case "harpie_lady":
    case "harpie":
      return /harpie/.test(blob);
    case "red_eyes":
      return /red[-_ ]?eyes|olhos?_?vermelh/.test(blob);
    case "blue_eyes":
      return /blue[-_ ]?eyes|olhos?_?azu/.test(blob);
    case "dark_magician_girl":
      return /dark_magician_girl|dark magician girl/.test(blob);
    case "dark_magician":
      return /dark_magician(?!_girl)|dark magician(?! girl)/.test(blob);
    case "black_luster":
      return /black_luster|black luster/.test(blob);
    case "kuriboh":
      return /kuriboh/.test(blob);
    case "toon":
      return /toon/.test(blob);
    default:
      return blob.includes(key.replace(/_/g, " "));
  }
}

function deckSatisfiesRequire(key: string, deck: Card[]): boolean {
  return deck.some((c) => matchesRequireName(key, c));
}

function hasThemeMonsters(deck: Card[], arch: ArchetypeIndexEntry, coreSet: Set<string>): boolean {
  if (arch.livre) {
    return deck.some((c) => c.card_type === "Monster" && !GOD_SET.has(c.slug));
  }
  return deck.some(
    (c) =>
      c.card_type === "Monster" &&
      !GOD_SET.has(c.slug) &&
      (coreSet.has(c.slug) ||
        arch.synergy_tipos.some(
          (t) => (c.tipo || "").toLowerCase() === t.toLowerCase(),
        )),
  );
}

function hasBosses(deck: Card[]): boolean {
  return deck.some((c) => (c.power_tier || 1) >= 5 && c.card_type === "Monster");
}

function synergyScore(
  candidate: Card,
  deckCards: Card[],
  arch: ArchetypeIndexEntry,
  coreSet: Set<string>,
  otherArch: Set<string>,
  core: Card[],
  target: SelectableTier,
  allEntries: ArchetypeIndexEntry[],
  themeTipo?: string | null,
  themeAtributo?: string | null,
  activeArchIds?: Set<string>,
): number {
  let score = 0;
  const isLivre = arch.livre;
  const themeNorm = themeTipo ? normTipo(themeTipo) : null;
  const themeAttr = themeAtributo ? normTipo(themeAtributo) : null;

  if (!isLivre) {
    if (coreSet.has(candidate.slug)) score += 55;
    if (otherArch.has(candidate.slug)) score -= 250;
    if (mentionsForeignArchetype(candidate, arch, allEntries, activeArchIds)) {
      score -= 80;
    }
  }

  const pt = candidate.power_tier || 1;
  const themeSupport = isThemeCoherentSupport(
    candidate,
    themeTipo,
    themeAtributo,
  );

  if (target === 5) {
    if (pt === 5) score += 70;
    if (pt === 4) score += 8;
    // Temáticos do filtro UI: não penalizar tier baixo (ex. equip Dino T2)
    if (pt <= 3 && !GOD_SET.has(candidate.slug) && !themeSupport) score -= 60;
  } else if (target === 4) {
    if (pt === 4) score += 55;
    if (pt === 5) score += 18;
    if (pt === 3) score += 6;
    if (pt <= 2 && !coreSet.has(candidate.slug) && !themeSupport) score -= 30;
  } else {
    if (pt === 3) score += 50;
    if (pt === 2) score += 28;
    if (pt === 4) score += 4;
    if (pt === 5) score -= 40;
    if (pt === 1) score -= 10;
  }

  if (!isLivre) {
    const synTipos = new Set(arch.synergy_tipos.map((t) => t.toLowerCase()));
    if (synTipos.has((candidate.tipo || "").toLowerCase())) score += 16;
    if (referencesCore(candidate, core)) score += 38;
    if (mentionsArchetype(candidate, arch)) score += 32;
  } else {
    if (
      themeNorm &&
      candidate.card_type === "Monster" &&
      normTipo(candidate.tipo) === themeNorm
    ) {
      score += 48;
    }
    if (
      themeAttr &&
      candidate.card_type === "Monster" &&
      normTipo(candidate.atributo) === themeAttr
    ) {
      score += 40;
    }
    if (!themeNorm && !themeAttr) {
      const domTipo = dominantKeys(deckCards, "tipo");
      const domAttr = dominantKeys(deckCards, "atributo");
      const monsterCount = deckCards.filter(
        (c) => c.card_type === "Monster" && !GOD_SET.has(c.slug),
      ).length;
      if (monsterCount >= 6) {
        if (domTipo && normTipo(candidate.tipo) === domTipo.key) score += 32;
        if (domAttr && normTipo(candidate.atributo) === domAttr.key) score += 18;
      }
    }
  }

  const tags = cardEffectTags(candidate);
  const themeMons = hasThemeMonsters(deckCards, arch, coreSet);
  const bosses = hasBosses(deckCards);

  if (
    (candidate.card_type === "Equip" ||
      tags.includes("attack_boost") ||
      tags.includes("attack_boost_high")) &&
    (themeMons || themeNorm || themeAttr)
  ) {
    const onlyTipo = parseTaggedValue(tags, "equip_only_tipo");
    const onlyAttr = parseTaggedValue(tags, "equip_only_attr");
    const buffsTipo = parseTaggedValue(tags, "buffs_tipo");
    const buffsAttr = parseTaggedValue(tags, "buffs_attr");
    const restricted =
      onlyTipo.length + onlyAttr.length + buffsTipo.length + buffsAttr.length > 0;
    if (!restricted) {
      score += 32; // genérico útil
    } else {
      const fit =
        onlyTipo.some((k) => hasTipoHost(deckCards, k, themeTipo)) ||
        onlyAttr.some((k) => hasAttrHost(deckCards, k, themeAtributo)) ||
        buffsTipo.some((k) => hasTipoHost(deckCards, k, themeTipo)) ||
        buffsAttr.some((k) => hasAttrHost(deckCards, k, themeAtributo));
      if (fit) score += 120;
      else score -= 50;
    }
  }
  if (
    candidate.card_type === "Trap" &&
    bosses &&
    (tags.includes("attacker_lock") ||
      tags.includes("attack_negation") ||
      tags.includes("strong_immunity") ||
      tags.includes("removal_control"))
  ) {
    score += 22;
  }
  if (tags.includes("tutor_summon") && !isLivre && mentionsArchetype(candidate, arch)) {
    score += 30;
  }

  for (const tribal of parseTaggedValue(tags, "mass_tipo_wipe_global")) {
    if (themeNorm && normTipo(tribal) === themeNorm) score -= 120;
    else if (themeAttr && isAttrKey(tribal) && normTipo(tribal) === themeAttr) {
      score -= 120;
    } else if (countTipoInDeck(deckCards, tribal) >= 2) score -= 100;
  }

  for (const tribal of parseTaggedValue(tags, "mass_tipo_wipe_opp")) {
    if (themeNorm && normTipo(tribal) === themeNorm) score -= 120;
    else if (themeAttr && isAttrKey(tribal) && normTipo(tribal) === themeAttr) {
      score -= 120;
    } else if (countTipoInDeck(deckCards, tribal) >= 2) score -= 80;
    else score += 10;
  }

  for (const d of deckCards) {
    if (d.tipo && candidate.tipo && d.tipo === candidate.tipo) score += 4;
    const text = cardText(candidate);
    if (d.nome && text.includes(norm(d.nome))) score += 24;
  }

  if (tags.includes("board_wipe") || tags.includes("virus_wipe")) score += 8;
  return score;
}

function preferredCopies(
  card: Card,
  target: SelectableTier,
  coreSet: Set<string>,
): number {
  const lim = copyLimit(card);
  const tier = card.power_tier || 1;
  const isCore = coreSet.has(card.slug);

  if (lim === 1) return 1;
  if (tier >= 5 && target === 5) return Math.min(lim, 2);
  if (tier >= 5) return 1;
  if (isCore && target >= 4) return Math.min(lim, 3);
  if (isCore) return Math.min(lim, 2);
  if (card.card_type === "Equip" || card.card_type === "Trap") {
    return Math.min(lim, target >= 4 ? 2 : 2);
  }
  if (card.card_type === "Spell") return Math.min(lim, target === 5 ? 2 : 1);
  return Math.min(lim, 2);
}

function pickGods(
  mode: GodsMode,
  bySlug: Map<string, Card>,
  rand: () => number,
): Card[] {
  const n = godsCount(mode);
  if (n === 0) return [];
  const gods = GOD_SLUGS.map((s) => bySlug.get(s)).filter(
    (c): c is Card => Boolean(c),
  );
  const shuffled = [...gods].sort(() => rand() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function calibrationForTier(
  tier: SelectableTier,
  cal: NpcCalibration | null | undefined,
): { equip?: number; trap?: number; spell?: number } | undefined {
  if (!cal?.by_strength) return undefined;
  const key = cal.tier_map?.[String(tier)] || (tier === 5 ? "strong" : tier === 4 ? "medium" : "weak");
  const row = cal.by_strength[key];
  if (!row) return undefined;
  return {
    equip: row.equip_target,
    trap: row.trap_target,
    spell: row.spell_target,
  };
}

function copiesAtTier(deck: Card[], tier: number): number {
  return deck.filter((c) => (c.power_tier || 1) === tier).length;
}

function pctOf(deck: Card[], pred: (c: Card) => boolean): number {
  if (!deck.length) return 0;
  return deck.filter(pred).length / deck.length;
}

function focusPredicate(target: SelectableTier): (c: Card) => boolean {
  if (target === 5) return (c) => (c.power_tier || 1) === 5;
  if (target === 4) return (c) => (c.power_tier || 1) === 4;
  return (c) => {
    const t = c.power_tier || 1;
    return t === 2 || t === 3;
  };
}

function focusMinRatio(target: SelectableTier): number {
  if (target === 5) return 0.8;
  if (target === 4) return 0.7;
  return 0.6;
}

type TierPolicyOpts = {
  /** Magia/Equip/Trap: permite qualquer tier (picker desce 5→1). */
  allowSupportFloor?: boolean;
  /** Monstros (ou qualquer carta): ignora caps de política para completar o deck. */
  allowAnyTier?: boolean;
};

function isAllowedByTierPolicy(
  card: Card,
  target: SelectableTier,
  deck: Card[],
  opts?: TierPolicyOpts,
): boolean {
  const pt = card.power_tier || 1;
  if (GOD_SET.has(card.slug)) return true;

  // Completar deck: prioriza tier alvo no picker, mas aceita 5→4→3→2→1
  if (opts?.allowAnyTier) {
    return true;
  }

  const isSupport =
    card.card_type === "Equip" ||
    card.card_type === "Trap" ||
    card.card_type === "Spell";

  // Quotas Magia/Equip/Trap: permite qualquer tier (o picker prioriza o alvo e desce)
  if (opts?.allowSupportFloor && isSupport) {
    return true;
  }

  if (target === 5) {
    if (pt <= 3) return false;
    if (pt === 4) {
      const t4Cap = Math.floor(DECK_SIZE * 0.2);
      return copiesAtTier(deck, 4) < t4Cap;
    }
    return true;
  }

  if (target === 4) {
    if (pt === 5) {
      const t5Cap = Math.floor(DECK_SIZE * 0.25);
      return copiesAtTier(deck, 5) < t5Cap;
    }
    if (pt <= 2) {
      const focus = copiesAtTier(deck, 4);
      return focus >= Math.floor(DECK_SIZE * 0.55);
    }
    return true;
  }

  if (pt === 5) {
    return copiesAtTier(deck, 5) < 2;
  }
  return true;
}

export function generateDeck(options: GenerateDeckOptions): DeckResult {
  const seed = options.seed ?? (Date.now() % 1_000_000);
  const rand = mulberry32(seed);
  const target = options.targetTier;
  const godsMode: GodsMode = options.godsMode ?? "off";
  const includeSpells = options.includeSpells !== false;
  const exactSlots = options.slotTargets ?? null;
  const { arch, isLivre, activeIds } = resolveTheme(
    options.archetypes,
    options.archetypeIds,
  );
  const monsterTipo =
    isLivre && options.monsterTipo ? String(options.monsterTipo).trim() : null;
  const monsterAtributoRaw =
    isLivre && options.monsterAtributo
      ? String(options.monsterAtributo).trim()
      : null;
  const monsterAtributo =
    monsterAtributoRaw && !normTipo(monsterAtributoRaw).includes("divine")
      ? monsterAtributoRaw
      : null;
  const typePure = Boolean(isLivre && monsterTipo);
  const attrPure = Boolean(isLivre && monsterAtributo);
  const themeTipo = monsterTipo;
  const themeAtributo = monsterAtributo;

  if (isLivre && !monsterTipo && !monsterAtributo) {
    return {
      archetype_id: arch.id,
      target_tier: target,
      gods_mode: godsMode,
      total: 0,
      entries: [],
      composition: { monster: 0, spell: 0, equip: 0, field: 0, trap: 0 },
      average_power_tier: 0,
      total_deck_power: 0,
      tags_used: [],
      warnings: [
        "Por tipo: escolhe raça e/ou atributo (ex. Aqua, Water) antes de gerar.",
      ],
      seed,
      include_spells: includeSpells,
    };
  }

  const pool = isLivre
    ? buildLivrePool(options.cards, monsterTipo, monsterAtributo)
    : buildMergedPool(
      options.cards,
      [...activeIds],
      options.archetypes.entries,
      monsterTipo,
      monsterAtributo,
    );
  const { core, support, fillerMonsters } = pool;
  const coreSet = new Set(core.map((c) => c.slug));
  const otherArch = isLivre
    ? new Set<string>()
    : new Set(arch.other_arch_slugs || []);
  const bySlug = new Map(options.cards.map((c) => [c.slug, c]));
  const maxBombs = maxBombsForTier(target);

  const state = createDeckState();
  const deckList: Card[] = [];
  const warnings: string[] = [];
  const tagsUsed = new Set<string>();

  if (typePure || attrPure) {
    const bits: string[] = [];
    if (monsterTipo) bits.push(`raça ${monsterTipo}`);
    if (monsterAtributo) bits.push(`attr ${monsterAtributo}`);
    warnings.push(
      `Por tipo: 100% monstros (${bits.join(" + ")}) · equips coerentes.`,
    );
  }

  const gods = pickGods(godsMode, bySlug, rand);
  for (const g of gods) {
    if (addCopy(g, state, { maxBombs })) {
      deckList.push(g);
      for (const t of g.effect_tags || []) tagsUsed.add(t);
    } else {
      warnings.push(`Não foi possível adicionar deus ${g.slug}.`);
    }
  }
  if (gods.length) {
    warnings.push(`Deuses: ${gods.length} incluído(s) (${gods.map((g) => g.nome_pt || g.nome).join(", ")}).`);
  }

  const calSlice = calibrationForTier(target, options.npcCalibration);
  const targets: SlotTargets = pickSlotTargets(
    target,
    rand,
    gods.length,
    calSlice,
    includeSpells,
    exactSlots,
  );
  const lockedQuotas = Boolean(exactSlots);
  const banned = new Set(
    (options.bannedSlugs || []).map((s) => String(s).toLowerCase()),
  );
  if (banned.size) {
    warnings.push(`Bans activos nesta config: ${banned.size} carta(s).`);
  }
  warnings.push(
    `Quotas: Equip ${targets.equip} · Trap ${targets.trap} · Magia ${targets.spell} · Monstro ${targets.monster}.`,
  );

  const fillerCap = isLivre ? 999 : 3;
  const fillers = fillerMonsters
    .filter((c) => !otherArch.has(c.slug))
    .slice(0, isLivre ? fillerMonsters.length : fillerCap * 4);

  const candidates = [
    ...new Map(
      [...core, ...support, ...fillers].map((c) => [c.slug, c]),
    ).values(),
  ].filter(
    (c) =>
      c.card_type !== "Field" &&
      !otherArch.has(c.slug) &&
      !banned.has(c.slug.toLowerCase()),
  );

  if (typePure && fillerMonsters.length < 8) {
    warnings.push(
      `Poucos monstros ${monsterTipo}${monsterAtributo ? `/${monsterAtributo}` : ""} no catálogo (${fillerMonsters.length}).`,
    );
  }
  if (attrPure && !typePure && fillerMonsters.length < 8) {
    warnings.push(
      `Poucos monstros atributo ${monsterAtributo} (${fillerMonsters.length}).`,
    );
  }

  let fillerUsed = 0;
  let libreAxis: string | null = typePure
    ? normTipo(monsterTipo!)
    : attrPure
      ? normTipo(monsterAtributo!)
      : null;
  const manualMap = new Map<string, 3 | 4 | 5>();
  if (options.effectTiers) {
    for (const [k, v] of Object.entries(options.effectTiers)) {
      manualMap.set(k, v);
    }
  }

  function manualFor(card: Card): 3 | 4 | 5 | null {
    if (!card.desc_pt) return null;
    return manualMap.get(effectTextKey(card.desc_pt)) ?? null;
  }

  function scoreOf(c: Card): number {
    return synergyScore(
      c,
      deckList,
      arch,
      coreSet,
      otherArch,
      core,
      target,
      options.archetypes.entries,
      themeTipo,
      themeAtributo,
      activeIds,
    );
  }

  function axisOk(card: Card): boolean {
    if (!isLivre) return true;
    if (card.card_type !== "Monster" || GOD_SET.has(card.slug)) return true;
    if (typePure && normTipo(card.tipo) !== normTipo(monsterTipo!)) return false;
    if (attrPure && normTipo(card.atributo) !== normTipo(monsterAtributo!)) {
      return false;
    }
    if (typePure || attrPure) return true;
    if (!libreAxis) return true;
    const mons = deckList.filter(
      (c) => c.card_type === "Monster" && !GOD_SET.has(c.slug),
    );
    if (mons.length < 5) return true;
    const onAxis = mons.filter((c) => normTipo(c.tipo) === libreAxis).length;
    const ratio = onAxis / mons.length;
    if (ratio >= 0.7) return true;
    return normTipo(card.tipo) === libreAxis;
  }

  function canPassGates(
    card: Card,
    policyOpts?: TierPolicyOpts,
  ): boolean {
    if (!canAddCopy(card, state, { maxBombs })) return false;
    if (!isAllowedByTierPolicy(card, target, deckList, policyOpts)) return false;
    if (rejectsAntiSynergy(card, deckList, themeTipo, themeAtributo)) {
      return false;
    }
    if (!axisOk(card)) return false;
    return true;
  }

  function tryAdd(
    card: Card,
    copiesWanted: number,
    policyOpts?: TierPolicyOpts,
  ): number {
    let added = 0;
    while (
      added < copiesWanted &&
      state.total < DECK_SIZE &&
      canPassGates(card, policyOpts)
    ) {
      const kind = slotKind(card);
      if (kind === "field") break;
      if (kind === "equip" || kind === "trap" || kind === "spell") {
        if (!needsSupportSlot(kind, state, targets)) break;
      }
      if (kind === "monster") {
        // Com quotas exactas, não ultrapassar monstro alvo (deuses já contam à parte no total)
        if (
          lockedQuotas &&
          state.typeCounts.monster >= targets.monster
        ) {
          break;
        }
      }
      addCopy(card, state, { maxBombs });
      deckList.push(card);
      added += 1;
      for (const t of cardEffectTags(card)) tagsUsed.add(t);
    }
    return added;
  }

  /** Igual a tryAdd: nunca ultrapassa quotas Magia/Equip/Trap/Monstro. */
  function tryAddRelaxTargets(
    card: Card,
    copiesWanted: number,
    policyOpts?: TierPolicyOpts,
  ): number {
    return tryAdd(card, copiesWanted, policyOpts);
  }

  function noteFiller(pick: Card, added: number): void {
    if (isLivre) return;
    if (
      added > 0 &&
      !coreSet.has(pick.slug) &&
      pick.card_type === "Monster" &&
      !support.some((s) => s.slug === pick.slug)
    ) {
      fillerUsed += added;
    }
  }

  function maybeLockAxis(): void {
    if (!isLivre || libreAxis) return;
    if (typePure) return;
    const dom = dominantKeys(deckList, "tipo");
    if (dom && dom.count >= 3) {
      libreAxis = dom.key;
      warnings.push(`Eixo Livre fixado: ${libreAxis}.`);
    }
  }

  function pickWeightedTopK(
    scored: Array<{ c: Card; score: number }>,
    k = 10,
  ): Card | null {
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(k, scored.length));
    let total = 0;
    const weights = top.map((row) => {
      const w = Math.max(0.01, row.score) ** 2;
      total += w;
      return w;
    });
    let r = rand() * total;
    for (let i = 0; i < top.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return top[i]!.c;
    }
    return top[top.length - 1]!.c;
  }

  function pickBest(
    pool: Card[],
    kind: SlotKind | null,
    phase: "focus" | "support" | "fill",
    policyOpts?: TierPolicyOpts,
  ): Card | null {
    const filtered = pool.filter((c) => {
      if (kind && slotKind(c) !== kind) return false;
      if (!canPassGates(c, policyOpts)) return false;
      if (phase === "focus" && !focusPredicate(target)(c)) return false;
      if (
        phase === "support" &&
        kind &&
        (kind === "equip" || kind === "trap" || kind === "spell") &&
        !needsSupportSlot(kind, state, targets)
      ) {
        return false;
      }
      if (!isLivre) {
        const isFiller =
          !coreSet.has(c.slug) &&
          c.card_type === "Monster" &&
          !support.some((s) => s.slug === c.slug) &&
          !GOD_SET.has(c.slug);
        if (isFiller && fillerUsed >= fillerCap) return false;
      }
      return true;
    });
    if (!filtered.length) return null;

    const band = powerBandForTier(target);
    const scored = filtered.map((c) => {
      let score = scoreOf(c) + rand() * 18;
      if (focusPredicate(target)(c)) score += phase === "focus" ? 50 : 28;
      if (coreSet.has(c.slug)) score += 20;
      if (isLivre && libreAxis && normTipo(c.tipo) === libreAxis) score += 40;
      const cp = cardDeckPower(c, manualFor(c));
      if (target === 5) score += cp * 3;
      else if (target === 4) score += cp * 1.5;
      else score += Math.max(0, 8 - cp);
      if (band.max != null && cp >= 8) score -= 15;
      return { c, score };
    });
    return pickWeightedTopK(scored, phase === "focus" ? 8 : 12);
  }

  function supportDeficitKinds(): SlotKind[] {
    return (["equip", "trap", "spell"] as SlotKind[]).filter((k) => {
      if (k === "spell" && targets.spell === 0) return false;
      return needsSupportSlot(k, state, targets);
    });
  }

  /** Preenche quota: temáticos do tipo/attr primeiro (5→1), depois genéricos. */
  function pickQuotaWithTierFallback(kind: SlotKind): Card | null {
    const policy = { allowSupportFloor: true as const };
    const useThemeFirst =
      Boolean(themeTipo || themeAtributo) &&
      (kind === "equip" || kind === "spell" || kind === "trap");

    function pickFromPool(
      pool: Card[],
      want: number,
      thematicOnly: boolean | null,
    ): Card | null {
      const atTier = pool.filter((c) => {
        if (slotKind(c) !== kind) return false;
        if ((c.power_tier || 1) !== want) return false;
        if (thematicOnly === true) {
          if (!isThemeCoherentSupport(c, themeTipo, themeAtributo)) return false;
        } else if (thematicOnly === false) {
          if (isThemeCoherentSupport(c, themeTipo, themeAtributo)) return false;
        }
        return canPassGates(c, policy);
      });
      if (!atTier.length) return null;
      const scored = atTier.map((c) => ({
        c,
        score: scoreOf(c) + rand() * 14,
      }));
      return pickWeightedTopK(scored, 10);
    }

    if (useThemeFirst) {
      for (let want = target; want >= 1; want--) {
        const pick = pickFromPool(candidates, want, true);
        if (pick) return pick;
      }
      for (let want = target; want >= 1; want--) {
        const pick = pickFromPool(candidates, want, false);
        if (pick) return pick;
      }
    } else {
      for (let want = target; want >= 1; want--) {
        const pick = pickFromPool(candidates, want, null);
        if (pick) return pick;
      }
    }

    return (
      pickBest(candidates, kind, "support", policy) ||
      pickBest(candidates, kind, "fill", policy)
    );
  }

  /** Monstros: desce raridade 5→4→3→2→1 até haver cartas viáveis. */
  function pickMonsterWithTierFallback(): Card | null {
    const policy = { allowAnyTier: true as const };
    for (let want = target; want >= 1; want--) {
      const atTier = candidates.filter((c) => {
        if (slotKind(c) !== "monster") return false;
        if ((c.power_tier || 1) !== want) return false;
        if (!isLivre) {
          const isFiller =
            !coreSet.has(c.slug) &&
            c.card_type === "Monster" &&
            !support.some((s) => s.slug === c.slug) &&
            !GOD_SET.has(c.slug);
          if (isFiller && fillerUsed >= fillerCap) return false;
        }
        return canPassGates(c, policy);
      });
      if (!atTier.length) continue;
      const scored = atTier.map((c) => ({
        c,
        score: scoreOf(c) + rand() * 14,
      }));
      const pick = pickWeightedTopK(scored, 12);
      if (pick) return pick;
    }
    return pickBest(candidates, "monster", "fill", policy);
  }

  function copiesNeededForQuota(kind: SlotKind, card: Card): number {
    const remain = targets[kind] - state.typeCounts[kind];
    if (remain <= 0) return 0;
    return Math.min(preferredCopies(card, target, coreSet), remain);
  }

  // —— Phase 0: sementes monstro (sem roubar espaço das quotas exactas) ——
  const reservedSupport = targets.equip + targets.trap + targets.spell;
  const earlyMonsterCap = lockedQuotas
    ? Math.max(0, Math.min(6, DECK_SIZE - reservedSupport - gods.length))
    : 6;
  let guard = 0;
  while (
    isLivre &&
    state.typeCounts.monster < earlyMonsterCap &&
    state.total < DECK_SIZE - (lockedQuotas ? reservedSupport : 0) &&
    guard < 400
  ) {
    if (!typePure && !attrPure && libreAxis) break;
    guard += 1;
    const pick =
      pickBest(candidates, "monster", "focus") ||
      pickBest(candidates, "monster", "fill");
    if (!pick) break;
    if (tryAddRelaxTargets(pick, preferredCopies(pick, target, coreSet)) === 0) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
      continue;
    }
    maybeLockAxis();
  }
  maybeLockAxis();

  if (target === 5) {
    for (const staple of T5_STAPLE_SLUGS) {
      if (targets[staple.kind] <= 0) continue;
      const card = bySlug.get(staple.slug);
      if (!card) {
        warnings.push(`Staple T5 ${staple.slug} não encontrada no catálogo.`);
        continue;
      }
      if (banned.has(staple.slug.toLowerCase())) {
        warnings.push(`Staple T5 ${card.nome_pt || card.nome} banida nesta config.`);
        continue;
      }
      if (deckList.some((c) => c.slug === staple.slug)) continue;
      const added = tryAdd(card, 1, { allowSupportFloor: true });
      if (added === 0) {
        warnings.push(
          `Não foi possível incluir staple T5 ${card.nome_pt || card.nome}.`,
        );
      }
    }
  }

  // —— Phase 1: quotas Equip/Trap/Spell (exactas = nunca baixar o alvo sem necessidade) ——
  const stuckKinds = new Set<SlotKind>();
  guard = 0;
  while (state.total < DECK_SIZE && guard < 2500) {
    guard += 1;
    const deficit = supportDeficitKinds().filter((k) => !stuckKinds.has(k));
    if (!deficit.length) break;
    const kind = deficit[Math.floor(rand() * deficit.length)]!;
    const pick = pickQuotaWithTierFallback(kind);
    if (!pick) {
      stuckKinds.add(kind);
      warnings.push(
        `Quota ${kind} incompleta (${state.typeCounts[kind]}/${targets[kind]}) — sem cartas viáveis mesmo com fallback de tier.`,
      );
      if (!lockedQuotas) {
        if (kind === "equip") targets.equip = state.typeCounts.equip;
        if (kind === "trap") targets.trap = state.typeCounts.trap;
        if (kind === "spell") targets.spell = state.typeCounts.spell;
      }
      continue;
    }
    const want = copiesNeededForQuota(kind, pick);
    const added = tryAdd(pick, want, { allowSupportFloor: true });
    if (added === 0) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }

  // —— Phase 2: densidade de foco de tier (só monstros; respeita quotas) ——
  const focusNeed = Math.ceil(DECK_SIZE * focusMinRatio(target));
  guard = 0;
  while (
    deckList.filter(focusPredicate(target)).length < focusNeed &&
    state.total < DECK_SIZE &&
    state.typeCounts.monster <
    (lockedQuotas ? targets.monster : DECK_SIZE) &&
    !supportDeficitKinds().length &&
    guard < 1000
  ) {
    guard += 1;
    const pick = pickBest(candidates, "monster", "focus");
    if (!pick) break;
    const added = tryAdd(
      pick,
      preferredCopies(pick, target, coreSet),
    );
    noteFiller(pick, added);
    maybeLockAxis();
    if (added === 0) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }

  // —— Phase 3: completar 40 sem ultrapassar quotas ——
  guard = 0;
  while (state.total < DECK_SIZE && guard < 2000) {
    guard += 1;
    let kind: SlotKind | null = null;
    if (needsSupportSlot("equip", state, targets) && !stuckKinds.has("equip")) {
      kind = "equip";
    } else if (
      needsSupportSlot("trap", state, targets) &&
      !stuckKinds.has("trap")
    ) {
      kind = "trap";
    } else if (
      needsSupportSlot("spell", state, targets) &&
      !stuckKinds.has("spell")
    ) {
      kind = "spell";
    } else if (
      needsSupportSlot("monster", state, targets) ||
      state.typeCounts.monster < targets.monster
    ) {
      kind = "monster";
    }

    if (kind === "equip" || kind === "trap" || kind === "spell") {
      const pick = pickQuotaWithTierFallback(kind);
      if (!pick) {
        stuckKinds.add(kind);
        continue;
      }
      const added = tryAdd(
        pick,
        copiesNeededForQuota(kind, pick),
        { allowSupportFloor: true },
      );
      if (added === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
      }
      continue;
    }

    // Só monstros para fechar o resto — desce tier 5→1 se o pool do alvo esgotar
    const pickStrict =
      pickBest(candidates, "monster", "fill") ||
      pickBest(candidates, "monster", "focus");
    const pick = pickStrict || pickMonsterWithTierFallback();
    if (!pick) {
      if (supportDeficitKinds().some((k) => !stuckKinds.has(k))) {
        for (const k of supportDeficitKinds()) stuckKinds.add(k);
        continue;
      }
      warnings.push(
        `Pool de monstros esgotado em ${state.total}/40 (${arch.id}, tier ${target}).`,
      );
      break;
    }

    const added = tryAdd(
      pick,
      preferredCopies(pick, target, coreSet),
      pickStrict ? undefined : { allowAnyTier: true },
    );
    noteFiller(pick, added);
    if (added === 0) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }

  // —— Phase 3.5: aparar excessos (segurança) e repor défices ——
  function trimExcess(kind: "spell" | "equip" | "trap"): void {
    while (state.typeCounts[kind] > targets[kind] && state.total > 0) {
      const idx = deckList.findIndex(
        (c) => slotKind(c) === kind && !GOD_SET.has(c.slug),
      );
      if (idx < 0) break;
      const card = deckList[idx]!;
      if (
        !removeCopy(card, state, {
          protectSupportMins: false,
        })
      ) {
        break;
      }
      deckList.splice(idx, 1);
    }
  }
  trimExcess("spell");
  trimExcess("equip");
  trimExcess("trap");
  while (
    lockedQuotas &&
    state.typeCounts.monster > targets.monster &&
    state.total > 0
  ) {
    const idx = deckList.findIndex(
      (c) =>
        slotKind(c) === "monster" &&
        !GOD_SET.has(c.slug),
    );
    if (idx < 0) break;
    const card = deckList[idx]!;
    if (!removeCopy(card, state, { protectSupportMins: false })) break;
    deckList.splice(idx, 1);
  }

  // Repor défices de suporte após trim
  guard = 0;
  while (state.total < DECK_SIZE && guard < 800) {
    guard += 1;
    const deficit = supportDeficitKinds().filter((k) => !stuckKinds.has(k));
    if (!deficit.length) break;
    const kind = deficit[0]!;
    const pick = pickQuotaWithTierFallback(kind);
    if (!pick) {
      stuckKinds.add(kind);
      continue;
    }
    if (
      tryAdd(pick, copiesNeededForQuota(kind, pick), {
        allowSupportFloor: true,
      }) === 0
    ) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }
  // Completar com monstros até 40 / alvo (cascade de tier 5→1)
  guard = 0;
  while (
    state.total < DECK_SIZE &&
    state.typeCounts.monster < targets.monster &&
    guard < 800
  ) {
    guard += 1;
    const pick = pickMonsterWithTierFallback();
    if (!pick) break;
    if (
      tryAdd(pick, preferredCopies(pick, target, coreSet), {
        allowAnyTier: true,
      }) === 0
    ) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }
  while (state.total < DECK_SIZE && guard < 1200) {
    guard += 1;
    const pick = pickMonsterWithTierFallback();
    if (!pick) break;
    if (tryAdd(pick, 1, { allowAnyTier: true }) === 0) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
      else break;
    }
  }

  // —— Phase 4: sintonizar poder do deck (raridade+efeito) ——
  const band = powerBandForTier(target);
  const POWER_TUNE_MAX = 80;

  function currentPower(): number {
    return deckTotalPower(stateToEntries(state), bySlug, manualMap);
  }

  function removableSlots(): Card[] {
    const out: Card[] = [];
    for (const c of deckList) {
      if (GOD_SET.has(c.slug)) continue;
      // clone-safe: só se removeCopy deixaria quotas mínimas
      const kind = slotKind(c);
      if (kind === "equip" && state.typeCounts.equip <= targets.equip) continue;
      if (kind === "trap" && state.typeCounts.trap <= targets.trap) continue;
      out.push(c);
    }
    return out;
  }

  function trySwapToward(wantHigher: boolean): boolean {
    const removable = removableSlots();
    if (!removable.length) return false;
    removable.sort((a, b) => {
      const da = cardDeckPower(a, manualFor(a));
      const db = cardDeckPower(b, manualFor(b));
      return wantHigher ? da - db : db - da;
    });

    for (const victim of removable.slice(0, 12)) {
      const kind = slotKind(victim);
      const victimPow = cardDeckPower(victim, manualFor(victim));
      const replacements = candidates.filter((c) => {
        if (c.slug === victim.slug) return false;
        if (slotKind(c) !== kind) return false;
        if (GOD_SET.has(c.slug)) return false;
        const pow = cardDeckPower(c, manualFor(c));
        if (wantHigher && pow <= victimPow) return false;
        if (!wantHigher && pow >= victimPow) return false;
        // Temp remove to evaluate gates with deck minus victim
        return true;
      });
      if (!replacements.length) continue;

      replacements.sort((a, b) => {
        const da = cardDeckPower(a, manualFor(a));
        const db = cardDeckPower(b, manualFor(b));
        return wantHigher ? db - da : da - db;
      });

      for (const incoming of replacements.slice(0, 8)) {
        if (
          !removeCopy(victim, state, {
            minEquip: targets.equip,
            minTrap: targets.trap,
          })
        ) {
          continue;
        }
        const vi = deckList.findIndex((x) => x.slug === victim.slug);
        if (vi >= 0) deckList.splice(vi, 1);

        // Gate against deck without victim — monstro pode cascatear tier
        const gateOpts =
          kind === "monster"
            ? { allowAnyTier: true as const }
            : { allowSupportFloor: true as const };
        if (!canPassGates(incoming, gateOpts)) {
          addCopy(victim, state, { maxBombs });
          deckList.push(victim);
          continue;
        }
        if (!addCopy(incoming, state, { maxBombs })) {
          addCopy(victim, state, { maxBombs });
          deckList.push(victim);
          continue;
        }
        deckList.push(incoming);
        for (const t of cardEffectTags(incoming)) tagsUsed.add(t);
        return true;
      }
    }
    return false;
  }

  let tuneGuard = 0;
  while (tuneGuard < POWER_TUNE_MAX && !powerInBand(currentPower(), band)) {
    tuneGuard += 1;
    const p = currentPower();
    const wantHigher = p < band.min;
    if (!trySwapToward(wantHigher)) break;
  }

  // Segurança pós-tune: nunca ficar abaixo de 40
  guard = 0;
  while (state.total < DECK_SIZE && guard < 600) {
    guard += 1;
    const deficit = supportDeficitKinds().filter((k) => !stuckKinds.has(k));
    if (deficit.length) {
      const kind = deficit[0]!;
      const pick = pickQuotaWithTierFallback(kind);
      if (!pick) {
        stuckKinds.add(kind);
        continue;
      }
      if (
        tryAdd(pick, copiesNeededForQuota(kind, pick), {
          allowSupportFloor: true,
        }) === 0
      ) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
      }
      continue;
    }
    const pick = pickMonsterWithTierFallback();
    if (!pick) break;
    if (tryAdd(pick, 1, { allowAnyTier: true }) === 0) {
      const idx = candidates.findIndex((x) => x.slug === pick.slug);
      if (idx >= 0) candidates.splice(idx, 1);
      else break;
    }
  }

  // Pós-validação
  const focusPct = pctOf(deckList, focusPredicate(target));
  if (target === 5) {
    if (focusPct < 0.8) {
      warnings.push(
        `Ultra Hard: ${(focusPct * 100).toFixed(0)}% T5 (alvo ≥80%).`,
      );
    }
  } else if (target === 4) {
    if (focusPct < 0.7) {
      warnings.push(`Hard: ${(focusPct * 100).toFixed(0)}% T4 (alvo ≥70%).`);
    }
  } else if (focusPct < 0.6) {
    warnings.push(
      `Mediano: ${(focusPct * 100).toFixed(0)}% T2–T3 (alvo ≥60%).`,
    );
  }

  if (state.typeCounts.equip < targets.equip) {
    warnings.push(
      `Equip abaixo do alvo (${targets.equip}): ${state.typeCounts.equip}.`,
    );
  }
  if (state.typeCounts.trap < targets.trap) {
    warnings.push(
      `Trap abaixo do alvo (${targets.trap}): ${state.typeCounts.trap}.`,
    );
  }
  if (state.typeCounts.spell < targets.spell) {
    warnings.push(
      `Magia abaixo do alvo (${targets.spell}): ${state.typeCounts.spell}.`,
    );
  }

  if (state.total < DECK_SIZE) {
    warnings.push(`Deck incompleto: ${state.total}/${DECK_SIZE} cartas.`);
  }

  const entries = stateToEntries(state);
  let powerSum = 0;
  let n = 0;
  for (const e of entries) {
    const card = bySlug.get(e.slug);
    if (!card) continue;
    powerSum += (card.power_tier || 1) * e.copies;
    n += e.copies;
  }

  const totalDeckPower = deckTotalPower(entries, bySlug, manualMap);
  if (!powerInBand(totalDeckPower, band)) {
    const maxLabel = band.max == null ? "∞" : String(band.max);
    warnings.push(
      `Poder do deck ${totalDeckPower} fora da faixa ${band.min}–${maxLabel} (Tier ${target}).`,
    );
  }

  return {
    archetype_id: arch.id,
    target_tier: target,
    gods_mode: godsMode,
    total: state.total,
    entries,
    composition: { ...state.typeCounts },
    average_power_tier: n ? Math.round((powerSum / n) * 100) / 100 : 0,
    total_deck_power: totalDeckPower,
    tags_used: [...tagsUsed].sort(),
    warnings,
    seed,
    libre_axis: libreAxis || undefined,
    monster_tipo: monsterTipo || undefined,
    monster_atributo: monsterAtributo || undefined,
    include_spells: includeSpells,
  };
}
