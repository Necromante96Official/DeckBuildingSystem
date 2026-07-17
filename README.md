# Criação de Deck

Sistema isolado na raiz do repo. Gera decks de **40 cartas** com sinergia, Power Tier **3 / 4 / 5**, Trap/Equip obrigatórios, Magia opcional e opção Dos Deuses.

**Banlist nunca:** este sistema **não** aplica `deckbuilder.json`. Só: 40 cartas, máx. 3 cópias, deuses 1. O site `montar_deck.html` é outro produto.

## Dificuldade e poder do deck

**Poder da carta** = peso raridade (**N1 / R2 / SR3 / UR4**) + peso efeito (**3 / 4 / 5** se tiver efeito; **0** se vanilla).

**Poder do deck** = soma em todas as cópias.

| Dificuldade | Alvo de poder |
|-------------|---------------|
| Mediano (3) | **140–200** |
| Hard (4) | **210–280** |
| Ultra Hard (5) | **≥300** (sem máximo) |

## Por tipo / atributo vs arquetípico

| Modo | Comportamento |
|------|----------------|
| **Por tipo** | Filtros opcionais **raça** e/ou **atributo** (≥1). Combináveis (AND), ex. Aqua + Water. **100%** dos monstros batem nos filtros. |
| **Arquetípico nomeado** | Pool puro + blacklist cruzada (sem filtro extra) |

Atributo **Divine** não aparece no select (só via Dos Deuses).

**Equips inteligentes (hard):**

- Genéricos (qualquer monstro) → OK.
- `equip_only` / buffs de **raça** ou **atributo** → só se o deck/tema tiver hosts (ex. Burning Spear = FIRE → fora num Aqua sem FIRE; Elf’s Light = Fairy/Light → fora num Water puro).
- Preferência de score para genéricos e equips que encaixem no tema.

**Quotas Magia / Equip / Armadilha:** selects **0–15** cada (defaults 3 / 7 / 6). Se a soma passar do espaço do deck (40 − monstros mínimos), o gerador reduz.

**Anti-sinergia:**

- Wipe tribal (raça ou atributo) contra o próprio tema rejeitado.
- Magias órfãs / Exodia solto rejeitados.

## Quotas

| Tipo | Faixa UI | Cap |
|------|----------|-----|
| Trap | **0–15** | 15 |
| Equip | **0–15** | 15 |
| Magia | **0–15** | 15 |
| Field | **0** | 0 |

## Aba Efeitos

Efeitos únicos em PT-BR; pesquisa por palavras; clique no texto para ver cartas; Tier 3/4/5 + Salvar → `data/effect-tiers.json`.

## Dos Deuses

| Modo | Comportamento |
|------|----------------|
| Sem deuses | Não inclui Obelisk / Slifer / Ra |
| 1 / 2 / 3 deuses | Exactamente N (quais: seed) |

## Abrir

[`Abrir-Criacao-de-Deck.bat`](Abrir-Criacao-de-Deck.bat)

1. Limpa instancia anterior, faz build e sobe `http://127.0.0.1:5177/`
2. Abre o browser sozinho (so a janela CMD do servidor)
3. **Abrir o .bat de novo** = fecha tudo e reinicia
4. **Fechar o separador** = encerra o servidor (~6s)
4. **Live reload:** muda `public/` ou `src/app` / `src/lib` e a página actualiza sozinha, lembrando aba, scroll, controlos e o último deck (seed)

```bash
cd criação-de-deck
npm install
npm run build -- --no-download
npm run dev
```
