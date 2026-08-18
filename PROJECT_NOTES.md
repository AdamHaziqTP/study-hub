# Study Hub — Project Notes (Living Document)

> **What this file is:** a continuously-updated record of *what* we are building, *why* each piece exists, and *what has been done so far*. Anyone — including future-you reading this months later, or an SMU interviewer — should be able to read this top-to-bottom and understand the reasoning behind every decision.

---

## 1. The product, in one sentence

**A research assistant that helps evidence-curious lifters find, understand, critically interpret, and apply exercise-science research — with a secondary system for writing and organizing your own evidence-backed conclusions.**

It is **not**:

- "PubMed but prettier"
- "AI fact-checks fitness influencers"
- "Obsidian for exercise science"
- a social network

It is a **research interpretation layer** between academic literature and a normal lifter.

---

## 2. Why this project exists

- **Personal motivation:** the builder (Adam) reads exercise-science studies and constantly hits the same wall — PubMed contains the information, but it is not designed around the questions a lifter actually asks ("Should I train this muscle 1× or 2× per week?", "Does arm position change which biceps head gets trained?", etc.).
- **Portfolio goal:** this is the centerpiece project for an SMU **Information Systems** application. It demonstrates information retrieval, API integration, relational data modeling, AI/NLP integration, information architecture, and user-centered product design — the exact mix IS values.
- **Scope reality:** built in ~4–6 weeks before an internship in Japan, so strict scope control has been a non-negotiable from day one.

---

## 3. The product hierarchy (the single most important rule)

From the project brief, the hierarchy is:

1. **🥇 Core — Study Explorer (≈70% of the product):** search → ranked results → study page that answers *what was asked / who was studied / how it was conducted / what was measured / what was found / what the authors concluded / limitations / evidence context / what this might mean for training*.
2. **🥈 Secondary — Evidence Notebook:** save studies, take notes, write articles that **consume studies already discovered through the Explorer**.
3. **🥉 Advanced — Evidence relationships:** claims linked to studies (`supports / contradicts / mixed / contextual`), and eventually a visual evidence graph.

**Two hard rules that follow from this:**

- **Explorer-first:** articles are written *after* reading studies. Never build the UI around "write a claim, then have the AI find a study that agrees" — that risks becoming an AI confirmation-bias machine.
- **Rank, don't filter:** search results are *ranked* by relevance but never hidden. A "peripheral" study may still contain something useful; the user always retains access.

---

## 4. Core product principles (the "defensible" rules)

These exist because the original idea drifted toward "AI tells you if a study is reliable," which is scientifically indefensible and easy to dismantle in an interview:

1. **No numerical "credibility score."** No "🟢 87% reliable." Study quality is not a scalar. Instead: **Evidence Context** — surface the factors (sample size, study design, population, training status, duration, measurement) with plain-language explanations of *why each matters*.
2. **The AI is an interpreter, never the source.** The raw PubMed abstract is always displayed first, unmodified. The AI only explains/extracts *downstream* of the source record.
3. **Three distinct AI jobs, kept structurally separate:**
   - **Job 1 — Extract:**  structured facts (sample size, population, duration…) — relatively objective.
   - **Job 2 — Explain:**  plain-English understanding of what the study tested/found.
   - **Job 3 — Translate cautiously:** what this *might* mean for training — explicitly labelled as interpretation, with "what it does NOT mean".
4. **Don't let AI invent limitations.** "n=24 trained males, 8 weeks" → AI can extract that. "This sample is too small to be reliable" → that is AI *interpretation* and must be labelled as such. "Ultrasound was inadequate" → scientific judgment, not allowed in the extraction layer.
5. **Immutable source, regenerable AI:** the PubMed record is never overwritten. AI output lives in separate tables so a prompt/model change can regenerate interpretations without touching the source.

---

## 5. Architecture & tech stack (and why)

```
                    ┌──────────────┐
                    │    User      │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Next.js    │
                    │  React/TS    │
                    └──────┬───────┘
                           │
             ┌─────────────┼──────────────┐
             ▼             ▼              ▼
        ┌─────────┐   ┌─────────┐   ┌──────────┐
        │ Supabase│   │ PubMed  │   │ DeepSeek │
        │ Postgres│   │  E-util │   │   API    │
        └─────────┘   └─────────┘   └──────────┘
        · Auth (GitHub OAuth, Task 6)
        · RLS
        · Storage (future)
```

