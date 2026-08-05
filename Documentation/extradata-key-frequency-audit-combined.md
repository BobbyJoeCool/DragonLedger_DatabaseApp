# extraData Key Frequency Audit — Combined (Open5e + Compendium)

**Purpose:** merges `extradata-key-frequency-audit.md` (Open5e) and
`extradata-key-frequency-audit-compendium.md` (Compendium) into one
side-by-side view, with expanded real examples for every "non-flat"
(array/object) key — these are the fields most likely to need a real
decision about shape before either source's data can be promoted to a
column. This document doesn't replace either original report (their
per-source framing and full frequency tables still stand); it exists to
answer one question the two separate reports couldn't: **for the same
conceptual field, do Open5e and Compendium actually produce the same
shape?** The answer, table by table, is "no" more often than "yes" — see
the shape-divergence notes under each table.

**Method:** same as both source reports — SQLite `json_each`/`json_extract`
against `prisma/dev.db`, `key: count/total` scoped per-source, >5-row
threshold. Row counts below are current as of this audit.

| Table | Open5e rows | Compendium rows |
|---|---|---|
| ContentSpell | 339 | 1,004 |
| ContentMonster | 331 | 4,847 |
| ContentItem | 960 | 5,967 |
| ContentClass | 12 | 25 |
| ContentSubclass | 12 | 370 |
| ContentRace | 9 | 131 |
| ContentSubrace | 24 | 142 |
| ContentBackground | 4 | 223 |
| ContentCondition | 0 | 0 |
| ContentFeat | 0 | 580 |
| ContentClassOption | 0 | 126 |

---

## ContentMonster

### `spellcasting` (object) — shape matches, reliability doesn't

Both sources produce the same target shape —
`{ability?, saveDC?, atWill?, limitedUse?, slots?, cantrips?}` — because the
Compendium transform's `parseSpellcastingBlock` was deliberately written to
mirror Open5e's. But the two feed off very different raw text, and the
Compendium's prose is far less regular, so the *reliability* of the parse
differs sharply:

