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
```

| Piece | Choice | Why |
|---|---|---|
| Frontend + Backend | **Next.js 16 (App Router) + TypeScript** | Same language ecosystem as the Arctic Fever React Native work; one repo for frontend + API routes; one deploy. No context-switching. |
| Database | **PostgreSQL via Supabase** | Relational fit for the evidence graph; Supabase gives auth/storage/RLS without setup overhead; free tier. |
| External research data | **NCBI PubMed E-utilities** | The authoritative open API for biomedical literature. Two-step: `esearch` → PMIDs, then `efetch` → full XML. |
| AI | **DeepSeek API** (planned) | Cheap structured extraction; model chosen explicitly in code (see §8). |
| Hosting | **Vercel + Supabase** (planned) | Natural fits for Next.js + Postgres. |

### Why Next.js 16 matters for the code
This is a **new major version** with breaking conventions vs. older Next.js training data. The key one we've hit: **dynamic route `params` is now a `Promise`** and must be `await`-ed (see `src/app/study/[pmid]/page.tsx`). Always check `node_modules/next/dist/docs/` before using a new Next.js feature.

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

Why this separation matters:
- If the AI prompt improves next month, you can **wipe and regenerate** `study_context` without destroying the original PubMed record.
- It keeps "source facts" vs "AI interpretation" vs "what the user concludes" cleanly separated — which is exactly the defensible design the project brief demands.

Tables (all in `sql/schema.sql`, which is the source of truth):

| Table | Purpose |
|---|---|
| `users` | Profile extension of Supabase Auth |
| `studies` | Raw PubMed record (PMID-unique) |
| `study_context` | AI-extracted structured facts (1:1 with study) |
| `study_assessments` | Qualitative evidence profile (1:1 with study) |
| `articles` | User-written wiki-style conclusions |
| `claims` | Individual statements within an article |
| `evidence_links` | The graph: claim ↔ study with a `relationship` enum |

---

## 7. Security decisions (RLS — Row Level Security)

Supabase's RLS is a per-table bouncer. Our decisions:

- **`studies` = shared public library** (like Wikipedia entries): anyone can **READ** and **INSERT**, **nobody can UPDATE or DELETE** via the API.
  - Rationale: the raw PubMed record is source-derived. Arbitrary public users must not be able to modify existing cached studies.
  - **Why INSERT-only save?** Originally the endpoint used PostgreSQL `upsert` (INSERT … ON CONFLICT DO UPDATE), which requires UPDATE permission. A security review flagged that granting public UPDATE contradicts the "immutable source" principle. So `/api/save-study` now does **check-then-insert**: if the PMID exists it returns a no-op `alreadyPresent: true`; otherwise it INSERTs. Therefore only two policies are needed:
    ```sql
    CREATE POLICY "Public read studies"   ON studies FOR SELECT USING (true);
    CREATE POLICY "Public insert studies" ON studies FOR INSERT WITH CHECK (true);
    ```
- **User-owned tables** (`articles`, `claims`, `evidence_links`, …) currently have RLS enabled with **no public policies** — they stay locked until authentication is implemented. `study_context` / `study_assessments` are read-only for now (they derive from a shared study).
- **Keys:** only the Supabase **anon/public** key is exposed via `NEXT_PUBLIC_` (it's meant to be public — RLS is the real security boundary). The DeepSeek key goes into `.env.local` **without** `NEXT_PUBLIC_` so it stays server-side. `.env*` is git-ignored.

---

## 8. Cost model (important — two separate costs)

There are **two completely different costs**, easy to confuse:

| | Cline (the coding agent) | Study Hub (the app's AI features) |
|---|---|---|
| What it is | Helps **write** the code | Runs **inside** the deployed app |
| Cost trigger | Large agentic context (reading files, reasoning, retries) | One small structured API call per study |
| Model choice | Set in the Cline provider config | **Chosen explicitly in our code** — the API key alone does **not** pick the model |

You saw a 43¢ bill from Cline — that was agentic coding cost (lots of context in/out), **not** the app's per-study cost. Study Hub's extraction will be one short call per study.

**Model strategy (upcoming):**
- **Cheap/flash model** → extraction + simplification (structured info from an abstract is a good use case for a cheap model).
- **Stronger model** → reserved for claim↔evidence alignment later ("does this claim accurately represent these five studies?"), which is genuinely harder.
- DeepSeek key: `DEEPSEEK_API_KEY=` in `.env.local` (no `NEXT_PUBLIC_` prefix).

---

## 9. What has been built so far (Milestone 1 — Explorer core)

All of this is **committed and pushed** to GitHub (`main`).

| File | What it does | Why it exists |
|---|---|---|
| `src/lib/pubmed.ts` | Shared PubMed engine: `esearch` → `efetch` → XML parse → structured `PubMedStudy` | One source of truth for parsing; search, detail page, and save all use identical logic so they can't drift |
| `src/app/api/search-pubmed/route.ts` | API route exposing search (now just delegates to the shared lib) | Backend keeps the NCBI call server-side |
| `src/app/api/save-study/route.ts` | POST endpoint: check-then-insert a study into `studies` | Wires the "Save to Library" button; INSERT-only per security review (§7) |
| `src/app/study/[pmid]/page.tsx` | Server page: tries the saved DB copy first, falls back to a live PubMed fetch | Saved studies work even when NCBI is down; Next.js 16 `params`-as-`Promise` convention |
| `src/app/study/[pmid]/StudyDetail.tsx` | The study detail UI | Implements the product rules: raw abstract on top, then breakdown / evidence context / training-application placeholders, Save + PubMed buttons |
| `src/app/page.tsx` | Search home page; cards link to `/study/[pmid]` | The entry point of the Explorer |
| `sql/schema.sql` | Full schema + RLS policies as a checked-in file | Database is reproducible; portfolio artifact showing the data-model reasoning |

### The page layout that encodes the product rules (`StudyDetail.tsx`, top to bottom)

1. Header (title, authors, journal, PMID)
2. **Save to Library** + **View original on PubMed** buttons
3. **What the study actually says** — the raw abstract, unmodified (source first)
4. **Study breakdown** — placeholders for the AI extraction (question / population / conduct / findings / conclusion)
5. **Evidence context** — placeholder for the factor explanations (no credibility score)
6. **What this might mean for training** — placeholder for cautious practical interpretation

---

## 10. Current status

- ✅ Next.js 16.3.1 + TypeScript + Tailwind, running with `npm run dev` (port 3000)
- ✅ Supabase project connected; `.env.local` git-ignored
- ✅ Full schema created in Supabase; recorded in `sql/schema.sql`
- ✅ PubMed search → parse → study card UI
- ✅ Study detail page (saved copy first, live fallback)
- ✅ Save to Library (verified working — RLS SELECT+INSERT policies applied)
- ✅ `tsc --noEmit` passes clean
- ✅ Living doc (this file)

**Editor note:** if VS Code shows "Cannot find module './StudyDetail'", it's a stale TS-server cache — the file exists and `tsc` resolves it. Restart the TS server (or save any file) to clear it.

### Test case being used
PubMed study **PMID 35819335** — *"Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position"* (Maeo et al., European Journal of Sport Science).

Why it's a good test case: it's exactly the kind of study that lacks context in its raw abstract (e.g., MRI may reflect acute swelling rather than true growth; specific subject population; specific training protocol). These are precisely the "Evidence context" / "what it does NOT mean" gaps the app is designed to surface.

---

## 11. Roadmap position & next steps

We are working through a 24-phase roadmap (from the project brief). Position ≈ **end of Phase 8** (study page without AI). Priority hierarchy:

- 🔴 **Must work:** PubMed → Study → Study Context → Evidence Context ✅ (core flow now wired, minus AI)
- 🟠 **Very important:** Notes → Articles → Claims → Evidence Links
- 🟡 **High-value stretch:** AI extraction → AI simplification → Claim alignment
- 🟢 **Stretch:** evidence graph → ranked search → polish
- ⚪ **Completely optional:** social / monetisation / mobile

### Immediate next steps (one small, testable step at a time)

1. **AI extraction skeleton** — add `DEEPSEEK_API_KEY` to `.env.local`; a server-only helper that takes title+abstract → **validated** structured JSON matching `study_context` (sample size, population, duration, design, intervention, outcome, findings, limitations). Validate before touching the DB.
2. **Populate the Study breakdown** from those extracted fields.
3. **Library page** (`/library`) — list saved studies (Evidence Notebook starting point).
4. **Ranked search** — relevance ordering that never hides lower-ranked results.
5. **Notes on studies** (per-study personal notes).
6. **Article/claim system** — consumes studies discovered through the Explorer.

### Workflow rule going forward
> One small feature at a time → the plan/approach is explained first → implemented → tested → committed. No more autonomous large builds.