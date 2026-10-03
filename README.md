# Wiwaha OS

The operating system for **Wiwaha by Praman**: a team dashboard, a client portal and a crew of AI agents that run the wedding estate's sales, events and operations.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Build rules: [`CLAUDE.md`](CLAUDE.md) and [`docs/build-handoff.md`](docs/build-handoff.md)
- Decisions: [`docs/decisions.md`](docs/decisions.md)
- Setup and deploy: [`docs/runbooks/setup.md`](docs/runbooks/setup.md)

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in Supabase + Anthropic keys
pnpm dev
```
