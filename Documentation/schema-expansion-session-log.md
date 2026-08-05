# Session Log — Schema Expansion Design Conversation

**Date:** August 5, 2026
**Participants:** project owner, Claude (Sonnet 5)
**Purpose:** work through the open questions in `schema-expansion-design-review.md`
and decide how to unify the Open5e/Compendium extraData shapes, informed by
`extradata-key-frequency-audit.md`, `-compendium.md`, and `-combined.md`.
**Output:** `schema-expansion-design-handoff.md`

---

## Session flow

**1. Context gathering.** Reviewed the four uploaded documents (both audits,
the combined audit, and the design review) plus the project's schema brief and
API reference docs to understand the two import pipelines, the current
`schema.prisma`, and every documented shape conflict between Open5e and
Compendium.

**2. Resistance/immunity/vulnerability shape.**

- Asked how the read side should display resistances (badges vs. full
  qualifiers vs. hybrid), and how to sequence the two known Compendium bugs.
- Answer: display is plain text, but the real goal is the character sheet app
  needing to programmatically determine whether a hit should be halved.
- This reframed the decision from a display question to a data-contract
  question. Proposed a unified `{types, nonmagical, bypassedBy}` shape;
  confirmed.
- Follow-up: asked whether Open5e's side of the qualifier data could be
  recovered via regex. Found that Open5e's API already returns
  `_display` string fields alongside the flat arrays, currently unused by the
  transform, rather than requiring new extraction from nothing.
- **Decision locked.**

**3. Spell scaling shape.**

- Asked three questions: whether Heroes needs to calculate scaling damage,
  whether cantrip vs. slot-level scaling should be tagged explicitly, and
  whether structured data should replace or supplement the existing
  `higherLevels` prose column.
- Answers: needs to be calculable; tag explicitly; keep both structured data
  and prose.
- While mapping the two source shapes, found a real ambiguity: Compendium's
  `<roll level="N">` element means character level for cantrips but spell slot
  level for leveled spells — same field, context-dependent meaning. Resolved
  using the existing `ContentSpell.level` column to disambiguate rather than
  guessing.
- Proposed `{trigger, triggerValue, dice, description}`, flagged two edge
  cases (unobserved non-damage upcast fields, a `level: null` outlier) as
  explicit assumptions rather than silently deciding them.
- **Decision locked.**

**4. Class/Subclass features shape.**

- Asked whether Heroes needs to query by level, whether this should become a
  real relation table instead of JSON, and which granularity to normalize to.
- Answers: needs to be queryable; wanted a recommendation on the table
  question; chose to explode to one-row-per-level.
- Recommended a real `ContentClassFeature` relation table given the query
  pattern and the now-settled one-row-per-level granularity, with reasoning
  (indexed queries vs. JSON scans on a hot path). Named the tradeoff
  (duplicate-looking rows for recurring features) explicitly.
- **Decision locked.**

**5. Remaining smaller items.** Asked how to handle the rest (walk through
each vs. bundle as implementation notes vs. defer). Chose to walk through
each.

- **isMartial bug (Compendium):** identified a likely root cause directly from
  the project's own `Compendium_Structure.md` — an `M` code collision between
  `<item><type>` (Melee) and `<item><property>` (Martial). Proposed as an
  implementation fix, confirmed.
- **proficiencyBonus bug (Compendium):** straightforward reuse of Open5e's
  existing CR-inference helper. Confirmed.
- **One-sided keys batch:** sorted into "no action needed" (low-signal fields
  already flagged weak in the audits, and the citation/tag cluster which
  isn't a real gap), one proposed free win (compute `experiencePoints` from
  `challengeRating` instead of treating it as source-dependent), and three
  real decisions (Compendium spell prose-parsing for
  savingThrow/damageRoll/damageTypes/materialConsumed/attackRoll; casterType
  inference for Compendium classes; and, raised separately afterward, Open5e
  race trait parsing for creatureType). All confirmed yes.
  - Correction made during casterType design: the originally-proposed
    inference method (`slotsReset` + `spellcastingAbility` presence alone)
    can only reliably resolve `NONE` and `PACT`. Flagged that `FULL`/`HALF`
    needs an additional hardcoded per-class table, since both caster tiers
    reset on long rest and nothing in the raw data distinguishes them.
- **descriptionStrippingSkipped (100% true on all subraces):** confirmed as a
  known issue, filed for separate investigation, explicitly kept out of this
  migration's scope.

**6. Handoff.** Produced `schema-expansion-design-handoff.md` (decisions,
updated Prisma models, implementation checklist) and this log.

---

## Decisions at a glance

| #   | Item                                                                           | Outcome                                                                                    |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | Monster damage resistance/immunity/vulnerability shape                         | Unified `{types, nonmagical, bypassedBy}`; Open5e switches to its unused `_display` fields |
| 2   | Spell scaling shape                                                            | Unified `{trigger, triggerValue, dice, description}`; trigger decided from `spell.level`   |
| 3   | Class/Subclass features                                                        | New `ContentClassFeature` relation table, one row per level                                |
| 4   | Compendium `isMartial` bug                                                     | Fix: check `<property>` list for exact `M`, not `<type>`                                   |
| 5   | Compendium `proficiencyBonus` bug                                              | Fix: reuse existing `inferProficiencyBonus(cr)` fallback                                   |
| 6   | Monster `experiencePoints`                                                     | Promoted to real column, computed from CR for both sources                                 |
| 7   | Spell savingThrow/damageRoll/damageTypes/materialConsumed/attackRoll           | New Compendium-side prose-parsing                                                          |
| 8   | Class `casterType`                                                             | New Compendium-side inference (spellcastingAbility + slotsReset + new per-class table)     |
| 9   | Race/Subrace `creatureType` and related                                        | New Open5e-side parsing from `traits[]`                                                    |
| 10  | `descriptionStrippingSkipped` at 100%                                          | Filed as known issue, deferred                                                             |
| —   | Monster category/subcategory, spell target/shape cluster, citation/tag cluster | No action, low signal or not a real gap                                                    |

## Open items carried into the handoff doc, not resolved this session

- Whether Compendium's `level: null` scaling entries (e.g. "Aura of Vitality")
  represent a real pattern or a one-off — needs checking against more real
  data.
- Whether Open5e's `castingOptions` non-damage upcast fields
  (duration/range/concentration/shape_size) ever actually populate anywhere
  in the wild; currently assumed unused and dropped from the unified shape.
- Root-cause investigation of `descriptionStrippingSkipped`, deferred to a
  separate ticket by design.
