# DragonLedger DatabaseApp — Phase 4 Write API: Final Design Export

**Reconciliation note (added after later sessions):** `ContentClassOption` (Metamagic/Eldritch Invocations/Maneuvers) didn't exist when this document was written and has the **same dependency shape as `ContentSubclass`** — a nullable `classId` FK with `onDelete: SetNull`. Section 1.7's Class-delete dependent-check logic should be treated as applying to `ContentClassOption` identically to how it applies to `ContentSubclass` (check for dependents, split by MANUAL/non-MANUAL, same confirm/cancel flow) — this wasn't written explicitly into Section 1.7 or Section 3's endpoint contract below, since the table didn't exist yet. Implementation should extend the dependent-lookup query to cover both tables, not just `ContentSubclass`.

## 1. Decisions Made

### 1.1 Homebrew Destination

A hardcoded, seeded `Source` row (`id: "homebrew"`, `name: "Homebrew"`, `type: MANUAL`, `isDeletable: false`) is always present from the start — no "zero MANUAL sources" edge case can occur, since this one always exists. `saveAs: "homebrew"` defaults to this source when no explicit target is given; the client can override with `targetSourceId` to file the copy under a different `MANUAL` source instead (including one the user just created). No schema addition needed — `isDeletable` already existed for exactly this purpose.

### 1.2 Slug Collisions

409 (Conflict) on any slug collision — whether from a homebrew copy or a plain `POST` create. This required no new logic: `@@unique([sourceId, slug])` already exists as a DB constraint regardless of how the row was created, so both cases hit the same constraint and get the same 409 + standard error envelope treatment.

### 1.3 Validation Strategy

Already settled by Phase 2: Zod, one schema module per content type, shared between import validation and this write API. See Section 4 for the new "Correctable Fields" subset schemas this phase adds on top of that foundation.

### 1.4 Error Envelope

Standardized across all write endpoints:

```json
{ "error": { "code": "SAVE_AS_REQUIRED", "message": "human-readable text" } }
```

Chosen as the simplest version of the common "Stripe-style" convention (a `code` the UI can branch on, a `message` safe to display directly) — appropriate for a single-team project with no public API consumers, versus heavier standards like RFC 7807 or JSON:API's error-array shape.

### 1.5 Concurrent Edit Safety

Deferred. No optimistic-concurrency (`updatedAt`) check in v1 — last save wins. Documented here as a known gap, not a silent omission.

### 1.6 Delete Scope & Confirmation

All deletes require confirmation now (a late addition to the original outline, which only guarded `Source` deletion via `isDeletable`):

- **Single-entry delete** (`DELETE /api/:type/:id`): lightweight `{ confirm: true }` flag. For Class/Race specifically, this expands into a dependent-aware flow — see Section 1.7.
- **Bulk-clear** (`DELETE /api/sources/:id/entries`, new endpoint — see Section 1.8): heavier `{ confirmName: "<source name>" }`, matching the source's exact name — proportional to the more catastrophic scope of this action.
- **Source-level delete** (`DELETE /api/sources/:id`, existing Phase 1.2 endpoint): behavior extended per Section 1.7 below to account for cross-source dependents.

### 1.7 Cross-Source Dependency Handling (Class/Race ↔ Subclass/Subrace)

**Schema change:** `ContentSubclass.classId` and `ContentSubrace.raceId` change from required to nullable (`String?`), with `onDelete: SetNull` replacing the original `onDelete: NoAction`. This was necessary because homebrewing across sources is explicitly allowed (a homebrew subclass can point at an official class), and `NoAction` would otherwise make the official class's source un-refreshable and un-deletable the moment any homebrew content depends on it.

The rule of thumb that emerged: **single, user-initiated actions get an interactive pre-check with cancel; bulk or automated actions proceed and warn after.** Concretely:

