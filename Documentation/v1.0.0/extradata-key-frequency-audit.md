# extraData Key Frequency Audit

**Purpose:** every content table has an `extraData` JSON escape-hatch column
for fields with no dedicated column. This audits what's actually landing in
that column across the current database and how often, as input to a
possible "promote to a real column" pass. Read-only analysis, produced by
querying `prisma/dev.db` directly with SQLite's `json_each`/`json_extract`.

**Scope caveat — read this first:** the database currently contains exactly
one imported source, `open5e-srd-2024` (Phase 2's Open5e importer). Phase
2.5 (Compendium import) doesn't exist yet, so nothing here reflects
Compendium-sourced data — a few `extraData` fields (`ContentRace`'s
`unresolvedRaceName`, `ContentSubclass`'s `unresolvedClassName`, homebrew
flags, etc.) are already designed into the schema for that source but never
populated by anything that's actually run yet. This report will need a
second pass once Phase 2.5 ships.

**Method:** for each content table, `key: count/total` means the key
appears in `extraData` on `count` of the table's `total` rows (not `count`
of rows that merely have non-null `extraData` — matches the request's own
"traits 900/950 monsters" example). Threshold: keys appearing on **more
than 5 rows**. Value type and example(s) are included since "how often" and
"is it actually informative" are different questions — a key present on
every row but always the same value is a much weaker case for a column than
one with real variation.

---

