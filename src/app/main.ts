import { deckTotalPower, effectTextKey } from "../lib/card-power.ts";
import { exportDeckToExcel } from "../lib/deck-export.ts";
import { generateDeck } from "../lib/deck-generator.ts";
import {
  copyLimit,
  DECK_SIZE,
  entriesToDeckState,
  removeAllCopies,
  setCopyCount,
  stateToEntries,
  type DeckState,
} from "../lib/deck-rules.ts";
import { RARITY_LABELS, sortRarities } from "../lib/rarity.ts";
import type {
  ArchetypeIndex,
  Card,
  CardsInventory,
  DeckComposition,
  DeckEntry,
  DeckResult,
  EffectTiersFile,
  GenerationBansFile,
  GodsMode,
  NpcCalibration,
  PowerTier,
  SavedDeckEntry,
  SavedDecksFile,
  SavedSeedEntry,
  SavedSeedsFile,
  SelectableTier,
} from "../types/card.ts";

const state = {
  cards: [] as Card[],
  bySlug: new Map<string, Card>(),
  archetypes: null as ArchetypeIndex | null,
  npcCalibration: null as NpcCalibration | null,
  effectTiers: {} as Record<string, 3 | 4 | 5>,
  generationBans: {} as Record<string, string[]>,
  savedSeeds: [] as SavedSeedEntry[],
  loadBanOverride: null as string[] | null,
  effectRows: [] as Array<{
    key: string;
    text: string;
    count: number;
    slugs: string[];
  }>,
  effectsQ: "",
  expandedEffectKey: null as string | null,
  versao: "",
  q: "",
  rarities: new Set<string>(),
  types: new Set<string>(),
  tiers: new Set<string>(),
  onlyEffect: false,
  deck: null as DeckResult | null,
  editableDeck: null as DeckState | null,
  pickerQ: "",
  qtyPopoverSlug: null as string | null,
  savedDecks: [] as SavedDeckEntry[],
  lastSeed: null as number | null,
};

const el = {
  tabCreate: document.getElementById("tab-create")!,
  tabCatalog: document.getElementById("tab-catalog")!,
  tabEffects: document.getElementById("tab-effects")!,
  panelCreate: document.getElementById("panel-create")!,
  panelCatalog: document.getElementById("panel-catalog")!,
  panelEffects: document.getElementById("panel-effects")!,
  archetype: document.getElementById("archetype") as HTMLSelectElement,
  monsterTipo: document.getElementById("monster-tipo") as HTMLSelectElement,
  fieldMonsterTipo: document.getElementById("field-monster-tipo")!,
  monsterAttr: document.getElementById("monster-attr") as HTMLSelectElement,
  fieldMonsterAttr: document.getElementById("field-monster-attr")!,
  qtySpell: document.getElementById("qty-spell") as HTMLSelectElement,
  qtyEquip: document.getElementById("qty-equip") as HTMLSelectElement,
  qtyTrap: document.getElementById("qty-trap") as HTMLSelectElement,
  tier: document.getElementById("tier") as HTMLSelectElement,
  godsMode: document.getElementById("gods-mode") as HTMLSelectElement,
  btnGenerate: document.getElementById("btn-generate")!,
  btnSaveSeed: document.getElementById("btn-save-seed") as HTMLButtonElement,
  btnSavedSeeds: document.getElementById("btn-saved-seeds")!,
  btnCloseSeeds: document.getElementById("btn-close-seeds")!,
  btnSaveDeck: document.getElementById("btn-save-deck") as HTMLButtonElement,
  btnSavedDecks: document.getElementById("btn-saved-decks")!,
  btnCloseDecks: document.getElementById("btn-close-decks")!,
  btnExportDeck: document.getElementById("btn-export-deck") as HTMLButtonElement,
  decksPanel: document.getElementById("decks-panel")!,
  decksList: document.getElementById("decks-list")!,
  decksStatus: document.getElementById("decks-status")!,
  pickerPanel: document.getElementById("card-picker-panel")!,
  pickerQ: document.getElementById("picker-q") as HTMLInputElement,
  pickerList: document.getElementById("picker-list")!,
  pickerStatus: document.getElementById("picker-status")!,
  btnClosePicker: document.getElementById("btn-close-picker")!,
  seedsPanel: document.getElementById("seeds-panel")!,
  seedsList: document.getElementById("seeds-list")!,
  seedsStatus: document.getElementById("seeds-status")!,
  btnSaveEffects: document.getElementById("btn-save-effects")!,
  genMeta: document.getElementById("gen-meta")!,
  warnings: document.getElementById("deck-warnings")!,
  deckGrid: document.getElementById("deck-grid")!,
  deckStage: document.querySelector(".deck-stage") as HTMLElement,
  deckSummary: document.getElementById("deck-summary")!,
  sumTotalItem: document.getElementById("sum-total-item")!,
  sumTotal: document.getElementById("sum-total")!,
  sumPower: document.getElementById("sum-power")!,
  sumAvg: document.getElementById("sum-avg")!,
  sumMon: document.getElementById("sum-mon")!,
  sumSpell: document.getElementById("sum-spell")!,
  sumEquip: document.getElementById("sum-equip")!,
  sumTrap: document.getElementById("sum-trap")!,
  grid: document.getElementById("grid")!,
  count: document.getElementById("count")!,
  effectsList: document.getElementById("effects-list")!,
  effectsCount: document.getElementById("effects-count")!,
  effectsStatus: document.getElementById("effects-status")!,
  effectsQ: document.getElementById("effects-q") as HTMLInputElement,
  q: document.getElementById("q") as HTMLInputElement,
  rarityChips: document.getElementById("rarity-chips")!,
  typeChips: document.getElementById("type-chips")!,
  tierChips: document.getElementById("tier-chips")!,
  onlyEffect: document.getElementById("only-effect") as HTMLInputElement,
  modal: document.getElementById("modal")!,
  modalBackdrop: document.getElementById("modal-backdrop")!,
  modalClose: document.getElementById("modal-close")!,
  modalArt: document.getElementById("modal-art")!,
  modalBody: document.getElementById("modal-body")!,
  btnHelp: document.getElementById("btn-help") as HTMLButtonElement,
  guide: document.getElementById("guide")!,
  guideBackdrop: document.getElementById("guide-backdrop")!,
  guideClose: document.getElementById("guide-close")!,
};

function cacheBust(path: string): string {
  return `${path}?v=${encodeURIComponent(state.versao || "0")}`;
}

// URL das artes no site oficial: usada como fallback quando a arte local
// não existe (ex.: publicação em GitHub Pages sem as .webp no repositório).
const PROD_IMAGE_BASE = "https://forbiddenlegacy.com.br/img/cartas_grande";

function prodImageUrl(slug: string): string {
  return `${PROD_IMAGE_BASE}/${encodeURIComponent(slug)}.webp`;
}

/** No GitHub Pages as artes locais podem não existir — usa o CDN oficial. */
function cardImageSrc(card: { slug: string; image: string }): string {
  const host = typeof location !== "undefined" ? location.hostname : "";
  if (host.endsWith("github.io") || host === "github.io") {
    return cacheBust(prodImageUrl(card.slug));
  }
  return cacheBust(card.image);
}

// Persistência: quando o dev-server (/api/*) está disponível usa-o; caso
// contrário (site estático / GitHub Pages) guarda tudo no localStorage do
// navegador. Definido no boot().
let backendAvailable = false;