| Action | Behavior |
|---|---|
| `DELETE /api/:type/:id` where `type` is `class` or `race` | Pre-check for dependents (any subclass/subrace pointing at this row, in any source). Split results into **non-MANUAL** dependents (will be deleted alongside the parent — they're replaceable, reappearing on that source's next refresh) and **MANUAL** dependents (will be `SetNull`'d, kept as orphaned — never auto-deleted, since they're irreplaceable user work). Present both lists, require `{ confirm: true }` to proceed. On confirm: non-MANUAL dependents are explicitly deleted in the same transaction as the parent (an app-level cascade, not a DB one); MANUAL dependents are `SetNull`'d by the DB. |
| `DELETE /api/:type/:id` for any other content type (Spell, Item, Monster, Background, Condition) | No dependent-check — nothing else references these types. Just `{ confirm: true }`. |
| `DELETE /api/sources/:id` (whole-source delete) | No pre-check. Proceeds directly; `SetNull` clears any cross-source links silently. Response includes a `warnings` array listing anything orphaned. |
| `DELETE /api/sources/:id/entries` (bulk-clear) | Same as whole-source delete: `confirmName` gate, then proceeds without a dependent pre-check; `SetNull` + post-hoc `warnings`. |
| `POST /api/import/open5e` (refresh) | No pre-check. Proceeds as Phase 2 designed; `SetNull` clears cross-source links silently. After completion, a follow-up query finds anything left with a `null` parent link and attaches it to `ImportJob.warnings`. |

"Official vs. homebrew" for any dependent is always derived via `dependent.source.type === "MANUAL"` — no separate flag needed anywhere, since the relation to `Source` already exists.

### 1.8 New Endpoint: Bulk-Clear a Source's Content

`DELETE /api/sources/:id/entries` — deletes every content row belonging to a source, across all content tables, leaving the `Source` row itself untouched. This is functionally "the delete half of a refresh, without the re-import step," reusing the same delete-all-content-for-sourceId logic Phase 2's `importSource` already needs. Gated by `{ confirmName: "<source's exact name>" }`; mismatched or missing name returns 400 without deleting anything.

### 1.9 `saveAs` Semantics, Generalized

`saveAs: "homebrew"` means **"duplicate this entry as a new row under a MANUAL source,"** regardless of whether the original entry is official or already homebrew — i.e. it doubles as a "Save As / Duplicate" action, not only an escape hatch for editing official content. `saveAs: "original"` only applies to non-MANUAL entries (editing a homebrew entry in place needs no `saveAs` field at all — there's nothing else it could mean).

## 2. Schema Additions

```prisma
model ContentSubclass {
  id          String       @id @default(cuid())
  slug        String
  sourceId    String
  source      Source       @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  classId     String?
  class       ContentClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
  name        String
  description String
  extraData   String?

  @@unique([sourceId, slug])
}

model ContentSubrace {
  id          String      @id @default(cuid())
  slug        String
  sourceId    String
  source      Source      @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  raceId      String?
  race        ContentRace? @relation(fields: [raceId], references: [id], onDelete: SetNull)
  name        String
  description String?
  size        String?
  speed       String?
  traits      String
  extraData   String?

  @@unique([sourceId, slug])
}
```

Seed data (not a schema change, but required before Phase 4 is usable):

```typescript
// One-time seed, or part of Phase 1.2's Source CRUD initialization
await prisma.source.upsert({
  where: { id: "homebrew" },
  update: {},
  create: {
    id: "homebrew",
    name: "Homebrew",
    type: "MANUAL",
    isDeletable: false,
    lastUpdated: new Date(),
  },
});
```

## 3. Endpoint Contracts

### `POST /api/:type` (auth)

Request body: content fields + `sourceId` (must resolve to a `MANUAL`-type source).

| Case | Status | Response |
|---|---|---|
| Success | 201 | Created entry |
| `sourceId` is not `MANUAL` | 400 | `{ error: { code: "SOURCE_NOT_MANUAL", message } }` |
| Slug collision within destination source | 409 | `{ error: { code: "SLUG_CONFLICT", message } }` |
| Validation failure | 400 | `{ error: { code: "VALIDATION_ERROR", message, fields? } }` |

### `PATCH /api/:type/:id` (auth)

Request body: partial content fields, optionally `saveAs: "original" | "homebrew"`, optionally `targetSourceId` (only meaningful with `saveAs: "homebrew"`).

Logic:

1. Parse the changed-fields subset against the content type's **Correctable Fields** Zod schema (strict mode — Section 4).
2. If it parses cleanly (every changed field is correctable) → apply in place, no `saveAs` required, regardless of the entry's source type.
3. Otherwise, require `saveAs`:
   - Entry's source is already `MANUAL` → no `saveAs` needed; edits apply in place. (If `saveAs: "homebrew"` is sent anyway, it's honored as a duplicate/"Save As" action per Section 1.9, rather than rejected.)
   - Entry's source is non-`MANUAL` and no `saveAs` provided → 400.
   - `saveAs: "original"` → overwrite in place.
   - `saveAs: "homebrew"` → create a new row under the resolved homebrew destination (Section 1.1), copying the original's unchanged fields plus this request's edits; original is untouched.