## ContentMonster (331 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `traits` | 331/331 | array | `[{name, description}, ...]` — e.g. Goblin Warrior's "Nimble Escape." Structured, but inherently variable-shape prose per monster — not a good fit for a scalar column. |
| `proficiencyBonus` | 331/331 | integer | 2 (218), 3 (52), 4 (23), 5 (18), 6 (8), 7 (11), 9 (1). Real, simple, always present. **Strong column candidate.** |
| `legendaryResistances` | 331/331 | integer | 0 (326), 3 (2), 4 (2), 6 (1). Always present but almost always 0 — only legendary creatures use it. Simple scalar; column candidate if legendary-creature filtering/display matters, otherwise low urgency. |
| `experiencePoints` | 331/331 | integer | Real range, e.g. 0, 25, 450, 1800, 2300. Simple, always present. **Strong column candidate.** |
| `category` | 331/331 | text | `Monsters` (235), `Animals` (95), `Beast` (1) — note the one `Beast` looks like an Open5e data inconsistency (singular, different casing convention) rather than a real fourth category. Worth a column only if this taxonomy is actually used for filtering; the near-binary Monsters/Animals split plus one outlier suggests checking Open5e's data quality before committing to it. |
| `armorClassDetail` | 330/331 | text | Only 1 distinct real value seen (`"natural armor"`) despite being present on 330/331 rows — suggests most values are short, repetitive descriptors. Was designed for multi-form AC text (e.g. werewolves' "11 in humanoid form, 12 in wolf form") but the current sample doesn't show that case. Low urgency as a column; more useful as free text than as a filterable field either way. |
| `spellcasting` | 49/331 | object | `{ability, saveDC, atWill, limitedUse, slots, cantrips}` — genuinely present only on spellcasting monsters (~15%). Structured and multi-field; if this becomes important (e.g. "browse spellcasting monsters"), it likely wants its own small set of columns or even a related table, not one flat column. |

**Not flagged** (present on ≤5 rows, or present but not requested): none —
every key that appears in any `ContentMonster.extraData` row appears on
either 49 or 330+ rows. There's no long tail here; it's binary between
"basically universal" and "spellcasters only."

---

## ContentSpell (339 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `targetType` | 339/339 | text | `creature` (338), `point` (1 — Fireball). Present on literally every spell but with almost no variation in this sample. Weak column candidate as-is; would need a larger/more varied sample (more AoE spells) to know if `point`/`object`/`self` etc. show up enough to matter. |
| `targetCount` | 339/339 | integer | **Constant `1` on all 339 rows**, including spells that canonically hit multiple targets (e.g. Bless targets 3 creatures). This looks like an Open5e v2 API data-completeness gap, not a real field — worth confirming against Open5e directly before ever promoting it; right now it carries no information. |
| `shapeSizeUnit` | 339/339 | text | Constant `"feet"` on all 339 rows, including spells with no shape at all. No information value — do not promote. |
| `savingThrow` | 128/339 | text | `wisdom` (40), `dexterity` (36), `constitution` (30), `charisma` (11), `strength` (8), `intelligence` (3). Real variation, present on ~38% (spells that require a save). **Strong column candidate** — this is exactly the kind of thing a Spell browse/filter view would want. |
| `castingOptions` | 122/339 | array | Per-slot-level scaling data for spells like upcast damage (e.g. one Magic Missile-family spell shown has 7 entries, one per slot level 3–9). Genuinely structured and spell-specific — not a good flat-column fit; if surfaced, probably belongs in its own related shape, not a scalar. |
| `damageRoll` | 119/339 | text | Real dice strings: `4d4`, `1d6`, `4d12`, etc. — base damage before upcast scaling. **Strong column candidate.** |
| `damageTypes` | 107/339 | array | `["acid"]`, `["force"]`, `["necrotic"]`, etc. — always a 1-element array in the sample seen. Could be a scalar `damageType` column if it's confirmed to always be single-valued, or stay an array if multi-type damage spells exist elsewhere. |
| `materialConsumed` | 57/339 | boolean | Only present (as `true`) when a spell consumes its material component; absent (not `false`) otherwise. **Column candidate** — would need to become non-nullable-with-default (`false`) or stay nullable-boolean to preserve the same "not applicable at all" vs. "consumed: no" distinction it currently encodes implicitly. |
| `shapeType` | 52/339 | text | `sphere` (29), `cube` (16), `cone` (6), `line` (1). Real variation, present on AoE spells. **Column candidate**, likely paired with `shapeSize` below. |
| `shapeSize` | 52/339 | integer | 9 distinct values seen (radius/length in feet). Pairs with `shapeType` — same candidacy. |
| `attackRoll` | 42/339 | boolean | Only present (`true`) on attack-roll spells; same implicit-boolean pattern as `materialConsumed`. |
| `reactionCondition` | 4/339 | text | Below the >5 threshold — flagged only because it's the one key that's genuinely rare, for contrast with everything else above. **Not a candidate at this frequency.** |

---

## ContentItem (960 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `size` | 960/960 | text | **Constant `"tiny"` on all 960 rows** — a suit of Plate Armor and a Greatsword are both `"tiny"`. This is almost certainly an Open5e data quality issue (a default/placeholder value never actually varied in their dataset), not real per-item data. **Do not promote** without confirming against Open5e directly first — right now this key is actively misleading. |
| `isSimple` | 454/960 | boolean | 301 false / 153 true. Only present on weapons (≈47% of items). Real signal, but scoped to weapons only — a column would need to be nullable for non-weapon items. |
| `isMartial` | 454/960 | boolean | 153 false / 301 true — inverse-ish of `isSimple` as expected for weapons. Same weapon-only scoping. |
| `isImprovised` | 454/960 | boolean | **Constant `false` on all 454 weapon rows.** No improvised weapons in this dataset — no information value right now, though the field itself is legitimate (just unexercised by SRD content). |
| `strRequired` | 110/960 | integer/null | Only present on armor (≈11%); heavy armor sets a real Strength requirement, light/medium leave it null within the object. Real signal, armor-only. |
| `stealthDisadvantage` | 110/960 | boolean | 44 false / 66 true, armor-only. Real variation. **Column candidate** for armor specifically (would need to be nullable/not-applicable for non-armor items, same as `strRequired`). |
| `maxDexBonus` | 110/960 | integer/null | Armor-only, pairs with `stealthDisadvantage`/`addDexMod`. |
| `addDexMod` | 110/960 | boolean | 43 false / 67 true, armor-only. Real variation. |
| `acDisplay` | 110/960 | text | Ready-made display strings: `"14 + Dex modifier (max 2)"`, `"16"`. Armor-only, derived from the four fields above rather than independent data — likely redundant with them rather than a separate column candidate. |
| `attunementDetail` | 19/960 | text | Only on magic items requiring attunement with a restriction, e.g. `"Requires Attunement by a Paladin"`. Real prose, rare (≈2%) — below the weapon/armor cluster's frequency but still meaningfully informative when present. |

**Note on the weapon/armor clusters:** the ~110 and ~454 counts aren't a
coincidence — they're exactly "how many items are armor" and "how many
items are weapons" respectively. These fields are already 100% populated
*within their applicable item type*; the sub-960 frequency is really about
item-type applicability, not data sparsity. Worth keeping in mind when
deciding whether to promote them: they'd naturally want to be nullable
columns (or live on a discriminated sub-shape), not present-on-everything
columns.

---

## ContentClass (12 rows) / ContentSubclass (12 rows)

| Table | Key | Frequency | Type | Notes |
|---|---|---|---|---|
| ContentClass | `features` | 12/12 | array | Every non-`CORE_TRAITS_TABLE` feature, structured `{name, description, type, levels}`. Always present, inherently multi-entry and variable-shape — not a scalar-column candidate; this is correctly extraData-shaped data. |
| ContentClass | `casterType` | 12/12 | text | `FULL` (5), `HALF` (2), `NONE` (4), `PACT` (1). Real, simple, always present. **Note:** this one's presence in `extraData` was already an explicit, deliberate design choice per the Phase 2 design doc ("Stored as-is"), not an oversight — flagging it here for completeness since it does meet the frequency bar, but it's a case the design already considered and chose not to make a dedicated column. |
| ContentSubclass | `features` | 12/12 | array | Same shape/reasoning as ContentClass's `features`. |

## ContentBackground (4 rows)

Only 4 rows total, so nothing can exceed the >5 threshold by construction.
Included for completeness, not because anything qualifies:

| Key | Frequency | Type | Notes |
|---|---|---|---|
| `grantedFeat` | 4/4 | object | `{name}` — e.g. `"Magic Initiate (Cleric)"`. This is the one flagged in the Phase 2 dev log as a real gap: 2024 SRD backgrounds grant a fixed feat via a benefit type the original design doc's mapping didn't account for at all. Worth a real column/relation once more than 4 backgrounds exist to judge frequency against (the SRD only ships 4; a Compendium import would add many more). |
| `equipment` | 4/4 | text | Raw "Choose A or B: ..." prose, already intentionally unstructured per the original design (`ContentSpell`/`ContentBackground` equipment text is deliberately left as-is). |

## ContentRace (9 rows) / ContentSubrace (24 rows)

**Nothing in `extraData` at all** — every row's `extraData` is `null` for
both tables under the current Open5e-only import. Race/Subrace route
everything through the dedicated `traits[]` column instead (including the
synthesized-subrace lineage benefits), so there's no escape-hatch usage to
report yet. This will likely change once Compendium import (Phase 2.5)
lands — the still-open design question there (`Documentation/v1-roadmap-open-decisions.md`
§2.5.1) about `<ability>`/`<resist>`/`<proficiency>`/`<languages>` landing
in `traits[]` vs. `extraData` is exactly about this table.

## ContentCondition / ContentFeat / ContentClassOption

**0 rows in the database** — `ContentCondition` because Open5e's v2 API has
no conditions tagged under `srd-2024` (a confirmed real upstream gap, not a
bug here, see the Phase 2 dev log); `ContentFeat`/`ContentClassOption`
because both are Compendium-only content types and Phase 2.5 hasn't been
built. Nothing to audit yet.

---

## Summary — strongest column candidates across all tables

Ranked by "real, varying, simple-scalar data that's already common,"
independent of raw frequency (a rare-but-clean boolean like `attackRoll`
can be a better column candidate than a universal-but-constant field like
`ContentSpell.targetCount`):

1. **`ContentMonster.proficiencyBonus`** (331/331, int, real range 2–9)
2. **`ContentMonster.experiencePoints`** (331/331, int, real range)
3. **`ContentSpell.savingThrow`** (128/339, text enum of 6 abilities)
4. **`ContentSpell.damageRoll`** (119/339, dice-string text)
5. **`ContentSpell.shapeType` + `shapeSize`** (52/339 each, paired AoE data)
6. **`ContentSpell.damageTypes`** (107/339, currently always single-element — confirm before flattening to scalar)
7. **`ContentBackground.grantedFeat`** (4/4 today, but a real, previously-unmapped gap — worth tracking against a larger Compendium-driven Background set before deciding shape)

**Explicitly *not* recommended for promotion**, despite meeting the raw
frequency bar, because the data itself carries little or no signal:
`ContentSpell.targetCount` (constant 1), `ContentSpell.shapeSizeUnit`
(constant "feet"), `ContentItem.size` (constant "tiny" — looks like an
Open5e data-quality gap), `ContentItem.isImprovised` (constant false in
this sample).

**Structured/multi-field, probably not a flat column even though common:**
`ContentMonster.traits`, `ContentMonster.spellcasting`,
`ContentClass.features`, `ContentSubclass.features`,
`ContentSpell.castingOptions` — these are legitimately variable-shape data
that `extraData` (or a related table, for `spellcasting`/`grantedFeat`) is
the right home for, not a scalar column.
