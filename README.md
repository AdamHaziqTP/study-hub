# Study Hub

**A research assistant that helps evidence-curious lifters find, understand, critically interpret, and apply exercise-science research — with a secondary system for writing and organizing your own evidence-backed conclusions.**

It is **not** a prettier PubMed, an AI fact-checker, or a social network. It is a **research interpretation layer** between academic literature and a normal lifter.

🔗 **Live app:** https://study-hub-rho-drab.vercel.app/

---

## What it does

- **Study Explorer (core):** search PubMed (NCBI Best Match ranking, results never filtered) → study page that answers *what was asked / who was studied / how it was conducted / what was found / limitations / evidence context / what this might mean for training*.
- **Evidence Notebook:** save studies, take personal notes, and write articles whose claims link back to specific studies with a relationship (`supports` / `contradicts` / `mixed` / `contextual`).
- **Evidence graph:** a force-directed visualisation (d3-force) of your articles, claims, and the studies they cite.
- **AI as interpreter, never the source:** the raw PubMed abstract always displays first, unmodified. Three separate AI jobs run downstream — **Extract** (structured facts), **Explain** (plain English), **Translate cautiously** (labelled interpretation with "what this does NOT mean" cautions). No numerical "credibility score" — instead, an evidence-context profile surfaces design, sample size, population, training status, duration, and measurement with plain-language *why it matters*.

## Tech stack

| Piece | Choice |
|---|---|
| Frontend + Backend | Next.js 16 (App Router) + TypeScript |
| Database | PostgreSQL via Supabase (RLS) |
| Auth | Supabase GitHub OAuth |
| Research data | NCBI PubMed E-utilities (esearch → efetch) |
| AI | DeepSeek API (`deepseek-chat`) |
| Graph physics | d3-force |
| Hosting | Vercel |

---

## Getting started (local development)

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables** — copy `.env.example` to `.env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   DEEPSEEK_API_KEY=...
   # optional: DEEPSEEK_MODEL=deepseek-chat
   ```

   The Supabase URL/anon key come from Supabase → Project Settings → API. The DeepSeek key comes from platform.deepseek.com.

3. **Apply the database schema** — open `sql/schema.sql` in the Supabase SQL Editor and run it once. It creates all tables, RLS policies, and indexes. (`sql/schema.sql` is the single source of truth.)

4. **Enable GitHub OAuth**

   - **GitHub:** create an OAuth App → authorization callback URL must point to Supabase's **internal** callback `https://<project-ref>.supabase.co/auth/v1/callback` (copy it from Supabase → Authentication → Providers → GitHub).
   - **Supabase** → Authentication → URL Configuration → Redirect URLs → add `http://localhost:3000/auth/callback` (and `https://<your-app>.vercel.app/auth/callback` for production).
   - See `.env.example` for the full walkthrough.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

---

## Try it (test cases)

These two PMIDs are the project's canonical test cases:

- **35819335** — *"Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position"* (Maeo et al.) — the key "missing context" case (abstract-only).
- **42605311** — a study with open-access full text on PMC (full-text extraction path).

Flow to verify: search → open a study → **Save to Library** → **Generate** the Study breakdown, "In plain English", and Evidence context / "What this might mean for training" → sign in → add a personal note → create an article with a claim and link it to the study → run the alignment check → view the evidence graph at `/graph`.

---

## Architecture notes

```
STUDIES              = "what the paper/source says"   (immutable, from PubMed)
  ▼
STUDY_CONTEXT        = "what our AI extracted"        (regenerable)
  ▼
STUDY_ASSESSMENTS    = "how that context affects interpretation" (qualitative)
```

- **Immutable source, regenerable AI:** the PubMed record is never overwritten. AI output lives in separate regenerable tables so a prompt/model change can regenerate interpretations without touching the source.
- **RLS trust models:** `studies` = public read + insert only. AI-derived tables (`study_context`, `study_simplifications`, `study_assessments`) = public read + insert + update (regenerable). User-owned tables (`study_notes`, `articles`, `claims`, `evidence_links`) = private to `auth.uid()`.
- **DeepSeek:** one cheap model (`deepseek-chat` default) powers all four AI jobs via the shared `getModel()` in `src/lib/ai.ts`; strict JSON validation on every call.

## Project notes

For the full rationale — product rules, schema reasoning, security decisions, cost model, and the session-by-session roadmap — read **`PROJECT_NOTES.md`**.

## Deployment

The app is hosted on Vercel (linked to GitHub; pushes to `main` auto-deploy). During initial setup, set the same env vars in Vercel → Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DEEPSEEK_API_KEY`
- (optional) `DEEPSEEK_MODEL`

Also add `https://<your-app>.vercel.app/auth/callback` to the Supabase Redirect URLs, as above.