# Claude connector (MCP)

Use Wiwaha OS from Claude (claude.ai, the desktop app or the phone app). Claude acts as the person who connects it, with exactly their permissions; every change is in the audit log with `surface = mcp`. Decision: D38.

## Connect (Claude Pro or Max)
1. In Claude: **Settings → Connectors → Add custom connector**.
2. Name: `Wiwaha OS`. URL: `https://wiwaha-os.vercel.app/api/mcp`. Leave the advanced (OAuth client ID/secret) fields empty.
3. **Connect** → sign in to Wiwaha OS with your team login → **Allow**.
4. In a chat, switch the connector on from the tools menu and ask, e.g. "What needs my attention at Wiwaha today?"

Team and Enterprise plans: an admin adds the connector once in the organisation's settings.

## Who can connect
`MCP_ALLOWED_ROLES` (default `owner`). Add roles comma-separated in Vercel, e.g. `owner,event_manager`. People see and change only what their role allows (RLS).

## Disconnect
Wiwaha OS → Settings → Claude connector → Disconnect (stops every token for that person at once). Or remove the connector in Claude.

## What Claude can do
Read: today's overview, approvals, leads, availability, weddings (everything about one), costing, payments, entertainment and extras, vendors and work orders, décor stock, tasks, messages waiting to be sent, the policy book.
Change: decide approvals (approve, edit, reject), add leads and update their status, hold dates, book a wedding, set a costing line's price, change payment parts, record a payment, open a planning stage, send options to a couple and make choices final, approve work orders, add décor and assign it to an event, create and complete tasks, change a policy rule (owner).

## How it works
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`: discovery.
- `/oauth/register` (dynamic client registration), `/oauth/authorize` (sign in + Allow), `/oauth/token` (PKCE S256; access tokens 1 hour, refresh tokens 30 days and rotating). Tokens are random and stored only as SHA-256 hashes (`mcp_tokens`).
- `/api/mcp`: Streamable HTTP, stateless. Each call opens a short Supabase session for the person (an admin magic link that is never emailed), so RLS and the audit triggers apply as in the app. After a change, agent work is routed and approved messages are sent, as in the app.
- Test it locally with the MCP Inspector (`npx @modelcontextprotocol/inspector`), transport "Streamable HTTP", URL `http://localhost:3000/api/mcp`.