| Piece | Choice | Why |
|---|---|---|
| Frontend + Backend | **Next.js 16 (App Router) + TypeScript** | Same language ecosystem as the Arctic Fever React Native work; one repo for frontend + API routes; one deploy. No context-switching. |
| Database | **PostgreSQL via Supabase** | Relational fit for the evidence graph; Supabase gives auth/storage/RLS without setup overhead; free tier. |
| Auth | **Supabase GitHub OAuth** | First user-owned feature (Task 6) needs real accounts. OAuth beats hardcoded test users (unprofessional for a portfolio) and email magic links (SMTP/spam-filter headaches). GitHub OAuth ties onto the GitHub account holding the student developer benefits; ~2 minutes to configure in the dashboards. |
| External research data | **NCBI PubMed E-utilities** | The authoritative open API for biomedical literature. Two-step: `esearch` → PMIDs, then `efetch` → full XML. |
| AI | **DeepSeek API** | Cheap structured extraction; model chosen explicitly in code (see §8). |
| Hosting | **Vercel + Supabase** (planned) | Natural fits for Next.js + Postgres. |

### Why Next.js 16 matters for the code
This is a **new major version** with breaking conventions vs. older Next.js training data. The key ones we've hit: **dynamic route `params` is now a `Promise`** and must be `await`-ed (see `src/app/study/[pmid]/page.tsx`); `cookies()` is async-only; `middleware` is renamed `proxy`. Always check `node_modules/next/dist/docs/` before using a new Next.js feature.

---

## 6. The database design (the data-model reasoning)

The single most important schema decision: **separate the source of truth from derived data.**

```
STUDIES              = "what the paper/source says"   (immutable, from PubMed)
  ▼
STUDY_CONTEXT        = "what our AI extracted"        (regenerable)
  ▼
STUDY_ASSESSMENTS    = "how that context affects interpretation" (qualitative)
```

And separately, the user's evidence graph:

```
ARTICLES → CLAIMS → EVIDENCE_LINKS → STUDIES
```

And the user's private layer (Task 6):

```
STUDY_NOTES (user_id, study_id)    = one consolidated personal note per (user, study)
```

Why this separation matters:
- If the AI prompt improves next month, you can **wipe and regenerate** `study_context` without destroying the original PubMed record.
- It keeps "source facts" vs "AI interpretation" vs "what the user concludes" cleanly separated — which is exactly the defensible design the project brief demands.

Tables (all in `sql/schema.sql`, which is the source of truth):

| Table | Purpose |
|---|---|
| `users` | Profile extension of Supabase Auth |
| `studies` | Raw PubMed record (PMID-unique) |
| `study_context` | AI-extracted structured facts (1:1 with study), incl. `source_info` (what the AI read) |
| `study_identified_limitations` | AI-derived limitations child rows (`limitation`, `based_on`, `sort_order`), regenerated wholesale |
| `study_notes` | User-owned personal note per (user, study) — `UNIQUE(user_id, study_id)`, RLS-locked to `auth.uid()` |
| `study_assessments` | Qualitative evidence profile (1:1 with study) |
| `articles` | User-written wiki-style conclusions |
| `claims` | Individual statements within an article |
| `evidence_links` | The graph: claim ↔ study with a `relationship` enum |

---

## 7. Security decisions (RLS — Row Level Security)

Supabase's RLS is a per-table bouncer. Our decisions:

- **`studies` = shared public library** (like Wikipedia entries): anyone can **READ** and **INSERT**, **nobody can UPDATE or DELETE** via the API.
  - Rationale: the raw PubMed record is source-derived. Arbitrary public users must not be able to modify existing cached studies.
  - **Why INSERT-only save?** Originally the endpoint used PostgreSQL `upsert`, which requires UPDATE permission. A security review flagged that granting public UPDATE contradicts the "immutable source" principle. `/api/save-study` now does **check-then-insert**; `/api/save-context` inserts the `studies` row the same way if missing.
