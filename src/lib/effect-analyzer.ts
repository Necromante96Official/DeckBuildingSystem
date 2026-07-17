import type { Card, PowerTier } from "../types/card.ts";

/** Peso base por tag de efeito (a mais forte vence) */
export const TAG_WEIGHTS: Record<string, PowerTier> = {
  board_wipe: 5,
  backrow_wipe: 5,
  divine_beast: 5,
  strong_immunity: 5,
  triple_attack: 5,
  win_condition: 5,
  virus_wipe: 5,
  removal_control: 4,
  explosive_equip: 4,
  multi_attack: 4,
  power_lock: 4,
  attacker_lock: 4,
  direct_attack: 4,
  piercing_pressure: 4,
  burn_direct: 4,
  burn_recurring: 4,
  attack_boost_high: 4,
  battle_destroy: 3,
  attack_boost: 3,
  burn_conditional: 3,
  burn_on_kill: 3,
  spell_negation: 3,
  attack_negation: 3,
  battle_resistance: 3,
  mill_pressure: 3,
  tutor_summon: 3,
  fusion_substitute: 3,
  evolution_accelerator: 3,
  equip_enabler_monster: 3,
  lp_recovery: 2,
  exodia_piece: 2,
  soft_effect: 2,
  vanilla: 1,
};

/** Tags consideradas absurdas (empurram UR → 5) */
export const ABSURD_TAGS = new Set([
  "board_wipe",
  "backrow_wipe",
  "divine_beast",
  "strong_immunity",
  "triple_attack",
  "win_condition",
  "virus_wipe",
]);

export const TIER_OVERRIDES: Record<string, PowerTier> = {
  // Wipes / bombs canónicos
  raigeki: 5,
  dark_hole: 5,
  crush_card_virus: 5,
  mirror_force: 5,
  // Deuses egípcios
  obelisk_the_tormentor: 5,
  slifer_the_sky_dragon: 5,
  the_winged_dragon_of_ra: 5,
  zorc_necrophades: 5,
  dark_master_zorc: 5,
  exodia_the_forbidden_one: 5,
  // Bosses de arquetípico (UR / wipe / finisher)
  "blue-eyes_white_dragon": 5,
  "blue-eyes_ultimate_dragon": 5,
  "blue-eyes_shining_dragon": 5,
  "blue-eyes_twin_burst_dragon": 5,
  "blue-eyes_chaos_max_dragon": 5,
  "red-eyes_b_dragon": 5,
  "red-eyes_dark_dragoon": 5,
  "red-eyes_darkness_metal_dragon": 5,
  "red-eyes_darkness_dragon": 5,
  "red-eyes_slash_dragon": 5,
  "red-eyes_black_flare_dragon": 5,
  "red-eyes_black_fullmetal_dragon": 5,
  b_skull_dragon: 5,
  archfiend_black_skull_dragon: 5,
  meteor_b_dragon: 5,
  lord_of_the_red: 5,
  dark_magician: 5,
  dark_magician_of_chaos: 5,
  dark_magician_girl: 4,
  magician_of_black_chaos: 5,
  black_luster_soldier: 5,
  "black_luster_soldier_-_envoy_of_the_beginning": 5,
  "black_luster_soldier_-_super_soldier": 5,
  "black_luster_soldier_-_sacred_soldier": 5,
  "black_luster_soldier_-_envoy_of_the_evening_twilight": 5,
};

export const GOD_SLUGS = [
  "obelisk_the_tormentor",
  "slifer_the_sky_dragon",
  "the_winged_dragon_of_ra",
] as const;

interface TextRule {
  tag: string;
  re: RegExp;
}

