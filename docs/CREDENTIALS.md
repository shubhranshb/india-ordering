# Credentials

Every value goes in `.env.local`, then `pnpm setup:env` pushes them to Vercel. Nothing here is ever committed.

Generate all secrets marked *self-generated* with:

```bash
openssl rand -hex 32
```

## Required

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key. Free tier, no credit card. |
| `LLM_PROVIDER` | `gemini` (default), or `openai` / `groq` |
| `TELEGRAM_BOT_TOKEN` | Telegram → [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token |
| `TELEGRAM_WEBHOOK_SECRET` | self-generated. Without it your webhook is open to the internet. |
| `TELEGRAM_OWNER_ID` | Telegram → [@userinfobot](https://t.me/userinfobot) → send anything → copy the numeric `Id` |
| `UPSTASH_REDIS_REST_URL` | Vercel dashboard → Storage → Upstash Redis (free tier), or [console.upstash.com](https://console.upstash.com) |
| `UPSTASH_REDIS_REST_TOKEN` | same place as the URL |
| `KEY_PREFIX` | you choose, e.g. `sid`. Must differ per person if you share a Redis DB. |
| `CRON_SECRET` | self-generated. Guards the daily session-health route. |

## Tier 1 only (the Playwright worker)

Skip these to run Tier 0 — deep-links only, which needs no provider logins at all.

| Variable | Where to get it |
|---|---|
| `WORKER_URL` | your Cloudflare Tunnel hostname, e.g. `https://worker.example.com` |
| `WORKER_TOKEN` | self-generated. Must match on Vercel and on the worker machine. |
| `SESSION_ENCRYPTION_KEY` | self-generated. **Must be identical** on Vercel and the worker, and **different per person**. |

Provider logins (Zepto, Blinkit, Swiggy, BigBasket) are **not** environment variables. You capture them once with `pnpm auth <provider>`, which opens a real browser for you to log in by hand. The session is then encrypted with `SESSION_ENCRYPTION_KEY` and stored in Redis. See [AUTH.md](AUTH.md).

## Optional

| Variable | Notes |
|---|---|
| `LLM_MODEL` | override the default model for your provider |
| `DRY_RUN` | `true` previews cart writes instead of touching your real account |

## Making sure the API key never costs money

**The guardrail that actually matters is external.** An AI Studio key belongs to a Google Cloud project. If that project has **no billing account attached**, Google cannot charge you — exceeding the free tier returns a `429` error instead of a bill. Check at [console.cloud.google.com/billing](https://console.cloud.google.com/billing) that your project shows no billing account, and leave it that way. Nothing in this repo can override that, and nothing else you do is as effective.

On top of that, the agent enforces its own limits and refuses to make the call when one is hit:

| Variable | Default | What it caps |
|---|---|---|
| `DAILY_REQUEST_LIMIT` | 200 | API calls per day |
| `DAILY_TOKEN_LIMIT` | 500,000 | input + output tokens per day |
| `MAX_OUTPUT_TOKENS` | 800 | length of any single reply |
| `REQUESTS_PER_MINUTE` | 10 | burst rate, keeps you under free-tier RPM |

Check where you stand any time with `/usage` in the CLI or in Telegram. Counters reset at midnight UTC.

Three more protections are built in:

- **Model allowlist.** A model outside the known free tier (`gemini-2.5-pro`, any OpenAI model) logs a warning at startup, so a typo in `LLM_MODEL` cannot quietly cost money.
- **History trimming.** Only the last 12 messages are re-sent, so a long conversation cannot inflate input tokens without bound.
- **Tool-round cap.** A single request can make at most 6 API calls, so the agent cannot loop.

A realistic order costs 3–6 requests and roughly 5–10k tokens, so the defaults allow around 30 orders a day.

## Notes on the LLM choice

**Gemini** is the default because AI Studio issues a key with no credit card and a real free tier.

**OpenAI** is a separate product from ChatGPT — a ChatGPT Free or Plus subscription grants no API access and includes no credits. It needs its own prepaid billing at [platform.openai.com](https://platform.openai.com) with a **$5 minimum**. Set `LLM_PROVIDER=openai` and `OPENAI_API_KEY` if you want it.

**Groq** ([console.groq.com](https://console.groq.com)) also has a free tier with tool-calling. Set `LLM_PROVIDER=groq` and `GROQ_API_KEY`.

## Two people, two deployments

Deploy this repo twice. Each person needs their own `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `GEMINI_API_KEY` (free-tier quota is per project), `KEY_PREFIX` and `SESSION_ENCRYPTION_KEY`. Everything else can be duplicated or shared. Different encryption keys mean neither person can read the other's sessions even from the same Redis DB.