const LS_SAVED_SEEDS = "fl_saved_seeds_v1";
const LS_SAVED_DECKS = "fl_saved_decks_v1";
const LS_EFFECT_TIERS = "fl_effect_tiers_v1";
const LS_GENERATION_BANS = "fl_generation_bans_v1";

const EDIT_OPTS = { allowOverSize: true } as const;

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function normBanPart(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Chave de ban: raça|atributo (vazios se não seleccionados). */
function banConfigKey(tipo?: string | null, atributo?: string | null): string {
  return `${normBanPart(tipo || "")}|${normBanPart(atributo || "")}`;
}

function bannedSlugsForCurrentConfig(): string[] {
  if (state.loadBanOverride) return state.loadBanOverride;
  const key = banConfigKey(el.monsterTipo.value, el.monsterAttr.value);
  return state.generationBans[key] || [];
}

function freshSeed(): number {
  return (
    (Date.now() % 1_000_000) +
    Math.floor(Math.random() * 997) +
    1
  );
}

function syncSaveSeedButton(): void {
  el.btnSaveSeed.disabled = !state.deck || state.deck.total <= 0;
}

function syncDeckActionButtons(): void {
  const hasDeck = Boolean(state.editableDeck && state.editableDeck.total > 0);
  el.btnSaveDeck.disabled = !hasDeck;
  el.btnExportDeck.disabled = !hasDeck;
}

function manualEffectMap(): Map<string, PowerTier> {
  const map = new Map<string, PowerTier>();
  for (const [k, v] of Object.entries(state.effectTiers)) {
    if (v === 3 || v === 4 || v === 5) map.set(k, v);
  }
  return map;
}

function computeAveragePowerTier(
  entries: Array<{ slug: string; copies: number }>,
): number {
  let powerSum = 0;
  let n = 0;
  for (const e of entries) {
    const card = state.bySlug.get(e.slug);
    if (!card) continue;
    powerSum += (card.power_tier || 1) * e.copies;
    n += e.copies;
  }
  return n ? Math.round((powerSum / n) * 100) / 100 : 0;
}

function syncEditableFromResult(result: DeckResult): void {
  state.editableDeck = entriesToDeckState(
    result.entries,
    state.bySlug,
    EDIT_OPTS,
  );
}

function buildEditableSnapshot(): {
  entries: DeckEntry[];
  composition: DeckComposition;
  total: number;
  total_deck_power: number;
  average_power_tier: number;
} | null {
  if (!state.editableDeck) return null;
  const entries = stateToEntries(state.editableDeck);
  const manual = manualEffectMap();
  return {
    entries,
    composition: { ...state.editableDeck.typeCounts },
    total: state.editableDeck.total,
    total_deck_power: deckTotalPower(entries, state.bySlug, manual),
    average_power_tier: computeAveragePowerTier(entries),
  };
}

function updateDeckWarnings(): void {
  const snap = buildEditableSnapshot();
  const deck = state.deck;
  if (!snap || !deck) {
    el.warnings.textContent = "";
    return;
  }
  const msgs: string[] = [];
  if (snap.total < DECK_SIZE) {
    msgs.push(`Deck incompleto: ${snap.total}/${DECK_SIZE}`);
  } else if (snap.total > DECK_SIZE) {
    msgs.push(
      `Deck com ${snap.total} cartas (limite oficial: ${DECK_SIZE})`,
    );
  }
  for (const w of deck.warnings) {
    if (!w.startsWith("Deck incompleto")) msgs.push(w);
  }
  el.warnings.textContent = msgs.join(" · ");
}

function applyEditableToDisplay(): void {
  const snap = buildEditableSnapshot();
  const deck = state.deck;
  if (!snap || !deck || !state.editableDeck) return;

  el.sumTotal.textContent = `${snap.total}/${DECK_SIZE}`;
  el.sumTotalItem.classList.remove("is-ok", "is-under", "is-over");
  if (snap.total === DECK_SIZE) el.sumTotalItem.classList.add("is-ok");
  else if (snap.total < DECK_SIZE) el.sumTotalItem.classList.add("is-under");
  else el.sumTotalItem.classList.add("is-over");

  el.sumPower.textContent = String(snap.total_deck_power);
  el.sumAvg.textContent = String(snap.average_power_tier);
  el.sumMon.textContent = String(snap.composition.monster);
  el.sumSpell.textContent = String(snap.composition.spell);
  el.sumEquip.textContent = String(snap.composition.equip);
  el.sumTrap.textContent = String(snap.composition.trap);

  deck.total = snap.total;
  deck.entries = snap.entries;
  deck.composition = snap.composition;
  deck.total_deck_power = snap.total_deck_power;
  deck.average_power_tier = snap.average_power_tier;

  updateDeckWarnings();
  syncDeckActionButtons();
}

function closeAllSidePanels(): void {
  el.seedsPanel.hidden = true;
  el.decksPanel.hidden = true;
  el.pickerPanel.hidden = true;
  el.btnSavedSeeds.setAttribute("aria-expanded", "false");
  el.btnSavedDecks.setAttribute("aria-expanded", "false");
  syncSidePanelBackdrop();
}

function syncSidePanelBackdrop(): void {
  const anyOpen =
    !el.seedsPanel.hidden ||
    !el.decksPanel.hidden ||
    !el.pickerPanel.hidden;
  el.deckStage?.classList.toggle("deck-stage--panel-open", anyOpen);
  const backdrop = document.getElementById("side-panel-backdrop");
  if (backdrop) {
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    backdrop.hidden = !anyOpen || !mobile;
  }
}

function ensureSidePanelBackdrop(): HTMLElement {
  let backdrop = document.getElementById("side-panel-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "side-panel-backdrop";
    backdrop.className = "side-panel-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("click", () => {
      setSeedsPanelOpen(false);
      setDecksPanelOpen(false);
      setPickerPanelOpen(false);
    });
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function setSeedsPanelOpen(open: boolean): void {
  if (open) {
    closeAllSidePanels();
    el.seedsPanel.hidden = false;
    el.btnSavedSeeds.setAttribute("aria-expanded", "true");
  } else {
    el.seedsPanel.hidden = true;
    el.btnSavedSeeds.setAttribute("aria-expanded", "false");
  }
  syncSidePanelBackdrop();
}

function setDecksPanelOpen(open: boolean): void {
  if (open) {
    closeAllSidePanels();
    el.decksPanel.hidden = false;
    el.btnSavedDecks.setAttribute("aria-expanded", "true");
  } else {
    el.decksPanel.hidden = true;
    el.btnSavedDecks.setAttribute("aria-expanded", "false");
  }
  syncSidePanelBackdrop();
}

function nudgePickerImages(): void {
  el.pickerList.scrollTop = 0;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const img of el.pickerList.querySelectorAll("img")) {
        if (!(img instanceof HTMLImageElement)) continue;
        img.loading = "eager";
        if (!img.complete) {
          const src = img.currentSrc || img.src;
          if (src) img.src = src;
        } else {
          void img.decode?.().catch(() => undefined);
        }
      }
    });
  });
}

function setPickerPanelOpen(open: boolean): void {
  if (open) {
    ensureSidePanelBackdrop();
    closeAllSidePanels();
    el.pickerPanel.hidden = false;
    renderPicker();
    nudgePickerImages();
    requestAnimationFrame(() => el.pickerQ.focus());
  } else {
    el.pickerPanel.hidden = true;
  }
  syncSidePanelBackdrop();
}

function closeQtyPopover(): void {
  state.qtyPopoverSlug = null;
  closeAllQtyPopoversDom();
}

