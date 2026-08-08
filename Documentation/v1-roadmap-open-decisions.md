# DragonLedger DatabaseApp — Path to v1.0.0: Open Design Decisions

**Purpose of this document:** every phase between where the project is now
(Phase 0.7, Electron packaging, done — version `0.0.7`) and `v1.0.0` (Phase 7,
Edit/Create UI, complete) still has open design questions sitting in various
per-phase "final export" documents, some resolved-as-a-rule-but-not-as-data,
some genuinely undecided, some just flagged as needing more real-data
verification before they can be trusted. This document consolidates **every
one of those** into a single place, phase by phase, with enough context to
discuss and resolve them **without the source repo open** — modeled on the
same pattern already used for `card-design-spec.md` (a data-only reference
compiled so a design session could run on Claude Mobile).

**How to use this:** work through it phase by phase (or jump to whichever
phase is next). For each open item, the question, why it matters, and the
options already on the table (if any) are spelled out — nothing here should
require re-deriving from scratch. Answers from that discussion come back as a
resolved version of this document (or a set of answers keyed to each
numbered item below), which becomes the input for actually building each
phase.

**Versioning note:** per the project's convention, `package.json` version
mirrors the phase number as `0.<phase>.<subphase>` pre-1.0.0. `v1.0.0` is
reached when Phase 7 is complete — there is no separate "1.0 polish" phase
beyond what's listed below.