const TEXT_RULES: TextRule[] = [
  {
    tag: "win_condition",
    re: /voc[eê] vence|you win|instant win|ganha o duelo|win the duel/i,
  },
  {
    tag: "virus_wipe",
    re: /crush card|v[ií]rus|1500 ou mais|hand.*destr|monstros com 1500/i,
  },
  {
    tag: "board_wipe",
    re: /destr(ua|ói|oi|ua|u[ií]).*(tod[ao]s|todas)|elimina.*(tod[ao]s|todas)|remova do jogo.*(todas|todos)|todas as cartas.*(monstro|campo|jogo)|todos os monstros|destroy all|wipe/i,
  },
  {
    tag: "backrow_wipe",
    re: /(todas|todos).*(magias?|traps?|spell|armadilhas)|destroy all.*(spell|trap)/i,
  },
  {
    tag: "strong_immunity",
    re: /n[aã]o [eé] afetad|imune|unaffected|n[aã]o (pode|podem) ser destru[ií]d/i,
  },
  {
    tag: "triple_attack",
    re: /tr[eê]s ataques|triple attack|attacks? (three|3) times|3 vezes/i,
  },
  {
    tag: "multi_attack",
    re: /dois ataques|attack twice|attacks? (twice|2 times)|2 vezes/i,
  },
  {
    tag: "attack_boost",
    re: /aumenta.*(atk|ataque|poder|def)|ganha \d+.*(atk|ataque|def)|(\+|mais)\s*\d{2,4}.*(atk|ataque|poder|def)|gains? \d+/i,
  },
  {
    tag: "burn_direct",
    re: /cause \d+ de dano|dano aos? pontos? de vida|burn|\d+ damage|inflict \d+/i,
  },
  {
    tag: "attacker_lock",
    re: /n[aã]o pode(m)? atacar|negue esse ataque|cannot attack|trava|lock|n[aã]o pode(m)? mudar/i,
  },
  {
    tag: "tutor_summon",
    re: /traga.*(do seu )?deck|para o campo|add.*from (your )?deck|invoque.*(do|from).*deck|search.*(deck)/i,
  },
  {
    tag: "fusion_substitute",
    re: /substitui.*fus[aã]o|fusion substitute|polymeriz/i,
  },
  {
    tag: "evolution_accelerator",
    re: /level up|evolu|lv\.|est[aá]gio final/i,
  },
  {
    tag: "lp_recovery",
    re: /ganha \d+.*(lp|pontos? de vida)|recupera.*(lp|vida)|gain \d+.*(life|lp)/i,
  },
  {
    tag: "direct_attack",
    re: /ataque direto|attack (your opponent )?directly|direct attack/i,
  },
  {
    tag: "removal_control",
    re: /destrua (um|1|o)|return.*(to|hand|deck)|banish|remova.*(carta|monstro)|send.*(to).*(grave)/i,
  },
  {
    tag: "spell_negation",
    re: /neg[au].*(magia|spell)|negate.*(spell|magia)/i,
  },
  {
    tag: "attack_negation",
    re: /neg[au].*ataque|negate.*attack/i,
  },
];

