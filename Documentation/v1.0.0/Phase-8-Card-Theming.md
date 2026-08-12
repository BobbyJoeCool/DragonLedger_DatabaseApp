# Phase 8 — Card Component Theming System: Design Notes

> Part of the `Documentation/v1.0.0/` phase-document set — see
> `v1.0.0-Roadmap.md` for the build-plan checklist and task log this design
> rationale supports. Consolidated from `phase-8-card-theming-final-export.md`,
> `card-design-spec.md`, and `card-design-data-examples.md` — the latter two
> were the field/data reference this phase's design session was built from,
> originally compiled for Phase 5 but never actually consumed until this
> phase. Implementation log, including the real bug found post-launch in the
> CSS structure this document specifies: `DevTools/Notes/v0.7.notes.md`,
> `v0.8.notes.md`, and `v1.0.notes.md`.

---

# DragonLedger DatabaseApp — Card Component System Handoff

> **Purpose of this document:** consolidates ~9 separate demo HTML files built
> across a long design-only chat session into one implementation-ready spec.
> Each demo file proved out one card type or one layout decision in
> isolation; none of them share real code with each other. This document
> defines the shared component/utility layer they all imply, so Claude Code
> can build it once as real React components rather than re-deriving each
> card from scratch. Source demo files (for visual reference only — not
> shipped as-is): `DragonLedger_CardWidthLogic.html`,
> `DragonLedger_CardThemeSystem.html`, `DragonLedger_SimpleCards.html`,
> `DragonLedger_TradingCardSheet.html`, `DragonLedger_RaceSubrace.html`,
> `DragonLedger_ClassSubclass.html`, `DragonLedger_MonsterSpellPacket.html`.

---

## 1. Shared components

### 1.1 Shell / Page

Print target is US Letter (8.5in × 11in). Every card type computes against
the same inner content cap:

```
PAGE_INNER_MAX = 11*96 - 2*(0.5in*96) - 2*(frame padding) - safety margin
```

(`0.5in` page margin each side, plus whatever the `.frame`'s own border/padding
consumes — this varied slightly file to file, ~14px padding + a few px
safety margin; standardize on one constant in the real component rather than
recomputing per card type.)

Two rendering targets:
- **`.page`** — a single capped Letter-sized sheet, used when a card must fit
  in one physical page (Monster list view, Class/Race list view, simple
  cards).
- **`.document`** — an uncapped flowing container, used when content is
  explicitly allowed to spill across multiple pages (Race/Class Expanded
  mode, the Monster+Spellcasting packet). Print CSS still paginates this via
  `break-inside`/`page-break-inside` on individual blocks; there's no
  artificial page-cap on the container itself.

`.frame` is the bordered card box inside either target — 2.5px solid border,
1px outline offset 4px (the "double rule" book-page look), `overflow:hidden`,
`break-inside:avoid`/`page-break-inside:avoid`.

**Real bug found post-launch (v1.0.0), fixed:** the theme's background color
and parchment texture were originally painted on `CardThemeProvider`'s own
wrapper `<div>` (which scopes the CSS custom properties), not on `.frame`
itself. That wrapper isn't width-constrained the way `.frame`/`.dl-shell-page`
are, so the background bled edge-to-edge of the page instead of stopping at
the card's own border. Fixed by moving the background/color paint (and the
parchment texture, converted to a `::after` pseudo-element) onto `.frame`
(and `.dl-tc-card` for trading cards) directly — see
`DevTools/Notes/v1.0.notes.md`.

### 1.2 ThemeProvider

Token schema — 5 color custom properties + 2 font slots:

```css
--bg, --accent, --ink, --muted, --rule
--font-display, --font-body
```

**Three locked presets**, fonts/texture/dividers non-editable on these:

| Preset | bg | accent | Fonts | Notes |
|---|---|---|---|---|
| Parchment | `#E4D5A7` | `#7A1E1E` | Almendra SC / EB Garamond | procedural SVG turbulence texture, red rule frame |
| Scribe's Copy | `#FFFFFF` | `#1F3A5F` | IBM Plex Sans / EB Garamond | grayscale-safe, outlined (not filled) corner tab |
| Grimoire | `#0A0A0A` | `#D3A94E` | Cinzel / EB Garamond | dark bg; **print CSS must auto-flip to an ink-safe light fallback**, dark backgrounds aren't print-safe |

**Custom theme builder — confirmed app-wide scope** (one global settings
surface, not per-card-type). Not yet built at that scope; only demonstrated
once, standalone, in `DragonLedger_CardThemeSystem.html`. Custom themes get
the 5 color slots applied to a neutral shell (closest to Scribe's Copy's
plain structure), default fonts, no texture — deliberately safer/print-
friendlier by construction than the locked presets. **Still not built as of
v1.0.0** — the data model exists in `ThemeProvider`, no settings page exists
to build a `custom` theme.

**Print-safety guardrails** (non-blocking warnings, shown to the user
building a custom theme, not enforced):
- WCAG contrast ratio check: bg vs. ink/accent/muted/rule pairs, thresholds
  4.5:1 / 3:1 / 1.5:1.
- Grayscale-collision check: simulated luma `0.299R + 0.587G + 0.114B`;
  warns if two colors' grayscale values differ by <25/255 — catches colors
  that look distinct on screen but merge together when printed B&W.

### 1.3 Divider

Two variants only:
- **Major (tapered)** — 6px tall, `background:var(--accent)`,
  `clip-path:polygon(0% 50%,6% 0%,94% 0%,100% 50%,94% 100%,6% 100%)`. Used
  once per card, between header and body.
- **Minor (section)** — 3px, no taper, `var(--rule)` color, class
  `.divider.section`. Used for every other section boundary.

Spanning dividers (`column-span:all` inside a multi-column context) force a
clean column-balance restart and are always full-width blocks — never
suppressed. Non-spanning dividers that happen to land exactly at a column
start/end are hidden post-layout via a JS pass:

```js
function suppressEdgeDividers(){
  // for each .divider.section:not(.span), compare
  // getBoundingClientRect().left against column-start/end positions;
  // if it lands on an edge, set visibility:hidden (not display:none,
  // to avoid a reflow) so the break still happens but no stray line shows.
}
```

### 1.4 Subcard

Bordered, corner-tabbed mini-card. Same visual pattern reused verbatim
across three different contexts — the only thing that changes is the tab
label and the content inside:

| Used by | Tab label | Content |
|---|---|---|
| Race → Subrace (Expanded mode) | `Subrace` | full nested subrace card |
| Class/Subclass (Expanded mode) | `Class` / `Subclass` | one feature (grouped) per subcard |
| Monster+Spellcasting packet | `Spell` | one spell per subcard, grouped under a level heading |

```
<Subcard tabLabel="Subclass">
  {children}
</Subcard>
```

CSS: `border:1.5px solid var(--rule); position:relative;
break-inside:avoid; page-break-inside:avoid;` with the tab absolutely
positioned at `top:-9px` — **this needs real vertical clearance above it**
(row-gap or a preceding heading's margin-bottom must be ≥ the tab's
negative offset, or the tab visually collides with whatever is above it).
This bit a real production bug during the demo phase — build it as part of
the component's own layout contract, not something each call site has to
remember.

### 1.5 `useFitToPage(naturalHeightPx, mode)`

One hook, two tier-sets selected by `mode`:

**`mode: 'monster'`** — 3-tier width + scale decision:
1. Try **half-width single column** — must fit under `PAGE_INNER_MAX * 0.55`
   (a half card must leave room to pair with a second half card on the same
   physical page, not just fit under the full-page cap on its own).