- **`study_context` = shared regenerable derived library** (DIFFERENT trust model than `studies`): AI-derived output is *designed* to be overwritten — a prompt/model change can regenerate it. So RLS is **SELECT + INSERT + UPDATE** (upsert on `study_id`), with DELETE locked (a full-row upsert replaces content wholesale).
- **`study_identified_limitations` = regenerable child**: regeneration = delete-all + reinsert, so RLS is **SELECT + INSERT + DELETE** (no UPDATE — rows are replaced wholesale).
- **`study_notes` = PRIVATE user-owned notes** (Task 6, the first user-owned table): a single `FOR ALL TO authenticated` policy with `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` — a user can only see/edit their OWN rows, and cannot insert on another user's behalf. The `user_id` column **DEFAULTS to `auth.uid()`** in the DB, so the client never sends it (belt-and-suspenders on top of the WITH CHECK).
- **User-owned tables** (`articles`, `claims`, `evidence_links`, `study_assessments`, `users`) have RLS enabled with **no public policies** — locked until their feature is built (articles/claims next).
- **Keys:** only the Supabase **anon/public** key is exposed via `NEXT_PUBLIC_` (it's meant to be public — RLS is the real security boundary). The DeepSeek key goes into `.env.local` **without** `NEXT_PUBLIC_` so it stays server-side. `.env*` is git-ignored (except `.env.example`, the committed template).

---

## 8. Cost model (important — two separate costs)

There are **two completely different costs**, easy to confuse:

| | Cline (the coding agent) | Study Hub (the app's AI features) |
|---|---|---|
| What it is | Helps **write** the code | Runs **inside** the deployed app |
| Cost trigger | Large agentic context (reading files, reasoning, retries) | One small structured API call per study |
| Model choice | Set in the Cline provider config | **Chosen explicitly in our code** — the API key alone does **not** pick the model |

You saw a 43¢ bill from Cline — that was agentic coding cost (lots of context in/out), **not** the app's per-study cost. Study Hub's extraction will be one short call per study.

**Model strategy (in effect now):**
- **Cheap model (`deepseek-chat`)** → extraction + simplification (structured info from an abstract is a good use case for a cheap model). Set as the default in `src/lib/ai.ts`; overridable via `DEEPSEEK_MODEL`.
- **Stronger model** → reserved for claim↔evidence alignment later ("does this claim accurately represent these five studies?"), which is genuinely harder.
- DeepSeek key: `DEEPSEEK_API_KEY=` in `.env.local` (no `NEXT_PUBLIC_` prefix).

---

## 9. What has been built so far

All of this is **committed and pushed** to GitHub (`main`).

| File | What it does | Why it exists |
|---|---|---|
| `src/lib/pubmed.ts` | Shared PubMed engine: `esearch` → `efetch` → XML parse → structured `PubMedStudy` (`pmid`, `title`, `authors`, `journal`, `publicationDate`, `abstract`, `doi`, `pmcid`) + `fetchFullText` (PMC, 12k cap); `searchPubMed` uses `sort=relevance` (NCBI Best Match) | One source of truth for parsing; `findPmcid` reads the PMC ArticleId from the record itself (lag-free); Best Match ranks results by relevance without hiding any (Task 5) |
| `src/app/api/search-pubmed/route.ts` | API route exposing search (delegates to shared lib) | Backend keeps the NCBI call server-side |
| `src/app/api/save-study/route.ts` | POST: check-then-insert a study into `studies` | INSERT-only per security review (§7); no public UPDATE |
| `src/app/api/extract-context/route.ts` | POST: fetch PubMed + PMC full text when available, run DeepSeek extraction, return `{ study, context, sourceInfo }` | The AI pipeline (no DB write) |
| `src/app/api/save-context/route.ts` | POST: persist validated `StudyContext` into `study_context` (+ `study_identified_limitations` child rows) | Wires the "Generate/Regenerate context" persistence; regenerable-warehouse RLS |
| `src/app/study/[pmid]/page.tsx` | Server page: DB-first (loads `studies` + saved `study_context`/limitations), falls back to live PubMed; passes `studyId` to `<StudyDetail>`; `force-dynamic` so save-state stays fresh | Saved context renders without an AI call on revisit; `studyId` unlocks PersonalNotes; Next.js 16 `params`-as-`Promise` |
| `src/app/study/[pmid]/StudyDetail.tsx` | Study detail UI: raw abstract on top → AI Study breakdown → evidence context / training-application placeholders → **Personal notes**; header now includes the `AuthStatus` sign-in control; Save-to-Library triggers `router.refresh()` so notes unlock immediately | Encodes the product rules end-to-end |
| `src/app/study/[pmid]/PersonalNotes.tsx` | Personal notes editor (Task 6): login call-to-action when unauthenticated; "save the study first" hint when signed in but unsaved; textarea + INSERT-or-UPDATE against `study_notes` when signed in + saved | First user-owned feature; client never sends `user_id` (DB defaults to `auth.uid()`) |
| `src/components/AuthStatus.tsx` | Header sign-in / sign-out widget (GitHub OAuth), thread-safe `next` redirect back to the originating page | Global auth entry point via `@supabase/ssr` browser client |
| `src/app/auth/callback/route.ts` | `GET /auth/callback`: exchanges the OAuth code for a session via a server-side `@supabase/ssr` client and persists session cookies, then redirects to `next` | Required Supabase PKCE callback handler |
| `src/lib/supabase/browser.ts` | Browser Supabase client (`createBrowserClient`) with automatic cookie session handling | Auth + user-owned notes from the client |
| `src/lib/supabase/server.ts` | Server Supabase client (`createServerClient`) bound to request/response cookies | Used by `/auth/callback` for the code exchange |
| `src/app/page.tsx` | Search home page; cards link to `/study/[pmid]`; header now has `AuthStatus` + Library link | The entry point of the Explorer |
| `src/app/library/page.tsx` | Library page (`/library`): server component listing saved studies from `studies` newest-first with the home-page card markup, empty + error states, and a "Back to search" link; header has `AuthStatus` | Task 4; public shared-library view (`studies` = shared reference library) |
| `sql/schema.sql` | Full schema + RLS as a checked-in file (incl. `source_info` col + `study_identified_limitations` table + regenerable RLS + **`study_notes` table + per-user RLS + FK indexes**) | Database reproducible; portfolio artifact |
| `src/lib/ai.ts` | Server-only DeepSeek helper: `extractStudyContext(title, abstract, fullText?)` → validated `StudyContext` + `IdentifiedLimitation[]` | `deepseek-chat` default; strict JSON validation; two-tier limitations |
| `.env.example` | Committed template of required env vars (no secrets) + GitHub OAuth note | `.env*` stays git-ignored except this file |

### The page layout that encodes the product rules (`StudyDetail.tsx`, top to bottom)

1. Header (title, authors, journal, PMID) + `AuthStatus` sign-in/sign-out control
2. **Save to Library** + **View original on PubMed** buttons
3. **What the study actually says** — the raw abstract, unmodified (source first)
4. **Study breakdown** — AI-generated: research question / who was studied / how conducted / findings / paper-stated limitations + identified limitations (each with a `based_on` quote), `sourceInfo` badge, Generate/Regenerate button, loading skeleton, error states
5. **Evidence context** — placeholder for the factor explanations (no credibility score)
6. **What this might mean for training** — placeholder for cautious practical interpretation
7. **Personal notes** (Task 6) — login-gated textarea saving to `study_notes`; private to the signed-in user

---

## 10. Current status

- ✅ Next.js 16.3.1 + TypeScript + Tailwind, running with `npm run dev` (port 3000)
- ✅ Supabase project connected; `.env.local` git-ignored
- ✅ Full schema created in Supabase; recorded in `sql/schema.sql`
- ✅ PubMed search → parse → study card UI
- ✅ Study detail page (DB-first, live fallback)
- ✅ Save to Library (verified working — RLS SELECT+INSERT applied in Supabase)
- ✅ AI extraction pipeline (Job 1) — DeepSeek `deepseek-chat`, validated output, `/api/extract-context`
- ✅ Full-text (PMC) reading — `pmcid` from the record (lag-free), `sourceInfo` reported
- ✅ Two-tier limitations — paper-stated vs AI-derived-with-`based_on`
- ✅ **Study breakdown populated on the detail page** (`StudyDetail.tsx` renders validated `StudyContext` + badge + skeleton + errors; Task 2)
- ✅ **Context persisted (Task 3)** — `/api/save-context` upserts into `study_context` (+ `study_identified_limitations` child rows); `page.tsx` loads saved context DB-first; schema updated with `source_info` + child table + regenerable RLS (SELECT+INSERT+UPDATE on study_context; SELECT+INSERT+DELETE on child)
- ⏳ **Action required by user:** run the updated `sql/schema.sql` in Supabase (adds `source_info` column, `study_identified_limitations` table + index + regenerable RLS policies — AND, since Task 6, the `study_notes` table + per-user RLS + FK indexes) so "Generate context" persistence and personal notes both work
- ✅ **Library page (Task 4)** — `/library` lists saved studies from `studies` newest-first (server component, `export const dynamic = "force-dynamic"` so newly-saved studies always appear); reuses home-page card markup, links to `/study/[pmid]`, has empty + error states; Library nav link added to the home page header
- ✅ **Ranked search (Task 5)** — `searchPubMed` now sends `sort=relevance` to ESearch, delegating ranking to NCBI's own "Best Match" ML algorithm (the same one used on pubmed.ncbi.nlm.nih.gov). This ranks results by relevance without filtering any — result count is unchanged (verified: "internal external rotation bicep" → still 228 hits). Default ESearch order is newest-first by PMID; Best Match surfaces the most-relevant studies regardless of recency.
- ✅ **Notes on studies (Task 6)** — Supabase GitHub OAuth via `@supabase/ssr` (`/auth/callback` exchange + `AuthStatus` header widget); `study_notes` table (keyed `(user_id, study_id)`, `UNIQUE` constraint, `user_id DEFAULT auth.uid()`) locked by RLS to the owner; `PersonalNotes` editor on the study page hidden behind a login prompt; `tsc --noEmit` clean
- ✅ `tsc --noEmit` passes clean
- ✅ Living doc (this file)

**Editor note:** if VS Code shows "Cannot find module './StudyDetail'", it's a stale TS-server cache — the file exists and `tsc` resolves it. Restart the TS server (or save any file) to clear it.

### Test case being used
PubMed study **PMID 35819335** — *"Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position"* (Maeo et al., European Journal of Sport Science).

Why it's a good test case: it's exactly the kind of study that lacks context in its raw abstract (e.g., MRI may reflect acute swelling rather than true growth; specific subject population; specific training protocol). These are precisely the "Evidence context" / "what it does NOT mean" gaps the app is designed to surface.

---

## 11. Roadmap position & next steps

We are working through a 24-phase roadmap (from the project brief). Position ≈ **Phase 12 (personal notes)**. Priority hierarchy:

- 🔴 **Must work:** PubMed → Study → Study Context → Evidence Context ✅ (core flow wired; extraction rendered + persisted)
- 🟠 **Very important:** Notes ✅ (Task 6) → Articles → Claims → Evidence Links
- 🟡 **High-value stretch:** AI simplification → Claim alignment
- 🟢 **Stretch:** evidence graph → polish
- ⚪ **Completely optional:** social / monetisation / mobile

### Immediate next steps (one small, testable step at a time)

1. ✅ **AI extraction skeleton** — `src/lib/ai.ts` + `/api/extract-context` (`deepseek-chat`; validates JSON; verified 35819335→abstract_only with derived limitations, 42605311→full_text).
2. ✅ **Populate the Study breakdown** on the detail page from validated `StudyContext` (display only; `sourceInfo` badge; loading/error states).
3. ✅ **Persist extracted context** — `/api/save-context` upserts `study_context` + child limitations; page.tsx loads DB-first. **User action:** apply updated `sql/schema.sql` in Supabase.
4. ✅ **Library page** (`/library`) — server component lists saved studies from `studies` newest-first (`export const dynamic = "force-dynamic"`); home-page card markup reused; empty + error states; nav link on home page.
5. ✅ **Ranked search** — `sort=relevance` (NCBI Best Match) added to ESearch in `searchPubMed`; verified against "internal external rotation bicep" (still 228 results, relevance-ordered; no filtering).
6. ✅ **Notes on studies (Task 6)** — Supabase GitHub OAuth + `study_notes` table (RLS-locked, `user_id DEFAULT auth.uid()`) + login-gated `PersonalNotes` editor. **User actions:** (a) run updated `sql/schema.sql` in Supabase, (b) enable GitHub in Authentication → Providers with the Client ID/Secret, (c) set GitHub's authorization callback URL to Supabase's internal `https://<project-ref>.supabase.co/auth/v1/callback`, and (d) add `<app-url>/auth/callback` to Supabase URL Configuration → Redirect URLs (see §12.5 / `.env.example`).
7. **Article/claim system** — consumes studies discovered through the Explorer (Phase 13-15).

### Workflow rule going forward
> One small feature at a time → the plan/approach is explained first → implemented → tested → committed. No more autonomous large builds.

---

## 12. Session Handoff (READ THIS FIRST in a new chat)

This project is developed in short agent-chat sessions. A fresh agent should be able to continue **from this file alone** plus the codebase — no conversation history needed.

### How the loop works
1. New chat: **"Read `PROJECT_NOTES.md` and the key files listed in §12.3, then implement the current task in §12.2."**
2. Agent completes the task, updates this file's status/next-steps, commits + pushes.
3. Agent tells the user the **next task in the same numbered format** (§12.2).
4. User starts a new chat with step 1. Repeat.

### 12.1 Non-negotiable project rules (transcript of the brief)
- **Explorer-first:** a user searches → reads → understands → forms a conclusion → *then* writes. Never "write a claim then find a study that agrees" (confirmation-bias machine).
- **Rank, don't filter:** search never hides low-relevance studies; it orders them.
- **The AI is an interpreter, never the source:** raw abstract/full text is always shown first, unmodified. AI output goes in derived/regenerable tables (`study_context`), never overwriting raw `studies`.
- **No credibility score.** No "87% reliable". Surface factors (design, n, population, duration, measure) + plain-language *why it matters*.
- **Two-tier limitations:** `limitations` = what the paper states; `identified_limitations` = AI-derived, each with a required `based_on` quote from a stated fact. Never invented.
- **Read full text when available:** via PMC (open access). `sourceInfo` field (`full_text` / `abstract_only` / `provided_text`) tells the UI what the AI actually read.
- **Cheap model default:** `DEEPSEEK_MODEL` defaults to `deepseek-chat` in `src/lib/ai.ts`. Only use a stronger model for claim↔evidence alignment later.
- **RLS:** `studies` = public SELECT + INSERT only (no UPDATE/DELETE). `study_context` = SELECT+INSERT+UPDATE (regenerable). `study_identified_limitations` = SELECT+INSERT+DELETE (regenerated wholesale). **`study_notes` = PRIVATE, `FOR ALL TO authenticated` with `auth.uid() = user_id`, `user_id DEFAULT auth.uid()`.** Other user-owned tables locked until auth.
- **Auth (Task 6):** GitHub OAuth via `@supabase/ssr`. Browser client = `src/lib/supabase/browser.ts`; server client = `src/lib/supabase/server.ts`; callback = `/auth/callback`. AuthState changes → `router.refresh()` where server props depend on save-state (studyId).
- **Next.js 16 gotchas:** dynamic `params` is a `Promise` (must await); `cookies()` is async; `middleware` → `proxy`; check `node_modules/next/dist/docs/` before new Next features.
- **Windows shell:** always use `npm.cmd`/`npx.cmd` in PowerShell (ps1 scripts are disabled); never chain with `&&` in PowerShell.

### 12.2 Current task queue
Current task:

**Task 7 (do this next): Article/claim system — user-written conclusions that consume saved studies from the Explorer.**
- What: let a user write an article (wiki-style conclusion) that references studies they have saved, with individual claims and `evidence_links` (supports / contradicts / mixed / contextual) to those studies.
- Product fit: this is the second piece of the Evidence Notebook (§3 hierarchy, tier 2) and unlocks the evidence graph later.
- Head start: `articles`, `claims`, `evidence_links` tables already exist in `sql/schema.sql` with RLS enabled and **no public policies** (same trust model as `study_notes` — user-owned, `auth.uid()`-locked). Auth (GitHub OAuth) is already in place from Task 6, so this builds directly on it.
- Deliverable: a user can create an article, add claims, and link claims to saved studies; the study page shows which claims reference it (when visited by the author, or render a public read-only view for non-authors — decide which).
- Notes: `studies` stays public-read; `articles`/`claims`/`evidence_links` need `user_id`/ownership columns (the current `evidence_links` schema has no `user_id` — that must be resolved, e.g. join through `articles.user_id` or add `user_id`).

Then, in order:
8. Optional/stretch: evidence graph, AI simplification, claim alignment, polish, deploy, test, docs.

### 12.3 Files to read on resume (fastest path to full context)
- `PROJECT_NOTES.md` (this file — deep context + history)
- `src/lib/pubmed.ts` — PubMed engine: `PubMedStudy` shape, `searchPubMed`, `fetchPubMedStudyById`, `findPmcid` (lag-free from record), `fetchFullText` (PMC, 12k cap), parsing.
- `src/lib/ai.ts` — DeepSeek helper: `StudyContext` + `IdentifiedLimitation` types, `extractStudyContext(title, abstract, fullText?)`, `deepseek-chat` default, strict JSON validation.
- `src/lib/supabase/browser.ts` + `server.ts` — `@supabase/ssr` browser/server clients (Task 6). Server client is request-scoped and used only by `/auth/callback`.
- `src/app/auth/callback/route.ts` — OAuth code exchange + session cookie persistence; `next` redirect param.
- `src/components/AuthStatus.tsx` — header sign-in/sign-out widget used on home, library, and study pages.
- `src/lib/supabase.ts` — shared anon client for *public* server-side reads/writes (`studies`, `study_context`, `study_identified_limitations`).
- `src/app/api/extract-context/route.ts` — AI pipeline endpoint (`sourceInfo`).
- `src/app/api/save-context/route.ts` — persistence endpoint (upserts `study_context` + child limitations).
- `src/app/api/save-study/route.ts` — INSERT-only check-then-insert.
- `src/app/api/search-pubmed/route.ts` — search endpoint.
- `src/app/study/[pmid]/page.tsx` + `StudyDetail.tsx` + `PersonalNotes.tsx` — detail page (renders + persists context; Task 6 personal notes; `studyId` prop unlocks notes).
- `src/app/page.tsx` — home search (header has `AuthStatus` + Library link).
- `src/app/library/page.tsx` — Library page (Task 4; `export const dynamic = "force-dynamic"` pattern).
- `sql/schema.sql` — schema + RLS (incl. `source_info`, `study_identified_limitations`, `study_notes` + per-user RLS + FK indexes, regenerable policies).
- `.env.example` — required env vars + GitHub OAuth note (never commit `.env.local`).

### 12.4 Verified status (don't re-verify unless asked)
- PubMed search → parsed study cards: ✅ working.
- Study detail page (DB-first, live fallback): ✅ HTTP 200.
- Save to Library: ✅ working (RLS SELECT+INSERT applied in Supabase).
- `/api/extract-context`: ✅ 35819335 → `abstract_only` + derived limitations; 42605311 → `full_text`.
- `/api/save-context`: ✅ implemented; persistence requires the updated `sql/schema.sql` to be applied in Supabase (user action noted in §10).
- `/library` (Task 4): ✅ HTTP 200; home page `/` with Library nav link: HTTP 200.
- Ranked search (Task 5): ✅ `sort=relevance` verified against NCBI ESearch (returns relevance-ordered PMIDs; result count unchanged — no filtering); `tsc --noEmit` clean.
- Task 6 (auth + notes): ✅ `tsc --noEmit` clean AND `npm run build` passes (Next.js 16 production build, Turbopack). The note save flow requires the `study_notes` RLS + table to exist in Supabase, so it is **not end-to-end verified until the user applies `sql/schema.sql`** and enables GitHub OAuth.
- Git: clean on `main` (HEAD after Task 6 commit).

### 12.5 Environment notes
- `.env.local` already contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DEEPSEEK_API_KEY` (user set it). `DEEPSEEK_MODEL` optional. **GitHub OAuth needs no env vars** - configured in TWO dashboards: (1) GitHub -> OAuth App -> "Authorization callback URL" must point to Supabase's INTERNAL callback `https://<project-ref>.supabase.co/auth/v1/callback` (copy it from Supabase Authentication -> Providers -> GitHub, "Callback URL") - NOT the app URL; (2) Supabase -> Authentication -> URL Configuration -> Redirect URLs -> add `<app-url>/auth/callback` (e.g. http://localhost:3000/**). See .env.example for the full walkthrough.
- Dev server: restart after env change (`npm.cmd run dev`). If port 3000 busy: `taskkill /PID <pid> /F`.
- Supabase project is live (don't re-run full schema unless asked; `sql/schema.sql` is source of truth — but the Task 3 + Task 6 additions DO need to be applied once for context persistence AND notes: `source_info` column, `study_identified_limitations` table + index + regenerable RLS, `study_notes` table + per-user RLS + FK indexes).
- Test PMIDs: **35819335** (the key "missing context" case), **42605311** (open access full text).

### 12.6 Every session must end with
1. Update this file (status, decisions, next-steps).
2. Commit + push.
3. State the next task as **one numbered item** in §12.2 format.