function textTagsForCard(card: Card): string[] {
  const text = `${card.desc_pt || ""} ${card.desc_en || ""}`.trim();
  if (!text) return [];
  const tags: string[] = [];
  for (const rule of TEXT_RULES) {
    if (rule.re.test(text)) tags.push(rule.tag);
  }
  if (
    /\b(1000|1500|2000|2500|3000)\b/.test(text) &&
    /aumenta|ganha|atk|poder|def|gains?/i.test(text)
  ) {
    if (!tags.includes("attack_boost")) tags.push("attack_boost");
    tags.push("attack_boost_high");
  }
  // Dice / random massive outcomes
  if (/dado|dice|seis faces|six-sided/i.test(text) && /destr/i.test(text)) {
    if (!tags.includes("board_wipe")) tags.push("board_wipe");
  }
  for (const t of extractTribalAndEquipTags(text, card.slug)) {
    if (!tags.includes(t)) tags.push(t);
  }
  for (const t of extractRequiresTags(text, card.slug)) {
    if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}

/** Peças do Exodia (banlist ignorada; sinergia própria) */
export const EXODIA_PIECE_SLUGS = [
  "exodia_the_forbidden_one",
  "exodia_the_forbidden",
  "left_arm_of_the_forbidden_one",
  "right_arm_of_the_forbidden_one",
  "left_leg_of_the_forbidden_one",
  "right_leg_of_the_forbidden_one",
] as const;

/**
 * Dependências nomeadas: requires_name:harpie_lady, requires_pack:exodia, …
 */
export function extractRequiresTags(text: string, slug?: string): string[] {
  const tags: string[] = [];
  const t = text;
  const lower = t.toLowerCase();

  if (slug && EXODIA_PIECE_SLUGS.includes(slug as (typeof EXODIA_PIECE_SLUGS)[number])) {
    tags.push("requires_pack:exodia");
  }
  if (/forbidden one|exodia|pe[cç]a.*proibid/i.test(lower)) {
    if (!tags.includes("requires_pack:exodia")) tags.push("requires_pack:exodia");
  }

  const named: Array<{ re: RegExp; key: string }> = [
    { re: /harpie lady|lady harpie|elegante egoc|elegant egotist/i, key: "harpie_lady" },
    { re: /harpie(?!\s*feather)/i, key: "harpie" },
    { re: /red[- ]eyes|olhos? vermelh/i, key: "red_eyes" },
    { re: /blue[- ]eyes|olhos? azu/i, key: "blue_eyes" },
    { re: /dark magician girl/i, key: "dark_magician_girl" },
    { re: /dark magician(?!\s*girl)|m[aá]gico negro/i, key: "dark_magician" },
    { re: /black luster/i, key: "black_luster" },
    { re: /kuriboh/i, key: "kuriboh" },
    { re: /toon/i, key: "toon" },
  ];

  // Só marcar requires se o texto parece tutor/equip/support dependente
  const dependencyContext =
    /traga|invoque|evoque|equip|apenas|only to|treat|considerad|transform|summon|search|from (your )?deck|do seu deck|harpie lady|in the name/i.test(
      lower,
    );

  for (const { re, key } of named) {
    if (!re.test(t)) continue;
    if (dependencyContext || key === "harpie_lady") {
      tags.push(`requires_name:${key}`);
    }
  }

  // Lord of D. style — dragons on your field
  if (
    /lord of d|dragons? (you control|on your (side of the )?field)|seus monstros dragon|seus drag/i.test(
      lower,
    )
  ) {
    tags.push("requires_tribe:dragon");
  }

  return tags;
}

/** Raças de monstro (não atributos) */
export const TYPE_KEYS = [
  "dragon",
  "warrior",
  "spellcaster",
  "fiend",
  "zombie",
  "machine",
  "beast",
  "beastwarrior",
  "winged beast",
  "insect",
  "plant",
  "aqua",
  "fish",
  "sea serpent",
  "dinosaur",
  "reptile",
  "rock",
  "pyro",
  "thunder",
  "fairy",
  "divine-beast",
  "divine beast",
] as const;

/** Atributos jogáveis (sem Divine — deuses noutro fluxo) */
export const ATTR_KEYS = [
  "dark",
  "light",
  "earth",
  "water",
  "fire",
  "wind",
] as const;

const TYPE_SET = new Set<string>(TYPE_KEYS);
const ATTR_SET = new Set<string>(ATTR_KEYS);

/** Sinónimos curtos → chave canónica em TYPE_KEYS */
const TRIBAL_ALIASES: Record<string, string[]> = {
  dinosaur: ["dino"],
};

/** União para wipes/texto genérico */
const TRIBAL_KEYS = [...TYPE_KEYS, ...ATTR_KEYS] as const;

function tribalWordPattern(key: string): string {
  const alts = [key, ...(TRIBAL_ALIASES[key] || [])].map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return `(?:${alts.join("|")})`;
}

const OPP_SCOPE_RE =
  /oponente|opponent|opposing|their (field|monsters)|campo do (seu )?oponente|do oponente|your opponent/i;

export function normalizeTribalKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^dino$/, "dinosaur")
    .replace(/^beast warrior$/, "beastwarrior")
    .replace(/^divine beast$/, "divine-beast")
    .replace(/^wingedbeast$/, "winged beast");
}

export function tribalSlug(key: string): string {
  return normalizeTribalKey(key).replace(/\s+/g, "_");
}

export function isAttrKey(key: string): boolean {
  return ATTR_SET.has(normalizeTribalKey(key).replace(/_/g, " "));
}

export function isTypeKey(key: string): boolean {
  const n = normalizeTribalKey(key).replace(/_/g, " ");
  return TYPE_SET.has(n) || TYPE_SET.has(n.replace(/ /g, ""));
}

function pushEquipOrBuffTag(
  tags: string[],
  kind: "equip_only" | "buffs",
  key: string,
): void {
  const n = normalizeTribalKey(key);
  const slug = n.replace(/\s+/g, "_");
  if (ATTR_SET.has(n)) {
    tags.push(`${kind}_attr:${slug}`);
  } else if (TYPE_SET.has(n) || TYPE_SET.has(n.replace(/ /g, ""))) {
    tags.push(`${kind}_tipo:${slug}`);
  }
}

/**
 * Extrai tags:
 * - mass_tipo_wipe_global / _opp (raça ou atributo)
 * - equip_only_tipo / equip_only_attr
 * - buffs_tipo / buffs_attr
 * - equip_only:* legado (ainda emitido para compat)
 */