2. Else try **full-width two-column** — must fit under `PAGE_INNER_MAX`.
3. Else **full-width, scaled down** — floor scale `0.55`, never smaller. A
   monster that still doesn't fit at 55% is accepted to render slightly
   taller than one physical page rather than silently clipping data.

User can override Auto with an explicit Half/Full choice; the override still
falls through to tier 3's safety net if needed.

**`mode: 'document'`** — 2-tier decision, used by Class and Race list views:
1. Try **natural size on one page**.
2. Try **scale to fit one page**, must be ≥ floor `0.55`.
3. Else **fall back to a flowing multi-page document**:
   `scale = max(PAGE_INNER_MAX * 2 / naturalH, 0.55)`, reporting the actual
   page count achieved. (Currently hardcoded to a 2-page target in the
   demos; the real hook should probably just keep adding pages until scale
   clears the 0.55 floor, rather than assuming 2 is always enough.)

Both modes share the same floor constant (`0.55`) — standardize this as one
exported constant, not a magic number repeated per card type.

---

## 2. Shared utilities

### `grantShapeToText(shape)`
Renders the "Fixed/Choice Grant Shape" schema pattern
(`{fixed, choices:[{type:'select'|'distribute',...}]}`) as display text.
Proven across 3 real uses: Background proficiencies/abilityBonuses, Race
(Drow's innate-spell trait), Class (skillChoices, Totem Spirit subclass
feature's animal choice).

### `parseFeatDescription(description)`
Real `ContentFeat` rows (Compendium-sourced, the dominant source) fold each
named sub-benefit into `description` as a `\t`-prefixed line rather than a
structured array — the schema's `benefits[]` key is Open5e-only and isn't
populated on Compendium rows. Splits `description` into `{intro[], benefits:
[{name, text}]}`, splitting each tab-prefixed line at its first `". "`.

### `parseDescriptionBlocks(text)` / `splitSentences(text)` / segment-pagination trio
General-purpose (not spell-specific) list detection: numbered (`1.`/`1)`) or
bulleted (`-`/`*`/`•`) consecutive lines in any description render as real
`<ol>`/`<li>` or `<ul>`/`<li>`. Feeds into the Trading Card greedy
pagination system (`buildSegments`/`segmentsToHTML`), which fills a card
with as much content as fits, spills overflow to a "(cont.)" card, and
resumes list numbering correctly via `start="N"` if a list splits across
cards. The "At Higher Levels" heading is bonded atomically to its first
sentence so it can never be stranded alone at a card's bottom.

### `groupFeatures(rows)`
`ContentClassFeature` is a real relation table, one row per **level** (not
grouped) — recurring features like Ability Score Improvement appear as one
row per level they occur on. This groups rows back together by
`name + description` for display, collecting `levels: [...]`. Reused
identically for both class-level and subclass-level rows.

### Orphaned-parent fallback convention
Both `ContentSubclass.classId` and `ContentSubrace.raceId` are nullable
(`onDelete: SetNull`), with `extraData.unresolvedClassName` /
`extraData.unresolvedRaceName` as the only trace of intent when resolution
fails on import. Since both types are normally only reached by drilling into
their parent's card, an orphaned row has no parent page to nest under — it
must render standalone. Convention, built identically both places:
- Standalone `.frame`/`.page`, no parent-context tab.
- Meta line shows `<span style="color:var(--muted);font-style:italic">{unresolvedName} (unresolved — not linked to a {class/race} record)</span>`
  instead of a link.
- Everything else (traits/features) renders the same as the linked case.

---

## 3. Per-type field components

Each of these composes the shared pieces above; only the field mapping is
type-specific.

| Type | Shell mode | Fit mode | Uses Subcard? | Notable shared-utility usage |
|---|---|---|---|---|
| Spell | `.page` (list) / trading card (2.5×3.5in grid) | n/a for trading card (greedy pagination instead) | no | `parseDescriptionBlocks`, segment pagination, `spellFooterFromExtraData` (see §4 dependency note) |
| Item | `.page` (list) / trading card | same as Spell | no | branches hard on `itemType` — weapon fields vs. wondrous-item fields populate almost disjoint sets; hide-when-empty, don't reserve fixed layout space |
| Condition | `.page`, single column | n/a (always simple) | no | **no live data exists yet** — see §4 |
| Feat | `.page`, single column | n/a | no | `parseFeatDescription` |
| Background | `.page`, single column | n/a | no | `grantShapeToText`; `feature[]` is empty on real 2024-style rows, falls back to `extraData.grantedFeat.name` (bare string, not an FK — display as name + "see Feat entry" note, don't assume inline detail) |
| Race | `.page` (List) / `.document` (Expanded) | `document` | yes (Expanded mode) | trait count/shape varies 4×–11× by source; orphaned-Subrace fallback |
| Subclass | reached from Class card, or standalone if orphaned | `document` (as part of Class) | yes (Expanded mode) | `groupFeatures`, orphaned-parent fallback |
| Class | `.page` (List) / `.document` (Expanded) | `document` | yes (Expanded mode, both class + subclass features) | `groupFeatures`, `grantShapeToText`; `description` is empty string on every Open5e-sourced row — hide the block, don't reserve space |
| Monster | `.page`, width auto-decided | `monster` | no (own image-row layout instead) | per-section independent multi-column (`.section-cols.c1`/`.c2`, **not** one shared multi-column flow — this was a real cross-browser bug fix, see §5); image support gated to full-width only |
| Monster + Spellcasting packet | `.document` | `monster` (for the monster block) + natural flow (for the appendix) | yes (spell subcards, grouped by level) | monster keeps its own independent fit-to-page scaling at the top of one shared flowing container; appendix begins in normal flow right after, landing same-page or next-page with no special logic needed |

`ContentClassOption` is explicitly excluded — Browse/card treatment is an
open question upstream of this doc, not decided here. **Still unbuilt as of
v1.0.0.**

---

## 4. Open dependencies — flagged, not resolved in the original session

1. **Source-priority dedupe setting doesn't exist yet.** Decision made:
   duplicate same-named rows across sources (e.g. "Champion" from both
   Open5e and PHB 2024) dedupe by name, with the winner picked by a
   user-configurable source-priority ranking. Default ranking: **Open5e
   ranked above Compendium**. **Homebrew (`MANUAL`-type sources) is exempt
   from the collapse and always shows as its own entry**, even alongside a
   same-named official version. The ranking itself needs a small settings
   surface (a reorderable source-priority list) that doesn't exist anywhere
   in the app yet. The card components don't need to know about any of
   this — they just render whatever single row (or homebrew row) the
   upstream query already resolved. **Resolved for the one case that
   actually got built (Monster+Spellcasting packet's spell-name matching):
   reuses `Source.type` directly as the priority order (`API` < `FILE` <
   `MANUAL`) — no separate ranking table needed, since the enum already
   encodes exactly Open5e-vs-Compendium-vs-homebrew. The real, user-facing
   reorderable settings UI is still unbuilt as of v1.0.0.**
2. **`ContentCondition` has zero live rows**, despite the Open5e import job
   explicitly including `CONDITION` and reporting `status: COMPLETED`. Not
   an errored/skipped job — it completed and produced nothing. Flag to
   whoever owns the import pipeline before assuming Condition data will
   show up "eventually, same as the others." The Condition card itself is
   low-risk/minimal, so this isn't urgent, just unverified. **Still zero
   rows as of v1.0.0** — confirmed a real, accepted upstream Open5e data
   gap, not this app's bug (see `Phase-2-Open5e-Import.md`).
3. **`spellFooterFromExtraData(extraData)`** — implemented in
   `DragonLedger_TradingCardSheet.html` as a real function, not just a
   warning: only renders "Damage" if `damageRoll` **and** `damageTypes[]`
   are both present, "Save" if `savingThrow` present, "Area" if `shapeType`
   **and** `shapeSize` are both present. This exists because `extraData`
   carries leftover keys even on non-damage spells (e.g. `Guidance` has a
   stray `damageRoll: '1d4'` despite being a pure buff) — a naive "show the
   key if it exists" binding would produce a wrong footer. Port this
   function as-is; don't rebuild the logic from scratch against the real
   API. **Built as designed** — see the real Guidance/Fireball/Prismatic
   Spray test cases in the implementation log.
4. **Matching a monster's stored spell names against real `ContentSpell`
   records** (for the Monster+Spellcasting packet) is a read-API/data-
   fetching concern, unresolved here — the packet's layout doesn't care how
   the spell list gets assembled, only that it arrives grouped by level.
   **Built** (`useSpellNameIndex`, case-insensitive matching against
   `?fields=all` — a deliberate scope override of item 5 below, done at the
   user's explicit request in the final Phase 8 session).
5. **`ContentClassOption` Browse/card treatment** — excluded from this
   entire card system per the original design brief; still open upstream.
   **Still unbuilt as of v1.0.0.**

---

## 5. Decision log (consolidated)

- Three locked theme presets: **Parchment**, **Scribe's Copy**, **Grimoire**
  (Grimoire auto-flips to a light print fallback).
- Card box height hugs content naturally; never fixed-height.
- Monster width/scale: 3-tier (half/full/scaled), floor 0.55, user override
  falls through to the scale-down safety net.
- **Per-section independent multi-column containers**, not one shared
  multi-column flow — a real cross-browser bug (`column-span:all` headers
  breaking against asymmetric column heights, causing visual overlap)
  required each section (Stat Block, Traits, Actions, Legendary, Lair) to
  own its own `.section-cols` container.
- Divider system: one tapered major divider (header→body only), one minor
  section divider for every other boundary; AC/HP/Speed→abilities uses the
  major divider (non-spanning); the column break to saves/skills/senses uses
  a forced `break-before:column` with **no divider at all** — the column gap
  itself is the separator.
- Non-spanning dividers that land on a column edge are hidden via
  `suppressEdgeDividers()` (visibility, not display, to avoid reflow).
- Monster images: full-width cards only, never half-width; gated by
  `m.image && showImagesEnabled && width==='full'`. Toggle is currently
  global; per-monster override is a flagged future decision, not built.
- Custom theme builder confirmed **app-wide** scope, not per-card-type.
- Simple cards (Spell/Item/Condition/Feat/Background list view): always
  single-column, no half/full tiering — not needed for this content shape.
- Trading card: real 2.5×3.5in dimensions, 3×3 grid, dashed cut guides on
  screen and print. Never shrinks text to fit — greedy pagination with
  "(cont.)" spillover cards instead. Footer height reserved before
  description fills, so footer never spills.
- Race Expanded mode is explicitly allowed to span multiple pages (a "small
  document," not a capped card) — full subrace cards can't be legibly
  shrunk further.
- Class/Race list-mode general rule: **prefer one page**, scale to the 0.55
  floor, only fall back to a capped flowing multi-page layout if the floor
  isn't enough.
- Class Expanded mode: every feature (grouped) gets its own half-width
  subcard, "every feature across all levels," not just levels with new
  content.
- Duplicate rows across sources: dedupe by name via a user-configurable
  source-priority setting, Open5e ranked above Compendium by default,
  homebrew always exempt from collapse.
- List-line bolded headings (e.g. Feat sub-benefit names) use
  `color:var(--accent)`, not the default ink color — this was a real fix
  applied late in the session; make sure it's the base style for this
  element, not a per-theme override.

---

## 6. Implementation instructions for Claude Code (historical — already executed)

1. Set up the shared component directory (`client/src/components/cards/shared/`)
   with `Shell`, `ThemeProvider`, `Divider`, `Subcard`, and the `useFitToPage`
   hook as described in §1. Export the `0.55` floor constant from one place.
2. Port the utilities in §2 (`grantShapeToText`, `parseFeatDescription`,
   `parseDescriptionBlocks`/`splitSentences`/segment-pagination,
   `groupFeatures`, `spellFooterFromExtraData`) as pure functions in
   `src/components/cards/shared/utils.ts`, with unit tests against the real
   example rows quoted in §3/§4 (Fireball, Guidance, and Prismatic Spray for
   the footer function; Alert for the feat parser; Barbarian's real
   feature rows for `groupFeatures`).
3. Build the orphaned-parent fallback (§2) as one shared presentational
   pattern, used by both Subclass and Subrace — don't let it drift into two
   slightly different implementations.
4. Build each per-type field component per §3, composing the shared pieces
   — do not reimplement fit-to-page, dividers, or subcards per type.
5. Do **not** build the Item/Class/Background field-completeness gaps beyond
   what's specified here (e.g. Item's full `extraData` surface, Background's
   `extraData.equipment` rendering) without checking back against the live
   schema first.
6. Leave `ContentClassOption` unbuilt — no card, no Browse entry — until the
   upstream open question is resolved.
7. Do not build the source-priority settings UI, the app-wide custom theme
   builder UI, or the Monster-spell-matching read API as part of this card
   work — flag them as separate tickets per §4. (**The Monster-spell-matching
   read API was explicitly greenlit and built anyway, in the final Phase 8
   session — see §4 item 4.**)
8. Once components are built, do a visual pass against all 3 theme presets
   for each type, specifically re-checking the Subcard tab vertical
   clearance (§1.4) and the Grimoire print fallback (§1.2) — both were real
   bugs during the demo phase and are easy to reintroduce with a fresh
   implementation.

---

# DragonLedger — Content Card Design Specification (Data Reference)

**What "card" means here:** the **full-content, printable** display for a
single record, shown once a user selects it (from the Browse results table —
see note below). This is what the v1.0.0 Roadmap calls `<Type>DetailFields`.
It shows the **entire record**, not a summary — and it must be printable.

**What "card" does *not* mean here:** the searchable/selectable list on the
Browse screen is a **table**, not cards — that's a separate piece of UI
(Phase 5). Nothing in this document concerns table/column design.

**This document is a data reference only.** It exists so a design session
(originally intended to run on Claude Mobile, ahead of this Phase 8 session
actually consuming it) has every field available per content type in one
place, without needing this codebase open. **It deliberately contains no
layout, grouping, visual-treatment, or "which fields matter most" opinions**
— every decision about how a type's card looks belongs to the session that
consumed this reference (documented in Sections 1–6 above), not to this
document. Where a note below states a data fact (a field is usually null, a
field only has meaning in combination with another), that's included because
it's necessary to represent the data correctly, not as a layout suggestion.

**Source of truth this was compiled from:**
`Documentation/v1.0.0/FlowCharts_ERDs/dragonledger-master-schema.md`
(field-by-field schema + worked examples) and the v1.0.0 Roadmap's Appendix
A. If this document and the master schema ever disagree, the master schema
wins.

---

## 1. App Context (factual)

DragonLedger is a local, single-user desktop app (Electron-packaged) for
managing D&D 5e reference content — spells, classes, races, monsters, items,
etc. — imported from the Open5e API and a Compendium XML file, or hand-entered
as homebrew. Every record belongs to a named **Source** (`API` / `FILE` /
`MANUAL`) and carries a `slug` unique within that source.

Frontend stack: React 19 + Vite + TypeScript, Tailwind CSS v4 (CSS-first
config, no `tailwind.config.js`), shadcn/ui. Cards are implemented as
ordinary React components in this stack.

**Stated requirements (from the person who requested this document, not
inferred):**
- Each card shows the **full record** for its type — no field is out of
  scope for display because it's "detail-view only" or "too long."
- Each card must be **printable**.

## 2. Where This Fits

```
BrowseScreen — searchable/filterable TABLE of results (Phase 5, out of scope here)
  → user selects a row
    → DetailScreen — shows the full-content, printable "card" for that record
```

One card component per content type, rendered on `DetailScreen`
(`/browse/:type/:id`).

## 3. Cross-Cutting Data Facts

Facts that apply across every content type below.

**Every content table shares this base shape:**

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | internal PK |
| `slug` | String | unique within `sourceId` |
| `sourceId` | String (FK → `Source`) | which book/API/homebrew this record came from |
| `name` | String | |

`Source` itself: `id`, `name`, `type` (`API \| FILE \| MANUAL`),
`description?`, `lastUpdated`, `isDeletable`.

**JSON-shaped fields:** SQLite has no native JSON column type, so every field
marked "JSON" below is stored as a `String` and parsed before use — a
data-layer detail, not something the card component itself needs to handle.

**The "Fixed/Choice Grant Shape"** (full spec: master schema Appendix C)
recurs across several types: `ContentBackground.proficiencies`,
`ContentBackground.abilityBonuses`, `ContentClass.skillChoices`, and
race/subrace trait `grant` fields. Its actual shape:

```json
{
  "fixed": { },
  "choices": [
    { "type": "select", "count": 1, "from": [ ], "amount": null },
    { "type": "distribute", "pool": 2, "among": [ ], "maxPerOption": 2 }
  ]
}
```

- `fixed` is an array for name-only grants (skills, tools, languages), or an
  object carrying an amount for grants like ability bonuses (e.g. `{"WIS":1}`)
- `choices[].type: "select"` — pick `count` items from `from` (`from: null` means "from anywhere")
- `choices[].type: "distribute"` — spend a `pool` of points across `among`, capped by `maxPerOption`
- `from`/`among` entries are plain strings, or `{ name, category }` objects
  when a choice spans categories (e.g. "Stealth, Sleight of Hand, or Thieves' Tools")

**`extraData`:** most content types have an `extraData String?` column — a
JSON escape hatch for fields with no dedicated column (either rare fields, or
source data too unpredictable to normalize into a fixed column). Since this
card shows the full record, `extraData`'s parsed contents are in scope for
display the same as any dedicated column — its per-type contents are listed
in each section below.

**Nullability in practice:** fields typed `String?` are genuinely absent on
many real records — e.g. `ContentCondition.effects` is null on essentially
every Open5e condition, `ContentSubrace.size`/`speed` are null unless that
specific subrace overrides its parent. These are noted per field below
because they're facts about the data, not because any field should be
hidden.

## 4. Content Types

Per the v1.0.0 Roadmap, there are **8 top-level browsable content types**
(Spell, Class, Race, Background, Condition, Item, Monster, Feat). Two more
exist in the schema but are reached from a parent record rather than the
top-level list:

- **Subclass** — reached from a Class's card (`GET /api/subclasses?classId=`)
- **Subrace** — reached from a Race's card (`GET /api/subraces?raceId=`)

Also present in the schema, included below for completeness, but its
own Browse/card treatment remains **unresolved as of v1.0.0**:

- **`ContentClassOption`** (Metamagic / Eldritch Invocations / Maneuvers)

Not included below: **`Language`** — a seeded lookup table (`name`,
`category`) referenced by other records as a plain string; it isn't itself a
content type with a card.

## 5. Per-Type Field Reference

### 5.1 Spell

| Field | Type | Notes |
|---|---|---|
| name | String | |
| level | Int | 0 = cantrip |
| school | String | e.g. "evocation", "abjuration" — free-text from source, not a fixed in-schema enum |
| castingTime | String | e.g. "action", "1 bonus action", "1 reaction" |
| range | String | e.g. "150 feet", "Self", "Touch" |
| components | String | collapsed display string, e.g. `"V, S, M"` |
| material | String? | the specific material component text, if any |
| duration | String | e.g. "instantaneous", "Concentration, up to 10 minutes" |
| concentration | Boolean | |
| ritual | Boolean | |
| classes | String (JSON array) | display names, e.g. `["Sorcerer","Wizard"]` |
| description | String | full spell text |
| higherLevels | String? | "at higher levels" text |
| extraData | String? (JSON) | `damageRoll`, `damageTypes`, `savingThrow`, `attackRoll`, `targetType`/`targetCount`, AoE shape/size, `reactionCondition`, `materialCost`/`materialConsumed` |

### 5.2 Class

| Field | Type | Notes |
|---|---|---|
| name | String | |
| hitDie | Int | e.g. 6, 8, 10, 12 |
| primaryAbility | String (JSON) | `{ abilities: string[], logic: "AND"\|"OR" }` |
| savingThrows | String (JSON array) | e.g. `["STR","CON"]` |
| armorProfs | String (JSON array) | |
| weaponProfs | String (JSON array) | |
| skillChoices | String (JSON) | Fixed/Choice Grant Shape (§3) |
| spellcastingAbility | String? | null if the class doesn't cast spells |
| description | String | |
| extraData | String? (JSON) | `casterType`; Compendium rows add `toolProfs`, `slotsReset`, `edition`, `page` |
| *(relation)* subclasses | ContentSubclass[] | |
| *(relation)* features | ContentClassFeature[] | one row per level (Phase 2.6), not an `extraData` key — see below |

**Correction (post-Phase-2.6):** class features live in the separate
**`ContentClassFeature`** table (one row per level, `classId` FK), not in
`extraData` as this section originally documented. That's actually better
for card design — features are queryable/sortable by level rather than
buried in JSON — but any card joins `ContentClassFeature` by `classId`
rather than reading `extraData.features`.

### 5.3 Subclass *(reached from a Class's card)*

| Field | Type | Notes |
|---|---|---|
| name | String | |
| classId | String? | nullable FK to parent Class — null if the parent was deleted (homebrew subclass orphaned) |
| description | String | |
| extraData | String? (JSON) | `unresolvedClassName` if cross-source parent resolution failed (Compendium-imported only) |
| *(relation)* features | ContentClassFeature[] | |

### 5.4 Race

| Field | Type | Notes |
|---|---|---|
| name | String | |
| size | String (JSON array) | e.g. `["medium"]`, or `["small","medium"]` for size-choice races |
| speed | String (JSON) | `{ walk, fly?, swim? }` |
| traits | String (JSON array) | `{ name, description, level, grant? }[]` |
| description | String | |
| extraData | String? (JSON) | |
| parentRaceId | String? | self-relation FK — set only for real 2014-style "subspecies" records (distinct from the separate Subrace table) |
| *(relation)* subraces | ContentSubrace[] | |

### 5.5 Subrace *(reached from a Race's card)*

| Field | Type | Notes |
|---|---|---|
| name | String | |
| raceId | String? | nullable FK to parent Race, same orphan possibility as Subclass |
| description | String? | |
| size | String? (JSON array) | **null unless this subrace overrides the parent's** |
| speed | String? (JSON) | same override-only semantics as `size` |
| traits | String (JSON array) | this subrace's own traits, in addition to the parent Race's |
| extraData | String? (JSON) | `unresolvedRaceName` if parent resolution failed |

### 5.6 Background

| Field | Type | Notes |
|---|---|---|
| name | String | |
| proficiencies | String (JSON) | Fixed/Choice Grant Shape (§3), entries tagged `category: "skill"\|"tool"` — skills and tools merged into one field |
| abilityBonuses | String (JSON) | Fixed/Choice Grant Shape; `fixed` is an object carrying an amount, e.g. `{"WIS":1}` |
| feature | String (JSON array) | `[{ name, description }]` |
| description | String | |
| extraData | String? (JSON) | languages, equipment, `unrecognizedBenefits[]`, flavor text, `proficiencyMismatch` (Compendium-only, when a tag and a bullet point disagree) |

### 5.7 Condition

| Field | Type | Notes |
|---|---|---|
| name | String | e.g. "Blinded", "Poisoned", "Prone" |
| description | String | |
| effects | String? | usually null — Open5e conditions have no structured effects field |
| extraData | String? (JSON) | `descriptionSource`/`requestedSource` (present only when a fallback substitution occurred), `icon` |

### 5.8 Item

| Field | Type | Notes |
|---|---|---|
| name | String | |
| itemType | String | e.g. "weapon", "armor", "wondrous item" |
| rarity | String? | e.g. "common", "rare", "legendary" — null for mundane equipment |
| requiresAttunement | Boolean | |
| cost | String? | e.g. "15 gp" |
| weight | String? | e.g. "3 lb." |
| damage | String? | weapons only, e.g. "1d8 slashing" |
| armorClass | String? | armor only |
| properties | String? (JSON array) | `{ name, detail? }[]` — e.g. weapon properties like "Finesse", "Versatile (1d10)" |
| description | String | |
| extraData | String? (JSON) | `size`, `range`, `isSimple`/`isMartial`/`isImprovised`, `stealthDisadvantage`, `maxDexBonus`, `addDexMod`, `strRequired`, `acDisplay`, `attunementDetail` |

### 5.9 Monster

The type with the most fields.

| Field | Type | Notes |
|---|---|---|
| name | String | |
| size | String | e.g. "small", "large" |
| monsterType | String | e.g. "fey", "dragon", "undead" |
| alignment | String | e.g. "neutral evil" |
| armorClass | Int | |
| hitPoints | Int | |
| hitDice | String | e.g. "2d6" |
| speed | String (JSON) | e.g. `{"unit":"feet","walk":30}` |
| abilityScores | String (JSON) | `{ strength, dexterity, constitution, intelligence, wisdom, charisma }` |
| savingThrows | String? (JSON) | |
| skills | String? (JSON) | e.g. `{"stealth":6}` |
| damageResistances | String? (JSON array) | composite-parser shape (structured, not a naive comma-split) |
| damageImmunities | String? (JSON array) | |
| damageVulnerabilities | String? (JSON array) | |
| conditionImmunities | String? (JSON array) | |
| senses | String? | plain display string, e.g. "darkvision 60 ft., passive Perception 9" |
| languages | String? | plain display string |
| challengeRating | String | handles fractions like `"1/8"` |
| experiencePoints | Int | computed at import from CR (Phase 2.6) |
| actions | String (JSON array) | each entry tagged `actionType: "action"\|"bonus"\|"reaction"` |
| legendaryActions | String? (JSON array) | |
| description | String? | |
| extraData | String? (JSON) | `armorClassDetail`, `lairActions`, `traits[]`, `spellcasting`, `proficiencyBonus`, `legendaryResistances`, `category`/`subcategory` |

### 5.10 Feat

| Field | Type | Notes |
|---|---|---|
| name | String | |
| category | String | `GENERAL \| ORIGIN \| FIGHTING_STYLE \| EPIC_BOON \| CLASS_SPECIFIC` |
| prerequisite | String? | e.g. "Strength 13 or higher" — null if none |
| description | String | |
| extraData | String? (JSON) | `benefits[]` (Open5e only), `special`, `modifiers[]` |

### 5.11 ContentClassOption *(Browse/card treatment still unresolved as of v1.0.0)*

| Field | Type | Notes |
|---|---|---|
| name | String | |
| classId | String? | which class this option is gated behind |
| pool | String | free string (widened from `"Metamagic" \| "Eldritch Invocation" \| "Maneuver"` during implementation — real data includes Arcane Shot, Channeling, Psionic Discipline, etc.) |
| description | String | |
| prerequisite | String? | |
| extraData | String? (JSON) | |

## 6. Real Data Examples

**Compiled 2026-08-06**, directly from `prisma/schema.prisma` and
`sqlite3 prisma/dev.db`, as a companion reference pairing every model above
with 2–3 real rows so the card design session could see actual shapes,
actual messiness, and actual edge cases — not idealized data.

**Row counts** (live db at compile time, for scale/sparsity context):

| Model | Rows |
|---|---|
| Source | 1,265 |
| ContentSpell | 1,343 |
| ContentClass | 37 |
| ContentSubclass | 382 |
| ContentClassFeature | 2,881 |
| ContentRace | 140 |
| ContentSubrace | 166 |
| ContentBackground | 227 |
| ContentCondition | **0** |
| ContentItem | 6,927 |
| ContentMonster | 5,178 |
| ContentFeat | 580 |
| ContentClassOption | 126 |
| Language | 22 |
| ImportJob | 5 |

### Source

**By type at compile time:** 1 `API` (Open5e), 1263 `FILE` (Compendium, one
per imported book/module — **later reduced to ~146 after the v1.0.0 citation-
bug cleanup merged ~1,148 duplicate per-page sources back into their correct
per-book source**, see `DevTools/Notes/v1.0.notes.md`), 1 `MANUAL` (a single
seeded "Homebrew" bucket).

```json
{ "id": "open5e-srd-2024", "name": "Open5e SRD 2024", "type": "API",
  "description": null, "isDeletable": true }

{ "id": "compendium-player-s-handbook-2024",
  "name": "Player's Handbook (2024)", "type": "FILE",
  "description": null, "isDeletable": true }

{ "id": "homebrew", "name": "Homebrew", "type": "MANUAL",
  "description": "User-created content not tied to an external source.",
  "isDeletable": false }
```

**Card-design note — source id/name can be very long and ugly.** Some
Compendium sources were auto-named from garbled source-file metadata, with
real ids running 279+ characters at compile time. If a card shows a
"source" badge/footer, it needs to handle this gracefully (truncate +
tooltip, wrap, or a display-name fallback) — a fixed-width badge will break
on rows like this.

### ContentSpell

**1. Fireball** (typical attack spell — the shape most damage-spell cards will hit)
```json
{
  "name": "Fireball", "level": 3, "school": "evocation",
  "castingTime": "action", "range": "150 feet", "components": "V, S, M",
  "material": "a ball of bat guano and sulfur", "duration": "instantaneous",
  "concentration": false, "ritual": false,
  "classes": ["Sorcerer", "Wizard"],
  "description": "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one. […]",
  "higherLevels": "The damage increases by 1d6 for each spell slot level above 3.",
  "extraData": {
    "scaling": [
      { "trigger": "slot_level", "triggerValue": 4, "dice": "9d6", "description": null },
      { "trigger": "slot_level", "triggerValue": 9, "dice": "14d6", "description": null }
    ],
    "damageRoll": "8d6", "damageTypes": ["fire"], "savingThrow": "dexterity",
    "targetType": "creature", "targetCount": 1,
    "shapeType": "sphere", "shapeSize": 20, "shapeSizeUnit": "feet"
  }
}
```

**2. Guidance** (minimal cantrip — shows how sparse a card *can* be)
```json
{
  "name": "Guidance", "level": 0, "school": "divination",
  "castingTime": "action", "range": "Touch", "components": "V, S",
  "material": "", "duration": "1 minute",
  "concentration": true, "ritual": false,
  "classes": ["Cleric", "Druid"],
  "description": "You touch a willing creature and choose a skill. Until the spell ends, the creature adds 1d4 to any ability check using the chosen skill.",
  "higherLevels": "",
  "extraData": { "damageRoll": "1d4", "targetType": "creature", "targetCount": 1, "shapeSizeUnit": "feet" }
}
```
Note `extraData` here has leftover keys (`damageRoll`, `shapeSizeUnit`) that
don't really apply to a buff spell — the transform pipeline populates these
generically; a card shouldn't assume every `extraData` key present is
meaningful for that spell's actual mechanics. (**This is exactly the case
`spellFooterFromExtraData` — §4 item 3 above — exists to guard against.**)

**3. Delayed Blast Fireball** (multi-stage scaling — the complex end of the range)
```json
{
  "name": "Delayed Blast Fireball", "level": 7,
  "higherLevels": "The base damage increases by 1d6 for each spell slot level above 7.",
  "extraData": {
    "scaling": [
      { "trigger": "slot_level", "triggerValue": 8, "dice": "13d6", "description": null },
      { "trigger": "slot_level", "triggerValue": 9, "dice": "14d6", "description": null }
    ],
    "damageRoll": "12d6", "damageTypes": ["fire"], "savingThrow": "dexterity",
    "shapeType": "sphere", "shapeSize": 20, "shapeSizeUnit": "feet"
  }
}
```
This one also has a secondary saving-throw mechanic embedded only in prose
(the "touching the glowing bead" trigger) — `extraData.scaling` doesn't
capture it. Any card design that wants to *structurally* render "what
happens if you touch the bead" as a separate block would need new schema;
right now that's description prose only.

### ContentClass

**1. Wizard — Open5e** (`open5e-srd-2024`)
```json
{
  "name": "Wizard", "hitDie": 6,
  "primaryAbility": { "abilities": ["INT"], "logic": "OR" },
  "savingThrows": ["Intelligence", "Wisdom"],
  "armorProfs": [], "weaponProfs": ["Simple weapons"],
  "spellcastingAbility": "INT",
  "description": "",
  "extraData": { "casterType": "FULL" }
}
```

**2. Wizard — Compendium** (`compendium-player-s-handbook-2024`)
```json
{
  "name": "Wizard", "hitDie": 6,
  "spellcastingAbility": "Intelligence",
  "description": "Wizards are defined by their exhaustive study of magic's inner workings. They cast spells of explosive fire, arcing lightning, subtle deception, and spectacular transformations. […]",
  "extraData": { "casterType": "FULL", "edition": "2024", "slotsReset": "L", "page": "165" }
}
```
**Card-design note — `description` is empty string on every Open5e-sourced
class** (all 12 checked, 12 empty). If a card's hero/flavor-text block reads
`ContentClass.description`, the Open5e-imported Wizard/Fighter/etc. cards
will show a blank where the Compendium PHB 2024 versions show three
paragraphs of flavor text. Not a bug — just a real gap between the two
import sources that the card layout needs to tolerate (e.g. hide the block
if empty, rather than reserving fixed vertical space for it).

**3. Fighter — Open5e** (non-caster contrast)
```json
{
  "name": "Fighter", "hitDie": 10,
  "primaryAbility": { "abilities": ["STR", "DEX"], "logic": "OR" },
  "savingThrows": ["Dexterity", "Strength"],
  "armorProfs": ["Light, Medium, and Heavy armor and Shields"],
  "weaponProfs": ["Simple and Martial weapons"],
  "spellcastingAbility": null,
  "extraData": { "casterType": "NONE" }
}
```

### ContentClassFeature

One row per **level** (Open5e's grouped `{levels:[4,8,12,16]}` entries are
exploded into 4 rows to match Compendium's native granularity). Belongs to
exactly one of `classId`/`subclassId` (enforced in the transform layer, not
by the DB).

**1. Class-level feature** — Barbarian, level 1
```json
{ "classId": "cmsglm41s...", "subclassId": null, "level": 1,
  "name": "Rage", "type": "CLASS_LEVEL_FEATURE",
  "description": "You can imbue yourself with a primal power called Rage […] While active, your Rage follows the rules below. Damage Resistance. […] Rage Damage. […] Strength Advantage. […]" }
```

**2. Same class, higher level** — Barbarian, level 15
```json
{ "classId": "cmsglm41s...", "level": 15, "name": "Persistent Rage",
  "type": "CLASS_LEVEL_FEATURE",
  "description": "When you roll Initiative, you can regain all expended uses of Rage. […]" }
```

**3. Subclass-level feature** — Champion, level 7
```json
{ "classId": null, "subclassId": "cmsglm41u...", "level": 7,
  "name": "Additional Fighting Style", "type": "CLASS_LEVEL_FEATURE",
  "description": "You gain another Fighting Style feat of your choice." }
```

**Card-design note:** since this is a real table (not JSON), a Class card
can trivially render a sorted "Features by Level" list via
`SELECT * FROM ContentClassFeature WHERE classId = ? ORDER BY level` — no
schema work needed for that. Barbarian alone has 13 feature rows across
levels 1–20; expect this list to be long on full-caster/full-martial
classes and worth collapsing or paginating on a printable card.

### ContentSubclass

**1. Champion — Open5e**
```json
{ "name": "Champion", "classId": "<Fighter id>",
  "description": "Pursue Physical Excellence in Combat\n\nA Champion focuses on the development of martial prowess […]",
  "extraData": null }
```

**2. Champion — Compendium PHB 2024** (same subclass, different source)
```json
{ "name": "Champion", "classId": "<Fighter id>",
  "description": "Pursue Physical Excellence in Combat\n\nA Champion focuses on the development of martial prowess […]",
  "extraData": { "page": "96" } }
```
The two sources produce near-duplicate rows (same subclass, same class,
different `sourceId`) — expected given each `Source` is independently
imported. A card design that lists "subclasses of this class" should
decide how to handle same-name duplicates across sources (show both? dedupe
by name? show source badge on each?) — this is a real, common case, not a
rare edge. (**Resolved for the Monster+Spellcasting packet's spell matching
per §4 item 1 above; not resolved as a general Browse/list behavior as of
v1.0.0.**)

### ContentRace

**1. Elf — Open5e SRD 2024** (concise, 4 traits)
```json
{
  "name": "Elf", "size": ["medium"], "speed": { "walk": 30 },
  "traits": [
    { "name": "Darkvision", "description": "You have Darkvision with a range of 60 feet.", "level": 1 },
    { "name": "Fey Ancestry", "description": "You have Advantage on saving throws you make to avoid or end the Charmed condition.", "level": 1 },
    { "name": "Keen Senses", "description": "You have proficiency in the Insight, Perception, or Survival skill.", "level": 1 },
    { "name": "Trance", "description": "You don't need to sleep, and magic can't put you to sleep. […]", "level": 1 }
  ],
  "description": "", "extraData": null
}
```

**2. Elf — Compendium "Plane Shift: Zendikar"** (11 traits, much denser)
```json
{
  "name": "Elf", "size": ["medium"], "speed": { "walk": 35 },
  "traits": [
    { "name": "Ability Score Increase", "description": "Wis +2, Dex +1", "level": 1 },
    { "name": "Weapon Proficiencies", "description": "Longsword, Shortsword, Shortbow, Longbow", "level": 1 },
    { "name": "Age", "description": "…", "level": 1 },
    { "name": "Alignment", "description": "…", "level": 1 },
    { "name": "Size", "description": "…includes a height/weight dice-roll formula as prose…", "level": 1 },
    { "name": "Darkvision", "description": "…", "level": 1 },
    { "name": "Fleet of Foot", "description": "Your ground speed increases to 35 feet.", "level": 1 }
  ],
  "extraData": { "otherTags": ["Zendikar, Joraga Nation"], "page": "19",
                 "rawAbility": "Wis +2, Dex +1", "rawWeapons": "Longsword, Shortsword, Shortbow, Longbow" }
}
```
**Card-design note — trait count and shape vary wildly by source.** Open5e's
SRD Elf has 4 clean, modern-format traits. The same race imported from a
third-party Compendium module has 11 traits including one that duplicates
`speed`/`extraData` info as prose. A trait-list card component needs to
just render whatever's in the array — it can't assume a fixed trait count
or that traits are non-redundant with other fields.

### ContentSubrace

**1. High Elf — Open5e** (clean parent link, no size/speed override)
```json
{ "name": "High Elf", "raceId": "<Elf id>", "description": null,
  "size": null, "speed": null,
  "traits": [
    { "name": "Level 1 Benefit", "description": "You know the Prestidigitation cantrip. […]", "level": 1 },
    { "name": "Level 3 Benefit", "description": "Detect Magic", "level": 3 },
    { "name": "Level 5 Benefit", "description": "Misty Step", "level": 5 }
  ],
  "extraData": null }
```

**2. High Elf Ancestry — Compendium (unresolved parent)**
```json
{ "name": "High Elf Ancestry", "raceId": null,
  "size": ["medium"], "speed": { "walk": 30 },
  "description": "Walking in two worlds but truly belonging to neither, half-elves combine […]",
  "extraData": { "page": "38", "unresolvedRaceName": "Half-Elf",
                 "rawAbility": "Cha +2", "descriptionStrippingSkipped": true } }
```
**Card-design note — orphaned subraces are real, not theoretical.** This
example has `raceId: null` with `extraData.unresolvedRaceName: "Half-Elf"` —
the import couldn't confidently match it to a parent Race row. A Subrace
card needs a fallback for "no parent" (show `unresolvedRaceName` as plain
text instead of a link) rather than assuming `raceId` always resolves.
(**Built — the shared `OrphanedParentFallback` component per §1/§2 above.**)

### ContentBackground

**1. Acolyte**
```json
{
  "name": "Acolyte",
  "proficiencies": { "fixed": [
      { "name": "Insight", "category": "skill" },
      { "name": "Religion", "category": "skill" },
      { "name": "Calligrapher's Supplies", "category": "tool" }
    ], "choices": [] },
  "abilityBonuses": { "fixed": {}, "choices": [
      { "type": "distribute", "pool": 3, "among": ["INT","WIS","CHA"], "maxPerOption": 2 }
    ] },
  "feature": [],
  "extraData": {
    "equipment": "*Choose A or B:* (A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP",
    "grantedFeat": { "name": "Magic Initiate (Cleric)" }
  }
}
```

**2. Soldier**
```json
{
  "name": "Soldier",
  "proficiencies": { "fixed": [
      { "name": "Athletics", "category": "skill" }, { "name": "Intimidation", "category": "skill" }
    ], "choices": [
      { "type": "select", "count": 1, "from": [{ "name": "Gaming Set", "category": "tool" }], "amount": null }
    ] },
  "extraData": {
    "equipment": "*Choose A or B:* (A) Spear, Shortbow, 20 Arrows, Gaming Set (same as above), Healer's Kit, Quiver, Traveler's Clothes, 14 GP; or (B) 50 GP",
    "grantedFeat": { "name": "Savage Attacker" }
  }
}
```
Both real examples have `"feature": []` — the dedicated `feature` column is
empty on these 2024-style backgrounds because the "background feature" was
folded into `grantedFeat` (a full Feat, cross-referenced by name in
`extraData`) rather than an inline `{name, description}`. A card that reads
`feature[]` as *the* background feature will show nothing for these; the
actual granted benefit lives in `extraData.grantedFeat.name`, which isn't
even an FK — just a name string a card would need to look up against
`ContentFeat` itself to show details.

### ContentCondition — zero rows throughout the project's life

No live examples exist to pull — the Condition import path was included in
the initial `open5e-srd-2024` job's `contentTypes` but produced zero rows,
confirmed as a real Open5e upstream data gap (`srd-2024` has no conditions
tagged), not a pipeline bug — see `Phase-2-Open5e-Import.md`.

### ContentItem

**1. Longsword** (mundane weapon)
```json
{ "name": "Longsword", "itemType": "weapon", "rarity": null,
  "requiresAttunement": false, "cost": "15 gp", "weight": "3", "damage": "1d8 slashing",
  "armorClass": null,
  "properties": [ { "name": "Sap" }, { "name": "Versatile", "detail": "1d10" } ],
  "extraData": { "isSimple": false, "isMartial": true, "isImprovised": false, "size": "tiny" } }
```

**2. Dancing Longsword** (magic weapon, same base stats + rarity/attunement layered on)
```json
{ "name": "Dancing Longsword", "itemType": "weapon", "rarity": "very-rare",
  "requiresAttunement": true, "damage": "1d8 slashing",
  "properties": [ { "name": "Sap" }, { "name": "Versatile", "detail": "1d10" } ],
  "description": "You can take a Bonus Action to toss this magic weapon into the air. […]" }
```

**3. Bag of Holding** (wondrous item — no damage/armorClass/properties at all)
```json
{ "name": "Bag of Holding", "itemType": "wondrous-item", "rarity": "uncommon",
  "requiresAttunement": false, "cost": "0 gp", "weight": "0",
  "damage": null, "armorClass": null, "properties": null,
  "description": "This bag has an interior space considerably larger than its outside dimensions […]",
  "extraData": { "size": "tiny" } }
```
**Card-design note:** `cost`/`weight` are free text, not numbers — "0 gp" on
plenty of magic items, and weight is a bare numeric string with no unit
(`"3"`, not `"3 lb."`). A card showing weight needs to append the unit
itself; it isn't in the data. Item shape also varies a lot by `itemType` —
weapon fields (`damage`, `properties`) are populated and `armorClass` is
null; wondrous items have neither `damage` nor `properties` nor
`armorClass`.

### ContentMonster

The widest type. 24 direct columns + `extraData`.

**1. Goblin Boss** (CR 1 — typical low-tier statblock)
```json
{
  "name": "Goblin Boss", "size": "small", "monsterType": "fey", "alignment": "chaotic neutral",
  "armorClass": 17, "hitPoints": 21, "hitDice": "6d6",
  "speed": { "unit": "feet", "walk": 30, "crawl": 15, "hover": false, "fly": 0, "burrow": 0, "climb": 15, "swim": 15 },
  "abilityScores": { "strength": 10, "dexterity": 15, "constitution": 10, "intelligence": 10, "wisdom": 8, "charisma": 10 },
  "skills": { "stealth": 6 },
  "damageResistances": null, "damageImmunities": null,
  "senses": "darkvision 60 ft., passive Perception 9", "languages": "Common, Goblin",
  "challengeRating": "1", "experiencePoints": 200,
  "actions": [
    { "name": "Multiattack", "actionType": "action", "description": "The goblin makes two attacks, using Scimitar or Shortbow in any combination." },
    { "name": "Scimitar", "actionType": "action", "toHitMod": 4, "damage": "1d6+2 slashing", "description": "Melee Attack Roll: +4, reach 5 ft. […]" },
    { "name": "Nimble Escape", "actionType": "bonus", "description": "The goblin takes the Disengage or Hide action." },
    { "name": "Redirect Attack", "actionType": "reaction", "description": "Trigger: A creature the goblin can see makes an attack roll against it. […]" }
  ],
  "legendaryActions": null,
  "extraData": { "traits": [], "proficiencyBonus": 2, "legendaryResistances": 0, "armorClassDetail": "natural armor", "category": "Monsters" }
}
```

**2. Ancient Red Dragon** (CR 24 — the complex end: legendary actions + spellcasting + resistances)
```json
{
  "name": "Ancient Red Dragon", "size": "gargantuan", "monsterType": "dragon",
  "armorClass": 22, "hitPoints": 507, "hitDice": "26d20 + 234",
  "speed": { "unit": "feet", "walk": 40, "fly": 80, "climb": 40, "swim": 20, "burrow": 0, "crawl": 20, "hover": false },
  "damageImmunities": [ { "types": ["fire"], "nonmagical": false, "bypassedBy": null } ],
  "senses": "darkvision 120 ft., blindsight 60 ft., passive Perception 26",
  "challengeRating": "24", "experiencePoints": 62000,
  "actions": [
    { "name": "Fire Breath", "actionType": "action", "description": "Dexterity Saving Throw: DC 24, each creature in a 90-foot Cone. […]" },
    { "name": "Multiattack", "actionType": "action", "description": "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting […]" },
    { "name": "Spellcasting", "actionType": "action", "description": "The dragon casts one of the following spells […]" }
  ],
  "legendaryActions": [
    { "name": "Commanding Presence", "actionType": "action", "description": "The dragon uses Spellcasting to cast Command (level 2 version). […]" },
    { "name": "Pounce", "actionType": "action", "description": "The dragon moves up to half its Speed, and it makes one Rend attack." }
  ],
  "extraData": {
    "traits": [ { "name": "Legendary Resistance (4/Day, or 5/Day in Lair)", "description": "If the dragon fails a saving throw, it can choose to succeed instead." } ],
    "proficiencyBonus": 7,
    "spellcasting": { "ability": "Charisma", "saveDC": 23, "atWill": ["Command","Detect Magic","Scorching Ray"],
                       "limitedUse": [ { "frequency": "1/Day Each", "spells": ["Fireball","Scrying"] } ] },
    "category": "Monsters"
  }
}
```
**Card-design note — statblock complexity scales enormously by monster.**
Goblin Boss has 4 actions, no legendary actions, no traits, no spellcasting.
Ancient Red Dragon has 3 actions, 3 legendary actions, 1 trait, and a nested
`extraData.spellcasting` block with its own at-will/limited-use lists. A
Monster card can't use one fixed layout — legendary-action and spellcasting
blocks need to conditionally render only when present, and the action list
itself needs to handle 1–10+ entries gracefully for print pagination.
(**Built exactly this way — `useFitToPage('monster')` + per-section
independent multi-column, §1.5/§5 above; the Adult Black Dragon's real
`extraData.spellcasting` was the live-verification case for the
Monster+Spellcasting packet.**)

### ContentFeat

**1. Alert**
```json
{ "name": "Alert", "category": "ORIGIN", "prerequisite": null,
  "description": "You gain the following benefits.\n\tInitiative Proficiency. When you roll Initiative, you can add your Proficiency Bonus to the roll.\n\tInitiative Swap. […]",
  "extraData": { "edition": "2024", "page": "200" } }
```

**2. Lucky**
```json
{ "name": "Lucky", "category": "ORIGIN", "prerequisite": null,
  "description": "You gain the following benefits.\n\tLuck Points. […]\n\tAdvantage. […]\n\tDisadvantage. […]",
  "extraData": { "edition": "2024", "page": "201" } }
```
Both real feats have multiple named sub-benefits folded into one
`description` string with `\t`-prefixed lines — not a structured
`benefits[]` array on these Compendium rows (that key is Open5e-only per
the schema comment). This is exactly the shape `parseFeatDescription`
(§2 above) exists to handle.

### ContentClassOption

```json
{ "name": "Ambush", "pool": "Maneuver", "classId": null, "prerequisite": null,
  "description": "When you make a Dexterity (Stealth) check or an Initiative roll, you can expend one Superiority Die and add the die to the roll, unless you have the Incapacitated condition.",
  "extraData": { "edition": "2024", "page": "94" } }

{ "name": "Commander's Strike", "pool": "Maneuver", "classId": null,
  "description": "When you take the Attack action on your turn, you can replace one of your attacks to direct one of your companions to strike. […]",
  "extraData": { "edition": "2024", "page": "94" } }
```
All 126 live rows (at compile time) had `classId: null` — every Maneuver in
the data was a general Battle Master option not yet linked to a specific
class row, even though the column exists.

### Language

Flat lookup table, not a content type with its own card — referenced
elsewhere as a plain string.

```json
{ "name": "Common", "category": "common" }
{ "name": "Dwarvish", "category": "common" }
{ "name": "Elvish", "category": "common" }
```

### ImportJob

Not card-facing, included for completeness / to explain why some sources
have gaps (e.g. Condition).

```json
{
  "sourceId": "open5e-srd-2024", "jobType": "OPEN5E", "status": "COMPLETED",
  "contentTypes": ["CONDITION","SPELL","RACE","CLASS","BACKGROUND","ITEM","MONSTER"],
  "totalItems": 7, "processedItems": 7, "errorLog": null
}
```

A second real job (`fc5-compendium-uncredited`, `status: "PARTIAL"`) has a
populated `errorLog` — rows get skipped when they fail Zod validation. Not
card-relevant directly, but explains why coverage per source is uneven.

## 7. Summary — things that bit (or would have bitten) a naive "one fixed layout per type" card design

1. **`ContentCondition` has zero rows.** Confirmed as a real upstream gap, not a bug.
2. **Class `description` is empty on every Open5e row**, populated on Compendium rows. Layout tolerates a missing flavor-text block.
3. **Class features are a real relation table** (`ContentClassFeature`), not JSON — good news structurally.
4. **Background `feature[]` is empty on 2024-style backgrounds**; the real granted benefit is `extraData.grantedFeat.name`, a bare string, not an FK.
5. **Item shape branches hard on `itemType`** — weapon vs. wondrous item populate almost entirely different field sets.
6. **Monster complexity ranges from 4 fields used to every field used** — legendary actions / spellcasting / traits render conditionally.
7. **Source names/ids can be 279+ characters** of garbled auto-generated text — source badges need truncation handling. (Mostly cleaned up post-launch, see the Source section above.)
8. **Race trait count/shape varies 4× to 11×** across sources for the "same" race, and can restate other fields as prose.
9. **Subrace/Subclass can have a null parent FK** — the shared orphaned-parent fallback handles this.
10. **Duplicate near-identical rows across sources are normal** — a real design decision, resolved for spell-name matching (source-type priority), not yet resolved as a general Browse behavior.