| Case | Status | Response |
|---|---|---|
| In-place success (correctable fields, or already-MANUAL entry) | 200 | Updated entry |
| `saveAs: "original"` success | 200 | Updated entry |
| `saveAs: "homebrew"` success | 201 | Newly created entry |
| Non-MANUAL entry, non-correctable edit, no `saveAs` | 400 | `{ error: { code: "SAVE_AS_REQUIRED", message } }` |
| Homebrew copy's slug collides in destination | 409 | `{ error: { code: "SLUG_CONFLICT", message } }` |
| Validation failure | 400 | `{ error: { code: "VALIDATION_ERROR", message, fields? } }` |

### `DELETE /api/:type/:id` (auth)

Request body: `{ confirm: true }`.

| `type` | Behavior |
|---|---|
| `class` or `race` | Pre-check dependents first. If any exist, return them (grouped by MANUAL/non-MANUAL) without deleting, requiring a follow-up confirmed request to proceed. On confirmed proceed: delete row, explicitly delete non-MANUAL dependents in the same transaction, `SetNull` clears MANUAL dependents. |
| any other type | No dependent-check. Delete directly once `confirm: true` is present. |

| Case | Status | Response |
|---|---|---|
| Success (no dependents, or dependents already confirmed) | 204 | — |
| Missing `confirm: true` | 400 | `{ error: { code: "CONFIRM_REQUIRED", message } }` |
| Dependents found, not yet confirmed (class/race only) | 409 | `{ error: { code: "HAS_DEPENDENT_CHILDREN", message, dependents: { willDelete: [...], willOrphan: [...] } } }` |
| Not found | 404 | `{ error: { code: "NOT_FOUND", message } }` |

### `DELETE /api/sources/:id/entries` (auth) — new endpoint

Request body: `{ confirmName: "<source's exact name>" }`.

| Case | Status | Response |
|---|---|---|
| Success | 200 | `{ deletedCount: number, warnings: [{ type: "orphanedSubclass" \| "orphanedSubrace", id, name, formerParentId }] }` |
| `confirmName` missing or mismatched | 400 | `{ error: { code: "CONFIRM_NAME_MISMATCH", message } }` |
| Source not found | 404 | `{ error: { code: "NOT_FOUND", message } }` |

## 4. Validation Approach: Correctable Fields — REVISED (2026-08-08)

**Superseded rule.** The original per-type, parser-derived-fields criterion
below (kept for historical context) has been replaced by a **source-type-based
rule**, decided during a Phase 7 design session once it became clear the two
importer refresh semantics (Section "Data Model Overview" in `outline.md`)
map directly onto what's safe to edit in place:

