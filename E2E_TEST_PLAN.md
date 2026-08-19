# Study Hub — End-to-End AI Agent Test Plan (Task 29, roadmap #16)

This is the **automated/manual end-to-end flow**: *Search → Auto-read → Save →
Note → Article → Graph*. It validates that every Phase-1 + Phase-2 piece works
together as a single journey.

## What's automated vs manual

- **Automated** (`scripts/e2e-test.ps1`): the public server chain — AI-assisted
  search, auto-read (Study breakdown / plain-English / evidence context),
  and save-to-Library. Run it against a running instance:
  ```powershell
  # Deployed instance:
  .\scripts\e2e-test.ps1
  # Local dev server:
  $env:BASE_URL="http://localhost:3000"; .\scripts\e2e-test.ps1
  ```
  Exit code 0 = all backend steps pass.

- **Manual** (below): the signed-in tail that needs a real browser + Supabase
  auth (personal notes, articles/claims, the evidence graph).

---

## Manual signed-in flow (needs GitHub or Google sign-in)

Use test PMID **35819335** (*Maeo et al., triceps overhead vs neutral*).

1. **Search** — go to `/` and search `"overhead vs neutral triceps"` (or click
   the "Triceps arm position" example chip). Confirm ranked cards render, the
   AI-translated query disclosure shows, and Load more paginates.
2. **Auto-read** — open the study (`/study/35819335`). Confirm all three AI
   blocks auto-generate on load: *Study breakdown*, *In plain English*, and
   *Evidence context + What this might mean for training* (each with a
   `sourceInfo` badge). Confirm the raw abstract appears first.
3. **Save to Library** — click **Save to Library**; it becomes **Remove from
   Library**; the study then appears on `/library`. On the home search card the
   bookmark should now be filled.
4. **Note** — with the study saved, the **Personal notes** block unlocks; write
   and save a note, reload, confirm it persists (private to you).
5. **Article + claim** — go to `/articles`, create an article, add a claim, link
   it to study 35819335 with a `supports`/`contradicts`/etc. relationship, and
   optionally press **Check alignment** to see the verdict chip. Save; reload;
   confirm it persists.
6. **Graph** — go to `/graph`. Confirm the "What is this graph?" explainer
   shows and that the article / claim / study appear as nodes with a
   relationship-colored edge. Drag a node; click it → it opens the article
   editor or study page.

## Acceptance criteria

- [ ] Every step in the backend chain passes (`scripts/e2e-test.ps1`, exit 0).
- [ ] Raw abstract is shown before any AI output.
- [ ] Save → appears in Library; Remove works (bookmark/button flip).
- [ ] Note persists per-user (RLS).
- [ ] Article + claim + evidence link persist; alignment check returns a verdict.
- [ ] Graph shows the new nodes/edge and is interactive.
