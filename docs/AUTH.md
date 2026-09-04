# Logging in to the ordering services

**You do not need any of this for Tier 0.** Deep-links work without logging in to anything — that is the whole point of the default setup. Read on only if you want live prices, stock checks and real cart-filling (Tier 1).

## Why it works this way

Zepto, Blinkit, Swiggy, Zomato and BigBasket have no public API and no way to issue you a token. The only way in is a real browser session, and creating one needs your phone to receive an OTP. A server cannot do that.

So you do it once, by hand, on your laptop. The browser session is captured, encrypted, and stored — and the worker reuses it from then on. You never log in again unless the provider expires the session.

```
your laptop (once)                          worker (forever after)
──────────────────                          ──────────────────────
pnpm auth zepto
  └ browser opens, you enter the OTP
      └ storageState ──AES-256-GCM──▶ Redis ──▶ decrypted in memory per job
```

Nothing is stored in plaintext, and nothing goes in an environment variable.

## Before you start

```bash
pnpm playwright install chromium
```

Then add an encryption key to `.env.local`:

```bash
openssl rand -hex 32
```

```
SESSION_ENCRYPTION_KEY=<paste it here>
```

Two rules for that key:

- It must be **identical** on your laptop and on the worker machine, or the worker cannot open what you captured.
- It must be **different** from your wife's, so neither of you can read the other's sessions even from a shared Redis.

If you have `UPSTASH_REDIS_REST_*` set, sessions go to Redis where a deployed worker can reach them. Without it they stay in a local file, which is fine for testing on one machine.

## Logging in

One provider at a time:

```bash
pnpm auth zepto
```

A real Chrome window opens on the provider's site. Log in exactly as you normally would — phone number, OTP, Google, whatever it asks. Take as long as you need. Then come back to the terminal and press Enter.

```
Logging in to Zepto
A browser window will open. Log in as you normally would —
phone number, OTP, Google, whatever the site asks for.

Press Enter here once you are logged in… 

✓ Zepto session saved (14 cookies)
Encrypted before storage. Re-run only when it expires.
```

If it captured zero cookies it refuses to save and tells you, rather than storing a session that isn't logged in.

Repeat for whichever you want:

```bash
pnpm auth blinkit
pnpm auth instamart
pnpm auth bigbasket
pnpm auth swiggy-food
pnpm auth zomato
pnpm auth amazon
```

Only do the ones you actually use. Each is independent — three logins is a perfectly good setup.

## While you are in there

Set your delivery addresses up properly in each app, since this project deliberately does not store addresses. Then tell it what each one is called:

```bash
pnpm order
> /map home zepto=Home
> /map home swiggy-food="Home 1"
```

The label only needs mapping when it differs from the display name.

## Checking and fixing

```bash
pnpm auth:status
```

```
Provider login sessions
stored in Upstash Redis

  ✓ zepto          captured 3 days ago
  ✓ blinkit        captured 3 days ago
  ✗ instamart      expired — run: pnpm auth instamart
  — bigbasket      not captured
```

| Command | What |
|---|---|
| `pnpm auth:status` | which providers are logged in, and how stale |
| `pnpm auth:verify zepto` | confirm a session still decrypts with your current key |
| `pnpm auth:clear zepto` | delete a saved session |
| `pnpm auth zepto` | log in again |

Once deployed, a daily cron checks these and messages you on Telegram when one expires, so you are not the one discovering it mid-order.

## How long a session lasts

Sessions are refreshed on every use — the worker writes the rotated cookies back — so an actively used one can last indefinitely. In practice, expect Amazon and BigBasket to hold for months, and Zepto and Blinkit to need re-doing occasionally, since they are app-first and treat web sessions as shorter-lived.

Re-authenticating is one command and about thirty seconds.

## Security

These sessions are logged into accounts with saved payment methods and your home address. Treat them accordingly.

- Encrypted with AES-256-GCM before anything is written down. `pnpm auth:status` never prints cookie contents, and log output is redacted.
- The encryption key lives only in `.env.local` and your worker's environment — never in the repo, never in Redis.
- `*.storageState.json` and `.sessions/` are gitignored, but the tool never writes them anyway.
- If you think a key leaked, rotate it: generate a new one, update both machines, then `pnpm auth` each provider again. Old sealed sessions become unreadable, which is the point.
- Logging out of the app on your phone usually invalidates the captured session too.

## Current status

`pnpm auth` works today and stores real sessions. The **worker that consumes them is not built yet** — see [docs/TESTING.md](TESTING.md) for what runs now. Until it exists, capturing a session is harmless but does nothing, so there is no reason to run this yet unless you are setting up ahead of time.
