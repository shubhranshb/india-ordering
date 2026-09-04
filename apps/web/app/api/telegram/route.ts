import { NextResponse } from 'next/server';
import {
  AddressBook,
  createStore,
  limitsFromEnv,
  loadConfig,
  safeEqual,
  safeError,
  safeLog,
  WorkerClient,
} from '@io/core';
import { createProviders } from '@io/providers';
import { Agent, TELEGRAM_STYLE, type Message } from '@io/agent';
import {
  answerCallback,
  editMessage,
  sendMessage,
  type TelegramUpdate,
} from '../../../src/telegram/api.js';
import {
  decodeCallback,
  HELP_TEXT,
  renderAddressPicker,
  renderOrderCard,
} from '../../../src/telegram/cards.js';

export const maxDuration = 60;

const HISTORY_TTL = 60 * 30;
const DEDUPE_TTL = 60 * 10;

export async function POST(request: Request): Promise<NextResponse> {
  const config = loadConfig();

  // Anyone who can reach this URL could otherwise spend money and read addresses.
  const secret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!config.telegram.webhookSecret || !safeEqual(secret, config.telegram.webhookSecret)) {
    safeLog('telegram: rejected bad webhook secret');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const fromId = update.message?.from?.id ?? update.callback_query?.from.id;
  if (fromId !== config.telegram.ownerId) {
    safeLog('telegram: rejected non-owner', { fromId });
    return NextResponse.json({ ok: true });
  }

  const store = createStore(config.redis, config.keyPrefix);

  // Telegram retries updates; without this a retry could fill a cart twice.
  if (!(await store.setIfAbsent(`update:${update.update_id}`, DEDUPE_TTL))) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) await handleCallback(update, config, store);
    else if (update.message?.text) await handleMessage(update, config, store);
  } catch (error) {
    safeError('telegram handler failed', error);
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) {
      await sendMessage(config.telegram.botToken, chatId, 'Something went wrong. Try again.');
    }
  }

  return NextResponse.json({ ok: true });
}

type Config = ReturnType<typeof loadConfig>;
type Store = ReturnType<typeof createStore>;

async function handleMessage(
  update: TelegramUpdate,
  config: Config,
  store: Store,
): Promise<void> {
  const text = update.message!.text!.trim();
  const chatId = update.message!.chat.id;
  const token = config.telegram.botToken;
  const addresses = new AddressBook(store);

  if (text === '/start' || text === '/help') {
    await sendMessage(token, chatId, HELP_TEXT);
    return;
  }

  if (text === '/addresses') {
    const card = renderAddressPicker(await addresses.list());
    await sendMessage(token, chatId, card.text, card.buttons);
    return;
  }

  if (text === '/providers') {
    const providers = createProviders(new WorkerClient(config.worker));
    const lines = Object.values(providers).map(
      (p) => `${p.displayName} — ${p.capabilities.join(', ')}`,
    );
    await sendMessage(token, chatId, lines.join('\n'));
    return;
  }

  if (text === '/usage') {
    const limits = limitsFromEnv();
    const usage = await new Agent(config).usage();
    const tokens = usage.inputTokens + usage.outputTokens;
    await sendMessage(
      token,
      chatId,
      [
        `Requests  ${usage.requests}/${limits.dailyRequests}`,
        `Tokens    ${tokens.toLocaleString()}/${limits.dailyTokens.toLocaleString()}`,
        '',
        'Resets at midnight UTC.',
      ].join('\n'),
    );
    return;
  }

  const thinkingId = await sendMessage(token, chatId, '🔎 Searching…');

  const history = (await store.get<Message[]>(`history:${chatId}`)) ?? [];
  const agent = new Agent(config);
  const result = await agent.turn(text, history, TELEGRAM_STYLE);
  await store.set(`history:${chatId}`, result.history.slice(-12), HISTORY_TTL);

  const address = await addresses.getDefault();
  const card = renderOrderCard(result.reply, result.options, address);
  await editMessage(token, chatId, thinkingId, card.text, card.buttons);
}

async function handleCallback(
  update: TelegramUpdate,
  config: Config,
  store: Store,
): Promise<void> {
  const query = update.callback_query!;
  const token = config.telegram.botToken;
  const chatId = query.message?.chat.id;
  const { action, value } = decodeCallback(query.data ?? '');
  const addresses = new AddressBook(store);

  await answerCallback(token, query.id);
  if (!chatId) return;

  if (action === 'addr' && value === 'list') {
    const card = renderAddressPicker(await addresses.list());
    await sendMessage(token, chatId, card.text, card.buttons);
    return;
  }

  if (action === 'addr') {
    await addresses.setDefault(value);
    const address = await addresses.get(value);
    await sendMessage(token, chatId, `📍 Now delivering to ${address?.displayName ?? value}.`);
  }
}
