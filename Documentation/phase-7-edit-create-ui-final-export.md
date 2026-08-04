# DragonLedger DatabaseApp — Phase 7 Edit & Create UI: Final Design Export

**Note:** this phase now covers **8 content types**, not the original brief's 7 — Feat was added during the Compendium sessions. `ContentClassOption` (Metamagic/Invocations/Maneuvers) is not included as its own form; whether it needs one, or is edited as part of its parent Class, remains an open decision (see Section 6).

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

### 1.5 Unsaved-Changes Handling

A route-leave guard warns before discarding unsaved changes (navigating to Browse, closing, hitting back with a dirty form) — not skipped for v1. Consistent with the "marketable product" framing from Section 1.3; silent data loss isn't acceptable for a real tool, even a small one.

### 1.6 Homebrew-Source Picker on Create

Defaults to the seeded, non-deletable `"homebrew"` Source (Phase 4) automatically, with a dropdown available to redirect to a different `MANUAL` source. Matches how `saveAs: "homebrew"` already resolves to this same source by default when no target is specified — the create form's default is a natural continuation of that existing behavior, not a new pattern.

**Stretch goal, not core scope:** the create-form source default may eventually be user-configurable — either a single global preference, or a richer per-content-type preference map (e.g. new Spells default to one homebrew collection, new Monsters to another). Exact shape deliberately left undecided; noted as a future direction rather than committed to prematurely.

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

Since forms are hand-built rather than config-driven, no single config-object shape needs designing. Instead, each future per-type form session should follow this template, using Spell as the worked example:

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

Each future per-type session should: (1) fill in this same structure for its content type, reading required/nullable directly off that type's Zod schema; (2) confirm/refine that type's Correctable Fields list (a real gap flagged back in Phase 4 — several types never got theirs defined); (3) decide how much of `extraData` gets real form fields vs. staying import-only/read-only in the edit UI.

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

## 5. Implementation Instructions for Claude Code

1. Set up the `@dragonledger/content-types` workspace package (Section 1.2) — move/establish the Zod schemas here first, since both server and client code will depend on it going forward. This is foundational and should happen before any form work begins.
2. Install `react-hook-form` and its Zod resolver package in `client/`.
3. Build `FixedChoiceGrantWidget` first, before any specific content-type form — it's the most-reused widget (Section 4) and several other widgets (`TraitListWidget`) compose it internally.
4. Build the remaining shared widgets from Section 4's table.
5. Build `SourcePicker`, `SaveButton`/`SaveAsPrompt` (wired to each content type's Correctable Fields subset schema per Phase 4's mechanism), `UnsavedChangesGuard`, and `CreateSourceInlineDialog`.
6. Do not attempt all 8 (or 10, counting Subclass/Subrace) forms in one pass. Each content type's form needs its own short design session (Section 3's template) before being built — this phase's export intentionally stops at the shared infrastructure layer, not full per-type field lists, since those weren't decided in this session.
7. Before considering Phase 7 complete for a given content type: confirm its Correctable Fields list is real and reviewed (not copied blindly from another type), confirm every field's required/nullable treatment matches its Zod schema, and confirm the unsaved-changes guard and Save/Save-as behavior both function correctly against that type's actual field set.
8. Resolve `ContentClassOption`'s form treatment (own form vs. edited within its parent Class) before or during whichever future session covers Class's form specifically — flagged as unresolved, not deferred by accident.