function deckWrapSelector(slug: string): string {
  return `[data-slug="${CSS.escape(slug)}"]`;
}

function closeAllQtyPopoversDom(): void {
  for (const pop of el.deckGrid.querySelectorAll(".qty-popover")) pop.remove();
  for (const wrap of el.deckGrid.querySelectorAll(".deck-slot-wrap.is-qty-open")) {
    wrap.classList.remove("is-qty-open");
    wrap
      .querySelector<HTMLElement>(".deck-slot-art")
      ?.setAttribute("aria-expanded", "false");
  }
}

function getDeckWrap(slug: string): HTMLElement | null {
  return el.deckGrid.querySelector(deckWrapSelector(slug));
}

function entryForSlug(slug: string): DeckEntry | null {
  if (!state.editableDeck) return null;
  const copies = state.editableDeck.counts.get(slug) || 0;
  if (copies < 1) return null;
  return { slug, copies };
}

function buildQtyPopoverEl(card: Card, current: number): HTMLElement {
  const pop = document.createElement("div");
  pop.className = "qty-popover";
  pop.setAttribute("role", "group");
  pop.setAttribute("aria-label", "Quantidade de cópias");

  const header = document.createElement("div");
  header.className = "qty-popover-header";

  const label = document.createElement("span");
  label.className = "qty-popover-label";
  label.textContent = "Cópias";

  const stepper = document.createElement("div");
  stepper.className = "qty-stepper";

  const limit = copyLimit(card);

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "qty-step";
  minus.textContent = "−";
  minus.setAttribute("aria-label", "Menos uma cópia");
  minus.disabled = current <= 1;
  minus.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const live = state.editableDeck?.counts.get(card.slug) || current;
    setCardQty(card.slug, live - 1);
  });

  const value = document.createElement("span");
  value.className = "qty-value";
  value.textContent = String(current);
  value.setAttribute("aria-live", "polite");

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "qty-step";
  plus.textContent = "+";
  plus.setAttribute("aria-label", "Mais uma cópia");
  plus.disabled = current >= limit;
  plus.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const live = state.editableDeck?.counts.get(card.slug) || current;
    setCardQty(card.slug, live + 1);
  });

  stepper.append(minus, value, plus);
  header.append(label, stepper);
  pop.appendChild(header);

  if (limit > 1) {
    const quick = document.createElement("div");
    quick.className = "qty-quick";
    quick.setAttribute("role", "group");
    quick.setAttribute("aria-label", "Atalhos de quantidade");
    for (let n = 1; n <= limit; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qty-quick-btn";
      btn.textContent = String(n);
      btn.setAttribute("aria-label", `${n} cópia${n > 1 ? "s" : ""}`);
      btn.setAttribute("aria-pressed", current === n ? "true" : "false");
      if (current === n) btn.classList.add("is-active");
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setCardQty(card.slug, n);
      });
      quick.appendChild(btn);
    }
    pop.appendChild(quick);
  }

  return pop;
}

function attachQtyPopover(wrap: HTMLElement, slug: string): void {
  const card = state.bySlug.get(slug);
  const entry = entryForSlug(slug);
  if (!card || !entry) return;
  wrap.querySelector(".qty-popover")?.remove();
  wrap.classList.add("is-qty-open");
  wrap
    .querySelector<HTMLElement>(".deck-slot-art")
    ?.setAttribute("aria-expanded", "true");
  wrap.appendChild(buildQtyPopoverEl(card, entry.copies));
}

function toggleQtyPopover(slug: string): void {
  if (state.qtyPopoverSlug === slug) {
    closeQtyPopover();
    return;
  }
  closeAllQtyPopoversDom();
  state.qtyPopoverSlug = slug;
  const wrap = getDeckWrap(slug);
  if (wrap) attachQtyPopover(wrap, slug);
}

function updateDeckSlotDom(wrap: HTMLElement, slug: string): void {
  const card = state.bySlug.get(slug);
  const entry = entryForSlug(slug);
  if (!card || !entry) return;

  const artBtn = wrap.querySelector<HTMLButtonElement>(".deck-slot-art");
  if (artBtn) {
    artBtn.title = `${card.nome_pt} ×${entry.copies}`;
  }

  let cop = wrap.querySelector<HTMLElement>(".copies");
  if (entry.copies > 1) {
    if (!cop) {
      cop = document.createElement("span");
      cop.className = "copies";
      artBtn?.insertBefore(cop, artBtn.querySelector(".art-frame"));
    }
    cop.textContent = `×${entry.copies}`;
  } else {
    cop?.remove();
  }

  const nameBtn = wrap.querySelector<HTMLElement>(".slot-name-btn");
  if (nameBtn) nameBtn.textContent = card.nome_pt || card.nome;
}

function setCardQty(slug: string, target: number): void {
  if (!state.editableDeck) return;
  const card = state.bySlug.get(slug);
  if (!card) return;
  const clamped = Math.max(0, Math.min(copyLimit(card), Math.round(target)));
  if (!setCopyCount(card, state.editableDeck, clamped, EDIT_OPTS)) return;

  applyEditableToDisplay();
  renderDeckMeta();

  if (clamped === 0) {
    getDeckWrap(slug)?.remove();
    if (state.qtyPopoverSlug === slug) closeQtyPopover();
    syncSaveSeedButton();
    syncDeckActionButtons();
    return;
  }

  let wrap = getDeckWrap(slug);
  if (!wrap) {
    renderDeckGrid(true);
    wrap = getDeckWrap(slug);
  }
  if (!wrap) return;

  updateDeckSlotDom(wrap, slug);
  if (state.qtyPopoverSlug === slug) attachQtyPopover(wrap, slug);

  syncSaveSeedButton();
  syncDeckActionButtons();
}

function adjustCardQty(slug: string, delta: number): void {
  if (!state.editableDeck) return;
  const current = state.editableDeck.counts.get(slug) || 0;
  setCardQty(slug, current + delta);
}

function renderDeckMeta(): void {
  const deck = state.deck;
  if (!deck || !state.editableDeck) {
    el.deckSummary.hidden = true;
    el.warnings.textContent = "";
    el.genMeta.textContent =
      "Em Por tipo, escolhe raça e/ou atributo; depois gera o deck.";
    return;
  }

  applyEditableToDisplay();
  el.deckSummary.hidden = false;

  const godsLabel =
    deck.gods_mode === "gods_3"
      ? "deuses×3"
      : deck.gods_mode === "gods_2"
        ? "deuses×2"
        : deck.gods_mode === "gods_1"
          ? "deuses×1"
          : "sem deuses";
  const tipoLabel = deck.monster_tipo;
  const attrLabel = deck.monster_atributo;
  el.genMeta.textContent =
    `${deck.archetype_id}` +
    (tipoLabel ? ` · tipo ${tipoLabel}` : "") +
    (attrLabel ? ` · attr ${attrLabel}` : "") +
    (!tipoLabel && !attrLabel && deck.libre_axis
      ? ` · eixo ${deck.libre_axis}`
      : "") +
    ` · Tier ${deck.target_tier} · poder ${deck.total_deck_power}` +
    (deck.include_spells === false ? " · sem magias" : "") +
    ` · ${godsLabel} · seed ${deck.seed}` +
    (deck.tags_used.length
      ? ` · ${deck.tags_used.slice(0, 6).join(", ")}`
      : "");
}

