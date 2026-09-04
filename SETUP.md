# Setup — start to finish

Every command in order. Follow it top to bottom and stop wherever you have enough.

There are three stages, each usable on its own:

| Stage | You get | Time |
|---|---|---|
| **A. Local chat** | Type a request, get store links | ~5 min |
| **B. Telegram bot** | Order from your phone, laptop off | ~20 min |
| **C. Live prices + carts** | Real prices, filled carts | ~15 min |

---

# Stage A — chat locally

## A1. Install

```bash
pnpm install
```

If `pnpm` is missing:

```bash
npm install -g pnpm
```

## A2. Get a free Gemini key

Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**. No credit card.

> **Keep it free:** the key belongs to a Google Cloud project. Make sure that project has **no billing account** attached at [console.cloud.google.com/billing](https://console.cloud.google.com/billing). Without one, Google returns an error instead of a bill. This matters more than anything in the code.

## A3. Configure

```bash
cp .env.example .env.local
```

Edit `.env.local` and set two lines:

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...your-key...
```

Leave everything else blank for now.

## A4. Run it

```bash
pnpm order
```

```
> 2L amul milk and a dozen eggs to home
> paneer butter masala for dinner
> a usb c charger
```

Groceries route to Zepto/Blinkit/Instamart/BigBasket, restaurant food to Swiggy/Zomato, everything else to Amazon.

In-chat commands:

```
/usage        API calls and tokens used today
/addresses    saved address labels
/reset        clear the conversation
/help  /exit
```

## A5. Tell it your address labels

Addresses are not stored here — the real ones live in your Zepto and Swiggy profiles. This only remembers what each is *called*:

```
> /map home zepto=Home
> /map home swiggy-food="Home 1"
> /map office zepto=Work
> /setdefault home
```

Only needed where the label differs from the display name.

**Stage A done.** You can stop here and just use `pnpm order`.

---

# Stage B — order from Telegram

## B1. Create the bot

Open Telegram, message [@BotFather](https://t.me/BotFather):

```
/newbot
```

Pick a name and a username. It replies with a token like `8123456789:AAH...`.

## B2. Get your user id

Message [@userinfobot](https://t.me/userinfobot) — send anything. It replies with your numeric `Id`.

## B3. Create a free Redis

Vercel dashboard → **Storage** → **Upstash Redis** → create. Or [console.upstash.com](https://console.upstash.com).

Copy the **REST URL** and **REST token** (not the Redis protocol URL).

## B4. Generate secrets

```bash
openssl rand -hex 32   # for TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 32   # for CRON_SECRET
```

## B5. Fill in `.env.local`

```
TELEGRAM_BOT_TOKEN=8123456789:AAH...
TELEGRAM_WEBHOOK_SECRET=<first openssl output>
TELEGRAM_OWNER_ID=123456789
CRON_SECRET=<second openssl output>

UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...

KEY_PREFIX=sid
```

`KEY_PREFIX` namespaces your data. If your wife runs her own copy, hers must differ.

## B6. Test the bot before deploying

Two terminals.

```bash
pnpm dev:web                                        # terminal 1
```

```bash
npx cloudflared tunnel --url http://localhost:3000  # terminal 2
```

Copy the `https://….trycloudflare.com` URL it prints, then:

```bash
pnpm telegram:set-webhook https://xxxx.trycloudflare.com
pnpm telegram:webhook-info      # check for last_error_message
```

Message your bot. Requests hit your laptop, so you see the logs.

## B7. Deploy

```bash
pnpm setup:env        # pushes .env.local to Vercel
vercel --prod
```

Point the webhook at the real URL:

```bash
pnpm telegram:set-webhook https://your-app.vercel.app
```

Message the bot. **The laptop can now be shut.**

Bot commands:

```
/addresses   /providers   /usage   /help
```

**Stage B done.** This is the setup most people stop at.

---

# Stage C — live prices and real carts

Optional. Adds a Playwright worker you host yourself, which logs in as you and reads real prices.

> The worker itself is **not built yet**. Steps C1–C3 below work today and set up the logins; there is no reason to run them until the worker exists.

## C1. Install a browser

```bash
pnpm playwright install chromium
```

## C2. Add an encryption key

```bash
openssl rand -hex 32
```

```
SESSION_ENCRYPTION_KEY=<paste it>
```

Two rules:

- **Identical** on your laptop and the worker machine, or the worker cannot read what you captured.
- **Different** from your wife's, so neither of you can read the other's sessions.

Then push it up:

```bash
pnpm setup:env
```

## C3. Log in to each service

```bash
pnpm auth zepto
```

A real Chrome window opens on zeptonow.com. Log in as you normally would — phone number, OTP, Google, whatever it asks. Take as long as you need. Then return to the terminal and press Enter.

```
Press Enter here once you are logged in… 

✓ Zepto session saved (14 cookies)
Encrypted before storage. Re-run only when it expires.
```

Repeat for the ones you use:

```bash
pnpm auth blinkit
pnpm auth instamart
pnpm auth bigbasket
pnpm auth swiggy-food
pnpm auth zomato
pnpm auth amazon
```

Each is independent — three is a perfectly good setup.

Check them any time:

```bash
pnpm auth:status        # ✓ captured 3 days ago  /  ✗ expired
pnpm auth:verify zepto  # confirm it still decrypts
pnpm auth:clear zepto
```

Sessions refresh on every use, so an active one lasts a long time. Expect Amazon and BigBasket to hold for months; Zepto and Blinkit may need redoing occasionally. Once deployed, a daily cron messages you on Telegram when one expires.

Full detail: [docs/AUTH.md](docs/AUTH.md).

---

# Two people, two copies

Deploy the same repo twice. No code changes, no shared state, and it stays free.

Each person needs their own:

- Telegram bot and `TELEGRAM_OWNER_ID`
- Gemini key — from **their own Google account**, since free quota is per project
- Vercel project (`india-ordering-sid`, `india-ordering-wife`)
- `KEY_PREFIX`
- `SESSION_ENCRYPTION_KEY` — this is what makes the isolation real
- Provider logins, captured on their own machine

Everything else can be duplicated or shared. With different encryption keys, one shared Redis is still safe.

---

# Everyday commands

```bash
pnpm order                  # CLI chat
pnpm check                  # typecheck + tests, before committing
pnpm dev:web                # web UI at localhost:3000
pnpm auth:status            # which provider logins are captured
pnpm mcp:inspect            # MCP Inspector against the Zepto server
pnpm telegram:webhook-info  # bot webhook health
pnpm setup:env              # re-push .env.local to Vercel
```

Changed the code? `git push` and Vercel redeploys itself. Changed a credential? Update `.env.local`, run `pnpm setup:env`.

---

# When something breaks

| Symptom | Fix |
|---|---|
| `Missing required environment variable: GEMINI_API_KEY` | key is in `.env` not `.env.local`, or blank |
| `Gemini 404 … no longer available` | model retired — set `LLM_MODEL` to a current flash model |
| `Gemini rate limit hit` | free-tier limit; wait a minute or lower `REQUESTS_PER_MINUTE` |
| `⚠️ Model … is not on the known free tier` | `LLM_MODEL` points at a paid model — the guardrail working |
| `🛑 Daily request limit reached` | your own cap in `.env.local`; resets midnight UTC |
| Bot silent | webhook secret mismatch, or `TELEGRAM_OWNER_ID` isn't your numeric id |
| Bot silent, webhook looks fine | run `pnpm telegram:webhook-info` and read `last_error_message` |
| `degraded: "no-worker"` | normal on Stages A and B — deep-links only |
| `Could not decrypt the … session` | `SESSION_ENCRYPTION_KEY` changed; re-run `pnpm auth <provider>` |

---

# What it will never do

It does not pay for anything, ever. It finds the items, applies your address, and hands you a link or a filled cart. The final tap is always yours, inside the provider's own app.

If it ever claims an order was placed, that is a bug — please report it.
