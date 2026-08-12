# extraData Key Frequency Audit — Compendium Import

**Purpose:** the same audit as `extradata-key-frequency-audit.md`, scoped
this time to content imported from `Complete_Compendium_5.5e.xml` (Phase
2.5) instead of Open5e (Phase 2). Same method: `key: count/total` means the
key appears in `extraData` on `count` of the table's `total`
**Compendium-sourced** rows (rows where `sourceId` is `compendium-*` or the
uncredited fallback) — not `count` of rows that merely have non-null
`extraData`. Threshold: keys appearing on **more than 5 rows**. Produced by
querying `prisma/dev.db` directly with `json_each`/`json_extract`, same as
before.

**Two real bugs were found and fixed while restoring the dataset for this
audit** (not pre-existing conditions of the data, but worth recording since
they explain why counts here may differ slightly from numbers quoted
elsewhere): a test suite cleanup step was deleting real imported content
that happened to share a real book's sourceId with the test's own synthetic
rows (fixed to delete only the test's specific rows); and `ContentSpell`'s
`scalingDice` extraData was 100% populated with `null`-filled placeholders
due to a wrong assumption about the real `<roll>` element's XML shape
(dice value is the element's text content with description/level as
attributes, not nested child elements — fixed). The dataset below reflects
the corrected import.

---

## ContentMonster (4,847 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `traits` | 4,847/4,847 | array | Same role as Open5e's — structured but inherently variable-shape, not a column candidate. |
| `proficiencyBonus` | 4,847/4,847 | integer | **`0` on 2,641 rows (54.5%)** — this is a real gap, not signal: unlike the Open5e transform, the Compendium Monster transform has no CR-based inference fallback when no "Proficiency Bonus" trait exists on the record; it currently defaults to `0` outright, which is never actually correct in 5e rules (minimum is +2). Real non-zero values are otherwise sane: 2 (1,065), 3 (482), 4 (284), 5 (148), 6 (95), 7 (78), 8 (45), 9 (7), one outlier at 15. **Worth fixing** — the same `inferProficiencyBonus(cr)` helper already written for Open5e could be reused here. |
| `legendaryResistances` | 4,847/4,847 | integer | 0 (4,369), 3 (356, the standard "3/Day" count), 4 (45), 2 (37), 1 (17), 5 (15), 6 (7), 7 (1). Real, usable signal on legendary creatures — same candidacy notes as the Open5e audit. |
| `page` | 3,534/4,847 | text | Citation page number. Present whenever a citation was found at all; not independently meaningful without the source book, which already has its own column (`sourceId`). |
| `ancestry` | 2,064/4,847 | text | E.g. `"Hag"`, `"Bulette"`, `"Berserker"` — a real Compendium-only field (`<ancestry>`) with no Open5e equivalent, roughly grouping named variants of the same creature family (e.g. all Goblin variants share `ancestry: "Goblin"`). Real, structured signal — **column candidate**, though it only exists for Compendium-sourced rows. |
| `environment` | 1,244/4,847 | text | E.g. `"mountain, planar (elemental plane of fire)"`, `"urban"`, `"any"`. Real habitat/environment tag data with no Open5e equivalent captured today. Free-text combinations rather than a clean enum — would need normalization before being a good column. |
| `spellcasting` | 1,018/4,847 | object | Same role as Open5e's — present on ~21% of Compendium monsters (vs. ~15% for Open5e), structured, not a flat-column candidate. |
| `edition` | 564/4,847 | text | `2024` (all `[5.5e]`-tagged), `2014` (`(Legacy)`-tagged) — two real values, meaningful. Not present on records with neither tag (untagged content, ambiguous edition). |
| `additionalCitations` | 553/4,847 | array | The rare (~11% here, higher than the ~0.15% citation-level rate reported in the Phase 2.5 dev log — monsters apparently cite multiple books more often than other content types) genuine multi-book citation, preserved per the "first-listed book only" scope decision. |
| `telepathyRange` | 515/4,847 | integer | Real range values (10–300 ft., e.g. 60, 120, 30, 240). Clean, simple, **column candidate** if telepathy ever needs to be a filterable/displayed stat on its own rather than folded into free-text `senses`. |
| `lairActions` | 143/4,847 | array | Legendary-lair creatures only. Structured, correctly rare — not a column candidate, matches its niche applicability. |
| `otherTags` | 99/4,847 | array | Unrecognized bracket/paren qualifiers preserved from name-tag stripping (e.g. a homebrew author or sourcebook name that isn't `(HB)`/`(TP)`/`(UA)`/`(Legacy)`). Working as designed — the "never silently drop" catch-all. |
| `unearthedArcana` | 4/4,847 | boolean | Below the >5 threshold — included only for contrast; UA-tagged monsters are rare in this file, unlike UA-tagged classes/subclasses. |

## ContentItem (5,967 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `isMartial` | 5,967/5,967 | boolean | **Constant `false` on every single item row**, including actual martial weapons like Longswords and Greatswords. This is a real transform bug, not a data-quality artifact in the source file: `isMartial` is derived from whether the `M` code is present in `<property>`, but the design conflates two different things — a weapon's *Martial* proficiency category (a top-level fact about the weapon) and the `M` *property* code, which is something else entirely in the Compendium's coding scheme (unclear exactly what without further investigation, but empirically it doesn't correlate with real martial weapons at all). **Worth fixing** before this field is trusted anywhere. |
| `page` | 3,549/5,967 | text | Citation page, same role as elsewhere. |
| `edition` | 2,066/5,967 | text | `2024`/`2014`, same as Monster. |
| `additionalCitations` | 1,887/5,967 | array | Items cite multiple books far more often than the ~0.15% overall citation-level rate — 31.6% of items have a second citation. Worth noting for anyone relying on the "rare" framing from the Phase 2.5 dev log; it's true in aggregate across all content types but not evenly distributed — Items are a real outlier. |
| `range` | 1,076/5,967 | text | Real ranged-weapon data, e.g. `"20/60"`, `"120/360"`, `"80/240"` — consistently formatted as `short/long` without a unit suffix (Open5e's equivalent, when present, includes `" ft."`). **Column candidate**, but would need format reconciliation with Open5e's version of the same concept if the two are ever meant to be comparable. |
| `attunementDetail` | 930/5,967 | text | Real, varied restriction text: `"a Spellcaster"`, `"a warlock"`, `"a druid or ranger"`, `"a creature of the weapon's choice"`. Same field Open5e also populates (Phase 2) — good candidate for reconciling into one shared display path regardless of source. |
| `otherTags` | 807/5,967 | array | Same role as Monster's. |
| `stealthDisadvantage` | 369/5,967 | boolean | Armor-only, same as Open5e's. Not checked here for a true/false split — worth a follow-up pass if this becomes a column, to confirm it isn't similarly constant. |
| `strRequired` | 171/5,967 | integer | Only 3 distinct real values across all armor: 13, 15, 16 — matches the real 5e heavy-armor Strength-requirement set exactly (no bogus values). Clean signal. |
| `unearthedArcana` | 61/5,967 | boolean | UA-tagged items are uncommon but real. |
| `homebrew` | 5/5,967 | boolean | Right at the threshold edge — included for completeness; homebrew items are rare in this file relative to official/third-party content. |

## ContentFeat (580 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `page` | 407/580 | text | Citation page. |
| `edition` | 314/580 | text | `2024` only — no `(Legacy)`-tagged feats found in this sample (2014 feats apparently aren't tagged the same way, or aren't present in the file under this name pattern). |
| `otherTags` | 292/580 | array | Same catch-all role. |
| `thirdParty` | 66/580 | boolean | Always `true` when present (a boolean flag field, not worth a distinct-value check). |
| `unearthedArcana` | 59/580 | boolean | Same. |
| `rawCategory` | 58/580 | text | The real prefix preserved when a feat's category didn't match one of the recognized buckets (Origin/Fighting Style/Epic Boon) — real values seen: `"Dragonmark"`, `"Path of the Lich"`, `"Path of the Death Knight"`, `"Dark Gift"`, `"Draconic Gift"`. Confirms the `CLASS_SPECIFIC` catch-all bucket is doing real work, not sitting empty. |
| `homebrew` | 42/580 | boolean | Same boolean-flag role. |
| `special` | 6/580 | text | Right at the threshold. Real values are themselves category-like: `"Fighting Style: Archery"`, `"Fighting Style: Defense"` — i.e. the Compendium's `<special>` field sometimes duplicates categorization info already captured elsewhere, rather than adding new information. |

## ContentSpell (1,004 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `page` | 567/1,004 | text | Citation page. |
| `edition` | 564/1,004 | text | `2024` only in this sample, same pattern as Feat. |
| `scalingDice` | 474/1,004 | array | **Now real data after the fix above** — e.g. `[{"dice":"2d6","description":"Necrotic Damage","level":"1"}, {"dice":"3d6",...,"level":"2"}, ...]`, one entry per character level or spell slot level a scaling cantrip/spell's damage increases at. Genuinely structured, multi-row data — not a flat-column candidate, but a real, valuable field now that it actually populates (previously 100% null placeholders). |
| `thirdParty` | 278/1,004 | boolean | Third-party spells are a meaningfully large fraction (27.7%) of this content type specifically. |
| `homebrew` | 142/1,004 | boolean | Same role. |
| `otherTags` | 68/1,004 | array | Same catch-all. |
| `additionalCitations` | 58/1,004 | array | ~5.8% multi-book rate for spells — closer to the Monster/Item outlier pattern than the ~0.15% headline figure. |
| `unearthedArcana` | 18/1,004 | boolean | Real but uncommon. |

## ContentClassOption (126 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `page` | 118/126 | text | Citation page. |
| `edition` | 58/126 | text | `2024` only. |

No other keys qualify. `ContentClassOption` is the simplest table by far —
consistent with it being newly synthesized (Maneuvers, Metamagic, Eldritch
Invocations, and the other real pools found this phase) rather than a rich
native Compendium record type in its own right.

## ContentBackground (223 rows)

| Key | Frequency | Type | Values / example |
|---|---|---|---|
| `unrecognizedTraits` | 150/223 | array | The single most common key in this table — confirms the "never silently drop" catch-all is carrying real weight here. Real trait names inside it: `"Suggested Characteristics"` (very common — present on the large majority of these), `"Choose Abilities"`, `"Choose a Feat"`. This isn't noise; `"Suggested Characteristics"` is genuine, valuable roleplaying-prompt content the schema has nowhere else to put — **worth a dedicated pass to decide whether it deserves its own field**, since right now it's indistinguishable at a glance from truly unrecognized/malformed traits. |
| `page` | 145/223 | text | Citation page. |
| `edition` | 68/223 | text | `2024` only. |
| `grantedFeat` | 67/223 | object | Same role as the Open5e-side finding from Phase 2 — confirms this is a real, common 2024-background pattern regardless of source. Real values: `{"name":"Crafter"}`, `{"name":"Skilled"}`, `{"name":"Musician"}`. |
| `equipment` | 67/223 | text | Raw equipment-choice text, same role as Open5e's. |
| `thirdParty` | 52/223 | boolean | Real, meaningful fraction. |
| `otherTags` | 48/223 | array | Same catch-all. |
| `homebrew` | 11/223 | boolean | Smaller fraction than third-party for this content type specifically. |

## ContentClass (25 rows) / ContentSubclass (370 rows)

| Table | Key | Frequency | Type | Notes |
|---|---|---|---|---|
| ContentClass | `features` | 25/25 | array | Same role as Open5e's — always present, correctly not a column candidate. |
| ContentClass | `slotsReset` | 21/25 | text | Real values: `"L"` (Long Rest), `"S"` (Short Rest), and one blank/empty value — a genuine 2-value-plus-gap enum. Low information density as a column given only 21 of 25 classes even have it, but clean when present. |
| ContentClass | `edition` | 20/25 | text | `2024` only in this sample. |
| ContentClass | `page` | 14/25 | text | Citation page. |
| ContentClass | `toolProfs` | 10/25 | text | Real, varied tool-proficiency text pulled from the `<tools>` field when not `"None"` — e.g. `"Thieves' Tools, Tinker's Tools, one type of Artisan's Tools of your choice"`, `"Alchemist's Supplies"`. Same "no dedicated column" status as Open5e's equivalent. |
| ContentSubclass | `features` | 370/370 | array | Universal, same role as base-class features. |
| ContentSubclass | `page` | 195/370 | text | Citation page. |
| ContentSubclass | `edition` | 168/370 | text | Both `2024` and `2014` (`(Legacy)`) values appear here, unlike the base-class table — matches the real finding that individual subclass variants (not the whole class) carry their own edition tag. |
| ContentSubclass | `homebrew` | 81/370 | boolean | Homebrew subclasses are a substantial fraction (21.9%) — matches the sheer number of `(HB)`-tagged Cleric/Wizard domain variants found during implementation. |
| ContentSubclass | `thirdParty` | 63/370 | boolean | Similarly substantial (17%). |
| ContentSubclass | `unearthedArcana` | 48/370 | boolean | UA-tagged subclass variants are common (13%) — much more so than UA-tagged base classes, monsters, or items. |
| ContentSubclass | `otherTags` | 11/370 | array | Same catch-all role. |

## ContentRace (131 rows) / ContentSubrace (142 rows)

Both tables carry the resolved-per-outline `traits[]` + `extraData.raw*`
dual-storage pattern for un-columned fields — confirmed working exactly as
designed, with real data now available to characterize it (Phase 1/2.5
only had this as a design decision, not real numbers, until now).

| Table | Key | Frequency | Type | Notes |
|---|---|---|---|---|
| ContentRace | `page` | 89/131 | text | Citation page. |
| ContentRace | `rawAbility` | 77/131 | text | Real ability-bonus text, e.g. `"Wis +2, Dex +1"`, `"Con +2"` — confirms the raw `<ability>` field reliably carries real, parseable-looking data (not yet parsed into `abilityBonuses` structure, still text-only). |
| ContentRace | `creatureType` | 68/131 | text | Wide real variety — not just `"Humanoid"` as the design doc's 2-sample check suggested, but also `"Fiend"`, `"Elemental"`, `"Fey"`, `"Monstrosity"`, `"Dragon"`, `"Undead"`, `"Aberration"`, `"Ooze"`, and several full-sentence variants (`"You are a humanoid. You are also considered a goblinoid for any prerequisite or effect..."`). This field is far richer and more load-bearing than the original "always Humanoid for player races" assumption — worth a real look at whether it deserves a dedicated column now that non-player, non-Humanoid real data exists for it. |
| ContentRace | `rawProficiency` | 40/131 | text | Real skill/tool names, e.g. `"Performance"`, `"Perception"`, `"History"` — single values in the samples checked, not lists, suggesting most races grant exactly one fixed proficiency via this field. |
| ContentRace | `edition` | 32/131 | text | `2024` only. |
| ContentRace | `otherTags` | 26/131 | array | Same catch-all. |
| ContentRace | `homebrew` | 26/131 | boolean | Real, meaningful fraction (19.8%). |
| ContentRace | `rawResist` | 23/131 | text | Real resistance text, un-columned by design (Race has no dedicated resistance column, unlike Monster). |
| ContentRace | `thirdParty` | 14/131 | boolean | Smaller than homebrew for this content type. |
| ContentRace | `rawWeapons`/`rawLanguages`/`rawConditionImmune`/etc. | ≤5/131 | text | Below the >5 threshold individually — included for completeness; real but rare fields. |
| ContentSubrace | `descriptionStrippingSkipped` | 142/142 | boolean | **Every single subrace has this flag set to `true`** — the safeguarded description-stripping mechanism *never once* found a confident parent-paragraph match and successfully stripped, across all 142 real subraces. This is either a real, systemic issue with the stripping logic (worth investigating — the safeguard may be too conservative, or the paragraph-matching heuristic may not handle real formatting variance), or the parent races genuinely don't share verbatim opening paragraphs as often in practice as the two-file sample suggested. Either way, **this is the single most actionable finding in this report** — the mechanism as built is currently providing zero of its intended value. |
| ContentSubrace | `rawAbility` | 112/142 | text | Same role as Race's, more common here (subraces more consistently grant ability bonuses than base races do). |
| ContentSubrace | `page` | 76/142 | text | Citation page. |
| ContentSubrace | `unresolvedRaceName` | 60/142 | text | **42.3% of all Compendium subraces have no resolved parent race at all.** Real unresolved names: `"Half-Elf"`, `"Half-Orc"`, `"Genasi"`, `"Merfolk"`, `"Faerie"`, `"Kithkin"`, `"Bullywug"`, `"Dhakaani Ghaal'dar"`, `"Dhakaani Golin'dar"`, `"Gith"`. This is *expected*, not a bug — Open5e's SRD-2024 import doesn't include Half-Elf/Half-Orc (removed as distinct SRD races in 2024 rules) or Genasi/Merfolk/Gith (never SRD-legal at all), so there's no Open5e-sourced parent to find, and no Compendium-sourced base race exists either for most of these (e.g. no standalone "Half-Elf [5.5e]" record exists in the file — only its named subrace variants like "Half-Elf, Mark of Detection" appear). Worth flagging clearly since it's a large fraction, even though it's correct behavior given the source data. |
| ContentSubrace | `rawProficiency` | 45/142 | text | Same role as Race's. |
| ContentSubrace | `creatureType` | 38/142 | text | Same role as Race's. |
| ContentSubrace | `thirdParty` | 34/142 | boolean | Real fraction. |
| ContentSubrace | `rawResist` | 33/142 | text | Same role as Race's. |
| ContentSubrace | `rawLanguages` | 30/142 | text | Crosses the threshold here (unlike Race's, which didn't) — subraces apparently specify languages more often than base races do. |
| ContentSubrace | `edition` | 28/142 | text | Both 2024 and 2014 values appear (2 distinct), unlike Race's edition field (2024-only) — matches the Subclass pattern where the more granular sub-entity carries more real edition variance. |
| ContentSubrace | `otherTags` | 25/142 | array | Same catch-all. |
| ContentSubrace | `rawWeapons` | 16/142 | text | Crosses the threshold here too. |
| ContentSubrace | `homebrew` | 14/142 | boolean | Real fraction. |
| ContentSubrace | `rawConditionResist`/`rawConditionImmune`/`rawTools` | ≤11/142 | text | Below or barely at the threshold — included for completeness. |

## ContentCondition (0 rows)

No Compendium data at all — confirmed in the design docs and Phase 2.5 dev
log: the Compendium's top-level element set has no `<condition>`
equivalent whatsoever. This is a hard limitation of the source file, not a
gap in the importer.

---

## Summary — real bugs/gaps found by this audit, beyond simple frequency counts

Ranked by how actionable they are, since several of this pass's findings
are genuine defects rather than "common but low-signal" cosmetic notes like
the Open5e audit mostly turned up:

1. **`ContentSubrace.extraData.descriptionStrippingSkipped` is `true` on
   100% of the 142 real subraces** — the safeguarded description-stripping
   mechanism has never once actually stripped anything in practice. Worth
   investigating directly: either the paragraph-match heuristic is too
   strict for real formatting variance, or it's simply not being reached
   correctly.
2. **`ContentItem.extraData.isMartial` is `false` on 100% of 5,967 items**,
   including real martial weapons — a genuine transform bug (the `M`
   property code doesn't mean what the code assumed), not just a
   low-information field.
3. **`ContentMonster.extraData.proficiencyBonus` defaults to `0` on 54.5%
   of monsters** rather than being inferred from challenge rating the way
   the Open5e transform already does — a real, fixable gap using an
   existing helper.
4. **42.3% of Compendium subraces have no resolved parent race**
   (`unresolvedRaceName` set) — confirmed *expected*, not a bug, but a
   large enough fraction to flag clearly for anyone consuming this data
   downstream (e.g. a future Heroes character sheet trying to look up a
   Half-Elf or Genasi subrace's parent race).
5. **`ContentRace.extraData.creatureType` is far richer than the original
   2-sample design check assumed** (real values well beyond "Humanoid":
   Fiend, Elemental, Fey, Monstrosity, Dragon, Undead, Aberration, Ooze,
   plus several full-sentence variants) — worth a real look at whether this
   deserves a dedicated column now that non-Humanoid data actually exists.
6. **`ContentBackground.extraData.unrecognizedTraits`** is the single most
   common key in that table (150/223) and is carrying real, valuable
   content (`"Suggested Characteristics"` roleplaying prompts) that's
   currently indistinguishable from genuinely malformed/unrecognized data —
   worth a dedicated pass.

**Two bugs were found and fixed as a prerequisite to running this audit at
all** (a test-suite cleanup step destroying real imported data sharing a
sourceId with test fixtures, and `ContentSpell.scalingDice` being 100% null
due to a wrong assumption about real XML attribute vs. child-element shape)
— both described in the scope note at the top of this document.

**Column candidates confirmed by real data, independent of the bugs above:**
`ContentMonster.extraData.ancestry` (clean grouping key), `ContentItem.extraData.strRequired`
(exactly the real 3-value 5e set, no noise), `ContentClass.extraData.slotsReset`
(clean 2-value enum). All three match candidates already flagged in the
Open5e-side audit for the same underlying concept where one exists.
