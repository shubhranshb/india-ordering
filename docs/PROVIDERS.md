# Providers — what is actually possible in India

The short version: **no Indian consumer ordering app has a public ordering API.** Swiggy, Zomato, Zepto, Blinkit and BigBasket all publish partner APIs that are merchant-side only. Amazon's Product Advertising API is read-only. There is no such thing as an official "Swiggy MCP".

So this project stops before payment by design. It finds the item and hands you a link or a filled cart; the final tap is always yours, in the provider's own app.

## Capability by provider

| Provider | Deep-link | Live search | Fill cart | Notes |
|---|---|---|---|---|
| Zepto | ✅ | Tier 1 | Tier 1 | Quick grocery. App-first, so web sessions may expire sooner. |
| Blinkit | ✅ | Tier 1 | Tier 1 | Quick grocery. |
| Swiggy Instamart | ✅ | Tier 1 | Tier 1 | Shares a login with Swiggy Food. |
| BigBasket | ✅ | Tier 1 | Tier 1 | Slotted delivery, longer-lived web session. |
| Swiggy Food | ✅ | Tier 1 | Tier 1 | Restaurants. |
| Zomato | ✅ | Tier 1 | Tier 1 | Restaurants. |
| Amazon India | ✅ | ❌ | ❌ | No legal catalog scrape. See below. |

**Tier 0** (default) is deep-links only — no logins, no browser, nothing to keep running. **Tier 1** adds the self-hosted Playwright worker.

## Amazon

Amazon is deliberately deep-link only. The legal path for catalog data is the **Product Advertising API 5.0**, which:

- returns search results, prices and `DetailPageURL`
- **cannot place an order** — no consumer ordering endpoint exists
- requires an approved Amazon Associates India account, and keys only activate after **3 qualifying affiliate sales**

If you get PA-API keys later, wire them into a `search` implementation for the `amazon` adapter. Amazon Business has a real ordering API, but it needs a business account.

## ONDC — the one legitimate end-to-end path

[ONDC](https://ondc.org) (Open Network for Digital Commerce, built on the Beckn protocol) is the only rail in India where software can legally complete a purchase end to end: `search` → `select` → `init` → `confirm`, across grocery (RET10), food (RET11) and general retail.

It is not in this project because becoming a Network Participant requires registration on the ONDC portal, Ed25519/X25519 signing keys, a hosted callback endpoint, and a DNS TXT record for production. It also would not give you Swiggy or Zepto inventory — those are off-network.

Worth revisiting if you ever want genuine hands-off ordering.

## Legality and etiquette

Tier 1 automates a browser session that **you** are logged into, against **your own** account — the same thing a password manager or accessibility tool does. It is nonetheless in tension with most sites' terms of service.

Keep it reasonable:

- One user, personal use, human-scale request volume.
- Never resell or redistribute scraped catalog data.
- No payment automation, ever.
- Expect breakage. Site DOMs change; that is why every provider keeps a deep-link fallback and why Tier 0 must always work on its own.

## Fixing a broken link

Every outbound URL is in one file: `packages/providers/src/links.ts`. If a provider changes its URL shape, fix it there and run `pnpm test`.