export function extractTribalAndEquipTags(text: string, slug?: string): string[] {
  if (!text.trim() && !slug) return [];
  const tags: string[] = [];
  const lower = text.toLowerCase();
  const oppOnly = OPP_SCOPE_RE.test(text);

  if (slug === "dragon_capture_jar") {
    tags.push("mass_tipo_wipe_opp:dragon");
  }
  if (slug === "burning_spear") {
    tags.push("equip_only_attr:fire");
  }
  if (slug === "elfs_light") {
    tags.push("buffs_tipo:fairy", "buffs_attr:light");
  }
  if (slug === "book_of_secret_arts") {
    tags.push("equip_only_tipo:spellcaster");
  }

  let m: RegExpExecArray | null;

  // "Um monstro do Tipo SPELLCASTER equipado..." / "SPELLCASTER-Type monster equipped..."
  const tipoEquippedPt =
    /(?:monstro\s+do\s+)?tipo\s+([a-z\- ]{3,24})\s+equipad/gi;
  while ((m = tipoEquippedPt.exec(text)) !== null) {
    pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
  }
  const typeEquippedEn =
    /([a-z\- ]{3,24})-type\s+monster\s+equipped/gi;
  while ((m = typeEquippedEn.exec(text)) !== null) {
    pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
  }

  // Mass wipe of a tribal type / attribute
  const massRe =
    /(?:destr(?:ua|ói|oi|u[ií]|oy|oys)|elimina(?:r)?|remova|destroy|wipe|reduz(?:e|es)?(?: o poder)?)\s+(?:tod[oa]s?|all|every)?\s*(?:os\s+)?(?:monstros?\s+)?([a-z\- ]{3,20})(?:\s+monsters?)?/gi;
  while ((m = massRe.exec(text)) !== null) {
    const key = normalizeTribalKey(m[1] || "");
    if (!TRIBAL_KEYS.includes(key as (typeof TRIBAL_KEYS)[number])) continue;
    const tribeSlug = key.replace(/\s+/g, "_");
    if (oppOnly) tags.push(`mass_tipo_wipe_opp:${tribeSlug}`);
    else tags.push(`mass_tipo_wipe_global:${tribeSlug}`);
  }

  for (const key of TRIBAL_KEYS) {
    const pat = tribalWordPattern(key);
    const re = new RegExp(
      `(?:tod[oa]s?|all)\\s+(?:os\\s+)?(?:monstros?\\s+)?${pat}|(?:monstros?\\s+)?${pat}\\s+(?:monsters?\\s+)?(?:no|on|do)\\s+(?:campo|field)`,
      "i",
    );
    if (!re.test(text)) continue;
    if (!/(destr|elimina|remova|destroy|wipe|send.*grave|reduz)/i.test(text)) {
      continue;
    }
    const tribeSlug = key.replace(/\s+/g, "_");
    const tag = oppOnly
      ? `mass_tipo_wipe_opp:${tribeSlug}`
      : `mass_tipo_wipe_global:${tribeSlug}`;
    if (!tags.includes(tag)) tags.push(tag);
  }

  // Equip only — EN/PT clássico
  const equipRe =
    /equip(?:e|ment)?\s+(?:apenas\s+a|only\s+to)\s+(?:um\s+|a\s+|an\s+)?(?:monstro\s+)?([a-z\- ]{3,24})/gi;
  while ((m = equipRe.exec(text)) !== null) {
    pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
  }

  // "Só pode ser equipado em monstros FIRE" / "Can only be equipped to FIRE monsters"
  const equipOnlyPtEn =
    /(?:s[oó]\s+pode\s+ser\s+equipad[oa]|can\s+only\s+be\s+equipped\s+to)\s+(?:em\s+|to\s+)?(?:monstros?\s+|um\s+monstro\s+)?([a-z\- ]{3,24})/gi;
  while ((m = equipOnlyPtEn.exec(text)) !== null) {
    pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
  }

  // "equipado apenas em monstros WATER"
  const equipadoEm =
    /equipad[oa]\s+(?:apenas\s+)?(?:em|a)\s+(?:um\s+)?(?:monstros?\s+)?([a-z\- ]{3,20})/gi;
  while ((m = equipadoEm.exec(text)) !== null) {
    pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
  }

  // Boosts: "Aumenta o poder dos monstros FAIRY e LIGHT" / "Increases the power of DINOSAUR"
  const buffRe =
    /(?:aumenta|increase[sd]?|ganha|gains?)\s+(?:o\s+|the\s+)?(?:poder|atk|def|power)\s+(?:d[oe]s?\s+|of\s+)?(?:monstros?\s+|monsters?\s+)?([a-z\- /]{3,40})/gi;
  while ((m = buffRe.exec(text)) !== null) {
    const chunk = m[1] || "";
    for (const key of TRIBAL_KEYS) {
      if (
        new RegExp(`\\b${tribalWordPattern(key)}\\b`, "i").test(chunk)
      ) {
        pushEquipOrBuffTag(tags, "buffs", key);
      }
    }
  }

  // "intended for WARRIOR"
  if (/equip.*(?:warrior|guerreiro)|(?:warrior|guerreiro).*equip/i.test(lower)) {
    if (
      !tags.some((t) => t.startsWith("equip_only_tipo:") || t.startsWith("equip_only:"))
    ) {
      if (/apenas|only|intended for|destinad/i.test(lower)) {
        tags.push("equip_only_tipo:warrior");
      }
    }
  }

  // Compat legado: mirror novos tags para equip_only:
  for (const t of [...tags]) {
    if (t.startsWith("equip_only_tipo:") || t.startsWith("equip_only_attr:")) {
      const legacy = `equip_only:${t.split(":")[1]}`;
      if (!tags.includes(legacy)) tags.push(legacy);
    }
  }

  return tags;
}

