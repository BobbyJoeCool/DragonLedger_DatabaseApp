# DragonLedger DatabaseApp — Schema Expansion Design Handoff

> **Purpose of this document:** self-contained handoff from a design session that
> worked through the open questions in `schema-expansion-design-review.md` and the
> three extraData frequency audits. It contains the decisions made, the updated
> Prisma models, and a checklist for Claude Code to implement directly. Companion
> documents (same repo): `schema-expansion-design-review.md` (the full context this
> session worked from), `extradata-key-frequency-audit.md` (Open5e), `extradata-key-frequency-audit-compendium.md`
> (Compendium), `extradata-key-frequency-audit-combined.md` (cross-source shape
> conflicts). See also `schema-expansion-session-log.md` for how each decision was
> reached.

**Session date:** August 5, 2026

---

## 1. Decisions made

### 1.1 Monster resistances/immunities/vulnerabilities/condition immunities

**Decision:** unified shape for all four dedicated columns:

```json
[{ "types": ["fire"], "nonmagical": false, "bypassedBy": null }]
```

Both sources write to this shape. Open5e maps its flat `["acid"]` array in
losslessly (`types: ["acid"], nonmagical: false, bypassedBy: null`). Compendium's
existing composite output already matches this shape via `shared/resistance.ts`.

**Reasoning:** this is a real, already-shipped column both importers write to
today with genuinely incompatible shapes, not a hypothetical extraData
promotion. The character sheet app needs to know whether a resistance is
conditional (nonmagical attacks, unless silvered) to correctly decide whether
to halve incoming damage, so the qualifier can't be dropped even though display
is plain text. Plain text gets derived from this structure at render time; it
doesn't replace it.

**Fix included:** Open5e's transform currently reads only the flat
`damage_resistances`/etc. arrays and discards the paired `damage_resistances_display`/etc.
string fields the API also returns. Those display strings are standard 5e
stat-block prose and should be run through the same composite parser Compendium
uses, rather than writing separate parsing logic per source.

**Caveat:** the sample record used to confirm this (Aboleth) has all `_display`
fields empty, since it has no resistances. Pull a real monster with a known
qualified resistance (CR 8+) and check the actual populated string shape before
finalizing the parser.

`bypassedBy` stays free text (not an enum) for now. Real Compendium data on it
is too sparse to build a taxonomy from yet.

### 1.2 Spell scaling (upcast damage / cantrip growth)

**Decision:** unified shape, replacing both `extraData.castingOptions` (Open5e)
and `extraData.scalingDice` (Compendium) with one key, `extraData.scaling`:

```json
{ "trigger": "slot_level" | "character_level", "triggerValue": number | null, "dice": string, "description": string | null }
```

**Reasoning:** the character sheet app needs to calculate scaling damage, same
requirement as the resistance case, so the shape has to be queryable, not just
displayable. The `trigger` type is decided from `ContentSpell.level` (an
existing dedicated column) rather than guessed: `level === 0` means character-level
scaling (cantrips), anything else means slot-level scaling (upcasting). This
resolves a real ambiguity found during design: Compendium's `<roll level="N">`
element means different things depending on what kind of spell it's attached to,
and the existing spell-level column already disambiguates it cleanly.

Open5e's `castingOptions` schema anticipates non-damage upcast changes
(duration/range/concentration/shape_size varying per slot), but every sampled
record has these as null. They're intentionally dropped from the unified shape
rather than carried forward unused. If real data ever populates them, that's a
small additive migration later.

`ContentSpell.higherLevels` (free-text "At Higher Levels" prose) stays as its
own column alongside `extraData.scaling` — structured data for calculation,
prose for flavor/edge cases.

**Open item, not resolved here:** Compendium's "Aura of Vitality" case has
`level: null` (a scaling effect not tied to any specific level or slot). Not
enough examples to know if this is common. Worth a manual check once real
queries are running against the new shape, rather than forcing a rule from one
example.

### 1.3 Class/Subclass features

**Decision:** new relation table, not a JSON blob.

```prisma
model ContentClassFeature {
  id          String           @id @default(cuid())
  classId     String?
  class       ContentClass?    @relation(fields: [classId], references: [id], onDelete: Cascade)
  subclassId  String?
  subclass    ContentSubclass? @relation(fields: [subclassId], references: [id], onDelete: Cascade)
  level       Int
  name        String
  description String
  type        String?

  @@index([classId, level])
  @@index([subclassId, level])
}
```

