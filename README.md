# Architect Prep

A self-paced study platform for the **Claude Certified Architect – Foundations** and **– Professional** exams. It's built for people who put things off: every session starts with a five-minute commitment, and streaks, XP, badges and a readiness score keep you coming back.

> Unofficial study aid. Not affiliated with or endorsed by Anthropic.

## Quick start (local)

```bash
pnpm i
pnpm dev        # http://localhost:3000
```

That's it. Without `DATABASE_URL`, the app uses [PGlite](https://pglite.dev), an embedded Postgres stored in `./data/pglite`, and applies migrations automatically on startup. The first account you create becomes the admin.

Requirements: Node 20+ and pnpm. There are no native modules.

## Deploy (Netlify + Netlify DB)

The app deploys to Netlify with zero custom code: `netlify.toml` sets the build (`pnpm build`, Node 22) and pins `@netlify/plugin-nextjs`. Nothing depends on Vercel-only APIs.

1. **Create the site.** Import the repo in Netlify. The settings come from `netlify.toml`.
2. **Provision the database.** Add Netlify DB (Neon) to the site. It sets `NETLIFY_DATABASE_URL` (pooled, used by the app) and `NETLIFY_DATABASE_URL_UNPOOLED` (direct, used for migrations). Using your own Neon project instead? Set `DATABASE_URL`, plus `DATABASE_URL_UNPOOLED` if you have a direct URL.
3. **Set environment variables** in Site configuration → Environment variables:
   - `AUTH_SECRET`: `openssl rand -base64 48` (required; the app refuses to start without it in production)
   - `ADMIN_EMAILS`: optional, comma-separated
4. **Run migrations** from your machine, once after provisioning and again whenever `drizzle/` changes:

   ```bash
   NETLIFY_DATABASE_URL_UNPOOLED='postgresql://…' pnpm db:migrate
   # or, with the Netlify CLI linked to the site:
   netlify env:get NETLIFY_DATABASE_URL_UNPOOLED   # copy the value, then run the line above
   ```

   `db:migrate` prefers an unpooled URL (DDL shouldn't go through a connection pooler), prints which variable and host it used, and skips migrations that are already applied, so re-running it is safe. Migrations deliberately do **not** run during the Netlify build: deploy previews would otherwise migrate the production database.
5. **Deploy.** Sign up; the first account becomes admin.

Order matters on the first deploy: run step 4 before the first sign-up, otherwise requests fail with "relation does not exist" until the tables exist.

On a hosting platform the app never falls back to the embedded database and never writes to the filesystem. Without a database URL it fails with a clear error instead.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server (PGlite unless `DATABASE_URL` / `NETLIFY_DATABASE_URL` is set) |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript (generates Next route types first) |
| `pnpm test` | Vitest: unit tests plus database tests on an in-memory PGlite (rate limiting, rewards transaction, first-admin rule, mocks) |
| `pnpm db:generate` | Generate a SQL migration in `./drizzle` after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations (unpooled URL preferred), or to local PGlite if no URL is set |
| `pnpm seed` | Create or promote an admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` |

PGlite is single-process: stop `pnpm dev` before running `pnpm db:migrate` or `pnpm seed` against the local database. CLI scripts read `.env.local` and `.env`.

## Environment

See `.env.example`. The important ones: `DATABASE_URL` (or Netlify DB's `NETLIFY_DATABASE_URL`), `AUTH_SECRET`, `ADMIN_EMAILS`. `CONTENT_DIR=content/_sample pnpm dev` runs against the fixture content.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests: `pnpm install --frozen-lockfile`, lint, typecheck, test, build. It needs no database (tests use in-memory PGlite; the build doesn't connect) and sets a dummy `AUTH_SECRET`.

## Content

All study content is JSON in `content/`, following `CONTENT_SCHEMA.md`. `src/lib/content.ts` reads it on the server and re-reads a file whenever it changes. Missing files produce empty states rather than errors.

- Question banks can be split into batch files: `questions/{certId}/{domainId}.json` and any `{domainId}.part-N.json` are merged, de-duplicated by question id.
- If `content/certs.json` doesn't exist, the app falls back to the fixtures in `content/_sample/`.
- Lessons can reference interactive diagrams by `visualId`; see `src/components/visuals/README.md`.

## How it fits together

```
src/
  app/
    (auth)/            login, signup
    (setup)/onboarding exam, date, daily goal, background → personal plan
    (app)/             signed-in shell: today, learn, practice, mock, flashcards,
                       insights, focus, achievements, settings, admin
    actions/           server actions (all auth-checked; admin actions re-check role)
  db/schema.ts         Drizzle schema, the single source of truth
  components/          shell, celebrations, focus timer, quiz, ui primitives, visuals
  lib/
    db.ts              Neon (DATABASE_URL / NETLIFY_DATABASE_URL) or PGlite connection, transactions, query helpers
    env.ts             database URL selection and hosted-platform detection
    repo/*             every database query lives here
    content.ts         content loader
    scoring.ts         scaled score, mastery, readiness, weighted allocation
    mock-core.ts       mock sampling (scenario-grouped or domain-weighted) and scoring
    sm2.ts / adaptive.ts / plan.ts / gamification.ts
    auth-core.ts       hashing, JWT, validation, rate limiting (framework-free)
drizzle/               generated SQL migrations (commit these)
```

The Neon connection uses `@neondatabase/serverless`'s WebSocket `Pool`, because XP, streaks and badges are awarded in a single interactive transaction. Per-user writes are serialised with a Postgres advisory lock so two tabs can't double-award.

### Scoring model

- **Scaled score**: linear map of fraction correct onto 100–1000, so the 720 pass line sits at about 69% raw. Anthropic doesn't publish its equating, so treat this as an estimate.
- **Mastery** per domain: recency-weighted accuracy (14-day half-life) with a prior of 25% worth four answers.
- **Readiness**: exam-weighted mastery on the same scale, labelled "early guess" until there are at least 10 answers.
- **Multi-select** questions need an exact match; no partial credit.
- **Mock exams**: when a cert lists scenarios, a mock picks four at random and draws questions in scenario blocks, like the real exam. Questions' free-text `scenario` field is matched to the cert's scenarios by title and keywords. Otherwise questions are sampled in proportion to domain weights.

### Motivation mechanics

- **Commit to five minutes**: the dial on Today starts a five-minute timer and opens the next item in your plan.
- **Streaks** count days with any study. You start with one streak freeze and earn another every seven-day run (max two).
- **XP**, named levels, 21 badges, a daily-goal ring, a leaderboard you can leave, and messages built from your own numbers.

## Security notes

- Passwords hashed with bcrypt (cost 12). Sessions are HS256 JWTs in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production).
- Password resets bump a per-user token version, which signs that user out everywhere.
- Login is rate limited per account+IP (8 per 15 minutes) and per IP (40 per 15 minutes); sign-up per IP (5 per hour). Counters live in the `rate_limits` table with hashed keys, so limits hold across serverless instances and restarts. The client IP comes from Netlify's `x-nf-client-connection-ip` header when present.
- Admin pages and admin actions check the role on the server. The first-admin rule is decided inside the sign-up transaction.
- Answers are never sent to the browser before you submit. Mock exams are scored on the server from the saved state.
