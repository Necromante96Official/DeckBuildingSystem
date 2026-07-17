/** Raridade lógica no catálogo do jogo */
export type Rarity = "N" | "R" | "SR" | "UR";

/** Código do ficheiro de badge (N → C) */
export type RarityFile = "C" | "R" | "SR" | "UR";

export type CardType = "Monster" | "Spell" | "Trap" | "Equip" | "Field";

export type ImageStatus = "ok" | "missing" | "orphan_ignored";

/** Power Tier 1 (fraco/vanilla) … 5 (wipe / deuses / bombs) */
export type PowerTier = 1 | 2 | 3 | 4 | 5;

/** Entrada crua do catalogo.json (export do jogo) */
export interface CatalogCardRaw {
  nome: string;
  nome_pt: string;
  slug: string;
  card_type: CardType | string;
  tipo: string;
  atributo: string;
  raridade: Rarity | string;
  raridade_arquivo: RarityFile | string;
  icone_atributo?: string;
  icone_tipo?: string;
  nivel?: string;
  atk?: string;
  def?: string;
  desc_pt?: string;
  desc_en?: string;
}

export interface CatalogSource {
  gerado_de: string;
  versao: string;
  cartas: CatalogCardRaw[];
}

/** Carta normalizada (+ enriquecimento de efeitos / power tier) */
export interface Card {
  slug: string;
  nome: string;
  nome_pt: string;
  card_type: string;
  tipo: string;
  atributo: string;
  raridade: string;
  raridade_arquivo: string;
  icone_atributo?: string;
  icone_tipo?: string;
  nivel?: string;
  atk?: string;
  def?: string;
  desc_pt?: string;
  desc_en?: string;
  has_effect: boolean;
  image: string;
  image_status: ImageStatus;
  /** Tags de efeito (heurística de texto + overrides) */
  effect_tags?: string[];
  effect_weight?: PowerTier;
  rarity_weight?: number;
  body_weight?: number;
  power_tier?: PowerTier;
  /** Poder para soma do deck: raridade(1–4) + efeito(0|3–5) */
  card_power?: number;
  effect_tier_manual?: PowerTier;
}

export interface CardsInventory {
  gerado_de: string;
  versao: string;
  fonte: string;
  gerado_em: string;
  total: number;
  cartas: Card[];
}

export interface InventoryReport {
  gerado_em: string;
  versao: string;
  total_cartas: number;
  com_arte: number;
  sem_arte: number;
  com_efeito: number;
  sem_efeito: number;
  por_raridade: Record<string, number>;
  por_card_type: Record<string, number>;
  por_power_tier?: Record<string, number>;
  missing_images: string[];
  orphan_images: string[];
}

export interface DeckBuilderGroup {
  label: string;
  cor: string;
  max_in_deck: number;
  scope: string;
}

export interface DeckBuilderCardRule {
  grupos: string[];
  limite?: number;
}

export interface DeckBuilderRules {
  gerado_de?: string;
  versao: string;
  limite_padrao: number;
  grupos: Record<string, DeckBuilderGroup>;
  cartas: Record<string, DeckBuilderCardRule>;
}

export interface ArchetypeDef {
  id: string;
  label: string;
  match?: string[];
  seed_slugs?: string[];
  /** Slugs de suporte explícito (não core, mas sinérgico) */
  support_slugs?: string[];
  synergy_tipos?: string[];
  livre?: boolean;
}

export interface ArchetypesFile {
  archetypes: ArchetypeDef[];
}

export interface ArchetypeIndexEntry {
  id: string;
  label: string;
  livre: boolean;
  synergy_tipos: string[];
  slugs: string[];
  support_slugs: string[];
  /** Slugs de todos os outros arquetípicos (blacklist) */
  other_arch_slugs: string[];
}

export interface ArchetypeIndex {
  gerado_em: string;
  entries: ArchetypeIndexEntry[];
}

export interface DeckEntry {
  slug: string;
  copies: number;
}

export interface DeckComposition {
  monster: number;
  spell: number;
  equip: number;
  field: number;
  trap: number;
}

/** Tiers escolhíveis pelo utilizador */
export type SelectableTier = 3 | 4 | 5;

/** Modo dos deuses egípcios: off ou contagem exacta 1–3 (quais são aleatórios) */
export type GodsMode = "off" | "gods_1" | "gods_2" | "gods_3";

export interface NpcStrengthRow {
  equip_avg: number;
  trap_avg: number;
  spell_avg: number;
  equip_target: number;
  trap_target: number;
  spell_target: number;
  boss_density: number;
  sample_size: number;
}

export interface NpcCalibration {
  source: string;
  generated_at: string;
  notes?: string;
  by_strength: Record<string, NpcStrengthRow>;
  tier_map: Record<string, string>;
}

export interface EffectTiersFile {
  updated_at?: string;
  /** chave = effectTextKey(desc_pt) → 3|4|5 */
  tiers: Record<string, 3 | 4 | 5>;
}

/** Bans permanentes por configuração raça|atributo (normalizados). */
export interface GenerationBansFile {
  updated_at?: string;
  /** chave = "tipo|atributo" → lista de slugs banidos */
  bans: Record<string, string[]>;
}

/** Snapshot de uma geração guardada (seed + inputs + resultado). */
export interface SavedSeedEntry {
  id: string;
  saved_at: string;
  seed: number;
  label?: string;
  options: {
    archetypeId: string;
    targetTier: SelectableTier;
    godsMode: GodsMode;
    monsterTipo: string | null;
    monsterAtributo: string | null;
    slotTargets: { spell: number; equip: number; trap: number };
    bannedSlugs: string[];
  };
  result: {
    total: number;
    entries: DeckEntry[];
    composition: DeckComposition;
    total_deck_power: number;
    average_power_tier: number;
    warnings: string[];
    tags_used: string[];
  };
}

export interface SavedSeedsFile {
  updated_at?: string | null;
  seeds: SavedSeedEntry[];
}

export interface DeckResult {
  archetype_id: string;
  target_tier: PowerTier;
  gods_mode: GodsMode;
  total: number;
  entries: DeckEntry[];
  composition: DeckComposition;
  average_power_tier: number;
  /** Soma raridade+efeito em todas as cópias */
  total_deck_power: number;
  tags_used: string[];
  warnings: string[];
  seed: number;
  /** Raça fixa no modo Por tipo (ex. Dragon) */
  libre_axis?: string;
  monster_tipo?: string;
  monster_atributo?: string;
  include_spells?: boolean;
}
