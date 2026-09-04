# Testing locally

Everything below runs on your laptop. Nothing needs to be deployed, and no provider account is touched.

## 0. One-time

```bash
pnpm install
cp .env.example .env.local
```

Fill in **one** value to get started — `GEMINI_API_KEY` from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Free, no credit card. Everything else in the file is optional until you deploy.

## 1. Fast checks (no network, no API calls)

```bash
pnpm check          # typecheck + tests, the one to run before committing
pnpm test           # 27 unit tests
pnpm test:watch     # re-run on save
pnpm typecheck      # all packages
```

These make zero API calls, so they cost nothing and work offline.

## 2. The CLI — the main way to test

```bash
pnpm order
```

Then type naturally:

```
> 2L amul milk and a dozen eggs to home
> paneer butter masala for dinner
> a phone charger
```

Grocery goes to Zepto/Blinkit/Instamart/BigBasket, restaurant food to Swiggy/Zomato, everything else to Amazon. Check it routes correctly.

Commands inside the CLI:

| Command | What |
|---|---|
| `/usage` | API calls and tokens used today vs your limits |
| `/addresses` | saved address labels |
| `/setdefault <id>` | change the default label |
| `/map home zepto=Home` | map a label to a provider account |
| `/reset` | clear the conversation |
| `/help`, `/exit` | |

Scripted run, useful for repeat testing:

```bash
printf '2L amul milk to home\n/usage\n/exit\n' | pnpm order
```

## 3. The web UI

```bash
pnpm dev:web        # http://localhost:3000
```

Same agent, same tools, clickable buttons. Use this to check the UI before deploying it.

```bash
pnpm build:web      # verify it compiles the way Vercel will
```

## 4. The MCP servers

```bash
pnpm mcp:inspect
```

Opens the MCP Inspector against the Zepto server. Call `zepto_deeplink` with `query: "amul milk"` and confirm you get a real URL back. Swap `zepto` for any other provider in the command.

Raw protocol check without the Inspector UI:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx tsx packages/mcp/src/bin/zepto.ts
```

## 5. Provider logins (Tier 1)

```bash
pnpm auth:status            # what is captured
pnpm auth zepto             # log in via a real browser, once
pnpm auth:verify zepto      # confirm it still decrypts
```

Needs `pnpm playwright install chromium` and `SESSION_ENCRYPTION_KEY`. Full guide: [AUTH.md](AUTH.md).

## 6. Telegram, before deploying

Needs `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OWNER_ID` and the two `UPSTASH_REDIS_REST_*` values in `.env.local`. Redis is required here — the webhook is stateless between requests.

Two terminals:

```bash
pnpm dev:web                                        # terminal 1
npx cloudflared tunnel --url http://localhost:3000  # terminal 2
```

Copy the `https://….trycloudflare.com` URL it prints, then:

```bash
pnpm telegram:set-webhook https://xxxx.trycloudflare.com
pnpm telegram:webhook-info      # confirm it stuck, check for last_error_message
```

Now message your bot. Requests hit your laptop, so you see logs and can set breakpoints.

When you're done, point the webhook back at production (or run `set` again after deploying).

## 7. What to actually check

- **Routing** — groceries go to grocery apps, food to food apps. Not everything to everything.
- **Address** — the reply names the active label, and `/setdefault office` changes it.
- **Honesty** — with no worker running it should say prices are unavailable, never invent a price or claim an order was placed.
- **Links** — open one on your phone and confirm it lands on the right search.
- **Budget** — `/usage` climbs; set `DAILY_REQUEST_LIMIT=2` in `.env.local` and confirm the third request is refused with 🛑.

## Common problems

| Symptom | Cause |
|---|---|
| `Missing required environment variable: GEMINI_API_KEY` | key is in `.env` not `.env.local`, or blank |
| `Gemini 404 … no longer available` | model retired; set `LLM_MODEL` to a current flash model |
| `Gemini rate limit hit` | free-tier RPM; wait a minute, or lower `REQUESTS_PER_MINUTE` |
| `⚠️ Model … is not on the known free tier` | `LLM_MODEL` points at a paid model — this warning is the guardrail working |
| Telegram bot silent | webhook secret mismatch, or `TELEGRAM_OWNER_ID` isn't your numeric id |
| `degraded: "no-worker"` | expected on Tier 0 — deep-links only |

## Cost while testing

Roughly 3–6 API calls and 5–10k tokens per request, inside the Gemini free tier. `pnpm test` and `pnpm typecheck` make no calls at all.

The real protection is that your Google Cloud project has **no billing account attached** — verify at [console.cloud.google.com/billing](https://console.cloud.google.com/billing). Without one, Google returns `429` instead of charging you.