- **`API` sources (Open5e):** refreshed by delete-and-replace. **No field is
  correctable in place, ever.** Any edit to an Open5e-sourced entry requires
  `saveAs` — there's no point letting someone directly patch a field that a
  future refresh will just overwrite anyway; the correction needs to live on
  a homebrew copy or it won't survive.
- **`FILE` sources (Compendium):** additive-only, never-overwritten on
  re-import — a direct correction here actually sticks, and the Compendium
  source data is known to be imperfect and not actively maintained. **Every
  field is correctable in place except a fixed lock list** (below). This
  replaces the old narrow per-type "parser-derived fields only" list with a
  much broader default — the Compendium is expected to have real content
  errors throughout, not just in parser-inferred fields.
- **`MANUAL` sources (homebrew):** unchanged — already always editable in
  place (Section 3, `PATCH`'s existing MANUAL-passthrough branch). Not
  affected by this section.

**Lock list — excluded from "correctable" on every content type, regardless
of source type:**

- `name` — the primary display identity; also a practical guard against a
  correction accidentally masquerading as a rename.
- `slug` — the `(sourceId, slug)` re-import dedup key (`prisma/schema.prisma`).
  Not expected to be a form field at all, but excluded explicitly so it's
  never accidentally included in a generated correctable-schema pick.
- `sourceId` — provenance/structure, not content. Reassigning an entry's
  Source is what `saveAs`/`targetSourceId` is for, not an in-place "fix."
- `ContentSubclass.classId` and `ContentSubrace.raceId` — parent-relation
  FKs. Reparenting a Subclass/Subrace to a different Class/Race is a
  structural change, not a content correction.

Every other field on every content type — including things previously left
off the old per-type lists, like `itemType`, `damage`/`armorClass`,
`size`/`speed`, `primaryAbility`, `description`, raw `actions`/`traits`
text — is now correctable in place **for `FILE`-sourced entries only**.

Representative example (Monster), replacing the old narrow 6-field pick:

```typescript
// server/src/schemas/content/monster.schema.ts
export const MonsterSchema = z.object({
  slug: z.string(),
  sourceId: z.string(),
  name: z.string(),
  size: z.string(),
  monsterType: z.string(),
  alignment: z.string(),
  armorClass: z.number().int(),
  hitPoints: z.number().int(),
  hitDice: z.string(),
  challengeRating: z.string(),
  speed: z.string(),
  abilityScores: z.string(),
  savingThrows: z.string().nullable(),
  skills: z.string().nullable(),
  damageResistances: z.string().nullable(),
  damageImmunities: z.string().nullable(),
  damageVulnerabilities: z.string().nullable(),
  conditionImmunities: z.string().nullable(),
  senses: z.string().nullable(),
  languages: z.string().nullable(),
  actions: z.string(),
  legendaryActions: z.string().nullable(),
  description: z.string().nullable(),
  extraData: z.string().nullable(),
});

export const MonsterPartialSchema = MonsterSchema.partial();

// Correctable subset, revised rule: every field except the fixed lock list
// (name/slug/sourceId — no classId/raceId on Monster). Applies only when
// the entry's Source.type === 'FILE'; see route logic below.
export const MonsterCorrectableSchema = MonsterSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).strict();
```

Route logic for `PATCH` (revised — gates the correctable check on source type
before applying it, where it previously ran unconditionally):

```typescript
function isFullyCorrectable(
  changedFields: Record<string, unknown>,
  correctableSchema: z.ZodObject<any>,
  sourceType: 'API' | 'FILE' | 'MANUAL',
): boolean {
  if (sourceType !== 'FILE') return false; // API: never; MANUAL: handled by its own passthrough branch, doesn't need this check
  const result = correctableSchema.safeParse(changedFields);
  return result.success;
}
```

If `isFullyCorrectable` returns `true` for the exact set of fields present in
the request body, apply the patch in place with no `saveAs` requirement.
Otherwise, fall through to the standard `saveAs` flow (which still short-
circuits to in-place for `MANUAL` entries, per the existing passthrough
branch).

**Code impact — not yet applied, flagged for implementation:** the live
`server/src/routes/content/writeHandlers.ts` `createPatchHandler` currently
runs the correctable-schema check *before* looking up the entry's source at
all (checks the schema, then falls through to a separate source-type lookup
only after a non-correctable result). That ordering needs to change so the
source-type check gates the correctable check as shown above. Every content
type's `<Type>CorrectableSchema` (`server/src/schemas/content/*.ts`) also
needs to be regenerated from `.omit({ name, slug, sourceId, ...FK if present })`
instead of the old hand-picked field lists. See `DevTools/Claude/phase-4.md`
for the full list of what was previously picked per type, now superseded.

---

### Historical: Original Per-Type Criterion (superseded, kept for context)

The original schema-and-handler build (Phase 4, shipped) used a narrower
rule: a field was "correctable" only if its value was *derived or inferred
by the import parser* (something the parser could plausibly get wrong) —
applied **regardless of the entry's source type**. This produced a short,
type-specific field list (Spell/Condition: none; Class: `hitDie`,
`primaryAbility`, `savingThrows`, `armorProfs`, `weaponProfs`,
`skillChoices`, `spellcastingAbility`; Subclass/Subrace/Race/ClassOption:
their parent-link field; Background: `proficiencies`, `abilityBonuses`;
Item: `rarity`, `requiresAttunement`, `damage`, `properties`; Feat:
`category`; Monster: the 6 fields shown in the example below prior to this
revision). This list and its "regardless of source type" behavior are now
superseded by the source-type-based rule above — kept here only so the
reasoning isn't lost, not as a current spec.

## 5. Implementation Instructions for Claude Code

1. Add the schema changes from Section 2 to `prisma/schema.prisma` (`ContentSubclass.classId`/`ContentSubrace.raceId` nullable with `onDelete: SetNull`).
2. Run `prisma migrate dev --name phase4-write-api`.
3. Add the Homebrew source seed (Section 2) to the database seed script, or run it once manually if seeding isn't automated yet.
4. Extend each content type's Zod schema file (`server/src/schemas/content/*.ts`) with a third exported schema: `<Type>CorrectableSchema`, using `.pick().strict()` per the pattern in Section 4. Decide the actual field list per type as part of this step — don't guess from the Monster example alone.
5. Build the shared error envelope helper (`server/src/utils/errorResponse.ts`) implementing `{ error: { code, message } }`, and use it for every error path across all endpoints in this phase.
6. Implement `POST /api/:type` per Section 3's contract.
7. Implement `PATCH /api/:type/:id`, including the correctable-fields check as the first branch before falling through to the `saveAs` flow.
8. Implement `DELETE /api/:type/:id`, with the class/race dependent pre-check branch. The dependent lookup query needs to join through to `source.type` to split results into `willDelete` (non-MANUAL) vs. `willOrphan` (MANUAL).
9. Implement `DELETE /api/sources/:id/entries` as a new route, reusing the delete-all-content-for-sourceId logic already needed by Phase 2's `importSource`.
10. Update `DELETE /api/sources/:id` (existing Phase 1.2 endpoint) to include the post-delete `warnings` array — no pre-check needed here, per Section 1.7's table.
11. Update Phase 2's `importSource` orchestrator to run the post-refresh orphan check (any subclass/subrace with a `null` parent link) and attach results to `ImportJob.warnings`.
12. Update `database.mmd` to reflect the nullable FK changes and the seeded Homebrew source.
13. Verify the full delete/orphan flow end-to-end before considering Phase 4 complete: delete an official class with both an official and a homebrew subclass attached, confirm the official subclass is gone, the homebrew one is `null`-parented and listed in the response, and that a subsequent refresh of that class's source doesn't error out.
