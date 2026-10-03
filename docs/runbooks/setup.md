# Setup, staging deploy and local development

## A. Run it on your computer (about 10 minutes)

You need Node 22, pnpm (`npm i -g pnpm`) and Docker Desktop.

```bash
git clone https://github.com/Aamir-marqait/wiwaha-os.git
cd wiwaha-os
git checkout claude/phase-1-foundation     # until it's merged to main
pnpm install

# Local Supabase (Postgres, Auth, Storage) in Docker. This applies every migration and the demo seed.
cd packages/db && npx supabase start && cd ../..
# It prints an API URL, an anon key and a service_role key.

cp .env.example apps/web/.env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
# from the output above, set CRON_SECRET to any string, and optionally ANTHROPIC_API_KEY.

pnpm dev                                   # http://localhost:3000
```

Sign in at `/login` as **prashanth@wiwaha.example** with the password **WiwahaDemo!2026** (see the demo script for every login).

To continue building with Claude Code on your computer, open the folder in Claude Code. `CLAUDE.md` loads automatically and carries all the project rules.

Useful commands:

```bash
pnpm typecheck && pnpm test            # unit + agent scenario tests
pnpm db:test                           # migrations + seed + RLS tests on a throwaway Postgres
cd packages/db && npx supabase db reset   # wipe local data and replay migrations + seed
node apps/web/e2e/done-when.mjs        # Phase 1 "done when" checks in a real browser (needs `npx playwright install chromium` once)
```

## B. Staging on Supabase + Vercel

### 1. Supabase project
1. Create a project at supabase.com (region **Mumbai, ap-south-1**). Save the database password.
2. **Database → Extensions:** enable `pg_cron` (it releases expired holds every 15 minutes).
3. Push the schema and seed from your computer:
   ```bash
   cd packages/db
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   ```
   The seed creates the demo users and the fictional couple. **Skip `--include-seed` for production** and run only `seed/00_policies_and_agents.sql` and `seed/10_reference.sql` (SQL editor), after replacing the placeholder spaces, prices and vendors.
4. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up" (staff are invited, couples are added by their event manager). Keep Email enabled.
5. **Authentication → URL configuration:** set the Site URL to your Vercel URL and add `https://<your-vercel-url>/auth/callback` to the redirect URLs.
6. **Authentication → Emails → Invite user:** set the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password`.
   Do the same for Magic link with `type=magiclink&next=/`.
7. **Project settings → API:** copy the URL, the `anon` key and the `service_role` key.

### 2. Vercel project
1. Import the GitHub repo. Set **Root directory** to `apps/web`. The framework is detected as Next.js, and Vercel uses pnpm from the lockfile.
2. Add the environment variables from `.env.example`: the three Supabase values, `NEXT_PUBLIC_APP_URL` (the Vercel URL), `CRON_SECRET` (a long random string) and `ANTHROPIC_API_KEY`.
3. Deploy. `apps/web/vercel.json` registers two crons: the morning brief at 03:00 UTC (8:30 am IST) and hourly agent routing. Vercel sends `CRON_SECRET` automatically.
4. Optional: to let the Wiwaha website post enquiries directly to `/api/leads`, set `LEAD_FORM_ALLOWED_ORIGINS=https://www.wiwaha…`. Otherwise link to `/enquire`.

### 3. Before real client data
- Delete the demo users (`*@wiwaha.example`) and the demo couple, or start production from a fresh project without the demo seed.
- Invite Prashanth as owner: run once in the SQL editor
  `insert into staff_invites (email, full_name, role, title) values ('<email>', 'Prashanth', 'owner', 'Founder');`
  then invite him from **Authentication → Users → Invite**.
- Confirm the open questions in `docs/open-questions.md` in the policy book.
- Get Prashanth's written OK before connecting live WhatsApp, phone or payment accounts (Phase 2/3).
