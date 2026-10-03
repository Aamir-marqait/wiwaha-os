# Working on Wiwaha OS as a collaborator

You only need **GitHub write access** to the repo. Staging credentials stay in GitHub and Vercel; you never need them.

## The loop

1. Open the repo in Claude Code (web or local). `CLAUDE.md` loads automatically and carries every project rule.
2. Work on a branch. Run the checks before you push:
   ```bash
   pnpm install
   pnpm typecheck && pnpm test
   pnpm db:test        # applies every migration + seed to a throwaway Postgres and runs the RLS tests
   ```
3. Open a PR into `claude/phase-1-foundation`. CI runs the same checks, and Vercel posts a preview link.
4. Aamir reviews and merges. On merge:
   - **Vercel** redeploys the app.
   - **Deploy migrations** (GitHub Action) applies any new SQL files in `packages/db/supabase/migrations` to the staging database, in order. Each file runs in one transaction, so a failing migration changes nothing.

## Database changes

- Add a **new** file `packages/db/supabase/migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql`. Never edit an applied one.
- Every new table needs RLS in the same migration (see `CLAUDE.md`).
- If you change policy defaults or the agent roster, run `pnpm --filter @wiwaha/db gen:seed`. Seed files are **not** re-applied to staging automatically. Put data changes that staging needs in a migration.

## Running the app locally

You don't need the staging database. Run Supabase locally (Docker required):

```bash
cd packages/db && npx supabase start && cd ../..   # prints a local URL, anon key and service_role key
cp .env.example apps/web/.env.local                 # fill in those local values
pnpm dev
```

Without `ANTHROPIC_API_KEY` the agents use their template replies, which is fine for most work. Use your own Claude key if you need live drafts.
