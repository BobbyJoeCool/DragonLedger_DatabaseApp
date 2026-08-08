# DragonLedger DatabaseApp — Phase 6 Import UI: Design Decisions

> Produced from the Phase 6 Import UI Design Brief. Paste this directly into
> Claude Code to implement.

---

## 0. Architecture note (resolved during the design session)

The Phase 1.1 schema brief describes DatabaseApp as a **hosted web app** on
**Azure SQL Database**. This Phase 6 brief describes it as a **local
single-user Electron app with SQLite**. Those two documents disagree with
each other. Confirmed during this session: DragonLedger Heroes (the mobile
character sheet app) will be **self-contained per device**, with possible
cloud sync of its own, and does **not** read live from a shared DatabaseApp
instance. There's no scenario where DatabaseApp needs to be reachable from a
different machine than the one running its desktop client. That makes the
local Electron + SQLite framing in this Phase 6 brief the accurate one —
Phase 1.1's "hosted web app" language looks like an earlier or aspirational
plan that got superseded. Worth updating Phase 1.1's own doc (or noting the
supersession somewhere central) so a future session doesn't get tripped up
by the same contradiction.

## 1. Decisions made

### 1.1 File-picker mechanism (the load-bearing decision)

**Decision: Native Electron file dialog + preload/IPC bridge.**

This app is explicitly single-user, single-machine, SQLite-on-disk. Building
a multipart upload path means writing server-side file-receiving code just to
turn bytes back into a path on the same disk they started on — solving a
client/server distance problem that doesn't exist here. The Compendium
endpoint already expects a filesystem path string; a native dialog slots into
it with zero backend changes, and gives the JSON endpoint (Question 2) the
same trivial "path in" shape for free.

Cost: `electron/src/main.ts` needs a preload script and one IPC channel added,
since neither exists today. That's a real but small one-time cost, and it's
the only way to get an absolute path out of the OS without a fake upload step.

### 1.2 JSON import endpoint contract

**Decision:**

```
POST /api/import/file   (auth)
body: { sourceId: string, sourceName: string, filePath: string }
→ 202 { jobId }
```

Reasoning: mirrors the Compendium endpoint's shape (path in, `202 {jobId}`
out) since Decision 1.1 makes that the natural pattern. No `contentTypes`
field — per Appendix B, the JSON file's own structure already sections
content by type (a `spells: [...]`, `items: [...]`, etc. shape), so there's
nothing for the user to pick; the importer reads whatever sections are
present, same posture as Compendium's fixed-set import.

`jobType`: see Decision 1.4 below — this endpoint writes `JSON_FILE`, not the
overloaded `FILE`.

### 1.3 `AWAITING_CONFIRMATION` as a live SSE-driven UI state

**Decision:** `useImportProgress(jobId)` owns one `EventSource` for the whole
wizard step's lifetime.

```ts
function useImportProgress(jobId: string | null): {
  status: ImportJobStatus | null;
  processedItems: number;
  totalItems: number;
  currentContentType: string | null;
  errors: string[];
  isConnected: boolean;
}
```

Lifecycle:
- Opens `EventSource` on mount when `jobId` is set; closes on unmount.
- Updates state on each `STATUS` event as it arrives (including the
  immediate replay-on-connect event, which is what makes Decision 1.7 safe).
- Closes the connection itself only on a true terminal status
  (`COMPLETED`, `FAILED`, `PARTIAL`) or a `DONE` event.
- `AWAITING_CONFIRMATION` is treated as just another status value, not a
  close signal — the hook keeps the connection open and keeps listening.

Wizard behavior: `Step2Compendium` watches `status` from the hook. The moment
it sees `AWAITING_CONFIRMATION`, it swaps `AwaitingConfirmationPanel` in
**in place** of the progress view (same step, no route change) — this is one
continuous job, not a new one, so navigating away would be misleading. When
the user picks duplicate/skip, the panel calls `POST .../resume` and then
gets out of the way; the *same* `EventSource` the hook already has open
starts emitting further `STATUS` events on its own once the backend resumes
the job, so the progress view just reappears with no need to reconnect.

### 1.4 Distinguishing Compendium from JSON import

**Decision:** extend `ImportJobType` to `OPEN5E | COMPENDIUM | JSON_FILE`
going forward. Stop writing the generic `FILE` value for new jobs; the
Compendium route writes `COMPENDIUM`, the new JSON route writes `JSON_FILE`.