A row belongs to exactly one of `classId`/`subclassId`; the other stays null.
`type` carries Open5e's feature-type tag when known, stays null on Compendium
rows (its XML has no equivalent). Open5e's grouped `{levels: [4,8,12,16]}`
entries explode into one row per level to match Compendium's native
granularity.

**Reasoning:** the character sheet app needs to query features by level ("what
does a level 7 Barbarian have"), and once the data is one-row-per-level anyway,
that's relational data, not blob data. A real table with an indexed `level`
column gives a normal `WHERE classId = X AND level <= 7` instead of a
`json_each` scan on every read, which matters given this gets called on every
level-up and every character sheet render.

**Named tradeoff:** exploding means a recurring feature (e.g. Ability Score
Improvement at levels 4/8/12/16) shows up as multiple same-named rows if
listing "all of a class's features" in one view rather than "features at level
N." Correct for the query pattern described, worth knowing about ahead of time.

### 1.4 Bug fixes (no schema change)

**`ContentItem.extraData.isMartial` (Compendium, constant `false`):**
`Compendium_Structure.md`'s own code tables show a likely root cause: `<item><type>`
uses `M` for "Melee Weapon" while `<item><property>` uses `M` for "Martial" —
same letter, different fields, different meanings. The fix is to split
`<property>` on commas and check for an exact `M` token, then set `isMartial`
from that and `isSimple` as its inverse. Verify against known martial weapons
(Longsword, Greatsword) before trusting.

**`ContentMonster.extraData.proficiencyBonus` (Compendium, defaults to `0` on
54.5% of rows):** add the same `inferProficiencyBonus(cr)` fallback Open5e's
transform already has, for records with no "Proficiency Bonus" trait.

### 1.5 One-sided key decisions

**`ContentMonster.experiencePoints`:** promoted to a real `Int` column (moved
out of `extraData`), computed from `challengeRating` via the standard 5e
CR-to-XP table for both sources, rather than left as a raw passthrough Open5e
has and Compendium structurally can't (its XML has no XP field at all).

**Compendium spell prose-parsing (new):** `savingThrow`, `damageRoll`,
`damageTypes`, `materialConsumed`, `attackRoll` currently exist only for
Open5e (parsed from its structured API response). New extraction is worth
writing against Compendium's spell description prose ("make a Dexterity saving
throw," "the spell consumes the material component"), since the character
sheet app needs these queryable regardless of source. Same best-effort caveat
as every other prose-parsed field in this pipeline — validate against a real
sample before trusting broadly.

**`ContentClass.extraData.casterType` (Compendium, currently absent):**
inferred rather than left Open5e-only:

- `spellcastingAbility` is null → `NONE`
- `slotsReset === "S"` (short rest recovery, the defining trait of Pact
  Magic) → `PACT`
- `slotsReset === "L"` alone cannot distinguish `FULL` from `HALF` (both full
  and half casters reset on long rest), so this needs a new hardcoded
  per-class lookup table for that split — the same pattern the Open5e
  transform already uses for `SPELLCASTING_ABILITY_BY_CLASS`. This is a
  correction to the original framing of "infer from slotsReset +
  spellcastingAbility alone," which can only reliably resolve NONE and PACT.

**`ContentRace`/`ContentSubrace` `creatureType` and related fields (new
Open5e-side parsing):** Open5e's `extraData` is currently `null` on every race
row by original design — everything routes through `traits[]` prose. Worth a
new parser to extract `creatureType` (and other fields Compendium already
captures) out of Open5e's `traits[]`, so the field is queryable regardless of
source, matching the precedent already set for Class/Background parsing.

**Left as-is, no action:**

- `ContentMonster.category`/`subcategory` and `ContentSpell.targetType`/`targetCount`/shape
  cluster: already flagged as low-signal/near-constant in the original audits,
  not worth building missing-side extraction for weak data.
- The citation/tag cluster (`page`, `edition`, `homebrew`, `thirdParty`,
  `unearthedArcana`, `otherTags`): not a real gap. Open5e's `sourceId` already
  encodes "which document" — just via a different mechanism (one Source row per
  API document vs. one per cited book).

### 1.6 Known issue, deferred

`ContentSubrace.extraData.descriptionStrippingSkipped` is `true` on all 142
real Compendium subraces — the safeguarded paragraph-dedup mechanism has never
once actually stripped anything in practice. Flagged as a known issue for
separate investigation (either the heuristic is too conservative or the
parent/subrace paragraph-matching assumption doesn't hold in real data).
Explicitly not part of this schema migration.

---

## 2. Updated Prisma models

Only models with schema-level changes are shown in full below. Unchanged at
the schema level: `Source`, `ImportJob`, `ContentItem`, `ContentRace`,
`ContentSubrace`, `ContentBackground`, `ContentCondition`, `ContentFeat`,
`ContentClassOption`, `Language`. (`ContentItem` and `ContentRace`/`ContentSubrace`
have transform-level fixes per §1.4/§1.5 with no column changes — just updated
`extraData` contents.)

```prisma
model ContentMonster {
  id                    String  @id @default(cuid())
  slug                  String
  sourceId              String
  source                Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name                  String
  size                  String
  monsterType           String
  alignment             String
  armorClass            Int
  hitPoints             Int
  hitDice               String
  speed                 String  // JSON
  abilityScores         String  // JSON
  savingThrows          String?
  skills                String?
  damageResistances     String? // JSON array: [{ types: string[], nonmagical: boolean, bypassedBy: string | null }]
  damageImmunities      String? // same shape as damageResistances
  damageVulnerabilities String? // same shape as damageResistances
  conditionImmunities   String? // same shape as damageResistances (types = condition names)
  senses                String?
  languages             String?
  challengeRating       String
  experiencePoints      Int     // computed from challengeRating at import time, both sources
  actions               String  // JSON array, each tagged actionType: "action"|"bonus"|"reaction"
  legendaryActions      String?
  description           String?
  extraData             String? // armorClassDetail, lairActions, traits[], spellcasting,
  // proficiencyBonus, legendaryResistances, category/subcategory,
  // ancestry, environment, telepathyRange (Compendium only)

  @@unique([sourceId, slug])
  @@index([challengeRating])
  @@index([monsterType])
}

model ContentSpell {
  id            String  @id @default(cuid())
  slug          String
  sourceId      String
  source        Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name          String
  level         Int
  school        String
  castingTime   String
  range         String
  components    String
  material      String?
  duration      String
  concentration Boolean
  ritual        Boolean
  classes       String  // JSON array of class display names
  description   String
  higherLevels  String? // free-text "At Higher Levels" prose, kept alongside extraData.scaling
  extraData     String? // scaling[] (both sources, shape below), damageRoll, damageTypes,
  // savingThrow, attackRoll, materialConsumed (both sources after this pass),
  // targetType/targetCount, shape info, reactionCondition, materialCost
  // scaling entry shape: { trigger: "slot_level" | "character_level",
  //   triggerValue: number | null, dice: string, description: string | null }

  @@unique([sourceId, slug])
  @@index([level])
  @@index([school])
}

model ContentClass {
  id                  String  @id @default(cuid())
  slug                String
  sourceId            String
  source              Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name                String
  hitDie              Int
  primaryAbility      String  // JSON: { abilities: string[], logic: "AND"|"OR" }
  savingThrows        String  // JSON array
  armorProfs          String  // JSON array
  weaponProfs         String  // JSON array
  skillChoices        String  // JSON, Fixed/Choice Grant Shape
  spellcastingAbility String?
  description         String
  extraData           String? // casterType (FULL/HALF/NONE/PACT, both sources after this pass),
  // toolProfs/slotsReset (Compendium only)

  subclasses   ContentSubclass[]
  classOptions ContentClassOption[]
  features     ContentClassFeature[]

  @@unique([sourceId, slug])
}

model ContentSubclass {
  id          String        @id @default(cuid())
  slug        String
  sourceId    String
  source      Source        @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  classId     String? // nullable per Phase 4, was required with onDelete: NoAction originally
  class       ContentClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
  name        String
  description String
  extraData   String? // unresolvedClassName if cross-source resolution (see Compendium docs) fails

  features ContentClassFeature[]

  @@unique([sourceId, slug])
}

model ContentClassFeature {
  id          String           @id @default(cuid())
  classId     String?
  class       ContentClass?    @relation(fields: [classId], references: [id], onDelete: Cascade)
  subclassId  String?
  subclass    ContentSubclass? @relation(fields: [subclassId], references: [id], onDelete: Cascade)
  level       Int
  name        String
  description String
  type        String? // Open5e's feature-type tag when known (e.g. CLASS_LEVEL_FEATURE); null on Compendium rows

  @@index([classId, level])
  @@index([subclassId, level])
}
```

**Relations & FK behavior for the new table:** `ContentClassFeature` has no
direct `sourceId`; it cascades transitively. Deleting a `Source` cascades to
`ContentClass`/`ContentSubclass` rows (existing behavior), which cascade to
their `ContentClassFeature` rows via the `onDelete: Cascade` on both FKs above.
A feature row must have exactly one of `classId`/`subclassId` set; this isn't
enforceable at the Prisma schema level and should be validated in the transform
layer before insert.

---

## 3. Implementation Instructions for Claude Code

1. Add the `ContentClassFeature` model to `schema.prisma`. Add
   `features ContentClassFeature[]` to `ContentClass` and `ContentSubclass`.
2. Add `experiencePoints Int` to `ContentMonster`; remove it from that model's
   `extraData` comment.
3. Run `prisma migrate dev --name schema-expansion-phase-1`.
4. Update the Open5e monster transform to write `experiencePoints` to the new
   column (existing passthrough value, just relocated).
5. Update the Compendium monster transform to compute `experiencePoints` from
   `challengeRating` via the standard 5e CR-to-XP table (Compendium's XML has
   no XP field, so this is a new computed value, not a passthrough).
6. Update the Open5e monster transform to read `damage_resistances_display`/`damage_immunities_display`/`damage_vulnerabilities_display`/`condition_immunities_display`
   and parse them through the same composite parser Compendium uses in
   `shared/resistance.ts`, replacing the current flat-array passthrough. Pull
   one real monster with a known qualified resistance and check the actual
   `_display` string format before finalizing the regex.
7. Update the Compendium spell transform to output `extraData.scaling` in the
   unified shape (rename from `scalingDice`), setting `trigger` from
   `spell.level` (`0` → `character_level`, else `slot_level`).
8. Update the Open5e spell transform to output `extraData.scaling` in the
   unified shape (rename from `castingOptions`), dropping the unused
   duration/range/concentration/shape_size fields.
9. Write new Compendium spell prose-parsers for `savingThrow`, `damageRoll`,
   `damageTypes`, `materialConsumed`, `attackRoll`. Validate output against a
   representative sample of real spells before merging.
10. Build `ContentClassFeature` population logic in both transforms: explode
    Open5e's grouped `levels[]` features into one row per level; write
    Compendium's already-one-row-per-level features directly. Remove
    `features` from both models' `extraData` comments once migrated.
11. Fix the Compendium item transform's `isMartial` derivation: check for an
    exact `M` token in the comma-split `<property>` list (not `<type>`), set
    `isSimple` as the inverse. Verify against known martial weapons (Longsword,
    Greatsword) in a real import before trusting.
12. Add the `inferProficiencyBonus(cr)` fallback (already written for Open5e)
    to the Compendium monster transform's `proficiencyBonus` derivation.
13. Add `casterType` inference to the Compendium class transform:
    `spellcastingAbility === null` → `NONE`; `slotsReset === "S"` → `PACT`;
    otherwise consult a new hardcoded per-class `FULL`/`HALF` lookup table.
14. Write a new Open5e race trait parser to extract `creatureType` (and other
    fields Compendium already captures) from `traits[]` prose into
    `extraData`, matching Compendium's existing key names where the concept
    lines up.
15. File `ContentSubrace.extraData.descriptionStrippingSkipped` being `true`
    on 100% of real subraces as a separate known-issue ticket. Not part of
    this migration; do not attempt to fix inline.
16. After implementation, re-run all three extraData frequency audits
    (`extradata-key-frequency-audit.md`, `-compendium.md`, `-combined.md`)
    against fresh imports to confirm the shapes actually converge and the two
    bug fixes (`isMartial`, `proficiencyBonus`) produced real, sane
    distributions rather than a different constant value.
