# india-ordering

Order groceries and food in India by typing what you want — from a terminal, a web page, or Telegram.

```
> 2L amul milk and a dozen eggs to home

  📍 Home

  Zepto              https://www.zeptonow.com/search?query=amul+milk+2L
  Blinkit            https://blinkit.com/s/?q=amul+milk+2L
  Swiggy Instamart   https://www.swiggy.com/instamart/search?query=amul+milk+2L
  BigBasket          https://www.bigbasket.com/ps/?q=amul+milk+2L
```

**It never pays for anything.** It finds the items and hands you a link — you make the final tap in the app. See [docs/PROVIDERS.md](docs/PROVIDERS.md) for why that boundary exists.

Runs entirely on free tiers. Two people can each run their own copy at no cost.

## Quick start

```bash
pnpm install
cp .env.example .env.local     # add a free Gemini key
pnpm order                     # chat from your terminal
```

A [Gemini API key](https://aistudio.google.com/apikey) (free, no card) is all you need to start. Telegram and Redis are only needed once you deploy.

**Full walkthrough — local chat, then Telegram, then live prices: [SETUP.md](SETUP.md).**

## Deploy the Telegram bot

```bash
pnpm setup:env                                   # push .env.local to Vercel
vercel --prod
pnpm telegram:set-webhook https://your-app.vercel.app
```

Then text your bot. The laptop can be shut.

## Two tiers

**Tier 0** (default) — deep-links only. No logins, no browser, nothing to keep running. The agent understands the request, picks the right stores and gives you pre-filled search links.

**Tier 1** (optional, still free) — adds live prices, stock checks and real cart-filling via a Playwright worker you host yourself on a laptop or Pi behind a free Cloudflare Tunnel. Provider logins are captured once with a headed browser, encrypted, and reused forever — see [docs/AUTH.md](docs/AUTH.md).

Tier 0 always works, so a stale session or a sleeping worker degrades to links rather than failing.

## Layout

| Path | What |
|---|---|
| `packages/core` | types, encrypted session store, address labels, log redaction |
| `packages/providers` | the 7 provider adapters — every URL lives in `src/links.ts` |
| `packages/mcp` | one MCP server per provider, plus an address server |
| `packages/agent` | LLM client (Gemini/OpenAI/Groq) and the tool loop |
| `apps/cli` | terminal chat |
| `apps/web` | Next.js chat page, Telegram webhook, session-health cron |

## Use as MCP servers

Each provider is also a standalone MCP server, usable from any MCP client — see `mcp.config.json`.

```bash
npx @modelcontextprotocol/inspector npx tsx packages/mcp/src/bin/zepto.ts
```

## Addresses

No addresses are stored here. The real ones already live in your Zepto and Swiggy profiles — this only remembers what each is *called* in each app.

```
/map home zepto=Home
/map home swiggy-food="Home 1"
```

## Commands

```bash
pnpm order                  # CLI chat
pnpm check                  # typecheck + tests
pnpm dev:web                # web UI at localhost:3000
pnpm auth:status            # which provider logins are captured
pnpm mcp:inspect            # MCP Inspector against the Zepto server
pnpm telegram:webhook-info  # check the bot's webhook
```

Full local testing guide, including how to test the Telegram bot before deploying: [docs/TESTING.md](docs/TESTING.md).
Logging in to the ordering services: [docs/AUTH.md](docs/AUTH.md).

## Docs

| File | What |
|---|---|
| [SETUP.md](SETUP.md) | start to finish, every command in order |
| [docs/AUTH.md](docs/AUTH.md) | logging in to Zepto, Blinkit and the rest |
| [docs/TESTING.md](docs/TESTING.md) | testing locally, including the Telegram bot |
| [docs/CREDENTIALS.md](docs/CREDENTIALS.md) | every credential and where to get it |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | what each provider can and cannot do |