Reasoning: now that a second file-based import kind is actually being built
in this same phase, the ambiguity stops being theoretical — a user with both
a Compendium source and a JSON source in their history has no way to tell
which is which today. The schema change is small and this is the natural
moment to make it, since Question 2 already requires touching the backend.

Existing historical rows already written as `FILE` stay as `FILE` — no
backfill migration. That's a one-time cosmetic gap in old history rows, not
worth a migration script for a single-user local app. Note this explicitly
in the `/sources` history UI (e.g. label `FILE` rows just "File Import"
generically, `COMPENDIUM`/`JSON_FILE` rows with their specific label).

### 1.5 Compendium wizard step's content-type UI

**Decision:** no checkboxes. Step 2b goes straight from file picker to
"Start Import." Since the backend always imports the same fixed seven
content types with no filtering option, showing selectable checkboxes would
imply a choice that doesn't exist and could mislead the user into thinking
they can narrow the import. A static, non-interactive list of what will be
imported (`Classes, Races, Backgrounds, Feats, Items, Spells, Monsters`) is
fine as informational text, but nothing on it should be clickable.

**v1.0 scope, confirmed:** full import only, no filtering of any kind.
**Future direction (not this phase):** import by section/subsection, or a
preview screen letting the user deselect individual rows before committing.
That's a backend change (the Compendium route would need to accept a filter
or a two-phase preview/commit flow) as well as a UI one — flag it as a
forward note in `Documentation/outline.md` now so a later design session
isn't reconstructing this context from scratch the way this one had to.

### 1.6 Re-run action for Compendium/File sources

**Decision:** no "Re-import" row action for Compendium or JSON-file sources
on `/sources`.

Reasoning: Open5e's re-import works as a table action because the backend
already has everything it needs (`documentKey`) to refetch without asking the
user anything. Compendium and JSON imports need a filesystem path the app
never stores anywhere — so a "re-run" button would just have to open the
wizard's file picker again anyway. At that point it's not a distinct action,
it's just "go run the wizard again." Don't build a button whose only job is
to redirect to a flow that already exists.

### 1.7 Progress view during the fire-and-forget window

**Decision:** navigate to the SSE progress view immediately on receiving
`jobId` from the `202` response.

Reasoning: the progress endpoint's "send one `STATUS` event immediately on
connect" behavior exists specifically so a client that arrives before real
work has started isn't left hanging — that's the race-smoothing mechanism
already built for this. Adding a second wait-for-signal step before
navigating would just be re-solving a problem the backend already solved.

---

## 2. New backend work required

### 2.1 JSON import route

New file (or addition to the existing import router):

```
POST /api/import/file   (auth required, same pattern as the other two import routes)

Request body:
{
  sourceId: string,
  sourceName: string,
  filePath: string
}

Response: 202 { jobId: string }
```

Internally: reuses the existing per-content-type transform functions
(referenced in the brief as already used by Open5e/Compendium), parsing
whatever sections the Appendix B JSON shape defines and creating/writing an
`ImportJob` row with `jobType: 'JSON_FILE'`.

### 2.2 `ImportJobType` enum change

Add `COMPENDIUM` and `JSON_FILE` as new values. Keep `FILE` in the enum for
backward compatibility with existing rows, but stop writing it — the
Compendium route's job-creation call switches from `FILE` to `COMPENDIUM`,
and the new JSON route writes `JSON_FILE`.

### 2.3 Electron preload script + IPC channel

`electron/src/main.ts` currently has no preload script. Add one, plus:

```
IPC channel: 'dialog:selectFile'
Renderer → Main:  invoke('dialog:selectFile', { filters?: FileFilter[] })
Main → Renderer:  returns { filePath: string } | { canceled: true }
```

Preload exposes this to the renderer via `contextBridge`, e.g.
`window.electronAPI.selectFile(filters)`. Used by both `Step2Compendium`
(filter to `.xml`) and `Step2Json` (filter to `.json`).

---

## 3. Component breakdown

