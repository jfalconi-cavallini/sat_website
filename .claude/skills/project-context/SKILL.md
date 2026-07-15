---
name: project-context
description: AIPrep.study project state, architecture decisions, and open items from the production-readiness audit and Phases 0-3. Load this at the start of a session working on this repo to pick up context instead of re-deriving it.
---

# AIPrep.study — project context

Free SAT prep site (question bank, daily challenge, AI tutor) built to make
parents/students trust MetaMinds STEM Academy before they pay for tutoring.
Next.js 15 / React 19 / TypeScript, deployed on Vercel, GitHub-hosted
(`jfalconi-cavallini/sat_website`). Two collaborators: the user (josefalconi)
and Emma Brugman, who built the original AI tutor prototype.

A full production-readiness audit was done first (findings ranked by
severity), then implemented phase by phase, each phase committed and pushed
separately. **Read this before re-auditing the codebase or re-deciding
something already settled below** — check git log for anything past
`c40489a` first, since work may have continued since this was written.

## What's done (Phases 0-3, commits `b676fe2`..`c40489a`)

- **Phase 0**: Fixed the root cause of "math renders wrong" (choice objects
  use `text_html`, the renderer never checked it), fixed a grading bug where
  the Daily Challenge graded stricter than practice mode, removed fabricated
  homepage stats, deleted a dead unused component.
- **Merged Emma's chat widget work** (`ChatWidget.tsx`, `ChatQuestionCard.tsx`,
  `backend/` Flask+OpenAI service). Fixed her build-breaking `any` types and
  hardcoded-to-her-machine config (CSV path, port).
- **Phase 1**: Root-caused the actual math rendering bug — the dataset uses
  `<mfenced>` MathML, which Chrome's native MathML renderer dropped support
  for. Wrote `normalizeMathML()` in `src/lib/question-render.tsx` (pure
  string transform, SSR-safe, tested against all 1,736 real occurrences in
  the dataset before shipping). Consolidated 3 duplicated rendering
  implementations into that one shared module.
- **Phase 2**: Added error/loading/not-found boundaries (there were none).
  Cached the question dataset in memory (~6x faster repeat requests). Added
  `/api/daily` so the Daily Challenge fetches 10 questions server-side
  instead of the entire question bank (25.9MB → 60KB, same quiz). Added
  Vitest + GitHub Actions CI (there were zero tests before this).
- **Phase 3**: Built the AI tutor as `/api/tutor`, a Next.js route —
  deliberately **not** finishing Emma's separate Flask backend. See
  "Architecture decisions" below for why. Streams responses, rate-limited,
  RAG-grounded by looking up the active question server-side by ID.

## Architecture decisions already made (don't re-litigate without new info)

- **Math rendering: native MathML, not KaTeX, for stored question content.**
  A bulk automated MathML→LaTeX conversion across ~2,800 questions risks
  silently mis-teaching a sign or exponent. KaTeX (`remark-math` +
  `rehype-katex`) is intentionally kept, but only for the AI tutor's own
  freely-generated prose, which naturally comes out as LaTeX — a different
  content source, correctly on a different renderer. Don't try to unify
  these onto one technology; the split is deliberate.
- **AI tutor: Next.js API route, not a separate Flask service.** Deploy
  target is Vercel (confirmed). A second Python service means a second
  hosting account/pipeline that doesn't exist. The Next.js route also
  sidesteps a real data-format mismatch in `backend/chatbot.py`
  (`parse_choices()` expects `[{'letter','text'}]`; the repo's CSVs store
  `"A. ... | B. ..."`) by reading from the same cached, correctly-shaped
  JSON data the rest of the app already uses. **`backend/` still exists,
  untouched, just not called by the running app** — Emma said she doesn't
  care either way, so it wasn't deleted, but nothing currently depends on
  it. The `ChatQuestionCard` inline-practice-question feature from her
  version is not wired up (would need OpenAI tool-calling to do properly)
  — dropped rather than half-shipped, component file left in place.
