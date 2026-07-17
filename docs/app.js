"use strict";
(() => {
  // src/lib/card-power.ts
  function deckRarityWeight(raridade) {
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
  function normalizeEffectText(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }
  function effectTextKey(desc_pt) {
    return normalizeEffectText(desc_pt);
  }
  function deckEffectWeight(card, manualTier) {
    if (!card.has_effect) return 0;
    if (manualTier === 3 || manualTier === 4 || manualTier === 5) {
      return manualTier;
    }
    const w = card.effect_weight || 1;
    if (w >= 5) return 5;
    if (w >= 4) return 4;
    if (w >= 3) return 3;
    if (card.effect_tags?.includes("vanilla")) return 0;
    return 3;
  }
  function cardDeckPower(card, manualEffectTier) {
    return deckRarityWeight(card.raridade) + deckEffectWeight(card, manualEffectTier);
  }
  function deckTotalPower(entries, bySlug, manualByEffectKey) {
    let sum = 0;
    for (const e of entries) {
      const c = bySlug.get(e.slug);
      if (!c) continue;
      let manual = null;
      if (manualByEffectKey && c.desc_pt) {
        const k = effectTextKey(c.desc_pt);
        manual = manualByEffectKey.get(k) ?? null;
      }
      sum += cardDeckPower(c, manual) * e.copies;
    }
    return sum;
  }
  function powerBandForTier(tier) {
    if (tier === 3) return { min: 140, max: 200 };
    if (tier === 4) return { min: 210, max: 280 };
    return { min: 300, max: null };
  }
  function powerInBand(total, band) {
    if (total < band.min) return false;
    if (band.max != null && total > band.max) return false;
    return true;
  }

  // src/lib/effect-analyzer.ts
  var GOD_SLUGS = [
    "obelisk_the_tormentor",
    "slifer_the_sky_dragon",
    "the_winged_dragon_of_ra"
  ];
  var EXODIA_PIECE_SLUGS = [
    "exodia_the_forbidden_one",
    "exodia_the_forbidden",
    "left_arm_of_the_forbidden_one",
    "right_arm_of_the_forbidden_one",
    "left_leg_of_the_forbidden_one",
    "right_leg_of_the_forbidden_one"
  ];
  function extractRequiresTags(text, slug) {
    const tags = [];
    const t = text;
    const lower = t.toLowerCase();
    if (slug && EXODIA_PIECE_SLUGS.includes(slug)) {
      tags.push("requires_pack:exodia");
    }
    if (/forbidden one|exodia|pe[cç]a.*proibid/i.test(lower)) {
      if (!tags.includes("requires_pack:exodia")) tags.push("requires_pack:exodia");
    }
    const named = [
      { re: /harpie lady|lady harpie|elegante egoc|elegant egotist/i, key: "harpie_lady" },
      { re: /harpie(?!\s*feather)/i, key: "harpie" },
      { re: /red[- ]eyes|olhos? vermelh/i, key: "red_eyes" },
      { re: /blue[- ]eyes|olhos? azu/i, key: "blue_eyes" },
      { re: /dark magician girl/i, key: "dark_magician_girl" },
      { re: /dark magician(?!\s*girl)|m[aá]gico negro/i, key: "dark_magician" },
      { re: /black luster/i, key: "black_luster" },
      { re: /kuriboh/i, key: "kuriboh" },
      { re: /toon/i, key: "toon" }
    ];
    const dependencyContext = /traga|invoque|evoque|equip|apenas|only to|treat|considerad|transform|summon|search|from (your )?deck|do seu deck|harpie lady|in the name/i.test(
      lower
    );
    for (const { re, key } of named) {
      if (!re.test(t)) continue;
      if (dependencyContext || key === "harpie_lady") {
        tags.push(`requires_name:${key}`);
      }
    }
    if (/lord of d|dragons? (you control|on your (side of the )?field)|seus monstros dragon|seus drag/i.test(
      lower
    )) {
      tags.push("requires_tribe:dragon");
    }
    return tags;
  }
  var TYPE_KEYS = [
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
    "divine beast"
  ];
  var ATTR_KEYS = [
    "dark",
    "light",
    "earth",
    "water",
    "fire",
    "wind"
  ];
  var TYPE_SET = new Set(TYPE_KEYS);
  var ATTR_SET = new Set(ATTR_KEYS);
  var TRIBAL_ALIASES = {
    dinosaur: ["dino"]
  };
  var TRIBAL_KEYS = [...TYPE_KEYS, ...ATTR_KEYS];
  function tribalWordPattern(key) {
    const alts = [key, ...TRIBAL_ALIASES[key] || []].map(
      (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    return `(?:${alts.join("|")})`;
  }
  var OPP_SCOPE_RE = /oponente|opponent|opposing|their (field|monsters)|campo do (seu )?oponente|do oponente|your opponent/i;
  function normalizeTribalKey(raw) {
    return raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^dino$/, "dinosaur").replace(/^beast warrior$/, "beastwarrior").replace(/^divine beast$/, "divine-beast").replace(/^wingedbeast$/, "winged beast");
  }
  function isAttrKey(key) {
    return ATTR_SET.has(normalizeTribalKey(key).replace(/_/g, " "));
  }
  function isTypeKey(key) {
    const n = normalizeTribalKey(key).replace(/_/g, " ");
    return TYPE_SET.has(n) || TYPE_SET.has(n.replace(/ /g, ""));
  }
  function pushEquipOrBuffTag(tags, kind, key) {
    const n = normalizeTribalKey(key);
    const slug = n.replace(/\s+/g, "_");
    if (ATTR_SET.has(n)) {
      tags.push(`${kind}_attr:${slug}`);
    } else if (TYPE_SET.has(n) || TYPE_SET.has(n.replace(/ /g, ""))) {
      tags.push(`${kind}_tipo:${slug}`);
    }
  }
  function extractTribalAndEquipTags(text, slug) {
    if (!text.trim() && !slug) return [];
    const tags = [];
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
    let m;
    const tipoEquippedPt = /(?:monstro\s+do\s+)?tipo\s+([a-z\- ]{3,24})\s+equipad/gi;
    while ((m = tipoEquippedPt.exec(text)) !== null) {
      pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
    }
    const typeEquippedEn = /([a-z\- ]{3,24})-type\s+monster\s+equipped/gi;
    while ((m = typeEquippedEn.exec(text)) !== null) {
      pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
    }
    const massRe = /(?:destr(?:ua|ói|oi|u[ií]|oy|oys)|elimina(?:r)?|remova|destroy|wipe|reduz(?:e|es)?(?: o poder)?)\s+(?:tod[oa]s?|all|every)?\s*(?:os\s+)?(?:monstros?\s+)?([a-z\- ]{3,20})(?:\s+monsters?)?/gi;
    while ((m = massRe.exec(text)) !== null) {
      const key = normalizeTribalKey(m[1] || "");
      if (!TRIBAL_KEYS.includes(key)) continue;
      const tribeSlug = key.replace(/\s+/g, "_");
      if (oppOnly) tags.push(`mass_tipo_wipe_opp:${tribeSlug}`);
      else tags.push(`mass_tipo_wipe_global:${tribeSlug}`);
    }
    for (const key of TRIBAL_KEYS) {
      const pat = tribalWordPattern(key);
      const re = new RegExp(
        `(?:tod[oa]s?|all)\\s+(?:os\\s+)?(?:monstros?\\s+)?${pat}|(?:monstros?\\s+)?${pat}\\s+(?:monsters?\\s+)?(?:no|on|do)\\s+(?:campo|field)`,
        "i"
      );
      if (!re.test(text)) continue;
      if (!/(destr|elimina|remova|destroy|wipe|send.*grave|reduz)/i.test(text)) {
        continue;
      }
      const tribeSlug = key.replace(/\s+/g, "_");
      const tag = oppOnly ? `mass_tipo_wipe_opp:${tribeSlug}` : `mass_tipo_wipe_global:${tribeSlug}`;
      if (!tags.includes(tag)) tags.push(tag);
    }
    const equipRe = /equip(?:e|ment)?\s+(?:apenas\s+a|only\s+to)\s+(?:um\s+|a\s+|an\s+)?(?:monstro\s+)?([a-z\- ]{3,24})/gi;
    while ((m = equipRe.exec(text)) !== null) {
      pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
    }
    const equipOnlyPtEn = /(?:s[oó]\s+pode\s+ser\s+equipad[oa]|can\s+only\s+be\s+equipped\s+to)\s+(?:em\s+|to\s+)?(?:monstros?\s+|um\s+monstro\s+)?([a-z\- ]{3,24})/gi;
    while ((m = equipOnlyPtEn.exec(text)) !== null) {
      pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
    }
    const equipadoEm = /equipad[oa]\s+(?:apenas\s+)?(?:em|a)\s+(?:um\s+)?(?:monstros?\s+)?([a-z\- ]{3,20})/gi;
    while ((m = equipadoEm.exec(text)) !== null) {
      pushEquipOrBuffTag(tags, "equip_only", m[1] || "");
    }
    const buffRe = /(?:aumenta|increase[sd]?|ganha|gains?)\s+(?:o\s+|the\s+)?(?:poder|atk|def|power)\s+(?:d[oe]s?\s+|of\s+)?(?:monstros?\s+|monsters?\s+)?([a-z\- /]{3,40})/gi;
    while ((m = buffRe.exec(text)) !== null) {
      const chunk = m[1] || "";
      for (const key of TRIBAL_KEYS) {
        if (new RegExp(`\\b${tribalWordPattern(key)}\\b`, "i").test(chunk)) {
          pushEquipOrBuffTag(tags, "buffs", key);
        }
      }
    }
    if (/equip.*(?:warrior|guerreiro)|(?:warrior|guerreiro).*equip/i.test(lower)) {
      if (!tags.some((t) => t.startsWith("equip_only_tipo:") || t.startsWith("equip_only:"))) {
        if (/apenas|only|intended for|destinad/i.test(lower)) {
          tags.push("equip_only_tipo:warrior");
        }
      }
    }
    for (const t of [...tags]) {
      if (t.startsWith("equip_only_tipo:") || t.startsWith("equip_only_attr:")) {
        const legacy = `equip_only:${t.split(":")[1]}`;
        if (!tags.includes(legacy)) tags.push(legacy);
      }
    }
    return tags;
  }
  function parseTaggedValue(tags, prefix) {
    const out = [];
    const p = `${prefix}:`;
    for (const t of tags) {
      if (t.startsWith(p)) out.push(t.slice(p.length));
    }
    return out;
  }

  // src/lib/deck-rules.ts
  var DECK_SIZE = 40;
  var DEFAULT_COPY_LIMIT = 3;
  var MAX_TRAP = 15;
  var MAX_EQUIP = 15;
  var MAX_SPELL = 15;
  var MAX_FIELD = 0;
  var EQUIP_RANGE = { min: 0, max: 15 };
  var TRAP_RANGE = { min: 0, max: 15 };
  var SPELL_RANGE = { min: 0, max: 15 };
  var GOD_SET = new Set(GOD_SLUGS);
  function slotKind(card) {
    const t = card.card_type;
    if (t === "Trap") return "trap";
    if (t === "Equip") return "equip";
    if (t === "Field") return "field";
    if (t === "Spell") return "spell";
    return "monster";
  }
  function copyLimit(card) {
    if (GOD_SET.has(card.slug)) return 1;
    return DEFAULT_COPY_LIMIT;
  }
  function emptyTypeCounts() {
    return { monster: 0, spell: 0, equip: 0, field: 0, trap: 0 };
  }
  function createDeckState() {
    return {
      counts: /* @__PURE__ */ new Map(),
      typeCounts: emptyTypeCounts(),
      total: 0,
      bombCopies: 0
    };
  }
  function typeCap(kind) {
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
  function pickSlotTargets(deckTier, rand, godsAlready, calibration, includeSpells = true, exact) {
    if (exact) {
      let equip2 = exact.equip != null ? Math.min(EQUIP_RANGE.max, Math.max(EQUIP_RANGE.min, Math.round(exact.equip))) : EQUIP_RANGE.min;
      let trap2 = exact.trap != null ? Math.min(TRAP_RANGE.max, Math.max(TRAP_RANGE.min, Math.round(exact.trap))) : TRAP_RANGE.min;
      let spell2 = exact.spell != null ? Math.min(SPELL_RANGE.max, Math.max(SPELL_RANGE.min, Math.round(exact.spell))) : 0;
      if (!includeSpells) spell2 = 0;
      let support2 = equip2 + trap2 + spell2;
      const maxSupport2 = Math.max(0, DECK_SIZE - Math.max(godsAlready, 0));
      while (support2 > maxSupport2 && support2 > 0) {
        if (spell2 > 0) spell2 -= 1;
        else if (equip2 >= trap2 && equip2 > 0) equip2 -= 1;
        else if (trap2 > 0) trap2 -= 1;
        else break;
        support2 = equip2 + trap2 + spell2;
      }
      return {
        equip: equip2,
        trap: trap2,
        spell: spell2,
        monster: DECK_SIZE - equip2 - trap2 - spell2
      };
    }
    const biasHigh = deckTier === 5 ? 0.8 : deckTier === 4 ? 0.55 : 0.3;
    function pickRange(min, max, cal) {
      if (cal != null && cal >= min && cal <= max) {
        const j = Math.round((rand() - 0.5) * 2);
        return Math.min(max, Math.max(min, cal + j));
      }
      const span = max - min;
      return min + Math.round(span * (rand() * 0.35 + biasHigh * 0.65));
    }
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
    while (support > maxSupport && (equip > autoEquipMin || trap > autoTrapMin || spell > SPELL_RANGE.min)) {
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
      monster: DECK_SIZE - equip - trap - spell
    };
  }
  function canAddCopy(card, state2, opts) {
    if (card.card_type === "Field") return false;
    if (state2.total >= DECK_SIZE) return false;
    const current = state2.counts.get(card.slug) || 0;
    if (current >= copyLimit(card)) return false;
    const kind = slotKind(card);
    const cap = typeCap(kind);
    if (cap != null && state2.typeCounts[kind] + 1 > cap) return false;
    const maxBombs = opts?.maxBombs;
    if (maxBombs != null && (card.power_tier || 1) >= 5 && state2.bombCopies + 1 > maxBombs) {
      return false;
    }
    return true;
  }
  function addCopy(card, state2, opts) {
    if (!canAddCopy(card, state2, opts)) return false;
    state2.counts.set(card.slug, (state2.counts.get(card.slug) || 0) + 1);
    state2.total += 1;
    state2.typeCounts[slotKind(card)] += 1;
    if ((card.power_tier || 1) >= 5) state2.bombCopies += 1;
    return true;
  }
  function removeCopy(card, state2, opts) {
    const current = state2.counts.get(card.slug) || 0;
    if (current < 1) return false;
    const kind = slotKind(card);
    if (opts?.protectSupportMins !== false) {
      const minEquip = opts?.minEquip ?? 0;
      const minTrap = opts?.minTrap ?? 0;
      if (kind === "equip" && state2.typeCounts.equip <= minEquip) {
        return false;
      }
      if (kind === "trap" && state2.typeCounts.trap <= minTrap) {
        return false;
      }
    }
    if (current === 1) state2.counts.delete(card.slug);
    else state2.counts.set(card.slug, current - 1);
    state2.total -= 1;
    state2.typeCounts[kind] -= 1;
    if ((card.power_tier || 1) >= 5) {
      state2.bombCopies = Math.max(0, state2.bombCopies - 1);
    }
    return true;
  }
  function stateToEntries(state2) {
    return [...state2.counts.entries()].map(([slug, copies]) => ({ slug, copies })).sort((a, b) => a.slug.localeCompare(b.slug));
  }
  function needsSupportSlot(kind, state2, targets) {
    if (kind === "equip") return state2.typeCounts.equip < targets.equip;
    if (kind === "trap") return state2.typeCounts.trap < targets.trap;
    if (kind === "spell") return state2.typeCounts.spell < targets.spell;
    if (kind === "monster") return state2.typeCounts.monster < targets.monster;
    return false;
  }

  // src/lib/deck-generator.ts
  var GOD_SET2 = new Set(GOD_SLUGS);
  var USEFUL_SUPPORT_TAGS = /* @__PURE__ */ new Set([
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
    "win_condition"
  ]);
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function resolveArchetype(index, id) {
    const found = index.entries.find((e) => e.id === id);
    if (found) return found;
    const livre = index.entries.find((e) => e.livre);
    if (livre) return livre;
    throw new Error(`Arquet\xEDpico desconhecido: ${id}`);
  }
  function resolveTheme(index, requestedId) {
    const requested = resolveArchetype(index, requestedId);
    return { arch: requested, isLivre: Boolean(requested.livre) };
  }
  function norm(s) {
    return s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function cardText(c) {
    return norm(
      `${c.nome} ${c.nome_pt} ${c.slug} ${c.desc_pt || ""} ${c.desc_en || ""}`
    );
  }
  function referencesCore(card, core) {
    const text = cardText(card);
    for (const c of core) {
      if (c.nome && text.includes(norm(c.nome))) return true;
      if (c.nome_pt && text.includes(norm(c.nome_pt))) return true;
      if (c.slug && text.includes(norm(c.slug))) return true;
    }
    return false;
  }
  function mentionsArchetype(card, arch) {
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
  function mentionsForeignArchetype(card, arch, allEntries) {
    const text = cardText(card);
    for (const other of allEntries) {
      if (other.livre || other.id === arch.id) continue;
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
        if (mentionsArchetype(card, arch) || referencesCore(card, [])) {
          continue;
        }
        return true;
      }
    }
    return false;
  }
  function maxBombsForTier(tier) {
    if (tier === 3) return 2;
    if (tier === 4) return 10;
    return 40;
  }
  function godsCount(mode) {
    if (mode === "gods_1") return 1;
    if (mode === "gods_2") return 2;
    if (mode === "gods_3") return 3;
    return 0;
  }
  function buildLivrePool(cards, monsterTipo, monsterAtributo) {
    const core = [];
    const support = [];
    const fillerMonsters = [];
    const wantTipo = monsterTipo ? normTipo(monsterTipo) : null;
    const wantAttr = monsterAtributo ? normTipo(monsterAtributo) : null;
    for (const c of cards) {
      if (c.card_type === "Field") continue;
      if (c.card_type === "Monster") {
        if (wantTipo && normTipo(c.tipo) !== wantTipo) continue;
        if (wantAttr && normTipo(c.atributo) !== wantAttr) continue;
        if (normTipo(c.atributo).includes("divine")) continue;
        fillerMonsters.push(c);
      } else {
        support.push(c);
      }
    }
    return { core, support, fillerMonsters };
  }
  function buildPool(cards, arch, allEntries, monsterTipo, monsterAtributo) {
    if (arch.livre) return buildLivrePool(cards, monsterTipo, monsterAtributo);
    const bySlug = new Map(cards.map((c) => [c.slug, c]));
    const coreSlugs = new Set(arch.slugs);
    const supportSlugs = new Set(arch.support_slugs || []);
    const otherArch = new Set(arch.other_arch_slugs || []);
    const synergy = new Set(arch.synergy_tipos.map((t) => t.toLowerCase()));
    const core = [];
    const support = [];
    const fillerMonsters = [];
    const noField = (c) => c.card_type !== "Field";
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
      if (mentionsForeignArchetype(c, arch, allEntries) && !referencesCore(c, core)) {
        continue;
      }
      if (referencesCore(c, core) || mentionsArchetype(c, arch)) {
        support.push(c);
        continue;
      }
      if (c.card_type === "Spell" || c.card_type === "Equip" || c.card_type === "Trap") {
        const tags = c.effect_tags || [];
        if (tags.some((t) => USEFUL_SUPPORT_TAGS.has(t))) support.push(c);
        continue;
      }
      if (c.card_type === "Monster" && synergy.has((c.tipo || "").toLowerCase())) {
        fillerMonsters.push(c);
      }
    }
    return { core, support, fillerMonsters };
  }
  function normTipo(t) {
    return (t || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^beast warrior$/, "beastwarrior").replace(/^winged beast$/, "winged beast");
  }
  function dominantKeys(deck, field) {
    const counts = /* @__PURE__ */ new Map();
    for (const c of deck) {
      if (c.card_type !== "Monster" || GOD_SET2.has(c.slug)) continue;
      const k = normTipo(field === "tipo" ? c.tipo : c.atributo);
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let best = null;
    for (const [key, count] of counts) {
      if (!best || count > best.count) best = { key, count };
    }
    return best;
  }
  function countRaceInDeck(deck, raceKey) {
    const want = normTipo(raceKey.replace(/_/g, " "));
    return deck.filter(
      (c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug) && normTipo(c.tipo) === want
    ).length;
  }
  function countAttrInDeck(deck, attrKey) {
    const want = normTipo(attrKey.replace(/_/g, " "));
    return deck.filter(
      (c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug) && normTipo(c.atributo) === want
    ).length;
  }
  function countTipoInDeck(deck, tipoSlug) {
    if (isAttrKey(tipoSlug)) return countAttrInDeck(deck, tipoSlug);
    return countRaceInDeck(deck, tipoSlug);
  }
  function hasTipoHost(deck, key, themeTipo) {
    const want = normTipo(key.replace(/_/g, " "));
    if (themeTipo && normTipo(themeTipo) === want) return true;
    return countRaceInDeck(deck, key) > 0;
  }
  function hasAttrHost(deck, key, themeAttr) {
    const want = normTipo(key.replace(/_/g, " "));
    if (themeAttr && normTipo(themeAttr) === want) return true;
    return countAttrInDeck(deck, key) > 0;
  }
  function isThemeCoherentSupport(card, themeTipo, themeAtributo) {
    if (!themeTipo && !themeAtributo) return false;
    if (card.card_type !== "Equip" && card.card_type !== "Spell" && card.card_type !== "Trap") {
      return false;
    }
    const tags = cardEffectTags(card);
    const onlyTipo = [
      ...parseTaggedValue(tags, "equip_only_tipo"),
      ...parseTaggedValue(tags, "equip_only").filter((k) => isTypeKey(k))
    ];
    const onlyAttr = [
      ...parseTaggedValue(tags, "equip_only_attr"),
      ...parseTaggedValue(tags, "equip_only").filter((k) => isAttrKey(k))
    ];
    const buffsTipo = parseTaggedValue(tags, "buffs_tipo");
    const buffsAttr = parseTaggedValue(tags, "buffs_attr");
    const restricted = onlyTipo.length + onlyAttr.length + buffsTipo.length + buffsAttr.length > 0;
    if (!restricted) return false;
    const emptyDeck = [];
    return onlyTipo.some((k) => hasTipoHost(emptyDeck, k, themeTipo)) || onlyAttr.some((k) => hasAttrHost(emptyDeck, k, themeAtributo)) || buffsTipo.some((k) => hasTipoHost(emptyDeck, k, themeTipo)) || buffsAttr.some((k) => hasAttrHost(emptyDeck, k, themeAtributo));
  }
  function rejectsAntiSynergy(candidate, deck, themeTipo, themeAtributo) {
    const tags = cardEffectTags(candidate);
    const themeRace = themeTipo ? normTipo(themeTipo) : null;
    const themeAttr = themeAtributo ? normTipo(themeAtributo) : null;
    const monCount = deck.filter(
      (c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug)
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
        ...parseTaggedValue(tags, "equip_only").filter((k) => isTypeKey(k))
      ];
      const onlyAttr = [
        ...parseTaggedValue(tags, "equip_only_attr"),
        ...parseTaggedValue(tags, "equip_only").filter((k) => isAttrKey(k))
      ];
      const buffsTipo = parseTaggedValue(tags, "buffs_tipo");
      const buffsAttr = parseTaggedValue(tags, "buffs_attr");
      let rejectReason = null;
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
      if (!rejectReason && (buffsTipo.length > 0 || buffsAttr.length > 0) && onlyTipo.length === 0 && onlyAttr.length === 0) {
        const okBuff = buffsTipo.some((k) => hasTipoHost(deck, k, themeTipo)) || buffsAttr.some((k) => hasAttrHost(deck, k, themeAtributo));
        if (!okBuff) rejectReason = "buffs_no_host";
      }
      if (!rejectReason) {
        for (const only of parseTaggedValue(tags, "equip_only")) {
          if (isTypeKey(only) || isAttrKey(only)) continue;
          if (themeRace && normTipo(only) !== themeRace && themeAttr && normTipo(only) !== themeAttr) {
            rejectReason = `legacy_only:${only}`;
            break;
          }
          if (!themeRace && !themeAttr && countTipoInDeck(deck, only) === 0 && monCount >= 4) {
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
  function cardEffectTags(card) {
    const base = card.effect_tags || [];
    const text = `${card.desc_pt || ""} ${card.desc_en || ""}`;
    const live = [
      ...extractTribalAndEquipTags(text, card.slug),
      ...extractRequiresTags(text, card.slug)
    ];
    if (!live.length) return base;
    return [.../* @__PURE__ */ new Set([...base, ...live])];
  }
  function matchesRequireName(key, card) {
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
  function deckSatisfiesRequire(key, deck) {
    return deck.some((c) => matchesRequireName(key, c));
  }
  function hasThemeMonsters(deck, arch, coreSet) {
    if (arch.livre) {
      return deck.some((c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug));
    }
    return deck.some(
      (c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug) && (coreSet.has(c.slug) || arch.synergy_tipos.some(
        (t) => (c.tipo || "").toLowerCase() === t.toLowerCase()
      ))
    );
  }
  function hasBosses(deck) {
    return deck.some((c) => (c.power_tier || 1) >= 5 && c.card_type === "Monster");
  }
  function synergyScore(candidate, deckCards, arch, coreSet, otherArch, core, target, allEntries, themeTipo, themeAtributo) {
    let score = 0;
    const isLivre = arch.livre;
    const themeNorm = themeTipo ? normTipo(themeTipo) : null;
    const themeAttr = themeAtributo ? normTipo(themeAtributo) : null;
    if (!isLivre) {
      if (coreSet.has(candidate.slug)) score += 55;
      if (otherArch.has(candidate.slug)) score -= 250;
      if (mentionsForeignArchetype(candidate, arch, allEntries)) score -= 80;
    }
    const pt = candidate.power_tier || 1;
    const themeSupport = isThemeCoherentSupport(
      candidate,
      themeTipo,
      themeAtributo
    );
    if (target === 5) {
      if (pt === 5) score += 70;
      if (pt === 4) score += 8;
      if (pt <= 3 && !GOD_SET2.has(candidate.slug) && !themeSupport) score -= 60;
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
      if (themeNorm && candidate.card_type === "Monster" && normTipo(candidate.tipo) === themeNorm) {
        score += 48;
      }
      if (themeAttr && candidate.card_type === "Monster" && normTipo(candidate.atributo) === themeAttr) {
        score += 40;
      }
      if (!themeNorm && !themeAttr) {
        const domTipo = dominantKeys(deckCards, "tipo");
        const domAttr = dominantKeys(deckCards, "atributo");
        const monsterCount = deckCards.filter(
          (c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug)
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
    if ((candidate.card_type === "Equip" || tags.includes("attack_boost") || tags.includes("attack_boost_high")) && (themeMons || themeNorm || themeAttr)) {
      const onlyTipo = parseTaggedValue(tags, "equip_only_tipo");
      const onlyAttr = parseTaggedValue(tags, "equip_only_attr");
      const buffsTipo = parseTaggedValue(tags, "buffs_tipo");
      const buffsAttr = parseTaggedValue(tags, "buffs_attr");
      const restricted = onlyTipo.length + onlyAttr.length + buffsTipo.length + buffsAttr.length > 0;
      if (!restricted) {
        score += 32;
      } else {
        const fit = onlyTipo.some((k) => hasTipoHost(deckCards, k, themeTipo)) || onlyAttr.some((k) => hasAttrHost(deckCards, k, themeAtributo)) || buffsTipo.some((k) => hasTipoHost(deckCards, k, themeTipo)) || buffsAttr.some((k) => hasAttrHost(deckCards, k, themeAtributo));
        if (fit) score += 120;
        else score -= 50;
      }
    }
    if (candidate.card_type === "Trap" && bosses && (tags.includes("attacker_lock") || tags.includes("attack_negation") || tags.includes("strong_immunity") || tags.includes("removal_control"))) {
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
  function preferredCopies(card, target, coreSet) {
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
  function pickGods(mode, bySlug, rand) {
    const n = godsCount(mode);
    if (n === 0) return [];
    const gods = GOD_SLUGS.map((s) => bySlug.get(s)).filter(
      (c) => Boolean(c)
    );
    const shuffled = [...gods].sort(() => rand() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }
  function calibrationForTier(tier, cal) {
    if (!cal?.by_strength) return void 0;
    const key = cal.tier_map?.[String(tier)] || (tier === 5 ? "strong" : tier === 4 ? "medium" : "weak");
    const row = cal.by_strength[key];
    if (!row) return void 0;
    return {
      equip: row.equip_target,
      trap: row.trap_target,
      spell: row.spell_target
    };
  }
  function copiesAtTier(deck, tier) {
    return deck.filter((c) => (c.power_tier || 1) === tier).length;
  }
  function pctOf(deck, pred) {
    if (!deck.length) return 0;
    return deck.filter(pred).length / deck.length;
  }
  function focusPredicate(target) {
    if (target === 5) return (c) => (c.power_tier || 1) === 5;
    if (target === 4) return (c) => (c.power_tier || 1) === 4;
    return (c) => {
      const t = c.power_tier || 1;
      return t === 2 || t === 3;
    };
  }
  function focusMinRatio(target) {
    if (target === 5) return 0.8;
    if (target === 4) return 0.7;
    return 0.6;
  }
  function isAllowedByTierPolicy(card, target, deck, opts) {
    const pt = card.power_tier || 1;
    if (GOD_SET2.has(card.slug)) return true;
    if (opts?.allowAnyTier) {
      return true;
    }
    const isSupport = card.card_type === "Equip" || card.card_type === "Trap" || card.card_type === "Spell";
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
  function generateDeck(options) {
    const seed = options.seed ?? Date.now() % 1e6;
    const rand = mulberry32(seed);
    const target = options.targetTier;
    const godsMode = options.godsMode ?? "off";
    const includeSpells = options.includeSpells !== false;
    const exactSlots = options.slotTargets ?? null;
    const { arch, isLivre } = resolveTheme(
      options.archetypes,
      options.archetypeId
    );
    const monsterTipo = isLivre && options.monsterTipo ? String(options.monsterTipo).trim() : null;
    const monsterAtributoRaw = isLivre && options.monsterAtributo ? String(options.monsterAtributo).trim() : null;
    const monsterAtributo = monsterAtributoRaw && !normTipo(monsterAtributoRaw).includes("divine") ? monsterAtributoRaw : null;
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
          "Por tipo: escolhe ra\xE7a e/ou atributo (ex. Aqua, Water) antes de gerar."
        ],
        seed,
        include_spells: includeSpells
      };
    }
    const { core, support, fillerMonsters } = buildPool(
      options.cards,
      arch,
      options.archetypes.entries,
      monsterTipo,
      monsterAtributo
    );
    const coreSet = new Set(core.map((c) => c.slug));
    const otherArch = isLivre ? /* @__PURE__ */ new Set() : new Set(arch.other_arch_slugs || []);
    const bySlug = new Map(options.cards.map((c) => [c.slug, c]));
    const maxBombs = maxBombsForTier(target);
    const state2 = createDeckState();
    const deckList = [];
    const warnings = [];
    const tagsUsed = /* @__PURE__ */ new Set();
    if (typePure || attrPure) {
      const bits = [];
      if (monsterTipo) bits.push(`ra\xE7a ${monsterTipo}`);
      if (monsterAtributo) bits.push(`attr ${monsterAtributo}`);
      warnings.push(
        `Por tipo: 100% monstros (${bits.join(" + ")}) \xB7 equips coerentes.`
      );
    }
    const gods = pickGods(godsMode, bySlug, rand);
    for (const g of gods) {
      if (addCopy(g, state2, { maxBombs })) {
        deckList.push(g);
        for (const t of g.effect_tags || []) tagsUsed.add(t);
      } else {
        warnings.push(`N\xE3o foi poss\xEDvel adicionar deus ${g.slug}.`);
      }
    }
    if (gods.length) {
      warnings.push(`Deuses: ${gods.length} inclu\xEDdo(s) (${gods.map((g) => g.nome_pt || g.nome).join(", ")}).`);
    }
    const calSlice = calibrationForTier(target, options.npcCalibration);
    const targets = pickSlotTargets(
      target,
      rand,
      gods.length,
      calSlice,
      includeSpells,
      exactSlots
    );
    const lockedQuotas = Boolean(exactSlots);
    const banned = new Set(
      (options.bannedSlugs || []).map((s) => String(s).toLowerCase())
    );
    if (banned.size) {
      warnings.push(`Bans activos nesta config: ${banned.size} carta(s).`);
    }
    warnings.push(
      `Quotas: Equip ${targets.equip} \xB7 Trap ${targets.trap} \xB7 Magia ${targets.spell} \xB7 Monstro ${targets.monster}.`
    );
    const fillerCap = isLivre ? 999 : 3;
    const fillers = fillerMonsters.filter((c) => !otherArch.has(c.slug)).slice(0, isLivre ? fillerMonsters.length : fillerCap * 4);
    const candidates = [
      ...new Map(
        [...core, ...support, ...fillers].map((c) => [c.slug, c])
      ).values()
    ].filter(
      (c) => c.card_type !== "Field" && !otherArch.has(c.slug) && !banned.has(c.slug.toLowerCase())
    );
    if (typePure && fillerMonsters.length < 8) {
      warnings.push(
        `Poucos monstros ${monsterTipo}${monsterAtributo ? `/${monsterAtributo}` : ""} no cat\xE1logo (${fillerMonsters.length}).`
      );
    }
    if (attrPure && !typePure && fillerMonsters.length < 8) {
      warnings.push(
        `Poucos monstros atributo ${monsterAtributo} (${fillerMonsters.length}).`
      );
    }
    let fillerUsed = 0;
    let libreAxis = typePure ? normTipo(monsterTipo) : attrPure ? normTipo(monsterAtributo) : null;
    const manualMap = /* @__PURE__ */ new Map();
    if (options.effectTiers) {
      for (const [k, v] of Object.entries(options.effectTiers)) {
        manualMap.set(k, v);
      }
    }
    function manualFor(card) {
      if (!card.desc_pt) return null;
      return manualMap.get(effectTextKey(card.desc_pt)) ?? null;
    }
    function scoreOf(c) {
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
        themeAtributo
      );
    }
    function axisOk(card) {
      if (!isLivre) return true;
      if (card.card_type !== "Monster" || GOD_SET2.has(card.slug)) return true;
      if (typePure && normTipo(card.tipo) !== normTipo(monsterTipo)) return false;
      if (attrPure && normTipo(card.atributo) !== normTipo(monsterAtributo)) {
        return false;
      }
      if (typePure || attrPure) return true;
      if (!libreAxis) return true;
      const mons = deckList.filter(
        (c) => c.card_type === "Monster" && !GOD_SET2.has(c.slug)
      );
      if (mons.length < 5) return true;
      const onAxis = mons.filter((c) => normTipo(c.tipo) === libreAxis).length;
      const ratio = onAxis / mons.length;
      if (ratio >= 0.7) return true;
      return normTipo(card.tipo) === libreAxis;
    }
    function canPassGates(card, policyOpts) {
      if (!canAddCopy(card, state2, { maxBombs })) return false;
      if (!isAllowedByTierPolicy(card, target, deckList, policyOpts)) return false;
      if (rejectsAntiSynergy(card, deckList, themeTipo, themeAtributo)) {
        return false;
      }
      if (!axisOk(card)) return false;
      return true;
    }
    function tryAdd(card, copiesWanted, policyOpts) {
      let added = 0;
      while (added < copiesWanted && state2.total < DECK_SIZE && canPassGates(card, policyOpts)) {
        const kind = slotKind(card);
        if (kind === "field") break;
        if (kind === "equip" || kind === "trap" || kind === "spell") {
          if (!needsSupportSlot(kind, state2, targets)) break;
        }
        if (kind === "monster") {
          if (lockedQuotas && state2.typeCounts.monster >= targets.monster) {
            break;
          }
        }
        addCopy(card, state2, { maxBombs });
        deckList.push(card);
        added += 1;
        for (const t of cardEffectTags(card)) tagsUsed.add(t);
      }
      return added;
    }
    function tryAddRelaxTargets(card, copiesWanted, policyOpts) {
      return tryAdd(card, copiesWanted, policyOpts);
    }
    function noteFiller(pick, added) {
      if (isLivre) return;
      if (added > 0 && !coreSet.has(pick.slug) && pick.card_type === "Monster" && !support.some((s) => s.slug === pick.slug)) {
        fillerUsed += added;
      }
    }
    function maybeLockAxis() {
      if (!isLivre || libreAxis) return;
      if (typePure) return;
      const dom = dominantKeys(deckList, "tipo");
      if (dom && dom.count >= 3) {
        libreAxis = dom.key;
        warnings.push(`Eixo Livre fixado: ${libreAxis}.`);
      }
    }
    function pickWeightedTopK(scored, k = 10) {
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
        r -= weights[i];
        if (r <= 0) return top[i].c;
      }
      return top[top.length - 1].c;
    }
    function pickBest(pool, kind, phase, policyOpts) {
      const filtered2 = pool.filter((c) => {
        if (kind && slotKind(c) !== kind) return false;
        if (!canPassGates(c, policyOpts)) return false;
        if (phase === "focus" && !focusPredicate(target)(c)) return false;
        if (phase === "support" && kind && (kind === "equip" || kind === "trap" || kind === "spell") && !needsSupportSlot(kind, state2, targets)) {
          return false;
        }
        if (!isLivre) {
          const isFiller = !coreSet.has(c.slug) && c.card_type === "Monster" && !support.some((s) => s.slug === c.slug) && !GOD_SET2.has(c.slug);
          if (isFiller && fillerUsed >= fillerCap) return false;
        }
        return true;
      });
      if (!filtered2.length) return null;
      const band2 = powerBandForTier(target);
      const scored = filtered2.map((c) => {
        let score = scoreOf(c) + rand() * 18;
        if (focusPredicate(target)(c)) score += phase === "focus" ? 50 : 28;
        if (coreSet.has(c.slug)) score += 20;
        if (isLivre && libreAxis && normTipo(c.tipo) === libreAxis) score += 40;
        const cp = cardDeckPower(c, manualFor(c));
        if (target === 5) score += cp * 3;
        else if (target === 4) score += cp * 1.5;
        else score += Math.max(0, 8 - cp);
        if (band2.max != null && cp >= 8) score -= 15;
        return { c, score };
      });
      return pickWeightedTopK(scored, phase === "focus" ? 8 : 12);
    }
    function supportDeficitKinds() {
      return ["equip", "trap", "spell"].filter((k) => {
        if (k === "spell" && targets.spell === 0) return false;
        return needsSupportSlot(k, state2, targets);
      });
    }
    function pickQuotaWithTierFallback(kind) {
      const policy = { allowSupportFloor: true };
      const useThemeFirst = Boolean(themeTipo || themeAtributo) && (kind === "equip" || kind === "spell" || kind === "trap");
      function pickFromPool(pool, want, thematicOnly) {
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
          score: scoreOf(c) + rand() * 14
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
      return pickBest(candidates, kind, "support", policy) || pickBest(candidates, kind, "fill", policy);
    }
    function pickMonsterWithTierFallback() {
      const policy = { allowAnyTier: true };
      for (let want = target; want >= 1; want--) {
        const atTier = candidates.filter((c) => {
          if (slotKind(c) !== "monster") return false;
          if ((c.power_tier || 1) !== want) return false;
          if (!isLivre) {
            const isFiller = !coreSet.has(c.slug) && c.card_type === "Monster" && !support.some((s) => s.slug === c.slug) && !GOD_SET2.has(c.slug);
            if (isFiller && fillerUsed >= fillerCap) return false;
          }
          return canPassGates(c, policy);
        });
        if (!atTier.length) continue;
        const scored = atTier.map((c) => ({
          c,
          score: scoreOf(c) + rand() * 14
        }));
        const pick = pickWeightedTopK(scored, 12);
        if (pick) return pick;
      }
      return pickBest(candidates, "monster", "fill", policy);
    }
    function copiesNeededForQuota(kind, card) {
      const remain = targets[kind] - state2.typeCounts[kind];
      if (remain <= 0) return 0;
      return Math.min(preferredCopies(card, target, coreSet), remain);
    }
    const reservedSupport = targets.equip + targets.trap + targets.spell;
    const earlyMonsterCap = lockedQuotas ? Math.max(0, Math.min(6, DECK_SIZE - reservedSupport - gods.length)) : 6;
    let guard = 0;
    while (isLivre && state2.typeCounts.monster < earlyMonsterCap && state2.total < DECK_SIZE - (lockedQuotas ? reservedSupport : 0) && guard < 400) {
      if (!typePure && !attrPure && libreAxis) break;
      guard += 1;
      const pick = pickBest(candidates, "monster", "focus") || pickBest(candidates, "monster", "fill");
      if (!pick) break;
      if (tryAddRelaxTargets(pick, preferredCopies(pick, target, coreSet)) === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
        continue;
      }
      maybeLockAxis();
    }
    maybeLockAxis();
    const stuckKinds = /* @__PURE__ */ new Set();
    guard = 0;
    while (state2.total < DECK_SIZE && guard < 2500) {
      guard += 1;
      const deficit = supportDeficitKinds().filter((k) => !stuckKinds.has(k));
      if (!deficit.length) break;
      const kind = deficit[Math.floor(rand() * deficit.length)];
      const pick = pickQuotaWithTierFallback(kind);
      if (!pick) {
        stuckKinds.add(kind);
        warnings.push(
          `Quota ${kind} incompleta (${state2.typeCounts[kind]}/${targets[kind]}) \u2014 sem cartas vi\xE1veis mesmo com fallback de tier.`
        );
        if (!lockedQuotas) {
          if (kind === "equip") targets.equip = state2.typeCounts.equip;
          if (kind === "trap") targets.trap = state2.typeCounts.trap;
          if (kind === "spell") targets.spell = state2.typeCounts.spell;
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
    const focusNeed = Math.ceil(DECK_SIZE * focusMinRatio(target));
    guard = 0;
    while (deckList.filter(focusPredicate(target)).length < focusNeed && state2.total < DECK_SIZE && state2.typeCounts.monster < (lockedQuotas ? targets.monster : DECK_SIZE) && !supportDeficitKinds().length && guard < 1e3) {
      guard += 1;
      const pick = pickBest(candidates, "monster", "focus");
      if (!pick) break;
      const added = tryAdd(
        pick,
        preferredCopies(pick, target, coreSet)
      );
      noteFiller(pick, added);
      maybeLockAxis();
      if (added === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
      }
    }
    guard = 0;
    while (state2.total < DECK_SIZE && guard < 2e3) {
      guard += 1;
      let kind = null;
      if (needsSupportSlot("equip", state2, targets) && !stuckKinds.has("equip")) {
        kind = "equip";
      } else if (needsSupportSlot("trap", state2, targets) && !stuckKinds.has("trap")) {
        kind = "trap";
      } else if (needsSupportSlot("spell", state2, targets) && !stuckKinds.has("spell")) {
        kind = "spell";
      } else if (needsSupportSlot("monster", state2, targets) || state2.typeCounts.monster < targets.monster) {
        kind = "monster";
      }
      if (kind === "equip" || kind === "trap" || kind === "spell") {
        const pick2 = pickQuotaWithTierFallback(kind);
        if (!pick2) {
          stuckKinds.add(kind);
          continue;
        }
        const added2 = tryAdd(
          pick2,
          copiesNeededForQuota(kind, pick2),
          { allowSupportFloor: true }
        );
        if (added2 === 0) {
          const idx = candidates.findIndex((x) => x.slug === pick2.slug);
          if (idx >= 0) candidates.splice(idx, 1);
        }
        continue;
      }
      const pickStrict = pickBest(candidates, "monster", "fill") || pickBest(candidates, "monster", "focus");
      const pick = pickStrict || pickMonsterWithTierFallback();
      if (!pick) {
        if (supportDeficitKinds().some((k) => !stuckKinds.has(k))) {
          for (const k of supportDeficitKinds()) stuckKinds.add(k);
          continue;
        }
        warnings.push(
          `Pool de monstros esgotado em ${state2.total}/40 (${arch.id}, tier ${target}).`
        );
        break;
      }
      const added = tryAdd(
        pick,
        preferredCopies(pick, target, coreSet),
        pickStrict ? void 0 : { allowAnyTier: true }
      );
      noteFiller(pick, added);
      if (added === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
      }
    }
    function trimExcess(kind) {
      while (state2.typeCounts[kind] > targets[kind] && state2.total > 0) {
        const idx = deckList.findIndex(
          (c) => slotKind(c) === kind && !GOD_SET2.has(c.slug)
        );
        if (idx < 0) break;
        const card = deckList[idx];
        if (!removeCopy(card, state2, {
          protectSupportMins: false
        })) {
          break;
        }
        deckList.splice(idx, 1);
      }
    }
    trimExcess("spell");
    trimExcess("equip");
    trimExcess("trap");
    while (lockedQuotas && state2.typeCounts.monster > targets.monster && state2.total > 0) {
      const idx = deckList.findIndex(
        (c) => slotKind(c) === "monster" && !GOD_SET2.has(c.slug)
      );
      if (idx < 0) break;
      const card = deckList[idx];
      if (!removeCopy(card, state2, { protectSupportMins: false })) break;
      deckList.splice(idx, 1);
    }
    guard = 0;
    while (state2.total < DECK_SIZE && guard < 800) {
      guard += 1;
      const deficit = supportDeficitKinds().filter((k) => !stuckKinds.has(k));
      if (!deficit.length) break;
      const kind = deficit[0];
      const pick = pickQuotaWithTierFallback(kind);
      if (!pick) {
        stuckKinds.add(kind);
        continue;
      }
      if (tryAdd(pick, copiesNeededForQuota(kind, pick), {
        allowSupportFloor: true
      }) === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
      }
    }
    guard = 0;
    while (state2.total < DECK_SIZE && state2.typeCounts.monster < targets.monster && guard < 800) {
      guard += 1;
      const pick = pickMonsterWithTierFallback();
      if (!pick) break;
      if (tryAdd(pick, preferredCopies(pick, target, coreSet), {
        allowAnyTier: true
      }) === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
      }
    }
    while (state2.total < DECK_SIZE && guard < 1200) {
      guard += 1;
      const pick = pickMonsterWithTierFallback();
      if (!pick) break;
      if (tryAdd(pick, 1, { allowAnyTier: true }) === 0) {
        const idx = candidates.findIndex((x) => x.slug === pick.slug);
        if (idx >= 0) candidates.splice(idx, 1);
        else break;
      }
    }
    const band = powerBandForTier(target);
    const POWER_TUNE_MAX = 80;
    function currentPower() {
      return deckTotalPower(stateToEntries(state2), bySlug, manualMap);
    }
    function removableSlots() {
      const out = [];
      for (const c of deckList) {
        if (GOD_SET2.has(c.slug)) continue;
        const kind = slotKind(c);
        if (kind === "equip" && state2.typeCounts.equip <= targets.equip) continue;
        if (kind === "trap" && state2.typeCounts.trap <= targets.trap) continue;
        out.push(c);
      }
      return out;
    }
    function trySwapToward(wantHigher) {
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
          if (GOD_SET2.has(c.slug)) return false;
          const pow = cardDeckPower(c, manualFor(c));
          if (wantHigher && pow <= victimPow) return false;
          if (!wantHigher && pow >= victimPow) return false;
          return true;
        });
        if (!replacements.length) continue;
        replacements.sort((a, b) => {
          const da = cardDeckPower(a, manualFor(a));
          const db = cardDeckPower(b, manualFor(b));
          return wantHigher ? db - da : da - db;
        });
        for (const incoming of replacements.slice(0, 8)) {
          if (!removeCopy(victim, state2, {
            minEquip: targets.equip,
            minTrap: targets.trap
          })) {
            continue;
          }
          const vi = deckList.findIndex((x) => x.slug === victim.slug);
          if (vi >= 0) deckList.splice(vi, 1);
          const gateOpts = kind === "monster" ? { allowAnyTier: true } : { allowSupportFloor: true };
          if (!canPassGates(incoming, gateOpts)) {
            addCopy(victim, state2, { maxBombs });
            deckList.push(victim);
            continue;
          }
          if (!addCopy(incoming, state2, { maxBombs })) {
            addCopy(victim, state2, { maxBombs });
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
    guard = 0;
    while (state2.total < DECK_SIZE && guard < 600) {
      guard += 1;
      const deficit = supportDeficitKinds().filter((k) => !stuckKinds.has(k));
      if (deficit.length) {
        const kind = deficit[0];
        const pick2 = pickQuotaWithTierFallback(kind);
        if (!pick2) {
          stuckKinds.add(kind);
          continue;
        }
        if (tryAdd(pick2, copiesNeededForQuota(kind, pick2), {
          allowSupportFloor: true
        }) === 0) {
          const idx = candidates.findIndex((x) => x.slug === pick2.slug);
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
    const focusPct = pctOf(deckList, focusPredicate(target));
    if (target === 5) {
      if (focusPct < 0.8) {
        warnings.push(
          `Ultra Hard: ${(focusPct * 100).toFixed(0)}% T5 (alvo \u226580%).`
        );
      }
    } else if (target === 4) {
      if (focusPct < 0.7) {
        warnings.push(`Hard: ${(focusPct * 100).toFixed(0)}% T4 (alvo \u226570%).`);
      }
    } else if (focusPct < 0.6) {
      warnings.push(
        `Mediano: ${(focusPct * 100).toFixed(0)}% T2\u2013T3 (alvo \u226560%).`
      );
    }
    if (state2.typeCounts.equip < targets.equip) {
      warnings.push(
        `Equip abaixo do alvo (${targets.equip}): ${state2.typeCounts.equip}.`
      );
    }
    if (state2.typeCounts.trap < targets.trap) {
      warnings.push(
        `Trap abaixo do alvo (${targets.trap}): ${state2.typeCounts.trap}.`
      );
    }
    if (state2.typeCounts.spell < targets.spell) {
      warnings.push(
        `Magia abaixo do alvo (${targets.spell}): ${state2.typeCounts.spell}.`
      );
    }
    if (state2.total < DECK_SIZE) {
      warnings.push(`Deck incompleto: ${state2.total}/${DECK_SIZE} cartas.`);
    }
    const entries = stateToEntries(state2);
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
      const maxLabel = band.max == null ? "\u221E" : String(band.max);
      warnings.push(
        `Poder do deck ${totalDeckPower} fora da faixa ${band.min}\u2013${maxLabel} (Tier ${target}).`
      );
    }
    return {
      archetype_id: arch.id,
      target_tier: target,
      gods_mode: godsMode,
      total: state2.total,
      entries,
      composition: { ...state2.typeCounts },
      average_power_tier: n ? Math.round(powerSum / n * 100) / 100 : 0,
      total_deck_power: totalDeckPower,
      tags_used: [...tagsUsed].sort(),
      warnings,
      seed,
      libre_axis: libreAxis || void 0,
      monster_tipo: monsterTipo || void 0,
      monster_atributo: monsterAtributo || void 0,
      include_spells: includeSpells
    };
  }

  // src/lib/rarity.ts
  var RARITY_ORDER = ["N", "R", "SR", "UR"];
  var RARITY_LABELS = {
    N: "Comum",
    R: "Rara",
    SR: "Super Rara",
    UR: "Ultra Rara"
  };
  function sortRarities(keys) {
    return [...keys].sort((a, b) => {
      const ia = RARITY_ORDER.indexOf(a);
      const ib = RARITY_ORDER.indexOf(b);
      const sa = ia === -1 ? 99 : ia;
      const sb = ib === -1 ? 99 : ib;
      return sa - sb || a.localeCompare(b);
    });
  }

  // src/app/main.ts
  var state = {
    cards: [],
    bySlug: /* @__PURE__ */ new Map(),
    archetypes: null,
    npcCalibration: null,
    effectTiers: {},
    generationBans: {},
    savedSeeds: [],
    loadBanOverride: null,
    effectRows: [],
    effectsQ: "",
    expandedEffectKey: null,
    versao: "",
    q: "",
    rarities: /* @__PURE__ */ new Set(),
    types: /* @__PURE__ */ new Set(),
    tiers: /* @__PURE__ */ new Set(),
    onlyEffect: false,
    deck: null,
    lastSeed: null
  };
  var el = {
    tabCreate: document.getElementById("tab-create"),
    tabCatalog: document.getElementById("tab-catalog"),
    tabEffects: document.getElementById("tab-effects"),
    panelCreate: document.getElementById("panel-create"),
    panelCatalog: document.getElementById("panel-catalog"),
    panelEffects: document.getElementById("panel-effects"),
    archetype: document.getElementById("archetype"),
    monsterTipo: document.getElementById("monster-tipo"),
    fieldMonsterTipo: document.getElementById("field-monster-tipo"),
    monsterAttr: document.getElementById("monster-attr"),
    fieldMonsterAttr: document.getElementById("field-monster-attr"),
    qtySpell: document.getElementById("qty-spell"),
    qtyEquip: document.getElementById("qty-equip"),
    qtyTrap: document.getElementById("qty-trap"),
    tier: document.getElementById("tier"),
    godsMode: document.getElementById("gods-mode"),
    btnGenerate: document.getElementById("btn-generate"),
    btnSaveSeed: document.getElementById("btn-save-seed"),
    btnSavedSeeds: document.getElementById("btn-saved-seeds"),
    btnCloseSeeds: document.getElementById("btn-close-seeds"),
    seedsPanel: document.getElementById("seeds-panel"),
    seedsList: document.getElementById("seeds-list"),
    seedsStatus: document.getElementById("seeds-status"),
    btnSaveEffects: document.getElementById("btn-save-effects"),
    genMeta: document.getElementById("gen-meta"),
    warnings: document.getElementById("deck-warnings"),
    deckGrid: document.getElementById("deck-grid"),
    deckSummary: document.getElementById("deck-summary"),
    sumTotal: document.getElementById("sum-total"),
    sumPower: document.getElementById("sum-power"),
    sumAvg: document.getElementById("sum-avg"),
    sumMon: document.getElementById("sum-mon"),
    sumSpell: document.getElementById("sum-spell"),
    sumEquip: document.getElementById("sum-equip"),
    sumTrap: document.getElementById("sum-trap"),
    grid: document.getElementById("grid"),
    count: document.getElementById("count"),
    effectsList: document.getElementById("effects-list"),
    effectsCount: document.getElementById("effects-count"),
    effectsStatus: document.getElementById("effects-status"),
    effectsQ: document.getElementById("effects-q"),
    q: document.getElementById("q"),
    rarityChips: document.getElementById("rarity-chips"),
    typeChips: document.getElementById("type-chips"),
    tierChips: document.getElementById("tier-chips"),
    onlyEffect: document.getElementById("only-effect"),
    modal: document.getElementById("modal"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modalClose: document.getElementById("modal-close"),
    modalArt: document.getElementById("modal-art"),
    modalBody: document.getElementById("modal-body")
  };
  function cacheBust(path) {
    return `${path}?v=${encodeURIComponent(state.versao || "0")}`;
  }
  var PROD_IMAGE_BASE = "https://forbiddenlegacy.com.br/img/cartas_grande";
  function prodImageUrl(slug) {
    return `${PROD_IMAGE_BASE}/${encodeURIComponent(slug)}.webp`;
  }
  function cardImageSrc(card) {
    const host = typeof location !== "undefined" ? location.hostname : "";
    if (host.endsWith("github.io") || host === "github.io") {
      return cacheBust(prodImageUrl(card.slug));
    }
    return cacheBust(card.image);
  }
  var backendAvailable = false;
  var LS_SAVED_SEEDS = "fl_saved_seeds_v1";
  var LS_EFFECT_TIERS = "fl_effect_tiers_v1";
  var LS_GENERATION_BANS = "fl_generation_bans_v1";
  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  }
  function normBanPart(s) {
    return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }
  function banConfigKey(tipo, atributo) {
    return `${normBanPart(tipo || "")}|${normBanPart(atributo || "")}`;
  }
  function bannedSlugsForCurrentConfig() {
    if (state.loadBanOverride) return state.loadBanOverride;
    const key = banConfigKey(el.monsterTipo.value, el.monsterAttr.value);
    return state.generationBans[key] || [];
  }
  function freshSeed() {
    return Date.now() % 1e6 + Math.floor(Math.random() * 997) + 1;
  }
  function syncSaveSeedButton() {
    el.btnSaveSeed.disabled = !state.deck || state.deck.total <= 0;
  }
  function setSeedsPanelOpen(open) {
    el.seedsPanel.hidden = !open;
    el.btnSavedSeeds.setAttribute("aria-expanded", String(open));
  }
  function formatSeedDate(iso) {
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      });
    } catch {
      return iso;
    }
  }
  function autoSeedLabel(entry) {
    const o = entry.options;
    const theme = o.monsterTipo || o.monsterAtributo ? [o.monsterTipo, o.monsterAtributo].filter(Boolean).join("/") : o.archetypeId;
    return `${theme} T${o.targetTier} \xB7 ${o.slotTargets.spell}/${o.slotTargets.equip}/${o.slotTargets.trap} \xB7 #${entry.seed}`;
  }
  function renderSavedSeeds() {
    const seeds = state.savedSeeds;
    el.seedsStatus.textContent = seeds.length ? `${seeds.length} seed(s) guardada(s)` : "Nenhuma seed guardada ainda.";
    const frag = document.createDocumentFragment();
    for (const s of seeds) {
      const card = document.createElement("article");
      card.className = "seed-card";
      card.setAttribute("role", "listitem");
      const title = document.createElement("p");
      title.className = "seed-card-title";
      title.textContent = s.label || autoSeedLabel(s);
      const o = s.options;
      const r = s.result;
      const gods = o.godsMode === "off" ? "sem deuses" : o.godsMode.replace("gods_", "") + " deus(es)";
      const meta = document.createElement("p");
      meta.className = "seed-card-meta";
      meta.innerHTML = escapeHtml(
        [
          `Seed ${s.seed} \xB7 ${formatSeedDate(s.saved_at)}`,
          `${o.archetypeId}${o.monsterTipo ? ` \xB7 ${o.monsterTipo}` : ""}${o.monsterAtributo ? ` \xB7 ${o.monsterAtributo}` : ""}`,
          `T${o.targetTier} \xB7 ${gods} \xB7 Magia ${o.slotTargets.spell} \xB7 Equip ${o.slotTargets.equip} \xB7 Trap ${o.slotTargets.trap}`,
          `${r.total} cartas \xB7 poder ${r.total_deck_power} \xB7 tier m\xE9d. ${r.average_power_tier}`,
          `M${r.composition.monster} / Mg${r.composition.spell} / Eq${r.composition.equip} / Tr${r.composition.trap}`,
          o.bannedSlugs.length ? `${o.bannedSlugs.length} ban(s)` : "sem bans",
          r.warnings.length ? `${r.warnings.length} aviso(s)` : "sem avisos"
        ].join("\n")
      ).replace(/\n/g, "<br>");
      const actions = document.createElement("div");
      actions.className = "seed-card-actions";
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "btn primary";
      loadBtn.textContent = "Carregar";
      loadBtn.addEventListener("click", () => {
        loadSavedSeed(s);
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn ghost";
      delBtn.textContent = "Apagar";
      delBtn.addEventListener("click", () => {
        void deleteSavedSeed(s.id);
      });
      actions.append(loadBtn, delBtn);
      card.append(title, meta, actions);
      frag.appendChild(card);
    }
    el.seedsList.replaceChildren(frag);
  }
  async function fetchSavedSeeds() {
    if (backendAvailable) {
      try {
        const res = await fetch("/api/saved-seeds");
        const json = await res.json();
        state.savedSeeds = Array.isArray(json.seeds) ? json.seeds : [];
        renderSavedSeeds();
        return;
      } catch {
      }
    }
    const local = lsGet(LS_SAVED_SEEDS, {
      updated_at: null,
      seeds: []
    });
    state.savedSeeds = Array.isArray(local.seeds) ? local.seeds : [];
    renderSavedSeeds();
  }
  async function saveCurrentSeed() {
    const deck = state.deck;
    if (!deck) return;
    const archId = el.archetype.value || deck.archetype_id || "livre";
    const tier = Number(el.tier.value);
    const godsRaw = el.godsMode.value;
    const godsMode = godsRaw === "gods_1" || godsRaw === "gods_2" || godsRaw === "gods_3" ? godsRaw : "off";
    const slotTargets = {
      spell: Number(el.qtySpell.value) || 0,
      equip: Number(el.qtyEquip.value) || 0,
      trap: Number(el.qtyTrap.value) || 0
    };
    const entry = {
      id: crypto.randomUUID(),
      saved_at: (/* @__PURE__ */ new Date()).toISOString(),
      seed: deck.seed,
      label: autoSeedLabel({
        seed: deck.seed,
        options: {
          archetypeId: archId,
          targetTier: tier,
          godsMode,
          monsterTipo: el.monsterTipo.value.trim() || null,
          monsterAtributo: el.monsterAttr.value.trim() || null,
          slotTargets,
          bannedSlugs: bannedSlugsForCurrentConfig()
        }
      }),
      options: {
        archetypeId: archId,
        targetTier: tier === 3 || tier === 4 || tier === 5 ? tier : deck.target_tier,
        godsMode: deck.gods_mode || godsMode,
        monsterTipo: deck.monster_tipo || el.monsterTipo.value.trim() || null,
        monsterAtributo: deck.monster_atributo || el.monsterAttr.value.trim() || null,
        slotTargets,
        bannedSlugs: [...bannedSlugsForCurrentConfig()]
      },
      result: {
        total: deck.total,
        entries: deck.entries.map((e) => ({ slug: e.slug, copies: e.copies })),
        composition: { ...deck.composition },
        total_deck_power: deck.total_deck_power,
        average_power_tier: deck.average_power_tier,
        warnings: [...deck.warnings],
        tags_used: [...deck.tags_used]
      }
    };
    el.btnSaveSeed.disabled = true;
    el.seedsStatus.textContent = "A guardar\u2026";
    if (backendAvailable) {
      try {
        const res = await fetch("/api/saved-seeds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry)
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          if (json.seeds?.seeds) state.savedSeeds = json.seeds.seeds;
          else state.savedSeeds.unshift(entry);
          setSeedsPanelOpen(true);
          renderSavedSeeds();
          el.seedsStatus.textContent = "Seed guardada.";
          syncSaveSeedButton();
          return;
        }
        el.seedsStatus.textContent = `Falha: ${json.error || res.status}`;
        syncSaveSeedButton();
        return;
      } catch {
      }
    }
    state.savedSeeds.unshift(entry);
    lsSet(LS_SAVED_SEEDS, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      seeds: state.savedSeeds
    });
    setSeedsPanelOpen(true);
    renderSavedSeeds();
    el.seedsStatus.textContent = "Seed guardada (neste navegador).";
    syncSaveSeedButton();
  }
  async function deleteSavedSeed(id) {
    el.seedsStatus.textContent = "A apagar\u2026";
    if (backendAvailable) {
      try {
        const res = await fetch(`/api/saved-seeds?id=${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          state.savedSeeds = json.seeds?.seeds || state.savedSeeds.filter((s) => s.id !== id);
          renderSavedSeeds();
          return;
        }
        el.seedsStatus.textContent = `Falha: ${json.error || res.status}`;
        return;
      } catch {
      }
    }
    state.savedSeeds = state.savedSeeds.filter((s) => s.id !== id);
    lsSet(LS_SAVED_SEEDS, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      seeds: state.savedSeeds
    });
    renderSavedSeeds();
  }
  function loadSavedSeed(entry) {
    const o = entry.options;
    if (o.archetypeId) el.archetype.value = o.archetypeId;
    syncTipoVisibility();
    if (o.monsterTipo != null) el.monsterTipo.value = o.monsterTipo;
    if (o.monsterAtributo != null) el.monsterAttr.value = o.monsterAtributo;
    el.tier.value = String(o.targetTier);
    el.godsMode.value = o.godsMode;
    el.qtySpell.value = String(o.slotTargets.spell);
    el.qtyEquip.value = String(o.slotTargets.equip);
    el.qtyTrap.value = String(o.slotTargets.trap);
    state.loadBanOverride = [...o.bannedSlugs || []];
    try {
      runGenerate(entry.seed);
    } finally {
      state.loadBanOverride = null;
    }
    persistUi();
    el.seedsStatus.textContent = `Carregada seed ${entry.seed}.`;
    switchTab("create");
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function switchTab(tab) {
    const map = {
      create: { btn: el.tabCreate, panel: el.panelCreate },
      catalog: { btn: el.tabCatalog, panel: el.panelCatalog },
      effects: { btn: el.tabEffects, panel: el.panelEffects }
    };
    for (const [k, v] of Object.entries(map)) {
      const on = k === tab;
      v.btn.classList.toggle("is-active", on);
      v.btn.setAttribute("aria-selected", String(on));
      v.panel.hidden = !on;
      v.panel.classList.toggle("is-active", on);
    }
    persistUi();
  }
  var SESSION_KEY = "fl_criacao_deck_ui_v1";
  function activeTab() {
    if (el.tabCatalog.classList.contains("is-active")) return "catalog";
    if (el.tabEffects.classList.contains("is-active")) return "effects";
    return "create";
  }
  function collectUi() {
    return {
      tab: activeTab(),
      scrollY: window.scrollY || 0,
      archetype: el.archetype.value,
      monsterTipo: el.monsterTipo.value,
      monsterAttr: el.monsterAttr.value,
      tier: el.tier.value,
      godsMode: el.godsMode.value,
      includeSpells: Number(el.qtySpell.value) > 0,
      qtySpell: Number(el.qtySpell.value) || 0,
      qtyEquip: Number(el.qtyEquip.value) || 0,
      qtyTrap: Number(el.qtyTrap.value) || 0,
      q: el.q.value,
      effectsQ: el.effectsQ.value,
      expandedEffectKey: state.expandedEffectKey,
      rarities: [...state.rarities],
      types: [...state.types],
      tiers: [...state.tiers],
      onlyEffect: state.onlyEffect,
      effectTiers: { ...state.effectTiers },
      lastSeed: state.lastSeed ?? state.deck?.seed ?? null
    };
  }
  function persistUi() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(collectUi()));
    } catch {
    }
  }
  function loadSavedUi() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function openModal(slug) {
    const c = state.bySlug.get(slug);
    if (!c) return;
    el.modal.hidden = false;
    el.modalArt.innerHTML = "";
    if (c.image_status === "ok") {
      const img = document.createElement("img");
      img.src = cardImageSrc(c);
      img.alt = c.nome_pt || c.nome;
      img.dataset.fallback = "0";
      img.onerror = () => {
        if (img.dataset.fallback === "0") {
          img.dataset.fallback = "1";
          img.src = prodImageUrl(c.slug);
          return;
        }
        el.modalArt.innerHTML = `<div class="missing">Arte em falta</div>`;
      };
      el.modalArt.appendChild(img);
    } else {
      el.modalArt.innerHTML = `<div class="missing">Arte em falta</div>`;
    }
    const rarityName = RARITY_LABELS[c.raridade] || c.raridade;
    const statusClass = c.image_status === "ok" ? "status-ok" : "status-missing";
    const effect = c.desc_pt || c.desc_en || "Sem texto de efeito no cat\xE1logo (vanilla ou sem desc_*).";
    const tags = (c.effect_tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const facts = [
      { k: "Raridade", v: `${c.raridade} \u2014 ${rarityName}` },
      { k: "Power Tier", v: String(c.power_tier ?? "\u2014") },
      { k: "Poder (deck)", v: String(c.card_power ?? "\u2014") },
      {
        k: "Pesos",
        v: `efeito ${c.effect_weight ?? "\u2014"} \xB7 raridade ${c.rarity_weight ?? "\u2014"} \xB7 corpo ${c.body_weight ?? "\u2014"}`
      },
      { k: "Tipo de carta", v: c.card_type },
      { k: "Ra\xE7a", v: c.tipo || "\u2014" },
      { k: "Atributo", v: c.atributo || "\u2014" }
    ];
    if (c.nivel) facts.push({ k: "N\xEDvel", v: c.nivel });
    if (c.atk) facts.push({ k: "ATK", v: c.atk });
    if (c.def) facts.push({ k: "DEF", v: c.def });
    facts.push({
      k: "Arte",
      v: `<span class="${statusClass}">${escapeHtml(c.image_status)}</span>`,
      html: true
    });
    el.modalBody.innerHTML = `
    <h2 id="modal-title">${escapeHtml(c.nome_pt || c.nome)}</h2>
    <p class="slug">${escapeHtml(c.nome)} \xB7 <code>${escapeHtml(c.slug)}</code></p>
    <div class="tags">${tags || `<span class="tag">vanilla</span>`}</div>
    <dl class="facts">
      ${facts.map(
      (f) => `<dt>${escapeHtml(f.k)}</dt><dd>${f.html ? f.v : escapeHtml(f.v)}</dd>`
    ).join("")}
    </dl>
    <p class="effect${c.has_effect ? "" : " empty"}">${escapeHtml(effect)}</p>
  `;
  }
  function closeModal() {
    el.modal.hidden = true;
  }
  function artNode(c) {
    const frame = document.createElement("div");
    frame.className = "art-frame";
    if (c.image_status === "ok") {
      const img = document.createElement("img");
      img.src = cardImageSrc(c);
      img.alt = c.nome_pt || c.nome;
      img.loading = "lazy";
      img.dataset.fallback = "0";
      img.onerror = () => {
        if (img.dataset.fallback === "0") {
          img.dataset.fallback = "1";
          img.src = prodImageUrl(c.slug);
          return;
        }
        frame.innerHTML = `<span class="missing">sem arte</span>`;
      };
      frame.appendChild(img);
    } else {
      frame.innerHTML = `<span class="missing">sem arte</span>`;
    }
    return frame;
  }
  function renderDeck() {
    const deck = state.deck;
    if (!deck) {
      el.deckSummary.hidden = true;
      el.deckGrid.replaceChildren();
      el.warnings.textContent = "";
      el.genMeta.textContent = "Em Por tipo, escolhe ra\xE7a e/ou atributo; depois gera o deck.";
      syncSaveSeedButton();
      return;
    }
    el.deckSummary.hidden = false;
    el.sumTotal.textContent = String(deck.total);
    el.sumPower.textContent = String(deck.total_deck_power ?? "\u2014");
    el.sumAvg.textContent = String(deck.average_power_tier);
    el.sumMon.textContent = String(deck.composition.monster);
    el.sumSpell.textContent = String(deck.composition.spell);
    el.sumEquip.textContent = String(deck.composition.equip);
    el.sumTrap.textContent = String(deck.composition.trap);
    el.warnings.textContent = deck.warnings.join(" \xB7 ");
    const godsLabel = deck.gods_mode === "gods_3" ? "deuses\xD73" : deck.gods_mode === "gods_2" ? "deuses\xD72" : deck.gods_mode === "gods_1" ? "deuses\xD71" : "sem deuses";
    const tipoLabel = deck.monster_tipo;
    const attrLabel = deck.monster_atributo;
    el.genMeta.textContent = `${deck.archetype_id}` + (tipoLabel ? ` \xB7 tipo ${tipoLabel}` : "") + (attrLabel ? ` \xB7 attr ${attrLabel}` : "") + (!tipoLabel && !attrLabel && deck.libre_axis ? ` \xB7 eixo ${deck.libre_axis}` : "") + ` \xB7 Tier ${deck.target_tier} \xB7 poder ${deck.total_deck_power}` + (deck.include_spells === false ? " \xB7 sem magias" : "") + ` \xB7 ${godsLabel} \xB7 seed ${deck.seed}` + (deck.tags_used.length ? ` \xB7 ${deck.tags_used.slice(0, 6).join(", ")}` : "");
    const frag = document.createDocumentFragment();
    deck.entries.forEach((entry, i) => {
      const c = state.bySlug.get(entry.slug);
      if (!c) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "deck-slot";
      btn.style.animationDelay = `${Math.min(i, 24) * 18}ms`;
      btn.title = `${c.nome_pt} \xD7${entry.copies}`;
      const ban = document.createElement("span");
      ban.className = "ban-card";
      ban.setAttribute("role", "button");
      ban.tabIndex = 0;
      ban.title = "Banir nesta ra\xE7a/atributo (n\xE3o volta a sair)";
      ban.textContent = "\xD7";
      ban.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void banAndRegen(c.slug);
      });
      ban.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.stopPropagation();
          void banAndRegen(c.slug);
        }
      });
      if (entry.copies > 1) {
        const cop = document.createElement("span");
        cop.className = "copies";
        cop.textContent = `\xD7${entry.copies}`;
        btn.appendChild(cop);
      }
      const tier = document.createElement("span");
      tier.className = "tier-pill";
      tier.textContent = `T${c.power_tier ?? "?"}`;
      const name = document.createElement("div");
      name.className = "slot-name";
      name.textContent = c.nome_pt || c.nome;
      btn.append(ban, artNode(c), tier, name);
      btn.addEventListener("click", () => openModal(c.slug));
      frag.appendChild(btn);
    });
    el.deckGrid.replaceChildren(frag);
    syncSaveSeedButton();
  }
  async function banAndRegen(slug) {
    const tipo = el.monsterTipo.value.trim();
    const atributo = el.monsterAttr.value.trim();
    const key = banConfigKey(tipo, atributo);
    el.genMeta.textContent = `A banir ${slug} nesta config\u2026`;
    if (backendAvailable) {
      try {
        const res = await fetch("/api/generation-bans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, atributo, slug })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          if (data.bans?.bans) {
            state.generationBans = { ...data.bans.bans };
          } else {
            const list2 = new Set(state.generationBans[key] || []);
            list2.add(slug.toLowerCase());
            state.generationBans[key] = [...list2];
          }
          runGenerate(state.lastSeed ?? void 0);
          return;
        }
        el.genMeta.textContent = `Falha a banir: ${data.error || res.status}`;
        return;
      } catch {
      }
    }
    const list = new Set(state.generationBans[key] || []);
    list.add(slug.toLowerCase());
    state.generationBans[key] = [...list].sort();
    lsSet(LS_GENERATION_BANS, {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      bans: state.generationBans
    });
    runGenerate(state.lastSeed ?? void 0);
  }
  function filtered() {
    const q = state.q.trim().toLowerCase();
    return state.cards.filter((c) => {
      if (state.rarities.size && !state.rarities.has(c.raridade)) return false;
      if (state.types.size && !state.types.has(c.card_type)) return false;
      if (state.tiers.size && !state.tiers.has(String(c.power_tier ?? 1))) {
        return false;
      }
      if (state.onlyEffect && !c.has_effect) return false;
      if (!q) return true;
      return c.nome.toLowerCase().includes(q) || c.nome_pt.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
    });
  }
  function renderChips(mount, values, selected) {
    mount.innerHTML = "";
    for (const v of values) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = v;
      btn.setAttribute("aria-pressed", selected.has(v) ? "true" : "false");
      btn.addEventListener("click", () => {
        if (selected.has(v)) selected.delete(v);
        else selected.add(v);
        btn.setAttribute("aria-pressed", selected.has(v) ? "true" : "false");
        renderCatalog();
        persistUi();
      });
      mount.appendChild(btn);
    }
  }
  function renderCatalog() {
    const list = filtered();
    el.count.textContent = `${list.length} de ${state.cards.length} cartas`;
    const frag = document.createDocumentFragment();
    for (const c of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-card";
      const meta = document.createElement("div");
      meta.className = "cat-meta";
      meta.innerHTML = `
      <div>${escapeHtml(c.nome_pt || c.nome)}</div>
      <span class="badge ${escapeHtml(c.raridade)}">${escapeHtml(c.raridade)}</span>
      <span class="badge">T${c.power_tier ?? "?"}</span>
      <span class="badge">${escapeHtml(c.card_type)}</span>
    `;
      btn.append(artNode(c), meta);
      btn.addEventListener("click", () => openModal(c.slug));
      frag.appendChild(btn);
    }
    el.grid.replaceChildren(frag);
  }
  function buildEffectRows() {
    const map = /* @__PURE__ */ new Map();
    for (const c of state.cards) {
      const raw = (c.desc_pt || "").trim();
      if (!raw || !c.has_effect) continue;
      const key = effectTextKey(raw);
      const cur = map.get(key);
      if (cur) {
        if (!cur.slugs.includes(c.slug)) cur.slugs.push(c.slug);
      } else {
        map.set(key, { text: raw, slugs: [c.slug] });
      }
    }
    state.effectRows = [...map.entries()].map(([key, v]) => ({
      key,
      text: v.text,
      count: v.slugs.length,
      slugs: v.slugs
    })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  }
  function normalizeSearch(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  }
  function effectSearchTokens(q) {
    return normalizeSearch(q).split(" ").filter((t) => t.length >= 2);
  }
  function effectMatchesQuery(text, tokens) {
    if (!tokens.length) return true;
    const hay = normalizeSearch(text);
    return tokens.every((t) => hay.includes(t));
  }
  function filteredEffectRows() {
    const tokens = effectSearchTokens(state.effectsQ);
    if (!tokens.length) return state.effectRows;
    return state.effectRows.filter((row) => effectMatchesQuery(row.text, tokens));
  }
  function renderEffectCards(mount, slugs) {
    const frag = document.createDocumentFragment();
    for (const slug of slugs) {
      const c = state.bySlug.get(slug);
      if (!c) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "effect-card";
      btn.title = c.nome_pt || c.nome;
      const name = document.createElement("div");
      name.className = "effect-card-name";
      name.textContent = c.nome_pt || c.nome;
      const meta = document.createElement("div");
      meta.className = "effect-card-meta";
      meta.innerHTML = `<span class="badge ${escapeHtml(c.raridade)}">${escapeHtml(c.raridade)}</span><span class="badge">T${c.power_tier ?? "?"}</span>`;
      btn.append(artNode(c), name, meta);
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openModal(c.slug);
      });
      frag.appendChild(btn);
    }
    mount.replaceChildren(frag);
  }
  function renderEffects() {
    const rows = filteredEffectRows();
    const tokens = effectSearchTokens(state.effectsQ);
    el.effectsCount.textContent = tokens.length ? `${rows.length} de ${state.effectRows.length} efeitos` : `${state.effectRows.length} efeitos \xFAnicos`;
    if (state.expandedEffectKey && !rows.some((r) => r.key === state.expandedEffectKey)) {
      state.expandedEffectKey = null;
    }
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const cur = state.effectTiers[row.key] ?? null;
      const expanded = state.expandedEffectKey === row.key;
      const article = document.createElement("article");
      article.className = `effect-row${expanded ? " is-expanded" : ""}`;
      article.dataset.key = row.key;
      article.tabIndex = 0;
      article.setAttribute("role", "button");
      article.setAttribute(
        "aria-expanded",
        expanded ? "true" : "false"
      );
      article.title = expanded ? "Clica para fechar as cartas" : "Clica para ver as cartas deste efeito";
      const toggleExpand = () => {
        state.expandedEffectKey = state.expandedEffectKey === row.key ? null : row.key;
        renderEffects();
        persistUi();
      };
      article.addEventListener("click", (ev) => {
        const t = ev.target;
        if (t.closest(".effect-radios") || t.closest(".effect-cards")) return;
        toggleExpand();
      });
      article.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        const t = ev.target;
        if (t.closest(".effect-radios")) return;
        ev.preventDefault();
        toggleExpand();
      });
      const textEl = document.createElement("div");
      textEl.className = "effect-text-btn";
      textEl.innerHTML = `<p class="effect-text">${escapeHtml(row.text)}</p>`;
      const meta = document.createElement("span");
      meta.className = "effect-meta";
      meta.textContent = `${row.count} carta(s)${expanded ? " \xB7 abertas" : ""}`;
      const radios = document.createElement("div");
      radios.className = "effect-radios";
      radios.setAttribute("role", "group");
      radios.setAttribute("aria-label", "Tier do efeito");
      radios.innerHTML = [3, 4, 5].map(
        (t) => `
          <label class="radio-pill">
            <input type="radio" name="eff-${escapeHtml(row.key)}" value="${t}" ${cur === t ? "checked" : ""} />
            <span>T${t}</span>
          </label>`
      ).join("");
      radios.querySelectorAll("input[type=radio]").forEach((input) => {
        input.addEventListener("change", () => {
          const v = Number(input.value);
          state.effectTiers[row.key] = v;
        });
        input.addEventListener("click", (ev) => ev.stopPropagation());
      });
      article.append(textEl, meta, radios);
      if (expanded) {
        const cardsWrap = document.createElement("div");
        cardsWrap.className = "effect-cards";
        renderEffectCards(cardsWrap, row.slugs);
        article.appendChild(cardsWrap);
      }
      frag.appendChild(article);
    }
    el.effectsList.replaceChildren(frag);
  }
  async function saveEffectTiers() {
    el.effectsStatus.textContent = "A guardar\u2026";
    const body = {
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      tiers: { ...state.effectTiers }
    };
    if (backendAvailable) {
      try {
        const res = await fetch("/api/effect-tiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          el.effectsStatus.textContent = `Guardado (${json.count} efeitos). Volta a gerar decks para aplicar.`;
          return;
        }
        el.effectsStatus.textContent = `Falha: ${json.error || res.status}`;
        return;
      } catch {
      }
    }
    lsSet(LS_EFFECT_TIERS, body);
    const count = Object.keys(body.tiers).length;
    el.effectsStatus.textContent = `Guardado neste navegador (${count} efeitos). Volta a gerar decks para aplicar.`;
  }
  function runGenerate(seed) {
    if (!state.archetypes) {
      el.genMeta.textContent = "Dados em falta. Corre o build (Abrir-Criacao-de-Deck.bat).";
      return;
    }
    const tier = Number(el.tier.value);
    if (tier !== 3 && tier !== 4 && tier !== 5) {
      el.genMeta.textContent = "Escolhe Tier 3, 4 ou 5.";
      return;
    }
    const archId = el.archetype.value || "livre";
    const archEntry = state.archetypes.entries.find((e) => e.id === archId);
    const isPorTipo = Boolean(archEntry?.livre);
    const monsterTipo = el.monsterTipo.value.trim();
    const monsterAtributo = el.monsterAttr.value.trim();
    if (isPorTipo && !monsterTipo && !monsterAtributo) {
      el.genMeta.textContent = "Por tipo: escolhe ra\xE7a e/ou atributo (ex. Aqua, Water).";
      return;
    }
    const godsRaw = el.godsMode.value;
    const godsMode = godsRaw === "gods_1" || godsRaw === "gods_2" || godsRaw === "gods_3" ? godsRaw : "off";
    const result = generateDeck({
      cards: state.cards,
      archetypes: state.archetypes,
      archetypeId: archId,
      targetTier: tier,
      godsMode,
      seed: seed ?? freshSeed(),
      npcCalibration: state.npcCalibration,
      effectTiers: state.effectTiers,
      monsterTipo: isPorTipo ? monsterTipo || null : null,
      monsterAtributo: isPorTipo ? monsterAtributo || null : null,
      includeSpells: Number(el.qtySpell.value) > 0,
      slotTargets: {
        spell: Number(el.qtySpell.value) || 0,
        equip: Number(el.qtyEquip.value) || 0,
        trap: Number(el.qtyTrap.value) || 0
      },
      bannedSlugs: bannedSlugsForCurrentConfig()
    });
    state.deck = result;
    state.lastSeed = result.seed;
    renderDeck();
  }
  var NON_RACE = /* @__PURE__ */ new Set([
    "",
    "spell",
    "trap",
    "equip",
    "field",
    "token"
  ]);
  var NON_ATTR = /* @__PURE__ */ new Set([
    "",
    "spell",
    "trap",
    "equip",
    "field",
    "divine",
    "divine-beast",
    "divine beast"
  ]);
  function fillMonsterTipos() {
    const races = [
      ...new Set(
        state.cards.filter((c) => c.card_type === "Monster").map((c) => (c.tipo || "").trim()).filter((t) => t && !NON_RACE.has(t.toLowerCase()))
      )
    ].sort((a, b) => a.localeCompare(b));
    const keep = el.monsterTipo.value;
    el.monsterTipo.innerHTML = `<option value="">\u2014 ra\xE7a (opcional) \u2014</option>` + races.map(
      (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
    ).join("");
    if (keep && races.includes(keep)) el.monsterTipo.value = keep;
  }
  function fillMonsterAttrs() {
    const attrs = [
      ...new Set(
        state.cards.filter((c) => c.card_type === "Monster").map((c) => (c.atributo || "").trim()).filter((a) => {
          if (!a) return false;
          const n = a.toLowerCase().replace(/[_-]+/g, " ");
          return !NON_ATTR.has(n) && !n.includes("divine");
        })
      )
    ].sort((a, b) => a.localeCompare(b));
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const a of attrs) {
      const n = a.toLowerCase();
      if (seen.has(n)) continue;
      seen.add(n);
      unique.push(a);
    }
    const keep = el.monsterAttr.value;
    el.monsterAttr.innerHTML = `<option value="">\u2014 atributo (opcional) \u2014</option>` + unique.map(
      (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
    ).join("");
    if (keep && unique.some((u) => u.toLowerCase() === keep.toLowerCase())) {
      el.monsterAttr.value = unique.find((u) => u.toLowerCase() === keep.toLowerCase()) || keep;
    }
  }
  function syncTipoVisibility() {
    const id = el.archetype.value || "livre";
    const entry = state.archetypes?.entries.find((e) => e.id === id);
    const show = Boolean(entry?.livre);
    el.fieldMonsterTipo.hidden = !show;
    el.monsterTipo.disabled = !show;
    el.fieldMonsterAttr.hidden = !show;
    el.monsterAttr.disabled = !show;
    if (!show) {
      el.monsterTipo.value = "";
      el.monsterAttr.value = "";
    }
  }
  function fillArchetypes() {
    if (!state.archetypes) return;
    el.archetype.innerHTML = "";
    for (const e of state.archetypes.entries) {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.livre ? "Por tipo" : `${e.label} (${e.slugs.length})`;
      el.archetype.appendChild(opt);
    }
    syncTipoVisibility();
  }
  async function boot() {
    const [invRes, archRes, calRes, effRes, bansRes] = await Promise.all([
      fetch("./data/cards.json"),
      fetch("./data/archetype-index.json"),
      fetch("./data/npc-calibration.json"),
      fetch("/api/effect-tiers").catch(() => null),
      fetch("/api/generation-bans").catch(() => null)
    ]);
    if (!invRes.ok) {
      el.genMeta.textContent = "Falta data/cards.json \u2014 corre o build.";
      return;
    }
    const inv = await invRes.json();
    state.cards = inv.cartas;
    state.bySlug = new Map(inv.cartas.map((c) => [c.slug, c]));
    state.versao = inv.versao;
    if (archRes.ok) {
      state.archetypes = await archRes.json();
    }
    if (calRes.ok) {
      state.npcCalibration = await calRes.json();
    }
    backendAvailable = Boolean(effRes && effRes.ok || bansRes && bansRes.ok);
    if (effRes && effRes.ok) {
      const ef = await effRes.json();
      state.effectTiers = { ...ef.tiers || {} };
    } else {
      try {
        const fr = await fetch("./data/effect-tiers.json");
        if (fr.ok) {
          const ef = await fr.json();
          state.effectTiers = { ...ef.tiers || {} };
        }
      } catch {
      }
      const localEff = lsGet(LS_EFFECT_TIERS, { tiers: {} });
      if (localEff && localEff.tiers) {
        state.effectTiers = { ...state.effectTiers, ...localEff.tiers };
      }
    }
    if (bansRes && bansRes.ok) {
      const bf = await bansRes.json();
      state.generationBans = { ...bf.bans || {} };
    } else {
      try {
        const fr = await fetch("./data/generation-bans.json");
        if (fr.ok) {
          const bf = await fr.json();
          state.generationBans = { ...bf.bans || {} };
        }
      } catch {
      }
      const localBans = lsGet(LS_GENERATION_BANS, {
        bans: {}
      });
      if (localBans && localBans.bans) {
        for (const [k, v] of Object.entries(localBans.bans)) {
          const merged = /* @__PURE__ */ new Set([...state.generationBans[k] || [], ...v]);
          state.generationBans[k] = [...merged];
        }
      }
    }
    fillArchetypes();
    fillMonsterTipos();
    fillMonsterAttrs();
    const saved = loadSavedUi();
    if (saved) {
      if (saved.archetype) el.archetype.value = saved.archetype;
      syncTipoVisibility();
      if (saved.monsterTipo) el.monsterTipo.value = saved.monsterTipo;
      if (saved.monsterAttr) el.monsterAttr.value = saved.monsterAttr;
      if (saved.tier) el.tier.value = saved.tier;
      if (saved.godsMode) el.godsMode.value = saved.godsMode;
      if (typeof saved.qtySpell === "number") el.qtySpell.value = String(saved.qtySpell);
      else if (saved.includeSpells === false) el.qtySpell.value = "0";
      if (typeof saved.qtyEquip === "number") el.qtyEquip.value = String(saved.qtyEquip);
      if (typeof saved.qtyTrap === "number") el.qtyTrap.value = String(saved.qtyTrap);
      el.q.value = saved.q || "";
      state.q = el.q.value;
      el.effectsQ.value = saved.effectsQ || "";
      state.effectsQ = el.effectsQ.value;
      state.expandedEffectKey = saved.expandedEffectKey || null;
      state.rarities = new Set(saved.rarities || []);
      state.types = new Set(saved.types || []);
      state.tiers = new Set(saved.tiers || []);
      state.onlyEffect = Boolean(saved.onlyEffect);
      el.onlyEffect.checked = state.onlyEffect;
      if (saved.effectTiers && typeof saved.effectTiers === "object") {
        state.effectTiers = { ...state.effectTiers, ...saved.effectTiers };
      }
    } else {
      syncTipoVisibility();
    }
    buildEffectRows();
    renderEffects();
    renderChips(
      el.rarityChips,
      sortRarities([...new Set(state.cards.map((c) => c.raridade))]),
      state.rarities
    );
    renderChips(
      el.typeChips,
      [...new Set(state.cards.map((c) => c.card_type))].sort(),
      state.types
    );
    renderChips(el.tierChips, ["1", "2", "3", "4", "5"], state.tiers);
    renderCatalog();
    renderDeck();
    if (saved?.tab) switchTab(saved.tab);
    if (saved?.lastSeed != null && Number.isFinite(saved.lastSeed)) {
      try {
        runGenerate(saved.lastSeed);
      } catch (err) {
        console.warn("Falha a restaurar deck:", err);
      }
    }
    if (saved && typeof saved.scrollY === "number") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, saved.scrollY);
        });
      });
    }
    el.tabCreate.addEventListener("click", () => switchTab("create"));
    el.tabCatalog.addEventListener("click", () => switchTab("catalog"));
    el.tabEffects.addEventListener("click", () => switchTab("effects"));
    el.archetype.addEventListener("change", () => {
      syncTipoVisibility();
      persistUi();
    });
    el.monsterTipo.addEventListener("change", () => persistUi());
    el.monsterAttr.addEventListener("change", () => persistUi());
    el.tier.addEventListener("change", () => persistUi());
    el.godsMode.addEventListener("change", () => persistUi());
    el.qtySpell.addEventListener("change", () => persistUi());
    el.qtyEquip.addEventListener("change", () => persistUi());
    el.qtyTrap.addEventListener("change", () => persistUi());
    el.btnGenerate.addEventListener("click", () => {
      runGenerate(freshSeed());
      persistUi();
    });
    el.btnSaveSeed.addEventListener("click", () => {
      void saveCurrentSeed();
    });
    el.btnSavedSeeds.addEventListener("click", () => {
      const open = Boolean(el.seedsPanel.hidden);
      setSeedsPanelOpen(open);
      if (open) void fetchSavedSeeds();
    });
    el.btnCloseSeeds.addEventListener("click", () => setSeedsPanelOpen(false));
    el.btnSaveEffects.addEventListener("click", () => {
      void saveEffectTiers();
    });
    el.effectsQ.addEventListener("input", () => {
      state.effectsQ = el.effectsQ.value;
      renderEffects();
      persistUi();
    });
    el.q.addEventListener("input", () => {
      state.q = el.q.value;
      renderCatalog();
      persistUi();
    });
    el.onlyEffect.addEventListener("change", () => {
      state.onlyEffect = el.onlyEffect.checked;
      renderCatalog();
      persistUi();
    });
    el.modalClose.addEventListener("click", closeModal);
    el.modalBackdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (!el.modal.hidden) {
        closeModal();
        return;
      }
      if (!el.seedsPanel.hidden) setSeedsPanelOpen(false);
    });
    void fetchSavedSeeds();
    syncSaveSeedButton();
    let scrollTimer = null;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollTimer != null) window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => persistUi(), 120);
      },
      { passive: true }
    );
    window.addEventListener("beforeunload", () => persistUi());
    window.addEventListener("pagehide", () => persistUi());
    setInterval(() => persistUi(), 1500);
  }
  boot().catch((err) => {
    console.error(err);
    el.genMeta.textContent = String(err);
  });
})();
//# sourceMappingURL=app.js.map