**Open5e** (clean — reads from a structured API's markdown-bulleted spell list):
```json
// Adult Black Dragon
{"ability":"Charisma","saveDC":17,"atWill":["Detect Magic","Fear","Acid Arrow"],
 "limitedUse":[{"frequency":"1/Day Each","spells":["Speak with Dead","Vitriolic Sphere"]}]}
```

**Compendium** (same shape, but the regexes miss real structure more often —
this is free XML prose, not markdown):
```json
// Nezznar the Black Spider — clean case
{"atWill":["dancing lights"],"limitedUse":[{"frequency":"1/Day each","spells":["darkness","faerie fire (save DC 12)"]}]}

// Evil Mage — a broken case: the "frequency" field swallowed an entire
// sentence fragment instead of a real frequency label, and the spell list
// itself leaked a stray "• Cantrips (at will):" bullet marker as if it
// were a spell name
{"saveDC":13,"limitedUse":[{"frequency":"level spellcaster that uses Intelligence as its spellcasting ability (spell save DC 13; +5 to hit with spell attacks). The mage knows the following spells from the wizard's spell list","spells":["• Cantrips (at will): light","mage hand","shocking grasp"]}],"slots":{"1":["charm person","magic missile"],"2":["hold person","misty step"]}}
```
The `Evil Mage` shape above is the real (`otherTags`/`spells`-array)
`extraData.spellcasting` value stored today — a downstream consumer reading
`limitedUse[0].spells` would display `"• Cantrips (at will): light"` as if
it were a spell name a monster can cast. **Any column/UI built on top of
`spellcasting` needs to treat the Compendium side as lower-confidence than
Open5e's**, or the underlying regex needs tightening first.

### `traits` (array) — shape matches, but scope differs by source

Both: `[{name, description}, ...]`. Open5e's `description` is always the
monster's own trait text. Compendium's is functionally the same, but the
transform additionally special-cases and *removes* two specific traits from
this array before storing it — `Proficiency Bonus` and `Legendary
Resistance` are pulled out into their own dedicated `extraData.proficiencyBonus`/
`legendaryResistances` scalar keys, so `traits` on a Compendium monster is
always missing those two even when present in the source XML. Open5e has no
such extraction — its `proficiencyBonus`/`legendaryResistances` are computed
separately from a CR table / regex, not pulled out of `traits`, so nothing
is removed from its `traits` array.

```json
// Open5e — Aboleth (5 traits, includes "Legendary Resistance" verbatim)
[{"name":"Amphibious","description":"The aboleth can breathe air and water."},
 {"name":"Eldritch Restoration","description":"If destroyed, the aboleth gains a new body in 5d10 days..."},
 {"name":"Legendary Resistance (3/Day, or 4/Day in Lair)","description":"If the aboleth fails a saving throw, it can choose to succeed instead."},
 {"name":"Mucus Cloud","description":"..."},
 {"name":"Probing Telepathy","description":"..."}]

// Compendium — Beast of the Sea (a Ranger's summoned-beast stat block, not
// a standalone monster — a real content shape Open5e doesn't have at all)
[{"name":"Armor Class","description":"13 plus your Wisdom modifier"},
 {"name":"Hit Points","description":"5 plus five times your Ranger level..."},
 {"name":"Amphibious","description":"The beast can breathe air and water."},
 {"name":"Primal Bond","description":"Add your Proficiency Bonus to any ability check..."}]
```

### `lairActions` (array) — shape matches, Compendium's is richer prose

Both: `[{name, description}]`. Open5e's SRD sample (331 monsters) has zero
non-null `lairActions` at all — none of the 331 imported creatures are
legendary/lair creatures. Compendium's 4,847-monster set has 143 real
examples:
```json
// Compendium — Arch-hag
[{"name":"Arch-hag Lairs","description":"Each arch-hag creates a magical home, such as a hidden demiplane, a mansion atop a storm cloud, or—in the case of the arch-hag Baba Yaga—a hut atop giant chicken legs. The interiors of these lairs frequently change or exhibit bewildering features.\n\tThe region containing an arch-hag's lair is altered by its presence...\n\nLapsus Linguae: Creatures (excluding the hag and its allies) within 1 mile of the lair subtract 1d10 from any ability checks...\n\nMeddlesome Magic: Whenever a creature other than the hag or its allies finishes a Long Rest within 1 mile of the lair, the next time that creature casts a spell using a spell slot, it also casts Confusion...\n\nIf the arch-hag is destroyed or moves its lair elsewhere, these effects end immediately."}]
```
No shape conflict here — just a coverage gap in the Open5e SRD sample, not
a transform difference.

### `damageResistances`/`damageImmunities`/`damageVulnerabilities` — real dedicated columns, but incompatible value shapes

This is the sharpest divergence in the whole database, and it's on a
**dedicated column**, not `extraData`. Both sources populate
`ContentMonster.damageResistances` (etc.) as a JSON string, but the array
element shape is fundamentally different per source:

```json
// Open5e — flat string array (source API already splits+keys damage types,
// discarding any qualifier like "nonmagical" or "unless silvered")
["acid"]
["lightning"]

// Compendium — composite object array (parsed from free-text XML by
// parseCompositeResistanceList, preserves qualifiers Open5e's shape can't)
[{"type":"radiant"}]
[{"type":"poison"}]
[{"types":["acid","cold","fire","lightning","poison"]}]
```
This is a **known, already-documented divergence** (see `shared/resistance.ts`'s
own comment and prior session memory) — not a bug, but the single most
important thing for a future schema-unification pass to resolve, since any
UI or filter built against "does this monster resist fire" has to handle
two incompatible shapes for the exact same column today.

### Scalar keys, summarized (see individual per-source reports for full tables)

| Key | Open5e | Compendium | Note |
|---|---|---|---|
| `proficiencyBonus` | 331/331, real range 2–9 | 4,847/4,847, but **0 on 54.5%** (no CR-fallback in Compendium transform) | Same conceptual field, Open5e's is trustworthy, Compendium's mostly isn't yet |
| `legendaryResistances` | 331/331, almost always 0 | 4,847/4,847, real distribution | Same shape/logic on both sides |
| `experiencePoints` | 331/331, real range | **not present at all** — no Compendium XML field carries XP | Compendium-side gap, not a transform bug |
| `category`/`subcategory` | 331/331, real but low-quality (`Beast` vs `Animals` casing inconsistency) | **not present** | Open5e-only concept |
| `ancestry` | **not present** | 2,064/4,847, real grouping key | Compendium-only concept, no Open5e equivalent |
| `environment` | **not present** | 1,244/4,847, real free text | Compendium-only concept |
| `telepathyRange` | **not present as extraData** (Open5e folds it into `senses` text) | 515/4,847, real integer | Same underlying fact (telepathy range), different representation — Compendium extracts it as a scalar via a shared helper (`shared/telepathy.ts`), Open5e leaves it embedded in prose |
| `armorClassDetail` | 330/331, almost always the same one value (`"natural armor"`) | **not present** | Open5e-only |

---

## ContentSpell

### `scalingDice` (Compendium) vs `castingOptions` (Open5e) — same real-world fact, structurally unrelated shapes

Both encode "how this spell's effect scales with a higher slot/character
level," but as genuinely different shapes with no shared field names at
all:

```json
// Open5e — Acid Arrow, castingOptions (7 entries, one per upcast slot
// level 3-9, many null fields — the schema anticipates range/duration/
// concentration/shape changing per option too, not just damage)
[{"type":"slot_level_3","damage_roll":"5d4","target_count":null,"duration":null,"range":null,"concentration":null,"shape_size":null,"desc":null},
 {"type":"slot_level_4","damage_roll":"6d4", ...},
 ... (through slot_level_9, "11d4")]

// Compendium — Arms of Hadar, scalingDice (9 entries, one per character
// level 1-9, keyed to a raw level number rather than a "slot_level_N" type
// string, and with no room for anything but dice+description)
[{"dice":"2d6","description":"Necrotic Damage","level":"1"},
 {"dice":"3d6","description":"Necrotic Damage","level":"2"},
 ... (through level "9", "10d6")]

// Compendium — Aura of Vitality, a single-entry case with level: null
// (a scaling effect not tied to a specific level/slot number at all)
[{"dice":"2d6","description":"Heal","level":null}]
```
A unified column would need to normalize both into one shape — likely
something like `{ trigger: "slot_level" | "character_level", triggerValue:
number | null, dice: string, description: string | null }` — since neither
source's native shape can represent the other's data as-is (Open5e's has no
per-entry damage *type* label distinct from the dice string; Compendium's
has no room for the non-damage fields Open5e's `castingOptions` schema
anticipates, like `duration`/`range`/`shape_size` changing on upcast).

### Scalar keys, summarized

| Key | Open5e | Compendium | Note |
|---|---|---|---|
| `savingThrow` | 128/339, real 6-value ability enum | **not present as its own key** — save DC/ability info for spells lives only in prose description, not extracted | Real gap on the Compendium side; would need new prose-parsing to extract |
| `damageRoll` | 119/339, real dice strings | **not present as its own key** — base (non-scaling) damage isn't extracted separately from `scalingDice`/description | Same gap |
| `damageTypes` | 107/339, single-element arrays | **not present** | Same gap |
| `targetType`/`targetCount` | 339/339 / 339/339, but low-signal (near-constant) | **not present** | Open5e-only, and already flagged as weak in the original report |
| `shapeType`/`shapeSize`/`shapeSizeUnit` | 52/339, 52/339, 339/339 (constant "feet") | **not present** | Open5e-only |
| `materialConsumed`/`attackRoll` | 57/339, 42/339 | **not present** | Open5e-only |
| `page`/`edition`/`thirdParty`/`homebrew`/`unearthedArcana`/`otherTags`/`additionalCitations` | **not present** — Open5e has no citation/tag concept at all | 567/1004, 564/1004, 278/1004, 142/1004, 18/1004, 68/1004, 58/1004 | Compendium-only concept (per-record source-book citation and name-tag parsing); Open5e's `sourceId` already encodes "which document," so there's no real gap here, just a different mechanism |

---

## ContentClass / ContentSubclass

### `features` (array) — same field name, different object shape

Both sources populate `extraData.features` on Class and Subclass, and both
are "everything not already captured by a dedicated column." But the
per-entry shape differs:

```json
// Open5e — Barbarian, features (has a `type` enum tag and a `levels`
// array, since one Open5e feature can recur at several levels)
[{"name":"Ability Score Improvement","description":"You gain the Ability Score Improvement feat...","type":"CLASS_LEVEL_FEATURE","levels":[12,16,4,8]},
 {"name":"Barbarian Subclass","description":"You gain a Barbarian subclass of your choice...","type":"CLASS_LEVEL_FEATURE","levels":[3]}]

// Compendium — Artificer, features (no `type`, and `level` is a single
// number, not an array — the Compendium's <autolevel level="N"> structure
// only ever attaches a feature to one level at a time, so there's no
// native way to represent "recurs at levels 4/8/12/16" as one entry the
// way Open5e's `gained_at[]` does; it would show up as 4 separate
// same-named Compendium feature entries instead)
[{"name":"Becoming An Artificer As A Level 1 Character","description":"As a 1st-level Artificer, you begin play with 8 + your Constitution modifier hit points.\n\nCore Artificer Traits\n\t• Primary Ability: Intelligence\n\t• Hit Point Die: D8 per Artificer level...","level":1}]
```
A real, previously undocumented shape conflict: `{type, levels: number[]}`
(Open5e) vs `{level: number}` (Compendium, singular, no type tag). Any
promotion of "class features" to a real relation/table needs to decide
whether to keep Compendium features as one row per level (matching its
native granularity) or attempt to collapse same-named same-description rows
across levels the way Open5e already does natively.

### `casterType` (Open5e-only) vs no equivalent

Open5e: 12/12, real 4-value enum (`FULL`/`HALF`/`NONE`/`PACT`) — this was a
deliberate Phase 2 design decision to leave in extraData. **Compendium has
no equivalent key at all** — the Compendium transform doesn't attempt to
classify caster type from `<spellAbility>`/`<slotsReset>`, it just
passes `<spellAbility>` straight to `spellcastingAbility` (this one *is* a
real dedicated column already). A unified `casterType` column would need
new Compendium-side inference logic (e.g. from `slotsReset` + whether
`spellAbility` is set) since the raw XML doesn't state it directly.

### Compendium-only keys with no Open5e equivalent

`toolProfs` (10/25 classes — real tool-proficiency prose, Open5e's
equivalent tool data isn't captured in extraData under the current Phase 2
transform at all), `slotsReset` (21/25 — real 2-value `"L"`/`"S"` enum, no
Open5e concept for it), plus the standard citation/tag cluster
(`page`/`edition`/`homebrew`/`thirdParty`/`unearthedArcana`/`otherTags`).

### ContentSubclass note

Same `features` shape divergence as Class. Compendium subclasses
additionally carry the full citation/tag cluster (`homebrew`: 81/370,
`thirdParty`: 63/370, `unearthedArcana`: 48/370 — all real, substantial
fractions, since UA/homebrew/third-party subclass variants are common in
the file) that Open5e subclasses have no equivalent for.

---

## ContentItem

### `properties` (dedicated column, not extraData) — shape matches well here

One of the few places the two sources agree cleanly:
```json
// Open5e — Battleaxe / Blowgun
[{"name":"Topple"},{"name":"Versatile","detail":"1d10"}]
[{"name":"Ammunition","detail":"Range 25/100; Needle"},{"name":"Loading"},{"name":"Vex"}]

// Compendium — Psychic Blade / Staff
[{"name":"Finesse"},{"name":"Thrown"}]
[{"name":"Versatile","detail":"1d8"}]
```
Both `{name, detail?}`, both populated from a lookup table mapping
short codes/keys to display names (Open5e: `properties[].property.name`
from the API; Compendium: `PROPERTY_CODES` mapping single-letter codes like
`V`→`"Versatile"`). No shape conflict — this is a genuine success case
worth pointing to as a model for how the resistance-array unification
above could work.

### `isMartial` — same key name, both currently broken, in different ways

**Open5e**: 454/960 weapon rows, real `true`/`false` split (153/301) — this
one looks trustworthy per the original audit.
**Compendium**: 5,967/5,967 (every item, not just weapons), **constant
`false`** — a real transform bug (`isMartial` is derived from the item's
`M` property code, which empirically doesn't correlate with real martial
weapons in the Compendium's coding scheme; see
`extradata-key-frequency-audit-compendium.md` for detail). A unified
`isMartial` column needs the Compendium side fixed first, or it will import
uniformly-wrong data for every future Compendium item.

### Weapon/armor scalar clusters — same concepts, same key names in most cases, near-identical values

`strRequired` (Open5e 110/960, integers 10-15 across all armor tiers;
Compendium 171/5,967, only 13/15/16 seen — both real, both armor-only),
`stealthDisadvantage` (Open5e 110/960 real 44/66 split; Compendium not
individually re-verified for a true/false split but present on 369/5,967
armor rows), `attunementDetail` (Open5e 19/960, rare — 2%; Compendium
930/5,967, common — 15.6%, richer variety). `range` matches in concept
(Open5e: `"20/60 ft."` with unit suffix; Compendium: `"20/60"` with no
unit) — a real, minor format reconciliation needed if unified.

`size` (Open5e-only, constant `"tiny"` on all 960 rows — already flagged as
a data-quality dead end in the original report, not usable) has **no
Compendium equivalent at all** — the Compendium item XML has no size field.

---

## ContentBackground

### `grantedFeat` (object) — shape matches exactly

```json
// Open5e — Acolyte / Criminal
{"name":"Magic Initiate (Cleric)"}
{"name":"Alert"}

// Compendium — Artisan / Charlatan
{"name":"Crafter"}
{"name":"Skilled"}
```
Identical `{name}` shape on both sides — this is the cleanest cross-source
match in the whole audit. Real gap in the original Open5e-only report (only
4 SRD backgrounds existed to sample) is now resolved: Compendium confirms
67 real examples of the same shape, at 30% frequency (67/223). **Strong
combined column/relation candidate.**

### `equipment` (text) — same key, same free-text-prose intent, on both sides

```json
// Open5e — Acolyte
"*Choose A or B:* (A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP"

// Compendium — Artisan
"Choose A or B: (A) Artisan's Tools (same as above), 2 Pouches, Traveler's Clothes, 32 GP; or (B) 50 GP"
```
Same intent, near-identical prose format (Open5e wraps the "Choose A or B"
lead-in in markdown emphasis, Compendium doesn't) — low-risk to unify into
one column as-is (free text), no real reconciliation needed.

### `unrecognizedTraits` (Compendium) vs `unrecognizedBenefits` (Open5e) — same escape-hatch role, empty on the Open5e side only because the sample is tiny

Open5e: 0/4 — the 4-background SRD sample never hit the catch-all.
Compendium: 150/223 (67%), and it's carrying real content, not noise:
```json
// Compendium — Custom Background
[{"name":"Choose Abilities","description":"Choose three abilities that seem appropriate for the background: ..."},
 {"name":"Choose a Feat","description":"Choose one feat from the Origin category. See the Player's Handbook for examples of Origin feats."},
 {"name":"Choose Skill Proficiencies","description":"Choose two skills appropriate for the background..."},
 {"name":"Choose a Tool Proficiency","description":"Choose one tool used in the practice of the background or often associated with it."},
 {"name":"Choose Equipment","description":"Assemble a package of equipment worth 50 GP..."}]
```
Both catch-alls use the exact same `{name, description}` shape already —
the only real difference is naming (`unrecognizedTraits` vs
`unrecognizedBenefits`) and how much real, structured content is landing in
each. Worth pulling `"Suggested Characteristics"` (a very common,
genuinely valuable roleplay-prompt entry inside Compendium's
`unrecognizedTraits`, per the Compendium-only report) out into its own
recognized field before any unification, since right now it's
indistinguishable from truly malformed data in both catch-alls.

---

## ContentRace / ContentSubrace

Sharpest availability gap in the database: **Open5e's extraData is `null`
on every single Race/Subrace row** (0/9, 0/24) — everything routes through
the dedicated `traits[]` column instead, by original Phase 2 design.
Compendium populates a rich, real `extraData` on both tables (see the
Compendium-only report for the full frequency table: `rawAbility`,
`creatureType`, `rawProficiency`, `rawResist`, etc., all real, all
un-columned raw text kept alongside the same fact's `traits[]` entry as a
cross-check/backup, per the resolved `v1-roadmap-open-decisions.md §2.5.1`
design question).

There is no shape conflict to resolve here since Open5e simply doesn't use
extraData on these two tables at all — but it does mean **any promotion
decision for Race/Subrace fields (ability bonuses, resistances,
proficiencies, creature type) has real data on the Compendium side only**;
Open5e's equivalent facts already live in `traits[]` prose and would need
their own prose-parsing pass to populate the same columns, matching the
pattern classes/backgrounds already went through.

---

## ContentFeat / ContentClassOption / ContentCondition

**ContentFeat / ContentClassOption**: 0 Open5e rows (both are
Compendium-only content types under the current Phase 2 Open5e transform —
Open5e's API has no feat or "class option pool" concept mapped in yet), 580
and 126 Compendium rows respectively. Nothing to compare cross-source; see
the Compendium-only report for their full frequency tables (`rawCategory`,
`special`, `modifiers`, citation/tag cluster).

**ContentCondition**: 0 rows on both sides currently — Open5e's SRD-2024
document has no conditions tagged (confirmed real upstream API gap, Phase 2
dev log), and the Compendium file format has no `<condition>` element at
all (confirmed real file-format limitation, Phase 2.5 dev log). Genuinely
empty on both sides, not a transform gap on either.

---

## Summary — what a schema-unification pass actually needs to resolve

Ranked by how much real design work each requires, independent of raw
frequency:

1. **`ContentMonster.damageResistances`/`damageImmunities`/`damageVulnerabilities`/`conditionImmunities`** — same dedicated column, genuinely incompatible value shapes (flat string vs. composite object) on every single row of every source. The one true "must resolve before either source can be trusted uniformly" case.
2. **`ContentClass`/`ContentSubclass.extraData.features`** — same key, `{type, levels[]}` (Open5e) vs `{level}` (Compendium, no type, singular level) — needs a decision on whether Compendium features get collapsed across levels to match Open5e's granularity, or Open5e's get exploded to match Compendium's.
3. **`ContentSpell` scaling data** — `castingOptions` (Open5e) vs `scalingDice` (Compendium) are conceptually the same fact with no shared field names at all; a unified shape needs designing from scratch, not just picking one side.
4. **`ContentMonster.isMartial`-equivalent-severity bug**: Compendium's `ContentItem.extraData.isMartial` is constant `false` on all 5,967 rows — needs a real fix before it can feed a unified column at all, since Open5e's version of the same key is otherwise trustworthy.
5. **`ContentMonster.extraData.proficiencyBonus`** — same key, same shape, Compendium just needs the same CR-inference fallback Open5e already has (`inferProficiencyBonus`, already written and reusable).
6. **Clean wins, safe to unify as-is**: `ContentBackground.grantedFeat` (identical shape both sides), `ContentItem.properties` (identical shape both sides, dedicated column), `ContentBackground.equipment`/`unrecognizedTraits`↔`unrecognizedBenefits` (same shape, different key name only).
7. **One-sided concepts with no gap to close** (real on one source, structurally absent — not broken — on the other): Compendium's `ancestry`/`environment`/citation-tag cluster/`toolProfs`/`slotsReset`; Open5e's `category`/`experiencePoints`/`targetType`/shape-AoE cluster/`casterType`.
