# Phase 7 — Edit & Create UI: Design Notes

> Part of the `Documentation/v1.0.0/` phase-document set — see
> `v1.0.0-Roadmap.md` for the build-plan checklist and task log this design
> rationale supports. Consolidated from `phase-7-edit-create-ui-final-export.md`.
> Implementation logs: `DevTools/Notes/v0.6.notes.md` (design follow-ups,
> foundation layer) and `v0.7.notes.md` (per-type form/card build-out).

---

# DragonLedger DatabaseApp — Phase 7 Edit & Create UI: Final Design Export

**Note:** this phase covers **8 content types** (Feat was added during the Compendium sessions). `ContentClassOption` (Metamagic/Invocations/Maneuvers) is not included as its own form — **resolved: edited within its parent Class's form**, see the v1.0.0 Roadmap Part 4, Section 0.1.

## 1. Decisions Made

### 1.1 Dynamic vs. Hand-Built Forms

Hand-built — one component per content type (8 total: Spell, Class, Subclass, Race, Subrace, Background, Condition, Item, Monster, Feat — several of these, like Subclass/Subrace, are simple enough to likely share most of their parent's form rather than needing a fully separate one), not a generic config-driven form engine. Consistent with Phase 5's identical choice for filter bars — direct control over each type's real layout quirks (a Monster's action list vs. a Condition's near-empty form) outweighs the code savings a shared engine would offer, especially now that JSON-shaped fields need real structured widgets (Section 1.3) rather than a generic fallback.

### 1.2 Form/Validation Library

react-hook-form + Zod (the standard shadcn/ui pairing), using react-hook-form's built-in Zod resolver against the schemas already built in Phases 2 and 4 — not a separate validation layer.

**Schema sharing: a real `@dragonledger/content-types` workspace package, set up now, not duplicated.** Even with the local/SQLite architecture pivot, client (React) and server (Express) remain two separate JS execution contexts needing the same validation logic — that didn't change with hosting. Given this app is explicitly the foundation for a future second consumer (Heroes) that will eventually want these same shapes too, investing in a real shared package now was judged worth it despite the project's small, single-developer scope.

### 1.3 JSON-Shaped Field Widgets

**Every JSON-shaped field gets a real structured sub-widget. No raw-JSON-textarea fallback anywhere, for any field, at any complexity level.** This is a firm requirement, not a case-by-case judgment call — driven by an explicit goal that this app (and by extension Heroes) needs to be usable by someone with no coding background, since it's meant to be marketable, not just a personal dev tool where a JSON textarea would be tolerable. See Section 4 for the full list of fields needing a widget.

### 1.4 Save-As Prompt UX

**Already resolved by Phase 4's "Correctable Fields" mechanism** — not a new Phase 7 decision. The Save button's behavior updates live as the user edits: while every currently-changed field is on that content type's Correctable Fields list, the button reads "Save" and submits in place with no interruption, even on an official entry. The moment any non-correctable field becomes dirty, the button's label/behavior switches to "Save as..." (prompting original-vs-homebrew), without a separate modal interrupt step. This makes the distinction visible to the user as they type, not a surprise at submit time.

**Underlying rule revised (2026-08-08, see `Phase-4-Write-API.md` §4):** what counts as "correctable" is no longer a per-type curated field list — it's now source-type-based. An **Open5e (`API`)** entry has zero correctable fields, so editing *any* field on it always flips the button to "Save as..." immediately. A **Compendium (`FILE`)** entry has every field correctable except the fixed lock list (`name`, `slug`, `sourceId`, and the parent-relation FK on Subclass/Subrace) — editing `name` flips to "Save as...", everything else stays "Save." A **`MANUAL`** (homebrew) entry is unaffected — always "Save," no prompt. The live-updating button behavior itself doesn't change, only which fields it treats as correctable per entry.

### 1.5 Unsaved-Changes Handling

A route-leave guard warns before discarding unsaved changes (navigating to Browse, closing, hitting back with a dirty form) — not skipped for v1. Consistent with the "marketable product" framing from Section 1.3; silent data loss isn't acceptable for a real tool, even a small one.

### 1.6 Per-Type Form Layout Base Pattern — RESOLVED (2026-08-08)

Added as the base template for the 7.2 per-type sessions, before any individual type's fields are
designed:

- **Form layout mirrors the card, field-for-field.** `<Type>Form` isn't a
  generic top-to-bottom field list — it's laid out to match
  `card-design-spec.md`'s field grouping and order for that type. It remains
  a **separate component from the read-only `<Type>Card`**, not the same
  component toggled into an edit mode — no shared card/form component, just
  matching visual structure.
- **Advanced Fields section at the bottom, for fields not on the card.**
  Any field that exists on the type but isn't part of the printable card
  (import-only metadata, less-common `extraData` keys) is editable and
  appended in a dedicated "Advanced Fields" section at the end of the form —
  fully part of the same submit, not read-only reference.
- **Advanced per-field save, scoped to Correctable Fields only.** In
  addition to the whole-form Save/Save-As button (Section 1.4), any field
  that's currently correctable for that entry gets its own independent save
  affordance — committing a single correction without touching or
  resubmitting the rest of the form. Non-correctable fields are **not**
  offered a per-field save; editing one still routes through the existing
  whole-form Save-As flow. This keeps a single set of rules (correctable =
  always safe to commit in place, at any granularity) rather than
  introducing a second, parallel per-field Save-As mechanism.
- **Revised (2026-08-08):** correctability is now source-type-based, not a
  per-type curated list (see §1.4 and `Phase-4-Write-API.md`
  §4). Practical effect for this per-field save affordance: on an
  Open5e-sourced entry, **no field ever gets a per-field save button** —
  every edit goes through whole-form Save-As. On a Compendium-sourced
  entry, **every field except `name` (and `slug`/`sourceId`/the parent FK,
  none of which are exposed as editable form fields anyway) gets one.**
  This is a much larger surface than originally anticipated when this
  pattern was first proposed — item 7.3 (per-type Correctable Fields
  review) is now mostly just confirming the lock list applies cleanly to
  each type, not building a bespoke list per type.
- **Consequence for sequencing:** unchanged — a type's Correctable Fields
  treatment still needs to be settled *before or during* that type's
  field-layout session, since it determines which fields in that layout get
  a per-field save affordance.

### 1.7 Homebrew-Source Picker on Create

Defaults to the seeded, non-deletable `"homebrew"` Source (Phase 4) automatically, with a dropdown available to redirect to a different `MANUAL` source. Matches how `saveAs: "homebrew"` already resolves to this same source by default when no target is specified — the create form's default is a natural continuation of that existing behavior, not a new pattern.

**Stretch goal, not core scope:** the create-form source default may eventually be user-configurable — either a single global preference, or a richer per-content-type preference map (e.g. new Spells default to one homebrew collection, new Monsters to another). Exact shape deliberately left undecided; noted as a future direction rather than committed to prematurely. **Still deferred as of v1.0.0.**

## 2. Component Breakdown

```
EditScreen / CreateScreen
├── <Type>Form                      (8 hand-built forms: SpellForm, ClassForm, RaceForm,
│                                     BackgroundForm, ConditionForm, ItemForm, MonsterForm,
│                                     FeatForm — SubclassForm/SubraceForm likely share most
│                                     of their parent type's form rather than needing a
│                                     fully separate build)
│   ├── SourcePicker                (shared; create-only; defaults to Homebrew, Section 1.6)
│   ├── <shared JSON-shape widgets> (Section 4 — reused across whichever forms need them)
│   ├── SaveButton                  (shared; Correctable-Fields-aware, Section 1.4)
│   └── SaveAsPrompt                (shared; triggered by SaveButton when needed)
├── CreateSourceInlineDialog        (shared; "no MANUAL source exists" fallback, per brief 7.3)
└── UnsavedChangesGuard             (shared route-leave hook, Section 1.5)
```

Shared/reusable across the whole app, not just this phase: `SourcePicker` (a variant of Phase 5's `SourceMultiSelect`, single-select here), every JSON-shape widget in Section 4, `SaveButton`/`SaveAsPrompt`, `UnsavedChangesGuard`.

## 3. Field-Config Reference (Template for the Hand-Built Approach)

Since forms are hand-built rather than config-driven, no single config-object shape needs designing. Instead, each per-type form session followed this template, using Spell as the worked example:

```
SpellForm
├── name: text input, required
├── level: number input (0-9), required
├── school: select, required, options from known school values
├── castingTime: text input, required
├── range: text input, required
├── components: <ComponentsWidget> (Section 4)
├── material: text input, nullable
├── duration: text input, required
├── concentration: checkbox
├── ritual: checkbox
├── classes: <TagListWidget> (multi-select-style tag input, class names)
├── description: textarea, required
├── higherLevels: textarea, nullable
├── extraData.castingOptions, .damageRoll, etc: deferred to the dedicated Spell form
│   session — likely a smaller "advanced fields" collapsible section, not full parity
│   with every extraData key from the mapping tables
├── SourcePicker (create only)
├── SaveButton / SaveAsPrompt
```

Each per-type session followed: (1) fill in this same structure for its content type, reading required/nullable directly off that type's Zod schema; (2) confirm/refine that type's Correctable Fields list; (3) decide how much of `extraData` gets real form fields vs. staying import-only/read-only in the edit UI.

## 4. JSON-Widget Plan

Every field below requires a real structured widget per Section 1.3 — no exceptions, no fallback tier.

| Field(s) | Widget | Notes |
|---|---|---|
| `skillChoices`, `proficiencies`, `abilityBonuses`, race/subrace trait `grant`, any other Fixed/Choice Grant Shape usage | **`FixedChoiceGrantWidget`** | The single most-reused shape in the schema — worth building once, well, and reusing everywhere. Needs to support: fixed entries, `select` choices (with optional `from` list, optional `category` tags for mixed-type choices), `distribute` choices (a point pool with `maxPerOption`), and `amount` on ability-score-flavored choices. |
| `ContentMonster.abilityScores` | `AbilityScoreGrid` | Six labeled number inputs (STR/DEX/CON/INT/WIS/CHA). |
| `ContentMonster.speed`, `ContentRace`/`ContentSubrace.speed` | `SpeedWidget` | Labeled number inputs per movement type (walk/fly/swim/climb/burrow), only showing populated ones by default with an "add movement type" affordance. |
| `ContentMonster.actions`, `.legendaryActions` | `ActionListWidget` | Repeatable row editor; each row has name/description/actionType/damage sub-fields. The most complex widget in this list, given the composed-dice-string convention and per-action `actionType` tagging established in the mapping sessions. |
| `ContentItem.properties` | `PropertyListWidget` | Repeatable `{name, detail?}` rows, name from a known property list, detail only shown for properties that use it (e.g. Versatile). |
| `ContentRace`/`ContentSubrace`/`ContentClass`/`ContentSubclass` `traits`/`features` | `TraitListWidget` | Repeatable `{name, description, level, grant?}` rows; the `grant?` sub-field reuses `FixedChoiceGrantWidget`. |
| `ContentSpell.components` | `ComponentsWidget` | Simpler than most — likely just V/S/M checkboxes plus a material-description text field, composed into the display string on save. |
| `ContentMonster.damageResistances`/`.damageImmunities`/`.damageVulnerabilities`/`.conditionImmunities` | `ResistanceListWidget` | Needs to represent the composite shape from the Compendium sessions — plain `{type}` entries alongside the special "B/P/S from nonmagical, unless [bypassedBy]" composite entry as a distinct, recognizable row type, not force-fit into a generic list. |
| `extraData.spellcasting` (Monster) | `SpellcastingWidget` | Ability select, slot-level entries, and a spell-name list — ideally with the same name-matching-against-`ContentSpell` behavior the importer already does, surfaced as an autocomplete rather than free text. |

(A `TagListWidget` was also built during implementation, not in this original catalog — needed for `Spell.classes`, simple enough not to warrant its own design pass. See `DevTools/Notes/v0.7.notes.md`.)

## 5. Implementation Instructions for Claude Code (historical — already executed)

1. Set up the `@dragonledger/content-types` workspace package (Section 1.2) — move/establish the Zod schemas here first, since both server and client code will depend on it going forward. This is foundational and should happen before any form work begins.
2. Install `react-hook-form` and its Zod resolver package in `client/`.
3. Build `FixedChoiceGrantWidget` first, before any specific content-type form — it's the most-reused widget (Section 4) and several other widgets (`TraitListWidget`) compose it internally.
4. Build the remaining shared widgets from Section 4's table.
5. Build `SourcePicker`, `SaveButton`/`SaveAsPrompt` (wired to each content type's Correctable Fields subset schema per Phase 4's mechanism), `UnsavedChangesGuard`, and `CreateSourceInlineDialog`.
6. Do not attempt all 8 (or 10, counting Subclass/Subrace) forms in one pass. Each content type's form needs its own short design session (Section 3's template) before being built.
7. Before considering Phase 7 complete for a given content type: confirm its Correctable Fields list is real and reviewed (not copied blindly from another type), confirm every field's required/nullable treatment matches its Zod schema, and confirm the unsaved-changes guard and Save/Save-as behavior both function correctly against that type's actual field set.
8. Resolve `ContentClassOption`'s form treatment (own form vs. edited within its parent Class) before or during whichever future session covers Class's form specifically. (**Resolved: edited within `ClassForm`.**)