function buildDeckSlotWrap(entry: DeckEntry, index: number): HTMLElement {
  const c = state.bySlug.get(entry.slug);
  if (!c) return document.createElement("div");

  const wrap = document.createElement("div");
  wrap.className = "deck-slot-wrap";
  wrap.dataset.slug = entry.slug;

  const slot = document.createElement("div");
  slot.className = "deck-slot";

  const artBtn = document.createElement("button");
  artBtn.type = "button";
  artBtn.className = "deck-slot-art";
  artBtn.title = `${c.nome_pt} ×${entry.copies}`;
  artBtn.setAttribute("aria-expanded", "false");
  artBtn.setAttribute("aria-label", `Ajustar quantidade de ${c.nome_pt || c.nome}`);
  if (index < 25) artBtn.style.animationDelay = `${index * 18}ms`;

  const removeBtn = document.createElement("span");
  removeBtn.className = "ban-card";
  removeBtn.setAttribute("role", "button");
  removeBtn.tabIndex = 0;
  removeBtn.title = "Remover carta e escolher substituto";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    removeCardAndOpenPicker(c.slug);
  });
  removeBtn.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
      removeCardAndOpenPicker(c.slug);
    }
  });

  if (entry.copies > 1) {
    const cop = document.createElement("span");
    cop.className = "copies";
    cop.textContent = `×${entry.copies}`;
    artBtn.appendChild(cop);
  }

  const tier = document.createElement("span");
  tier.className = "tier-pill";
  tier.textContent = `T${c.power_tier ?? "?"}`;

  artBtn.append(removeBtn, artNode(c), tier);
  artBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleQtyPopover(c.slug);
  });

  const nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.className = "slot-name-btn";
  nameBtn.textContent = c.nome_pt || c.nome;
  nameBtn.title = "Ver detalhes da carta";
  nameBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openModal(c.slug);
  });

  slot.append(artBtn, nameBtn);
  wrap.appendChild(slot);

  if (state.qtyPopoverSlug === c.slug) {
    attachQtyPopover(wrap, c.slug);
  }

  return wrap;
}

function renderDeckGrid(animate = true): void {
  if (!state.editableDeck) {
    el.deckGrid.replaceChildren();
    el.deckGrid.classList.remove("deck-board--animate");
    return;
  }

  const entries = stateToEntries(state.editableDeck);
  const openSlug = state.qtyPopoverSlug;
  const frag = document.createDocumentFragment();
  entries.forEach((entry, i) => {
    frag.appendChild(buildDeckSlotWrap(entry, animate ? i : 0));
  });
  el.deckGrid.replaceChildren(frag);
  el.deckGrid.classList.toggle("deck-board--animate", animate);

  if (openSlug && getDeckWrap(openSlug)) {
    state.qtyPopoverSlug = openSlug;
  } else if (openSlug) {
    state.qtyPopoverSlug = null;
  }
}

function formatSeedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function autoSeedLabel(entry: Pick<SavedSeedEntry, "options" | "seed">): string {
  const o = entry.options;
  const theme =
    o.monsterTipo || o.monsterAtributo
      ? [o.monsterTipo, o.monsterAtributo].filter(Boolean).join("/")
      : o.archetypeId;
  return `${theme} T${o.targetTier} · ${o.slotTargets.spell}/${o.slotTargets.equip}/${o.slotTargets.trap} · #${entry.seed}`;
}

