import { config as loadEnv } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { chromium } from 'playwright';
import { createStore, loadConfig, type ProviderId } from '@io/core';
import { createProviders, PROVIDER_IDS } from '@io/providers';
import { WorkerClient } from '@io/core';
import { loadSession, sessionKey, saveSession, type StoredSession } from './session.js';

loadEnv({ path: '.env.local' });
loadEnv();

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function requireEncryptionKey(key: string | null): string {
  if (!key) {
    console.error(red('\nSESSION_ENCRYPTION_KEY is not set.'));
    console.error('Generate one and put it in .env.local:\n');
    console.error(bold('  openssl rand -hex 32\n'));
    console.error(dim('It must match the value on your worker machine.\n'));
    process.exit(1);
  }
  return key;
}

function isProvider(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function age(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days === 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

async function capture(providerId: ProviderId): Promise<void> {
  const config = loadConfig();
  const encryptionKey = requireEncryptionKey(config.sessionEncryptionKey);
  const store = createStore(config.redis, config.keyPrefix);
  const provider = createProviders(new WorkerClient(null))[providerId];

  console.log(`\n${bold(`Logging in to ${provider.displayName}`)}`);
  console.log(dim('A browser window will open. Log in as you normally would —'));
  console.log(dim('phone number, OTP, Google, whatever the site asks for.\n'));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(provider.loginUrl, { waitUntil: 'domcontentloaded' });
  } catch {
    console.log(yellow(`Could not open ${provider.loginUrl} — navigate there yourself.`));
  }

  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question(bold('\nPress Enter here once you are logged in… '));
  rl.close();

  const storageState = await context.storageState();
  const cookies = storageState.cookies.length;

  if (cookies === 0) {
    console.log(red('\nNo cookies were captured — you may not be logged in.'));
    console.log(dim('Nothing was saved. Try again.\n'));
    await browser.close();
    process.exit(1);
  }

  await saveSession(store, providerId, storageState, encryptionKey);
  await browser.close();

  console.log(green(`\n✓ ${provider.displayName} session saved`), dim(`(${cookies} cookies)`));
  console.log(dim('Encrypted before storage. Re-run only when it expires.\n'));
}

async function status(): Promise<void> {
  const config = loadConfig();
  const store = createStore(config.redis, config.keyPrefix);

  console.log(`\n${bold('Provider login sessions')}`);
  console.log(dim(config.redis ? 'stored in Upstash Redis' : 'stored locally (no Redis configured)'));
  console.log();

  for (const id of PROVIDER_IDS) {
    const session = await store.get<StoredSession>(sessionKey(id));
    if (!session) {
      console.log(`  ${dim('—')} ${id.padEnd(14)} ${dim('not captured')}`);
    } else if (!session.healthy) {
      console.log(`  ${red('✗')} ${id.padEnd(14)} ${red('expired')} ${dim(`— run: pnpm auth ${id}`)}`);
    } else {
      console.log(`  ${green('✓')} ${id.padEnd(14)} ${dim(`captured ${age(session.capturedAt)}`)}`);
    }
  }

  if (!config.sessionEncryptionKey) {
    console.log(yellow('\n  SESSION_ENCRYPTION_KEY is not set — sessions cannot be read.'));
  }
  console.log();
}

async function verify(providerId: ProviderId): Promise<void> {
  const config = loadConfig();
  const encryptionKey = requireEncryptionKey(config.sessionEncryptionKey);
  const store = createStore(config.redis, config.keyPrefix);

  try {
    const state = await loadSession(store, providerId, encryptionKey);
    if (!state) {
      console.log(yellow(`\nNo saved session for ${providerId}. Run: pnpm auth ${providerId}\n`));
      process.exit(1);
    }
    const cookies = (state as { cookies: unknown[] }).cookies.length;
    console.log(green(`\n✓ ${providerId} session decrypts correctly`), dim(`(${cookies} cookies)\n`));
  } catch {
    console.log(red(`\n✗ Could not decrypt the ${providerId} session.`));
    console.log(dim('SESSION_ENCRYPTION_KEY has probably changed. Re-run: pnpm auth ' + providerId + '\n'));
    process.exit(1);
  }
}

async function clear(providerId: ProviderId): Promise<void> {
  const config = loadConfig();
  const store = createStore(config.redis, config.keyPrefix);
  await store.del(sessionKey(providerId));
  console.log(green(`\n✓ Cleared the ${providerId} session\n`));
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);

  if (!command || command === 'status') return status();

  if (command === 'clear') {
    if (!argument || !isProvider(argument)) {
      console.error(red(`\nUsage: pnpm auth:clear <provider>\n`));
      console.error(dim(`  ${PROVIDER_IDS.join(', ')}\n`));
      process.exit(1);
    }
    return clear(argument);
  }

  if (command === 'verify') {
    if (!argument || !isProvider(argument)) {
      console.error(red(`\nUsage: pnpm auth:verify <provider>\n`));
      process.exit(1);
    }
    return verify(argument);
  }

  if (!isProvider(command)) {
    console.error(red(`\nUnknown provider "${command}".\n`));
    console.error(dim(`  ${PROVIDER_IDS.join(', ')}\n`));
    process.exit(1);
  }

  return capture(command);
}

main().catch((error: unknown) => {
  console.error(red(`\n${error instanceof Error ? error.message : String(error)}\n`));
  process.exit(1);
});