- **Persistence: Upstash Redis**, not Postgres. Leaderboard reads ("top 20
  by score") and rate limiting are both textbook sorted-set/counter use
  cases — Postgres would be over-engineering it. `src/lib/redis.ts` is the
  shared client (`Redis.fromEnv()`).
- **Fail loud, not silent, on missing config.** Established pattern: if a
  required env var is missing, the specific request/route returns a clear
  error at call time (e.g. `/api/tutor` returns 500 "isn't configured yet"),
  but the build and other routes keep working. Don't add silent fallbacks
  to in-memory/dummy data when config is missing — that's how the original
  in-memory leaderboard and hardcoded Flask paths caused real problems.

## Conventions to follow

- Shared question-rendering logic lives in `src/lib/question-render.tsx`
  (`pickHtmlLike`, `formatWordedMath`, `normalizeMathML`, `htmlBlock`,
  `renderChoiceContent`, `isCorrectAnswer`, `norm`). If you're rendering
  question stem/choices/rationale or grading an answer anywhere, use these
  — don't reinvent them per-component. This exact duplication is what
  caused two real bugs already (C4 math rendering, C6 grading
  inconsistency).
- Choice objects' real content field is `text_html` (MathML), not `html` or
  `text`. `pickHtmlLike` already checks it first; don't write new code that
  checks `choice.text`/`choice.html` without also checking `text_html`.
- Data loaders (`src/lib/english.ts`, `src/lib/math.ts`) cache the parsed
  JSON at module scope for the process lifetime — don't add per-request
  `fs.readFile` calls elsewhere; extend these loaders instead.
- Tests live next to the code (`*.test.ts`), run via `npm test` (Vitest).
  Route handler tests mock `@/lib/redis`, `@upstash/ratelimit`, and
  `next/headers` rather than hitting real infra — see
  `src/app/api/leaderboard/route.test.ts` and
  `src/app/api/tutor/route.test.ts` as the pattern to copy.
- CI (`.github/workflows/ci.yml`) runs lint + typecheck + test + build on
  every push/PR to `main`. `npm run lint` exits 0 on warnings, only fails
  on errors — a handful of pre-existing warnings are expected and fine.

## Required environment variables (none of these are provisioned by me — external accounts)

- `OPENAI_API_KEY` — required for `/api/tutor`. **Not yet set up as of
  commit `c40489a`** — confirm with the user before assuming the tutor
  actually works end-to-end.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — required for the
  leaderboard and both rate limiters. Vercel dashboard → Storage →
  Marketplace Database Integrations → Upstash → Redis provisions these.
  **Also not yet confirmed set up.**
- `TUTOR_MODEL` — optional, defaults to `gpt-4o-mini`.
- See `.env.example` for the full list with setup notes.

## Known open items (explicitly deferred, not forgotten)

- Rate limit on `/api/tutor` (20 req/hour/IP) is a starting guess, not
  tuned against real usage.
- `ChatQuestionCard`'s inline practice-question suggestion isn't wired up
  (needs OpenAI tool-calling to sample a question and return it
  structured alongside the streamed text).
- `/api/qbank` still returns the entire unslimmed dataset — nothing in the
  app calls it anymore (the Daily Challenge moved to `/api/daily`), but it
  wasn't deleted since it might be a useful public endpoint. Worth a
  decision on whether to slim, document, or remove it.
- Visiting `/questions/math` or `/questions/english` with no domain/skill
  filter (e.g. the "Explore Math" quick-action link) still loads and ships
  the entire subject's dataset to the client as props — not fixed, flagged
  as a separate, bigger UX/pagination question, not a quick fix.
- Roadmap Phase 4 (SAT-specific: full practice tests, scaled scoring,
  value-equivalent grid-in grading, weak-area dashboard) and Phase 5
  (growth/polish: SEO/OG metadata, shareable results, unified visual
  system, light theme) haven't been started.
- `npm audit` reports 9 vulnerabilities (5 moderate, 4 high) in
  transitive deps — not investigated or triaged yet.

## Before starting new work

1. `git log --oneline -15` — check nothing's changed since `c40489a` that
   isn't reflected here (Emma may have pushed something).
2. Ask whether `OPENAI_API_KEY` and the Upstash credentials have been set
   up yet, if the task involves the tutor or leaderboard.
3. Run `npm test && npm run typecheck && npm run build` before assuming a
   clean baseline.
