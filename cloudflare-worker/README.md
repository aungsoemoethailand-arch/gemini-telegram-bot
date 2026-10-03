# gemini-telegram-webhook

This is a separate Cloudflare Worker for testing. It does not modify the existing `bookfilderwow-bot` Worker or the GitHub Actions bot.

## Deploy

```bash
cd cloudflare-worker
npm exec wrangler login
npm exec wrangler d1 migrations apply gemini-telegram-catalog --remote
npm exec wrangler secret put TELEGRAM_BOT_TOKEN
npm exec wrangler secret put TELEGRAM_SECRET_TOKEN
npm exec wrangler deploy
```

Set the webhook only after the Worker has been tested:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://gemini-telegram-webhook.<your-subdomain>.workers.dev" \
  -d "secret_token=$TELEGRAM_SECRET_TOKEN"
```

The Worker supports `/search`, `/authors`, `/books`, `/stats`, CSV/text channel ingestion, and D1 persistence. AI, member tracking, notes, and `/add` are intentionally not included.
