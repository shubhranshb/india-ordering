/**
 * Points the Telegram bot at your deployment.
 * Usage: pnpm telegram:set-webhook https://your-app.vercel.app
 *        pnpm telegram:webhook-info
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN missing from .env.local');
  process.exit(1);
}

const command = process.argv[2] ?? 'info';

async function api(method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

if (command === 'set') {
  const base = process.argv[3];
  if (!base) {
    console.error('Usage: pnpm telegram:set-webhook https://your-app.vercel.app');
    process.exit(1);
  }
  if (!secret) {
    console.error('TELEGRAM_WEBHOOK_SECRET missing — the webhook would be open to anyone.');
    process.exit(1);
  }
  console.log(
    await api('setWebhook', {
      url: `${base.replace(/\/$/, '')}/api/telegram`,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  );
} else {
  console.log(await api('getWebhookInfo'));
}