function renderSavedSeeds(): void {
  const seeds = state.savedSeeds;
  el.seedsStatus.textContent = seeds.length
    ? `${seeds.length} seed(s) guardada(s)`
    : "Nenhuma seed guardada ainda.";
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
    const gods =
      o.godsMode === "off"
        ? "sem deuses"
        : o.godsMode.replace("gods_", "") + " deus(es)";
    const meta = document.createElement("p");
    meta.className = "seed-card-meta";
    meta.innerHTML = escapeHtml(
      [
        `Seed ${s.seed} · ${formatSeedDate(s.saved_at)}`,
        `${o.archetypeId}${o.monsterTipo ? ` · ${o.monsterTipo}` : ""}${o.monsterAtributo ? ` · ${o.monsterAtributo}` : ""}`,
        `T${o.targetTier} · ${gods} · Magia ${o.slotTargets.spell} · Equip ${o.slotTargets.equip} · Trap ${o.slotTargets.trap}`,
        `${r.total} cartas · poder ${r.total_deck_power} · tier méd. ${r.average_power_tier}`,
        `M${r.composition.monster} / Mg${r.composition.spell} / Eq${r.composition.equip} / Tr${r.composition.trap}`,
        o.bannedSlugs.length ? `${o.bannedSlugs.length} ban(s)` : "sem bans",
        r.warnings.length ? `${r.warnings.length} aviso(s)` : "sem avisos",
      ].join("\n"),
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

async function fetchSavedSeeds(): Promise<void> {
  if (backendAvailable) {
    try {
      const res = await fetch("/api/saved-seeds");
      const json = (await res.json()) as SavedSeedsFile;
      state.savedSeeds = Array.isArray(json.seeds) ? json.seeds : [];
      renderSavedSeeds();
      return;
    } catch {
      /* fall through para localStorage */
    }
  }
  const local = lsGet<SavedSeedsFile>(LS_SAVED_SEEDS, {
    updated_at: null,
    seeds: [],
  });
  state.savedSeeds = Array.isArray(local.seeds) ? local.seeds : [];
  renderSavedSeeds();
}

function autoDeckLabel(): string {
  const deck = state.deck;
  if (!deck) return `Deck ${new Date().toLocaleDateString("pt-BR")}`;
  const theme =
    deck.monster_tipo || deck.monster_atributo
      ? [deck.monster_tipo, deck.monster_atributo].filter(Boolean).join("/")
      : deck.archetype_id;
  const snap = buildEditableSnapshot();
  return `${theme} · ${snap?.total ?? deck.total} cartas · ${formatSeedDate(new Date().toISOString())}`;
}

function renderSavedDecks(): void {
  const decks = state.savedDecks;
  el.decksStatus.textContent = decks.length
    ? `${decks.length} deck(s) guardado(s)`
    : "Nenhum deck guardado ainda.";
  const frag = document.createDocumentFragment();
  for (const d of decks) {
    const card = document.createElement("article");
    card.className = "seed-card";
    card.setAttribute("role", "listitem");

    const title = document.createElement("p");
    title.className = "seed-card-title";
    title.textContent = d.label;

    const meta = document.createElement("p");
    meta.className = "seed-card-meta";
    meta.innerHTML = escapeHtml(
      [
        `${formatSeedDate(d.saved_at)}`,
        `${d.total} cartas · poder ${d.total_deck_power} · tier méd. ${d.average_power_tier}`,
        `M${d.composition.monster} / Mg${d.composition.spell} / Eq${d.composition.equip} / Tr${d.composition.trap}`,
        d.meta?.seed != null ? `Seed origem ${d.meta.seed}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ).replace(/\n/g, "<br>");

    const actions = document.createElement("div");
    actions.className = "seed-card-actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "btn primary";
    loadBtn.textContent = "Carregar";
    loadBtn.addEventListener("click", () => {
      loadSavedDeck(d);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn ghost";
    delBtn.textContent = "Apagar";
    delBtn.addEventListener("click", () => {
      void deleteSavedDeck(d.id);
    });

    actions.append(loadBtn, delBtn);
    card.append(title, meta, actions);
    frag.appendChild(card);
  }
  el.decksList.replaceChildren(frag);
}

async function fetchSavedDecks(): Promise<void> {
  if (backendAvailable) {
    try {
      const res = await fetch("/api/saved-decks");
      const json = (await res.json()) as SavedDecksFile;
      state.savedDecks = Array.isArray(json.decks) ? json.decks : [];
      renderSavedDecks();
      return;
    } catch {
      /* fall through para localStorage */
    }
  }
  const local = lsGet<SavedDecksFile>(LS_SAVED_DECKS, {
    updated_at: null,
    decks: [],
  });
  state.savedDecks = Array.isArray(local.decks) ? local.decks : [];
  renderSavedDecks();
}

async function saveCurrentDeck(): Promise<void> {
  const snap = buildEditableSnapshot();
  const deck = state.deck;
  if (!snap || !deck) return;

  const entry: SavedDeckEntry = {
    id: crypto.randomUUID(),
    saved_at: new Date().toISOString(),
    label: autoDeckLabel(),
    entries: snap.entries.map((e) => ({ slug: e.slug, copies: e.copies })),
    composition: { ...snap.composition },
    total: snap.total,
    total_deck_power: snap.total_deck_power,
    average_power_tier: snap.average_power_tier,
    meta: {
      archetype_id: deck.archetype_id,
      target_tier: deck.target_tier as SelectableTier,
      gods_mode: deck.gods_mode,
      monster_tipo: deck.monster_tipo ?? null,
      monster_atributo: deck.monster_atributo ?? null,
      seed: deck.seed,
      include_spells: deck.include_spells,
    },
  };

  el.btnSaveDeck.disabled = true;
  el.decksStatus.textContent = "A guardar…";
  if (backendAvailable) {
    try {
      const res = await fetch("/api/saved-decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        decks?: SavedDecksFile;
      };
      if (res.ok && json.ok) {
        if (json.decks?.decks) state.savedDecks = json.decks.decks;
        else state.savedDecks.unshift(entry);
        setDecksPanelOpen(true);
        renderSavedDecks();
        el.decksStatus.textContent = "Deck guardado.";
        syncDeckActionButtons();
        return;
      }
      el.decksStatus.textContent = `Falha: ${json.error || res.status}`;
      syncDeckActionButtons();
      return;
    } catch {
      /* fall through para localStorage */
    }
  }
  state.savedDecks.unshift(entry);
  lsSet(LS_SAVED_DECKS, {
    updated_at: new Date().toISOString(),
    decks: state.savedDecks,
  });
  setDecksPanelOpen(true);
  renderSavedDecks();
  el.decksStatus.textContent = "Deck guardado (neste navegador).";
  syncDeckActionButtons();
}

async function deleteSavedDeck(id: string): Promise<void> {
  el.decksStatus.textContent = "A apagar…";
  if (backendAvailable) {
    try {
      const res = await fetch(`/api/saved-decks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        decks?: SavedDecksFile;
      };
      if (res.ok && json.ok) {
        state.savedDecks =
          json.decks?.decks || state.savedDecks.filter((d) => d.id !== id);
        renderSavedDecks();
        return;
      }
      el.decksStatus.textContent = `Falha: ${json.error || res.status}`;
      return;
    } catch {
      /* fall through para localStorage */
    }
  }
  state.savedDecks = state.savedDecks.filter((d) => d.id !== id);
  lsSet(LS_SAVED_DECKS, {
    updated_at: new Date().toISOString(),
    decks: state.savedDecks,
  });
  renderSavedDecks();
}

function loadSavedDeck(entry: SavedDeckEntry): void {
  const meta = entry.meta;
  if (meta?.archetype_id) el.archetype.value = meta.archetype_id;
  syncTipoVisibility();
  if (meta?.monster_tipo != null) el.monsterTipo.value = meta.monster_tipo;
  if (meta?.monster_atributo != null) el.monsterAttr.value = meta.monster_atributo;
  if (meta?.target_tier) el.tier.value = String(meta.target_tier);
  if (meta?.gods_mode) el.godsMode.value = meta.gods_mode;

  state.editableDeck = entriesToDeckState(entry.entries, state.bySlug, EDIT_OPTS);
  state.deck = {
    archetype_id: meta?.archetype_id || el.archetype.value || "livre",
    target_tier: meta?.target_tier || 3,
    gods_mode: meta?.gods_mode || "off",
    total: entry.total,
    entries: entry.entries.map((e) => ({ ...e })),
    composition: { ...entry.composition },
    average_power_tier: entry.average_power_tier,
    total_deck_power: entry.total_deck_power,
    tags_used: [],
    warnings: [],
    seed: meta?.seed ?? freshSeed(),
    monster_tipo: meta?.monster_tipo ?? undefined,
    monster_atributo: meta?.monster_atributo ?? undefined,
    include_spells: meta?.include_spells,
  };
  if (meta?.seed != null) state.lastSeed = meta.seed;

  renderDeck();
  persistUi();
  el.decksStatus.textContent = `Deck "${entry.label}" carregado.`;
  switchTab("create");
  setDecksPanelOpen(false);
}

function exportCurrentDeck(): void {
  const snap = buildEditableSnapshot();
  const deck = state.deck;
  if (!snap || !deck) return;
  exportDeckToExcel(
    snap.entries,
    state.bySlug,
    {
      total: snap.total,
      composition: snap.composition,
      total_deck_power: snap.total_deck_power,
      average_power_tier: snap.average_power_tier,
      seed: deck.seed,
      label: autoDeckLabel(),
    },
    manualEffectMap(),
  );
}

function filteredPicker(): Card[] {
  const q = state.pickerQ.trim().toLowerCase();
  return state.cards.filter((c) => {
    if (c.card_type === "Field") return false;
    if (!q) return true;
    return (
      c.nome.toLowerCase().includes(q) ||
      c.nome_pt.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q)
    );
  });
}

function renderPicker(): void {
  const list = filteredPicker();
  el.pickerStatus.textContent = `${list.length} de ${state.cards.length} cartas`;
  const frag = document.createDocumentFragment();
  const max = Math.min(list.length, 120);
  for (let i = 0; i < max; i++) {
    const c = list[i];
    const row = document.createElement("article");
    row.className = "picker-row";
    row.setAttribute("role", "listitem");

    const artWrap = document.createElement("div");
    artWrap.className = "picker-row-art";
    artWrap.appendChild(artNode(c, { loading: "eager" }));

    const info = document.createElement("div");
    info.className = "picker-row-info";
    const name = document.createElement("p");
    name.className = "picker-row-name";
    name.textContent = c.nome_pt || c.nome;
    const meta = document.createElement("p");
    meta.className = "picker-row-meta";
    meta.textContent = `${c.card_type} · ${c.raridade} · T${c.power_tier ?? "?"}`;
    info.append(name, meta);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn primary";
    addBtn.textContent = "Adicionar";
    addBtn.addEventListener("click", () => {
      addCardFromPicker(c.slug);
    });

    row.append(artWrap, info, addBtn);
    frag.appendChild(row);
  }
  if (list.length > max) {
    const more = document.createElement("p");
    more.className = "seeds-status";
    more.textContent = `Mostrando ${max} de ${list.length}. Refina a busca.`;
    frag.appendChild(more);
  }
  el.pickerList.replaceChildren(frag);
  if (!el.pickerPanel.hidden) nudgePickerImages();
}

function addCardFromPicker(slug: string): void {
  if (!state.editableDeck) return;
  const card = state.bySlug.get(slug);
  if (!card) return;
  const current = state.editableDeck.counts.get(slug) || 0;
  if (!setCopyCount(card, state.editableDeck, current + 1, EDIT_OPTS)) {
    el.pickerStatus.textContent = `Não foi possível adicionar ${card.nome_pt || card.nome}.`;
    return;
  }
  applyEditableToDisplay();
  renderDeckGrid(true);
  el.pickerStatus.textContent = `${card.nome_pt || card.nome} adicionada.`;
}

function removeCardAndOpenPicker(slug: string): void {
  if (!state.editableDeck) return;
  const card = state.bySlug.get(slug);
  if (!card) return;
  removeAllCopies(card, state.editableDeck);
  closeQtyPopover();
  applyEditableToDisplay();
  renderDeckMeta();
  renderDeckGrid(false);
  state.pickerQ = "";
  el.pickerQ.value = "";
  setPickerPanelOpen(true);
}

async function saveCurrentSeed(): Promise<void> {
  const deck = state.deck;
  if (!deck) return;
  applyEditableToDisplay();
  const snap = buildEditableSnapshot();
  const archId = el.archetype.value || deck.archetype_id || "livre";
  const tier = Number(el.tier.value) as SelectableTier;
  const godsRaw = el.godsMode.value;
  const godsMode: GodsMode =
    godsRaw === "gods_1" || godsRaw === "gods_2" || godsRaw === "gods_3"
      ? godsRaw
      : "off";
  const slotTargets = {
    spell: Number(el.qtySpell.value) || 0,
    equip: Number(el.qtyEquip.value) || 0,
    trap: Number(el.qtyTrap.value) || 0,
  };
  const entry: SavedSeedEntry = {
    id: crypto.randomUUID(),
    saved_at: new Date().toISOString(),
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
        bannedSlugs: bannedSlugsForCurrentConfig(),
      },
    }),
    options: {
      archetypeId: archId,
      targetTier: tier === 3 || tier === 4 || tier === 5 ? tier : deck.target_tier as SelectableTier,
      godsMode: deck.gods_mode || godsMode,
      monsterTipo: deck.monster_tipo || el.monsterTipo.value.trim() || null,
      monsterAtributo:
        deck.monster_atributo || el.monsterAttr.value.trim() || null,
      slotTargets,
      bannedSlugs: [...bannedSlugsForCurrentConfig()],
    },
    result: {
      total: snap?.total ?? deck.total,
      entries: (snap?.entries ?? deck.entries).map((e) => ({
        slug: e.slug,
        copies: e.copies,
      })),
      composition: { ...(snap?.composition ?? deck.composition) },
      total_deck_power: snap?.total_deck_power ?? deck.total_deck_power,
      average_power_tier: snap?.average_power_tier ?? deck.average_power_tier,
      warnings: [...deck.warnings],
      tags_used: [...deck.tags_used],
    },
  };

  el.btnSaveSeed.disabled = true;
  el.seedsStatus.textContent = "A guardar…";
  if (backendAvailable) {
    try {
      const res = await fetch("/api/saved-seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        seeds?: SavedSeedsFile;
      };
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
      /* fall through para localStorage */
    }
  }
  state.savedSeeds.unshift(entry);
  lsSet(LS_SAVED_SEEDS, {
    updated_at: new Date().toISOString(),
    seeds: state.savedSeeds,
  });
  setSeedsPanelOpen(true);
  renderSavedSeeds();
  el.seedsStatus.textContent = "Seed guardada (neste navegador).";
  syncSaveSeedButton();
}

