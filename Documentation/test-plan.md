# Test Plan — DragonLedger DatabaseApp

**Issue:** #17 (sub-issues #18–#24) · **Status:** planned · **Written:** 2026-11-18

## Where things stand

- **Server unit/integration tests (Vitest):** strong. `server/src/__tests__/` covers auth, health, the database, content reads and writes, sources, the import routes, every Open5e importer, every Compendium importer, both import orchestrators, the JSON file importer, and the fetch/paging/retry helpers.
- **Client (`client/`):** one test file, `components/cards/shared/utils.test.ts`. The screens, forms, form widgets, browse components, filter bars, import wizard, source dialogs, hooks and `lib/` have no tests.
- **Shared types (`packages/content-types`):** type definitions only; nothing to unit-test beyond what the server tests already check.
- **Electron (`electron/src`):** `main.ts` and `paths.ts` have no tests.
- **E2E (Playwright):** two specs, both for imports (`open5e-import.spec.ts`, `compendium-import.spec.ts`). They run against the **live Open5e API**, a **local Compendium XML file** that isn't in the repo, and the database configured in `.env`. Browsing, creating, editing, deleting, sources, display/printing and login have no E2E.

## Goal

Unit tests for every client module and E2E for every user-facing flow, per `CLAUDE.md`. E2E runs on a throwaway database and fixtures, never the live Open5e API or the real data file.

## Tooling

| Layer | Tool | Location | Command |
|---|---|---|---|
| Server | Vitest (existing) | `server/src/__tests__/` | `npm test` |
| Client | Vitest (existing config) + React Testing Library + jsdom | `client/src/**/*.test.tsx` | `npm test` |
| E2E | Playwright (existing) | `e2e/` | `npm run test:e2e` |

Claude asks Bob before adding Testing Library and jsdom to `client/` if they aren't installed.

## Part 1: Make E2E self-contained (do first)

1. **Test database:** Playwright's global setup creates a fresh SQLite file (`DATABASE_URL=file:./e2e/test.db`), runs `prisma migrate deploy` and a small seed, and the `webServer` starts the server with that URL. The dev and real databases are never touched.
2. **Open5e fixtures:** record a small set of Open5e responses (a few spells, monsters, races, classes, items, backgrounds, conditions, across two pages) into `e2e/fixtures/open5e/`, and serve them from a local mock server that the importer points at through its base-URL setting. The current live test becomes an optional, hand-run check (`npm run test:e2e:live`).
3. **Compendium fixture:** a trimmed `Complete_Compendium` XML with one or two entries of each type, committed to `e2e/fixtures/`, only if its license allows; otherwise a hand-written XML in the same format. **Bob decides** which.

## Part 2: Client unit tests

1. `lib/`: `contentQuery` (query string building), `correctability`, `slugify`, `contentTypes`, and the `cardRegistry`/`filterBarRegistry`/`formRegistry` lookups (every content type has a card, filter bar and form).
2. `api/client.ts` and `lib/electronApi.ts`: request building and error handling (fetch and the Electron bridge mocked).
3. Hooks: `useContentList`, `useContentDetail`, `useContentNameIndex`, `useSpellNameIndex`, `useSources`, `useSelection`, `useDisplaySelection`, `useDisplayCollection`, `useImportProgress` (SSE events mocked: progress, partial, failed, completed).
4. Form widgets: `AbilityScoreGrid`, `ActionListWidget`, `ComponentsWidget`, `FixedChoiceGrantWidget`, `PropertyListWidget`, `ResistanceListWidget`, `SpeedWidget`, `SpellcastingWidget`, `TagListWidget`, `TraitListWidget`: add, edit, remove, and validation.
5. Forms (one test file per content type: background, class, condition, feat, item, monster, race, spell, subclass, subrace): required fields, validation messages, submit payload, edit mode pre-fills, `SaveAsPrompt` and `UnsavedChangesGuard`.
6. Cards: each content card renders a typical record and a minimal one; `OrphanedParentFallback`; `useFitToPage`.
7. Browse: `ResultsTable` (sorting, selection), `BulkActionBar`, `SourceMultiSelect`, `EditionToggle`, `NameSearchInput`, `PositionBar`, `DetailPopup`, `PrintCardsOverlay`; each filter bar.
8. Import wizard: each step (`Step1ChooseType`, `Step2Open5e`, `Step2Compendium`, `Step2Json`, `Step3Progress`, `AwaitingConfirmationPanel`).
9. Sources: `AddSourceDialog`, `ClearEntriesDialog`, `DeleteSourceDialog` (confirmation required), `SourceRow`, `SourcesTable`.
10. Screens: `LoginScreen` (wrong password), `BrowseScreen`, `DetailScreen`, `SubclassDetailScreen`, `SubraceDetailScreen`, `CreateHubScreen`, `DisplayScreen`, `SourcesScreen`: loading, empty and error states.

## Part 3: Electron

`paths.ts`: data and log paths per platform. `main.ts`: starts the server and opens the window (Electron APIs mocked). Light smoke tests only.

## Part 4: E2E specs to write

1. `auth.spec.ts`: wrong password is rejected; right password reaches Browse; protected routes redirect to login.
2. `browse.spec.ts`: switch content types; search by name; filter (spell level and school, monster CR, item rarity); toggle edition; sources filter; open a detail popup and a detail page.
3. `create-edit.spec.ts`: for spells, monsters and items, create a record, see it in Browse, edit it, save as a copy; leaving with unsaved changes shows the guard.
4. `subraces-subclasses.spec.ts`: add a subrace to a race and a subclass to a class; edit and delete them.
5. `delete.spec.ts`: delete one record; bulk-delete a selection with confirmation.
6. `sources.spec.ts`: add a source, clear its entries, delete it (confirmation).
7. `display-print.spec.ts`: add records to the Display collection; print trading cards and a monster spellcasting packet (check the print view renders, not the printer).
8. `open5e-import.spec.ts` and `compendium-import.spec.ts`: keep them, moved onto the fixtures from Part 1; add a JSON-file import spec and a failed-import spec.
9. `theme.spec.ts`: light/dark toggle persists.

## Order of work

1. (#18) Claude sets up the test database and import fixtures, and moves the two import specs onto them (Part 1).
2. (#19) Claude writes the client `lib/`, API client and hook tests.
3. (#20) Claude writes the widget, form, card and browse tests.
4. (#21) Claude writes the import wizard, sources and screen tests.
5. (#22) Claude writes the Electron smoke tests.
6. (#23) Claude writes the new E2E specs.
7. (#24) Claude updates `CLAUDE.md` with any new commands.

## Done when

- `npm test` runs server and client tests, and all pass.
- `npm run test:e2e` passes offline, on the throwaway database.
- Every route in `client/src/main.tsx` is reached by at least one E2E test.
