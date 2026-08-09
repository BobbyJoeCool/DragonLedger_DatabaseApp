# DragonLedger DatabaseApp — Card Component System Handoff

> **Purpose of this document:** consolidates ~9 separate demo HTML files built
> across a long design-only chat session into one implementation-ready spec.
> Each demo file proved out one card type or one layout decision in
> isolation; none of them share real code with each other. This document
> defines the shared component/utility layer they all imply, so Claude Code
> can build it once as real React components rather than re-deriving each
> card from scratch. Source demo files (for visual reference only — not to
> be shipped as-is): `DragonLedger_CardWidthLogic.html`,
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
friendlier by construction than the locked presets.

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
open question upstream of this doc, not decided here.

---

## 4. Open dependencies — flagged, not resolved here

These came up during the design session but require decisions or plumbing
outside the scope of the card components themselves:

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
   upstream query already resolved.
2. **`ContentCondition` has zero live rows**, despite the Open5e import job
   explicitly including `CONDITION` and reporting `status: COMPLETED`. Not
   an errored/skipped job — it completed and produced nothing. Flag to
   whoever owns the import pipeline before assuming Condition data will
   show up "eventually, same as the others." The Condition card itself is
   low-risk/minimal, so this isn't urgent, just unverified.
3. **`spellFooterFromExtraData(extraData)`** — implemented in
   `DragonLedger_TradingCardSheet.html` as a real function, not just a
   warning: only renders "Damage" if `damageRoll` **and** `damageTypes[]`
   are both present, "Save" if `savingThrow` present, "Area" if `shapeType`
   **and** `shapeSize` are both present. This exists because `extraData`
   carries leftover keys even on non-damage spells (e.g. `Guidance` has a
   stray `damageRoll: '1d4'` despite being a pure buff) — a naive "show the
   key if it exists" binding would produce a wrong footer. Port this
   function as-is; don't rebuild the logic from scratch against the real
   API.
4. **Matching a monster's stored spell names against real `ContentSpell`
   records** (for the Monster+Spellcasting packet) is a read-API/data-
   fetching concern, unresolved here — the packet's layout doesn't care how
   the spell list gets assembled, only that it arrives grouped by level.
5. **`ContentClassOption` Browse/card treatment** — excluded from this
   entire card system per the original design brief; still open upstream.

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

## 6. Implementation instructions for Claude Code

1. Set up the shared component directory (suggested:
   `src/components/cards/shared/`) with `Shell`, `ThemeProvider`, `Divider`,
   `Subcard`, and the `useFitToPage` hook as described in §1. Export the
   `0.55` floor constant from one place.
2. Port the utilities in §2 (`grantShapeToText`, `parseFeatDescription`,
   `parseDescriptionBlocks`/`splitSentences`/segment-pagination,
   `groupFeatures`, `spellFooterFromExtraData`) as pure functions in
   `src/components/cards/shared/utils.ts`, with unit tests against the real
   example rows quoted in §3/§4 (Fireball, Guidance, and Prismatic Spray for
   the footer function; Alert for the feat parser; Barbarian's 18 raw
   feature rows for `groupFeatures`).
3. Build the orphaned-parent fallback (§2) as one shared presentational
   pattern, used by both Subclass and Subrace — don't let it drift into two
   slightly different implementations.
4. Build each per-type field component per §3, composing the shared pieces
   — do not reimplement fit-to-page, dividers, or subcards per type.
5. Do **not** build the Item/Class/Background field-completeness gaps beyond
   what's specified here (e.g. Item's full `extraData` surface, Background's
   `extraData.equipment` rendering) without checking back against the live
   schema first — some of this may have moved again since the reference
   doc this handoff was built from.
6. Leave `ContentClassOption` unbuilt — no card, no Browse entry — until the
   upstream open question is resolved.
7. Do not build the source-priority settings UI, the app-wide custom theme
   builder UI, or the Monster-spell-matching read API as part of this card
   work — flag them as separate tickets per §4.
8. Once components are built, do a visual pass against all 3 theme presets
   for each type, specifically re-checking the Subcard tab vertical
   clearance (§1.4) and the Grimoire print fallback (§1.2) — both were real
   bugs during the demo phase and are easy to reintroduce with a fresh
   implementation.