async function deleteSavedSeed(id: string): Promise<void> {
  el.seedsStatus.textContent = "A apagar…";
  if (backendAvailable) {
    try {
      const res = await fetch(`/api/saved-seeds?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        seeds?: SavedSeedsFile;
      };
      if (res.ok && json.ok) {
        state.savedSeeds =
          json.seeds?.seeds || state.savedSeeds.filter((s) => s.id !== id);
        renderSavedSeeds();
        return;
      }
      el.seedsStatus.textContent = `Falha: ${json.error || res.status}`;
      return;
    } catch {
      /* fall through para localStorage */
    }
  }
  state.savedSeeds = state.savedSeeds.filter((s) => s.id !== id);
  lsSet(LS_SAVED_SEEDS, {
    updated_at: new Date().toISOString(),
    seeds: state.savedSeeds,
  });
  renderSavedSeeds();
}

function loadSavedSeed(entry: SavedSeedEntry): void {
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

  state.loadBanOverride = [...(o.bannedSlugs || [])];
  try {
    runGenerate(entry.seed);
  } finally {
    state.loadBanOverride = null;
  }
  persistUi();
  el.seedsStatus.textContent = `Carregada seed ${entry.seed}.`;
  switchTab("create");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function switchTab(tab: "create" | "catalog" | "effects"): void {
  const map = {
    create: { btn: el.tabCreate, panel: el.panelCreate },
    catalog: { btn: el.tabCatalog, panel: el.panelCatalog },
    effects: { btn: el.tabEffects, panel: el.panelEffects },
  } as const;
  for (const [k, v] of Object.entries(map)) {
    const on = k === tab;
    v.btn.classList.toggle("is-active", on);
    v.btn.setAttribute("aria-selected", String(on));
    v.panel.hidden = !on;
    v.panel.classList.toggle("is-active", on);
  }
  persistUi();
}

const SESSION_KEY = "fl_criacao_deck_ui_v1";

type SavedUi = {
  tab: "create" | "catalog" | "effects";
  scrollY: number;
  archetype: string;
  monsterTipo: string;
  monsterAttr: string;
  tier: string;
  godsMode: string;
  includeSpells: boolean;
  qtySpell: number;
  qtyEquip: number;
  qtyTrap: number;
  q: string;
  effectsQ: string;
  expandedEffectKey: string | null;
  rarities: string[];
  types: string[];
  tiers: string[];
  onlyEffect: boolean;
  effectTiers: Record<string, 3 | 4 | 5>;
  lastSeed: number | null;
};

function activeTab(): SavedUi["tab"] {
  if (el.tabCatalog.classList.contains("is-active")) return "catalog";
  if (el.tabEffects.classList.contains("is-active")) return "effects";
  return "create";
}

function collectUi(): SavedUi {
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
    lastSeed: state.lastSeed ?? state.deck?.seed ?? null,
  };
}

function persistUi(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(collectUi()));
  } catch {
    /* ignore quota */
  }
}

function loadSavedUi(): SavedUi | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedUi;
  } catch {
    return null;
  }
}

function openModal(slug: string): void {
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
  const effect =
    c.desc_pt ||
    c.desc_en ||
    "Sem texto de efeito no catálogo (vanilla ou sem desc_*).";

  const tags = (c.effect_tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  const facts: Array<{ k: string; v: string; html?: boolean }> = [
    { k: "Raridade", v: `${c.raridade} — ${rarityName}` },
    { k: "Power Tier", v: String(c.power_tier ?? "—") },
    { k: "Poder (deck)", v: String(c.card_power ?? "—") },
    {
      k: "Pesos",
      v: `efeito ${c.effect_weight ?? "—"} · raridade ${c.rarity_weight ?? "—"} · corpo ${c.body_weight ?? "—"}`,
    },
    { k: "Tipo de carta", v: c.card_type },
    { k: "Raça", v: c.tipo || "—" },
    { k: "Atributo", v: c.atributo || "—" },
  ];
  if (c.nivel) facts.push({ k: "Nível", v: c.nivel });
  if (c.atk) facts.push({ k: "ATK", v: c.atk });
  if (c.def) facts.push({ k: "DEF", v: c.def });
  facts.push({
    k: "Arte",
    v: `<span class="${statusClass}">${escapeHtml(c.image_status)}</span>`,
    html: true,
  });

  el.modalBody.innerHTML = `
    <h2 id="modal-title">${escapeHtml(c.nome_pt || c.nome)}</h2>
    <p class="slug">${escapeHtml(c.nome)} · <code>${escapeHtml(c.slug)}</code></p>
    <div class="tags">${tags || `<span class="tag">vanilla</span>`}</div>
    <dl class="facts">
      ${facts
      .map(
        (f) =>
          `<dt>${escapeHtml(f.k)}</dt><dd>${f.html ? f.v : escapeHtml(f.v)}</dd>`,
      )
      .join("")}
    </dl>
    <p class="effect${c.has_effect ? "" : " empty"}">${escapeHtml(effect)}</p>
  `;
}

function closeModal(): void {
  el.modal.hidden = true;
}

function openGuide(): void {
  el.guide.hidden = false;
  el.btnHelp.setAttribute("aria-expanded", "true");
}

function closeGuide(): void {
  el.guide.hidden = true;
  el.btnHelp.setAttribute("aria-expanded", "false");
}

function artNode(
  c: Card,
  opts?: { loading?: "lazy" | "eager" },
): HTMLElement {
  const frame = document.createElement("div");
  frame.className = "art-frame";
  if (c.image_status === "ok") {
    const img = document.createElement("img");
    img.src = cardImageSrc(c);
    img.alt = c.nome_pt || c.nome;
    img.loading = opts?.loading ?? "lazy";
    img.decoding = opts?.loading === "eager" ? "sync" : "async";
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

function renderDeck(): void {
  const deck = state.deck;
  if (!deck || !state.editableDeck) {
    el.deckSummary.hidden = true;
    el.deckGrid.replaceChildren();
    el.deckGrid.classList.remove("deck-board--animate");
    el.warnings.textContent = "";
    el.genMeta.textContent =
      "Em Por tipo, escolhe raça e/ou atributo; depois gera o deck.";
    syncSaveSeedButton();
    syncDeckActionButtons();
    return;
  }

  renderDeckMeta();
  renderDeckGrid(true);
  syncSaveSeedButton();
  syncDeckActionButtons();
}

function filtered(): Card[] {
  const q = state.q.trim().toLowerCase();
  return state.cards.filter((c) => {
    if (state.rarities.size && !state.rarities.has(c.raridade)) return false;
    if (state.types.size && !state.types.has(c.card_type)) return false;
    if (state.tiers.size && !state.tiers.has(String(c.power_tier ?? 1))) {
      return false;
    }
    if (state.onlyEffect && !c.has_effect) return false;
    if (!q) return true;
    return (
      c.nome.toLowerCase().includes(q) ||
      c.nome_pt.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q)
    );
  });
}

function renderChips(
  mount: HTMLElement,
  values: string[],
  selected: Set<string>,
): void {
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

function renderCatalog(): void {
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

function buildEffectRows(): void {
  const map = new Map<string, { text: string; slugs: string[] }>();
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
  state.effectRows = [...map.entries()]
    .map(([key, v]) => ({
      key,
      text: v.text,
      count: v.slugs.length,
      slugs: v.slugs,
    }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/** Normaliza para pesquisa: minúsculas, sem acentos, espaços colapsados */
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function effectSearchTokens(q: string): string[] {
  return normalizeSearch(q)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function effectMatchesQuery(text: string, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const hay = normalizeSearch(text);
  return tokens.every((t) => hay.includes(t));
}

function filteredEffectRows(): typeof state.effectRows {
  const tokens = effectSearchTokens(state.effectsQ);
  if (!tokens.length) return state.effectRows;
  return state.effectRows.filter((row) => effectMatchesQuery(row.text, tokens));
}

function renderEffectCards(mount: HTMLElement, slugs: string[]): void {
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

function renderEffects(): void {
  const rows = filteredEffectRows();
  const tokens = effectSearchTokens(state.effectsQ);
  el.effectsCount.textContent = tokens.length
    ? `${rows.length} de ${state.effectRows.length} efeitos`
    : `${state.effectRows.length} efeitos únicos`;

  if (
    state.expandedEffectKey &&
    !rows.some((r) => r.key === state.expandedEffectKey)
  ) {
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
      expanded ? "true" : "false",
    );
    article.title = expanded
      ? "Clica para fechar as cartas"
      : "Clica para ver as cartas deste efeito";

    const toggleExpand = () => {
      state.expandedEffectKey =
        state.expandedEffectKey === row.key ? null : row.key;
      renderEffects();
      persistUi();
    };

    article.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest(".effect-radios") || t.closest(".effect-cards")) return;
      toggleExpand();
    });
    article.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const t = ev.target as HTMLElement;
      if (t.closest(".effect-radios")) return;
      ev.preventDefault();
      toggleExpand();
    });

    const textEl = document.createElement("div");
    textEl.className = "effect-text-btn";
    textEl.innerHTML = `<p class="effect-text">${escapeHtml(row.text)}</p>`;

    const meta = document.createElement("span");
    meta.className = "effect-meta";
    meta.textContent = `${row.count} carta(s)${expanded ? " · abertas" : ""}`;

    const radios = document.createElement("div");
    radios.className = "effect-radios";
    radios.setAttribute("role", "group");
    radios.setAttribute("aria-label", "Tier do efeito");
    radios.innerHTML = [3, 4, 5]
      .map(
        (t) => `
          <label class="radio-pill">
            <input type="radio" name="eff-${escapeHtml(row.key)}" value="${t}" ${cur === t ? "checked" : ""} />
            <span>T${t}</span>
          </label>`,
      )
      .join("");
    radios.querySelectorAll("input[type=radio]").forEach((input) => {
      input.addEventListener("change", () => {
        const v = Number((input as HTMLInputElement).value) as 3 | 4 | 5;
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

async function saveEffectTiers(): Promise<void> {
  el.effectsStatus.textContent = "A guardar…";
  const body: EffectTiersFile = {
    updated_at: new Date().toISOString(),
    tiers: { ...state.effectTiers },
  };
  if (backendAvailable) {
    try {
      const res = await fetch("/api/effect-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        count?: number;
      };
      if (res.ok && json.ok) {
        el.effectsStatus.textContent = `Guardado (${json.count} efeitos). Volta a gerar decks para aplicar.`;
        return;
      }
      el.effectsStatus.textContent = `Falha: ${json.error || res.status}`;
      return;
    } catch {
      /* fall through para localStorage */
    }
  }
  lsSet(LS_EFFECT_TIERS, body);
  const count = Object.keys(body.tiers).length;
  el.effectsStatus.textContent = `Guardado neste navegador (${count} efeitos). Volta a gerar decks para aplicar.`;
}

function runGenerate(seed?: number): void {
  if (!state.archetypes) {
    el.genMeta.textContent =
      "Dados em falta. Corre o build (Abrir-Criacao-de-Deck.bat).";
    return;
  }
  const tier = Number(el.tier.value) as SelectableTier;
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
    el.genMeta.textContent =
      "Por tipo: escolhe raça e/ou atributo (ex. Aqua, Water).";
    return;
  }
  const godsRaw = el.godsMode.value;
  const godsMode: GodsMode =
    godsRaw === "gods_1" || godsRaw === "gods_2" || godsRaw === "gods_3"
      ? godsRaw
      : "off";
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
      trap: Number(el.qtyTrap.value) || 0,
    },
    bannedSlugs: bannedSlugsForCurrentConfig(),
  });
  state.deck = result;
  state.lastSeed = result.seed;
  syncEditableFromResult(result);
  renderDeck();
}

const NON_RACE = new Set([
  "",
  "spell",
  "trap",
  "equip",
  "field",
  "token",
]);

const NON_ATTR = new Set([
  "",
  "spell",
  "trap",
  "equip",
  "field",
  "divine",
  "divine-beast",
  "divine beast",
]);

function fillMonsterTipos(): void {
  const races = [
    ...new Set(
      state.cards
        .filter((c) => c.card_type === "Monster")
        .map((c) => (c.tipo || "").trim())
        .filter((t) => t && !NON_RACE.has(t.toLowerCase())),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const keep = el.monsterTipo.value;
  el.monsterTipo.innerHTML =
    `<option value="">— raça (opcional) —</option>` +
    races
      .map(
        (t) =>
          `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`,
      )
      .join("");
  if (keep && races.includes(keep)) el.monsterTipo.value = keep;
}

function fillMonsterAttrs(): void {
  const attrs = [
    ...new Set(
      state.cards
        .filter((c) => c.card_type === "Monster")
        .map((c) => (c.atributo || "").trim())
        .filter((a) => {
          if (!a) return false;
          const n = a.toLowerCase().replace(/[_-]+/g, " ");
          return !NON_ATTR.has(n) && !n.includes("divine");
        }),
    ),
  ].sort((a, b) => a.localeCompare(b));
  // Canonicalize display: prefer Title case unique by norm
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const a of attrs) {
    const n = a.toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(a);
  }
  const keep = el.monsterAttr.value;
  el.monsterAttr.innerHTML =
    `<option value="">— atributo (opcional) —</option>` +
    unique
      .map(
        (t) =>
          `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`,
      )
      .join("");
  if (keep && unique.some((u) => u.toLowerCase() === keep.toLowerCase())) {
    el.monsterAttr.value =
      unique.find((u) => u.toLowerCase() === keep.toLowerCase()) || keep;
  }
}

function syncTipoVisibility(): void {
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

function fillArchetypes(): void {
  if (!state.archetypes) return;
  el.archetype.innerHTML = "";
  for (const e of state.archetypes.entries) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.livre
      ? "Por tipo"
      : `${e.label} (${e.slugs.length})`;
    el.archetype.appendChild(opt);
  }
  syncTipoVisibility();
}

async function boot(): Promise<void> {
  const [invRes, archRes, calRes, effRes, bansRes] = await Promise.all([
    fetch("./data/cards.json"),
    fetch("./data/archetype-index.json"),
    fetch("./data/npc-calibration.json"),
    fetch("/api/effect-tiers").catch(() => null),
    fetch("/api/generation-bans").catch(() => null),
  ]);

  if (!invRes.ok) {
    el.genMeta.textContent = "Falta data/cards.json — corre o build.";
    return;
  }

  const inv = (await invRes.json()) as CardsInventory;
  state.cards = inv.cartas;
  state.bySlug = new Map(inv.cartas.map((c) => [c.slug, c]));
  state.versao = inv.versao;
  if (archRes.ok) {
    state.archetypes = (await archRes.json()) as ArchetypeIndex;
  }
  if (calRes.ok) {
    state.npcCalibration = (await calRes.json()) as NpcCalibration;
  }

  // Se o dev-server respondeu aos /api/*, há backend; caso contrário (site
  // estático / GitHub Pages) a persistência passa a usar o localStorage.
  backendAvailable = Boolean((effRes && effRes.ok) || (bansRes && bansRes.ok));

  if (effRes && effRes.ok) {
    const ef = (await effRes.json()) as EffectTiersFile;
    state.effectTiers = { ...(ef.tiers || {}) };
  } else {
    // fallback: ficheiro estático + edições guardadas no navegador
    try {
      const fr = await fetch("./data/effect-tiers.json");
      if (fr.ok) {
        const ef = (await fr.json()) as EffectTiersFile;
        state.effectTiers = { ...(ef.tiers || {}) };
      }
    } catch {
      /* ignore */
    }
    const localEff = lsGet<EffectTiersFile>(LS_EFFECT_TIERS, { tiers: {} });
    if (localEff && localEff.tiers) {
      state.effectTiers = { ...state.effectTiers, ...localEff.tiers };
    }
  }
  if (bansRes && bansRes.ok) {
    const bf = (await bansRes.json()) as GenerationBansFile;
    state.generationBans = { ...(bf.bans || {}) };
  } else {
    try {
      const fr = await fetch("./data/generation-bans.json");
      if (fr.ok) {
        const bf = (await fr.json()) as GenerationBansFile;
        state.generationBans = { ...(bf.bans || {}) };
      }
    } catch {
      /* ignore */
    }
    const localBans = lsGet<GenerationBansFile>(LS_GENERATION_BANS, {
      bans: {},
    });
    if (localBans && localBans.bans) {
      for (const [k, v] of Object.entries(localBans.bans)) {
        const merged = new Set([...(state.generationBans[k] || []), ...v]);
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
    state.rarities,
  );
  renderChips(
    el.typeChips,
    [...new Set(state.cards.map((c) => c.card_type))].sort(),
    state.types,
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
  el.btnSaveDeck.addEventListener("click", () => {
    void saveCurrentDeck();
  });
  el.btnSavedDecks.addEventListener("click", () => {
    const open = Boolean(el.decksPanel.hidden);
    setDecksPanelOpen(open);
    if (open) void fetchSavedDecks();
  });
  el.btnCloseDecks.addEventListener("click", () => setDecksPanelOpen(false));
  el.btnExportDeck.addEventListener("click", () => exportCurrentDeck());
  el.btnClosePicker.addEventListener("click", () => setPickerPanelOpen(false));
  el.pickerQ.addEventListener("input", () => {
    state.pickerQ = el.pickerQ.value;
    renderPicker();
  });
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
  el.btnHelp.addEventListener("click", openGuide);
  el.guideClose.addEventListener("click", closeGuide);
  el.guideBackdrop.addEventListener("click", closeGuide);
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!el.guide.hidden) {
      closeGuide();
      return;
    }
    if (!el.modal.hidden) {
      closeModal();
      return;
    }
    if (!el.seedsPanel.hidden) setSeedsPanelOpen(false);
    if (!el.decksPanel.hidden) setDecksPanelOpen(false);
    if (!el.pickerPanel.hidden) setPickerPanelOpen(false);
    if (state.qtyPopoverSlug) closeQtyPopover();
  });

  void fetchSavedSeeds();
  void fetchSavedDecks();
  ensureSidePanelBackdrop();
  syncSaveSeedButton();
  syncDeckActionButtons();

  document.addEventListener("click", (ev) => {
    if (!state.qtyPopoverSlug) return;
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const wrap = target.closest(".deck-slot-wrap");
    if (wrap?.getAttribute("data-slug") === state.qtyPopoverSlug) return;
    closeQtyPopover();
  });

  let scrollTimer: number | null = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer != null) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => persistUi(), 120);
    },
    { passive: true },
  );
  window.addEventListener("beforeunload", () => persistUi());
  window.addEventListener("pagehide", () => persistUi());
  // Backup: live reload pode chegar entre eventos; mantem snapshot fresco
  setInterval(() => persistUi(), 1500);
}

boot().catch((err) => {
  console.error(err);
  el.genMeta.textContent = String(err);
});