```
SourcesScreen
  SourcesTable
    SourceRow            (name, type badge, entry count, last updated, row actions)
  AddSourceDialog         (name + description → creates MANUAL source)
  ClearEntriesDialog       (confirmName input → DELETE /:id/entries)
  DeleteSourceDialog       (confirmation, shows entry count + warnings[])

ImportScreen
  ImportWizard
    Step1ChooseType         (Open5e / Compendium / JSON)
    Step2Open5e              (source name, content-type checkboxes, Start Import)
    Step2Compendium
      (file picker → Start Import)
      AwaitingConfirmationPanel   (swapped in when status === AWAITING_CONFIRMATION)
    Step2Json                (source name, file picker, Upload & Import)
    Step3Progress             (per-content-type counts, error list, Done)
```

`Step3Progress` is shared across all three import kinds — it just consumes
`useImportProgress(jobId)` regardless of which `POST` created the job.

---

## 4. `useImportProgress` hook — full design

```ts
type ImportJobStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL';

interface ImportProgressState {
  status: ImportJobStatus | null;
  processedItems: number;
  totalItems: number;
  currentContentType: string | null;
  errors: string[];
  isConnected: boolean;
}

function useImportProgress(jobId: string | null): ImportProgressState {
  // 1. On mount (or when jobId changes from null → a value):
  //    open new EventSource(`/api/import/progress/${jobId}`)
  // 2. On 'STATUS' message: parse payload, setState with new counts/status
  // 3. On 'DONE' message, or status in [COMPLETED, FAILED, PARTIAL]:
  //    close the EventSource, leave final state in place
  // 4. AWAITING_CONFIRMATION: setState as normal, do NOT close the connection
  // 5. On unmount: always close the EventSource (cleanup function)
  // 6. isConnected reflects EventSource.readyState, mainly for showing
  //    a "reconnecting..." indicator if the connection drops unexpectedly
}
```

The wizard's `Step2Compendium` reads `status` from this hook and renders
`AwaitingConfirmationPanel` in place whenever `status === 'AWAITING_CONFIRMATION'`,
swapping back to the normal progress view automatically once a later `STATUS`
event reports something else (post-resume).

---

## 5. Implementation Instructions for Claude Code

1. **Backend first.** Add `COMPENDIUM` and `JSON_FILE` to the `ImportJobType`
   enum. Update the Compendium import route to write `jobType: 'COMPENDIUM'`
   instead of `'FILE'`.
2. Create `POST /api/import/file` per the contract in Section 2.1, reusing
   the existing content-type transform functions. Write `jobType: 'JSON_FILE'`.
3. **Electron bridge.** Add a preload script to `electron/src/main.ts`'s
   `BrowserWindow` config, and register the `dialog:selectFile` IPC handler
   in the main process per Section 2.3. Expose `window.electronAPI.selectFile`
   via `contextBridge`.
4. **Client: hook.** Implement `useImportProgress` in
   `client/src/hooks/useImportProgress.ts` per Section 4.
5. **Client: `/sources`.** Build `SourcesScreen`, `SourcesTable`, `SourceRow`,
   `AddSourceDialog`, `ClearEntriesDialog`, `DeleteSourceDialog` under
   `client/src/screens` and `client/src/components`, reusing `useSources` and
   `SourceBadge` from Phase 5. No re-import action on rows for Compendium/JSON
   sources (Decision 1.6) — Open5e-type sources only.
6. **Client: `/sources/import`.** Build `ImportScreen > ImportWizard` and its
   steps per Section 3. `Step2Compendium` and `Step2Json` call
   `window.electronAPI.selectFile` rather than an `<input type="file">`.
   `Step2Compendium` has no content-type checkboxes (Decision 1.5).
7. Wire all three "Start Import" / "Upload & Import" actions to navigate to
   `Step3Progress` immediately on receiving `{ jobId }` from their respective
   `202` response (Decision 1.7) — don't wait for any other signal first.
8. In `/sources` and any import-history view, label jobs by `jobType`:
   `OPEN5E` → "Open5e Import", `COMPENDIUM` → "Compendium Import",
   `JSON_FILE` → "JSON Import", legacy `FILE` → generic "File Import".
9. Before moving to Phase 6.3's tests: verify the `AWAITING_CONFIRMATION`
   path end-to-end with a real duplicate-triggering Compendium file — confirm
   the SSE connection survives the pause, the panel swaps in and out
   correctly, and `resume` continues the same job rather than creating a new
   one. The outline's existing Phase 6.3 test list in `Documentation/outline.md`
   stays valid as written.