**What this document is *not*:** a re-litigation of anything already firmly
decided. Settled decisions are summarized briefly for context (so a
discussion doesn't accidentally re-open them) but are not up for debate here.
Only genuinely open items — real decisions, or flagged verification/research
work — are the actual content.

---

## Quick Status by Phase

| Phase | What it is | Open decisions | Verification/research only |
|---|---|---|---|
| 1 | Schema & Sources | **0** — ready to build | 0 |
| 2 | Open5e Import | 0 | 3 |
| 2.5 | Compendium Import | 2 | 5 (one is a blocking prerequisite) |
| 3 | Content Read API | 0 — resolved via #0.1 | 0 |
| 4 | Content Write API | 1 (6 sub-items) | 0 |
| 5 | Browse UI | 2 (one resolved via #0.1) | 0 |
| 6 | Import UI | **whole phase** — no design session has happened yet | 0 |
| 7 | Edit & Create UI | 2 (one resolved via #0.1) | 0 |

Plus **2 cross-cutting decisions** (Section 0), one of which (0.1) is now
resolved — it touched Phases 3, 5, and 7, all now closed out with the same
answer. 0.2 remains open.

---

## Section 0 — Cross-Cutting Decisions (resolve these first)

These two items each show up as an open item in *multiple* phase sections
below. Resolving them once, here, avoids deciding them three separate times
(or worse, inconsistently).

### 0.1 `ContentClassOption`'s Browse / API / Form Treatment — RESOLVED (2026-08-08)

**Decision: Option 2 — nested only.** No 9th top-level Browse tab, no
standalone `GET /api/class-options` route, no standalone card, no standalone
form. Class-option data rides along in `GET /api/classes/:id`'s response and
is edited inline within `ClassForm`. Confirms the existing Phase 5 lean —
class-options are inherently class-scoped and nobody's described wanting to
browse Metamagic/Invocations/Maneuvers across all classes at once. This
closes out 3.1, 5.1, and 7.1 below with the same answer.

**What it is:** `ContentClassOption` is the schema table for Metamagic
options, Eldritch Invocations, and Maneuvers — themed pools of selectable
options gated behind one specific class (e.g. only Sorcerers can pick
Metamagic). It's structurally distinct from a `Feat` (which is standalone,
gated only by a prerequisite, not by class) and from a `Feature` (which is
automatic, not a choice — stays embedded JSON on its parent, never
independently browsable).

**Why it's undecided:** every other content type got an explicit "yes, top-
level Browse tab" or "no, nested under something else" call. `ContentClassOption`
never got that call — it fell through three separate phase sessions (Read
API, Browse UI, Edit/Create UI) each flagging it as "not decided here" rather
than deciding it.

**The actual question:** does a Metamagic option / Invocation / Maneuver...
1. **Get its own top-level Browse tab** (a 9th entry in the sidebar, alongside
   Spell/Class/Race/etc.), with its own `GET /api/class-options?classId=`
   endpoint and its own `<ClassOptionCard>` — treated exactly like the other
   8 content types, or
2. **Only ever surface nested under its parent Class's detail view** — no
   top-level tab, no standalone endpoint (fetched as part of `GET
   /api/classes/:id`'s response, or via a query param scoped to that class
   only), no standalone card — the existing "leaning" mentioned in the Phase
   5 export, but never firmed up into a decision.

**What depends on this answer:**
- Phase 3 (Read API): whether `GET /api/class-options?classId=` exists as its
  own route at all, or the data is just embedded in a Class's detail response.
- Phase 5 (Browse UI): whether there's a 9th sidebar entry, filter bar, table,
  and card, or nothing beyond what a Class's own detail page already shows.
- Phase 7 (Edit/Create UI): whether there's a standalone `ClassOptionForm`
  (9th/10th form, depending on how Subclass/Subrace are counted), or editing
  happens inline within the parent Class's own edit form.

**Recommendation already on the table (not a final decision):** the Phase 5
export leans toward "surfaced from a Class's detail view" rather than a full
top-level tab, since class-options are inherently class-scoped and a user
browsing "all Metamagic options across all classes" isn't a use case anyone
described. But this was never explicitly confirmed — it's a leaning, not a
resolution.

### 0.2 Per-Content-Type UI Design Sessions — What's Already Scoped

Not a decision itself, but context that matters for planning the discussion:
Phases 5 and 7 both defer a large amount of real design work to "per-type
sessions" that haven't happened yet. Specifically:

- **8 content types** (Spell, Class, Race, Background, Condition, Item,
  Monster, Feat) each need: (a) a Browse results-table column layout, (b) a
  full-content printable "card" layout for the detail view, and (c) an
  Edit/Create form layout.
- **The data reference for (b) already exists** — `Documentation/card-design-spec.md`
  was compiled specifically so this session could happen on Claude Mobile. It
  has every field, per type, with nullability/shape notes, and deliberately
  no layout opinions. It's ready to use as-is for a card-design discussion.
- **(a) and (c) have no equivalent reference document yet.** Column-layout
  and form-layout discussions would need a similar data-only reference
  compiled first, or could piggyback on the same session as the card work
  since the underlying field data is identical — the only real difference is
  which fields go in a table row (probably ~4-6 most-identifying fields per
  type) vs. a form (every editable field) vs. a card (every field, full
  content).
- **One worked example already exists for forms**: Spell's form layout is
  fully specified in `phase-7-edit-create-ui-final-export.md` Section 3, as a
  template for the other 7 types to follow the same pattern.

This suggests one efficient path: a single extended design session covering
table columns + card layout + form layout **together, per type**, reusing
`card-design-spec.md`'s field data for all three purposes rather than three
separate sessions per type.

---

## Phase 1 — Database Schema & Source Management

**Status: no open decisions.** Every model, field, and relation is fully
specified in `outline.md` Appendix A and `Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`.
Seed data (the `homebrew` Source row, the full `Language` table with its
common/exotic/secret lists) is spelled out in `tasks.md`. This phase is
ready to build as soon as the design-doc discussion (this document) wraps —
it doesn't block on anything below.

---

## Phase 2 — Open5e Import

**Status: no genuine design decisions open** — everything below is
verification/research work, not a "pick between reasonable approaches" call.
Included here so it isn't forgotten, not because it needs discussion.

### Needs Verification / Research (not decisions)

1. **Batch-insert chunk size must be recalculated, not just re-verified.**
   The original design (500 rows per `createMany` call) was sized against SQL
   Server's ~2,100-bound-parameter limit. SQLite's own limit is much lower
   (~999 total parameters per query, depending on build) — for a wide table
   like `ContentMonster` (~25 columns), 500 rows × 25 columns = 12,500
   parameters, which would fail outright. Fix: compute `floor(999 /
   columnCount)` per model, or pick one conservative universal batch size
   (e.g. 30–50 rows) safely under the limit for even the widest model. This
   is arithmetic, not a design call — flagged so it isn't missed during
   implementation.
2. **Classes' `skillChoices`/`armorProfs`/`weaponProfs` parsing** is scanned
   out of feature prose (no direct Open5e API field exists for these) and
   hasn't been verified against a live API sample yet.
3. **Hardcoded lookup tables** (hit-die fallback when no nested `hit_points`
   object exists, spellcasting ability by class name, multiclass AND/OR logic
   by class name) need confirmation they cover every SRD 2024 class before
   Classes import is considered complete.

---

## Phase 2.5 — Compendium Import

### Open Decisions

**2.5.1 — Race/Subrace's un-columned fields: `extraData` or a synthesized trait?**

**What it is:** the Compendium's XML format has dedicated `<ability>`,
`<resist>`, `<vulnerable>`, `<conditionResist>`, `<conditionImmune>`,
`<proficiency>`, `<weapons>`, `<tools>`, and `<languages>` fields for a
race/subrace. This app's schema has **no dedicated column for any of
these** — `ContentRace`/`ContentSubrace` only have `traits` (a JSON array)
and `extraData` (a JSON escape hatch).

**Why it's undecided:** this is a genuine two-option fork that was
explicitly flagged as "not resolved this session" rather than picked. Both
options were considered valid:

- **Option A — synthesize each into a `traits[]` entry.** Keeps `traits[]`
  as the one canonical place a race's mechanical grants live, consistent
  regardless of source — this is how Open5e-sourced races already represent
  everything (even something like Dwarven Resilience) as trait prose, so a
  race's `traits[]` array would mean the same thing no matter which importer
  produced it.
- **Option B — put them in `extraData`** as their own structured keys (e.g.
  `extraData.rawAbility`, `extraData.rawResist`). More directly structured
  and closer to the source data's actual shape, but becomes a *second* place
  (besides `traits`) where a race's mechanical grants can live — something
  the rest of the schema has generally tried to avoid, for both Race and
  every other content type.

A hybrid was also floated for the "Race/Subrace synthesized-trait" item
elsewhere in the docs (outline.md's Resolved section actually already landed
on **Option A + also preserving the raw value in `extraData` as a backup**)
— so there may already be a de facto answer here that just needs to be
explicitly confirmed and carried into this specific compendium-race-subrace
document's own field mapping table (Section 1.4 there currently still marks
it "not resolved," which appears to be stale relative to the outline's later
resolution). **Discussion should confirm:** is outline.md's resolution
(synthesize into `traits[]` *and* keep the raw value in `extraData`) the
final answer here too, closing this out as already-decided rather than open?

**2.5.2 — Multi-book citation priority ranking (data, not a rule)**

**What it is:** some Compendium records cite more than one source book in
one citation line (e.g. `"Curse of Strahd p. 209, Van Richten's Guide to
Ravenloft p. 34"`). The *rule* for resolving this is already decided:
whichever cited book has the higher priority wins, and a `priority: Int`
field on `Source` (or an equivalent hardcoded ranking table) is where that
priority will live.

**What's actually missing:** the real ranking data — an ordered list of
which D&D 5e sourcebooks outrank which others when both are cited for the
same record. This is a domain-knowledge/preference call (which books should
be considered more "authoritative" or "preferred" when content overlaps),
not something derivable from the code or the API — a good candidate to just
work through directly in the design discussion by listing out the relevant
sourcebooks (core rulebooks, setting books, adventure modules) and agreeing
an order.

### Needs Verification / Research (not decisions)

3. **Feat category default** — unprefixed Compendium feat names default to
   `GENERAL` category; unconfirmed against real data whether this is always
   correct.
4. **Background bullet-parsing** — the entire Background field-mapping table
   was built from a 6-record sample. Needs re-verification against a larger
   sample: is the bullet-label set exhaustive, does "Feature:" substring-
   matching still work on cases like the confirmed "Selesnya Guild Spells"
   edge case, do ability-score bullets exist anywhere in real data at all.
5. **Item rarity/attunement text-parsing** — no confirmed reliable pattern
   exists yet; the Compendium format has no dedicated field for these (unlike
   Open5e), so this is best-effort text parsing from the item's description,
   attempted anyway per a prior explicit decision to try rather than skip.
6. **🚩 BLOCKING — Class/Subclass detection rule, verified against exactly
   one file (Cleric 2024).** The parenthetical-suffix subclass-detection rule
   (a feature named `"Avatar Of Battle (War Domain) 2024"` gets routed to a
   synthesized `ContentSubclass` called "War Domain") has only ever been
   checked against one real class file. **This is flagged as a required
   blocking step, not optional polish** — a much larger real sample (multiple
   classes spanning both 2014 and 2024 editions, at least one genuine third-
   party/homebrew example) must be pulled and manually verified against the
   rule before Class/Subclass import is written at all, not after.
7. **🚩 BLOCKING (same severity as #6) — Race/Subrace's comma-separated
   naming convention, verified against exactly two files** (Elf/Wood Elf,
   Dwarf). Same requirement: pull a broader real sample — multiple race
   families with real subraces, ideally a homebrew example — before trusting
   the `"ParentRace, SubraceName Edition"` detection rule at scale.

---

## Phase 3 — Content Read API

### Open Decisions

**3.1 — `ContentClassOption`'s endpoint shape. RESOLVED via Section 0.1:**
nested under Class only — no standalone route. Class-option data rides
along in `GET /api/classes/:id`'s response.

Everything else in this phase (the 8 confirmed content types' list/detail
endpoints, the shared query pattern, the `?fields=name` lightweight mode
needed by Phase 5's name-index) is fully specified with no open decisions.

---

## Phase 4 — Content Write API

### Open Decisions

**4.1 — Correctable Fields, per-type lists — RESOLVED (2026-08-08), rule
changed from a per-type list to a source-type rule.**

**Old approach (superseded):** the "Correctable Fields" mechanism lets a
user fix a mistake on an *official* (non-homebrew) entry in place, without
triggering the full "Save As" homebrew-copy flow. Originally scoped as a
per-type curated list, criterion "parser-derived/inferred field," applied
regardless of source type. Only Monster's list was ever actually built
under this rule (`savingThrows`, `skills`, `damageResistances`,
`damageImmunities`, `damageVulnerabilities`, `conditionImmunities`).

**New rule (resolved):** correctability is now **source-type-based**, not
per-type-curated:

- `API` (Open5e) entries — no field is correctable in place, ever. Every
  edit requires `saveAs`. (Open5e refreshes are delete-and-replace, so an
  in-place fix would just be wiped on the next re-import anyway.)
- `FILE` (Compendium) entries — every field is correctable in place
  **except** a fixed lock list: `name`, `slug`, `sourceId`, and the
  parent-relation FK on Subclass/Subrace (`classId`/`raceId`). Compendium
  data is known to be imperfect and isn't actively maintained, so the
  default is now "broadly fixable" rather than "only the fields our own
  parser might have gotten wrong."
- `MANUAL` (homebrew) entries — unchanged, always editable in place.

**Code impact, not yet applied:** `server/src/routes/content/writeHandlers.ts`'s
`createPatchHandler` currently checks the correctable schema before looking
at source type at all — needs reordering so the source-type check gates the
correctable check. Every content type's `<Type>CorrectableSchema` in
`server/src/schemas/content/*.ts` needs regenerating from `.omit({ name,
slug, sourceId, ...FK if present })` instead of the old hand-picked lists.
See `phase-4-write-api-final-export.md` §4 for the full detail and
`DevTools/Claude/phase-4.md` for the log entry. **Not yet implemented in
code as of this decision** — flagged as a follow-up task, pending
confirmation to proceed with the source-file edits.

---

## Phase 5 — Browse UI

### Open Decisions

**5.1 — `ContentClassOption`'s Browse treatment. RESOLVED via Section 0.1:**
nested only — no 9th sidebar tab, no standalone card. Surfaced from a
Class's own detail view.

**5.2 — Per-type results-table column set (8 types).** The results list
was revised from a card grid to a table, but which columns each of the 8
tables actually shows was explicitly deferred. No reference document exists
yet for this specific decision (unlike cards, below) — likely 4-6
most-identifying fields per type (e.g. Spell: name, level, school, classes,
source; Monster: name, type, CR, size, source). Candidate approach: derive
this alongside the card-layout session (Section 0.2) since the same field
knowledge applies, just picking a smaller "at a glance" subset per type
instead of "everything."

**5.3 — Per-type card (`<Type>DetailFields`) layout (8 types).** The
full-content, printable detail view for each type. **The data reference for
this already exists and is ready to use as-is:** `Documentation/card-design-spec.md`
— every field per type, with nullability and shape notes, deliberately
containing zero layout opinions so a design session can start fresh. This is
the single most-scoped piece of remaining open design work in the whole
project — it just needs the actual visual-design conversation to happen.

Everything else in Phase 5 (TanStack Query/Virtual choice, local-not-URL
filter state, per-type hand-built filter bars, the virtualized bidirectional
position-bar pagination mechanism, the all-sources-checked-by-default
multi-select) is fully decided with no open items.

---

## Phase 6 — Import UI

### Status: the whole phase needs a design session — none has happened yet

Unlike every other remaining phase, Phase 6 has **no "final export" design
document at all.** `tasks.md` explicitly notes: *"No dedicated design
session yet — build against outline.md §Phase 6 as written, but do not skip
[two flagged items]; they're known requirements, not optional polish."*

The outline's existing scope (not yet challenged or refined in a real
session) is:

- **Source list (`/sources`)**: table of all sources (name, type badge,
  entry count, last updated, actions), "Re-import" for API sources, "Delete
  source" with confirmation, "Clear entries" (Phase 4's bulk-clear endpoint),
  "Add Source" dialog.
- **Import wizard (`/sources/import`)**, three steps:
  - Step 1 — choose import type: three options now (Open5e API, Compendium
    XML *(new since the original outline)*, JSON file).
  - Step 2a (Open5e) — source name input, content-type checkboxes, SSE
    progress.
  - Step 2b (Compendium, new) — file picker, then **a genuinely new UI state
    the original wizard never accounted for**: if the batch-level duplicate
    check (Phase 2.5) returns matches, show the `AWAITING_CONFIRMATION`
    summary ("N records match — import as duplicates, or skip?") *before*
    the real import runs.
  - Step 2c (JSON file) — source name input, file picker, upload.
  - Step 3 — progress view: per-content-type progress bar, live counts,
    error list, "Done" → back to `/sources`.

**What a design session for this phase would actually need to nail down**
(none of this has real answers yet, just the rough shape above):
- Exact table columns / row actions on the Source list.
- Whether/how the three import-type options in Step 1 are presented (tabs?
  radio cards? separate routes?).
- The Compendium duplicate-confirmation UI specifically — this is flagged
  as genuinely new UI the original design never had to solve, and it's the
  most novel piece of this phase.
- Error-list UX in the progress view — how failures within one content type
  are surfaced without blocking the rest of the import.
- Whether this phase reuses Phase 5's shared components as intended
  (`SourceBadge`, etc.) or needs new ones.

---

## Phase 7 — Edit & Create UI

### Open Decisions

**7.1 — `ContentClassOption`'s form treatment. RESOLVED via Section 0.1:**
no standalone `ClassOptionForm` — edited inline within `ClassForm`.

**7.2 — Per-type form field layout (7 of 8 types, plus Subclass/Subrace).**
**Base pattern now resolved (2026-08-08, see `phase-7-edit-create-ui-final-export.md`
§1.6):** each `<Type>Form` mirrors its printable card's field grouping/order
(not a generic top-to-bottom list), stays a separate component from the
read-only card, appends an editable "Advanced Fields" section for anything
not on the card, and — for fields on that type's Correctable Fields list
only — offers an independent per-field save alongside the whole-form
Save/Save-As button. Spell already has a complete worked template following
the pre-existing shape (`phase-7-edit-create-ui-final-export.md` Section 3)
— required/nullable straight off its Zod schema, one widget per JSON-shaped
field. The other 7 base types (Class, Race, Background, Condition, Item,
Monster, Feat) still each need their own field-by-field session against
this base pattern; Subclass and Subrace are expected to mostly reuse their
parent type's form rather than needing a fully separate build, but that
hasn't been explicitly confirmed per type. **Note the new dependency:**
because per-field save is scoped to Correctable Fields, each type's 7.3
review needs to happen before or during its 7.2 session, not after.

**7.3 — Correctable Fields review, per type. Mostly resolved via 4.1's rule
change.** Since correctability is now source-type-based rather than a
per-type list, this item shrinks to: per type, confirm the lock list
(`name`/`slug`/`sourceId`/parent FK) applies cleanly, and confirm
Subclass/Subrace's per-field save affordance correctly excludes their
`classId`/`raceId`. No bespoke per-type field-list work remains.

**Explicitly deferred, not blocking v1.0.0:** the create-form's homebrew-
source default becoming user-configurable (a single global preference, or a
richer per-content-type map) is called out as a stretch goal, not core
scope — worth noting so it doesn't accidentally get pulled into the v1.0.0
discussion as something that needs resolving now.

Everything else in Phase 7 (hand-built forms over a config-driven engine,
react-hook-form + Zod, the `@dragonledger/content-types` shared package, the
"every JSON field gets a real widget, no raw-textarea fallback ever" rule,
the live Save/Save-As button behavior, the route-leave unsaved-changes
guard, the full `FixedChoiceGrantWidget`-and-friends widget plan) is fully
decided with no open items.

---

## Appendix — Source Documents

Everything in this document was consolidated from the following existing
files, in case deeper detail on any already-settled point is needed during
discussion (this document should be self-sufficient for the open items
themselves, but these are the primary sources if something needs
double-checking):

- `Documentation/outline.md` — the master build plan and its own consolidated Open Questions appendix
- `Documentation/tasks.md` — the concrete task checklist per phase
- `Documentation/phase-2-import-final-export.md`
- `Documentation/phase-4-write-api-final-export.md`
- `Documentation/phase-5-browse-ui-final-export.md`
- `Documentation/phase-7-edit-create-ui-final-export.md`
- `Documentation/compendium-import-final-export.md`
- `Documentation/compendium-race-subrace-reimport-safety-export.md`
- `Documentation/card-design-spec.md` — ready-to-use data reference for the Phase 5 card-layout decision (Section 5.3 above)
- `Documentation/FlowCharts_ERDs/dragonledger-master-schema.md` — the authoritative current schema