export function parseTaggedValue(
  tags: string[],
  prefix: string,
): string[] {
  const out: string[] = [];
  const p = `${prefix}:`;
  for (const t of tags) {
    if (t.startsWith(p)) out.push(t.slice(p.length));
  }
  return out;
}

export function collectEffectTags(card: Card): string[] {
  const set = new Set<string>();
  for (const t of textTagsForCard(card)) set.add(t);
  if (set.size === 0) {
    set.add(card.has_effect ? "soft_effect" : "vanilla");
  }
  return [...set].sort();
}

export function effectWeightFromTags(tags: string[]): PowerTier {
  let max: PowerTier = 1;
  for (const t of tags) {
    const w = TAG_WEIGHTS[t];
    if (w && w > max) max = w;
  }
  return max;
}

export function hasAbsurdEffect(tags: string[], effectWeight: PowerTier): boolean {
  if (effectWeight >= 5) return true;
  return tags.some((t) => ABSURD_TAGS.has(t));
}

export function analyzeCardEffects(
  card: Card,
): { effect_tags: string[]; effect_weight: PowerTier } {
  const effect_tags = collectEffectTags(card);
  let effect_weight = effectWeightFromTags(effect_tags);

  const text = `${card.desc_pt || ""} ${card.desc_en || ""}`;

  // High boosts → 4
  if (
    (effect_tags.includes("attack_boost") ||
      effect_tags.includes("attack_boost_high")) &&
    /\b(1000|1500|2000|2500|3000)\b/.test(text)
  ) {
    effect_weight = Math.max(effect_weight, 4) as PowerTier;
  }

  // Moderate boosts → 3
  if (
    effect_tags.includes("attack_boost") &&
    /\b(100|200|250|300|400|500)\b/.test(text) &&
    !/\b(1000|1500|2000|2500|3000)\b/.test(text)
  ) {
    const strong = effect_tags.some(
      (t) => (TAG_WEIGHTS[t] || 1) >= 4 && t !== "attack_boost",
    );
    if (!strong) {
      effect_weight = Math.max(
        Math.min(effect_weight, 3) as PowerTier,
        3,
      ) as PowerTier;
      if (effect_weight > 3 && !strong) effect_weight = 3;
    } else {
      effect_weight = Math.max(effect_weight, 3) as PowerTier;
    }
  }

  // Small LP burns stay at most 3 unless other absurd tags
  if (
    effect_tags.includes("burn_direct") &&
    !hasAbsurdEffect(effect_tags, effect_weight) &&
    /\b([1-4]\d{2}|50|100|200|300|400|500)\b/.test(text) &&
    !/\b([6-9]\d{2}|[1-9]\d{3,})\b/.test(text)
  ) {
    if (effect_weight > 3 && !effect_tags.some((t) => ABSURD_TAGS.has(t))) {
      // keep burn_direct at 4 for large numbers; small → cap later in power-tier
    }
  }

  return { effect_tags, effect_weight };
}
