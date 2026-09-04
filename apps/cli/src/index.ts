import { config as loadEnv } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Agent, type Message, type OrderOption } from '@io/agent';
import { limitsFromEnv, loadConfig } from '@io/core';

// .env.local matches what `vercel env pull` writes, so both stay in sync.
loadEnv({ path: '.env.local' });
loadEnv();

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function renderOptions(options: OrderOption[]): void {
  if (options.length === 0) return;
  console.log();
  for (const option of options) {
    const items = option.result?.items ?? [];
    const top = items[0];
    const price = top?.price !== undefined ? `  ₹${top.price}` : '';
    const eta = option.result?.etaMinutes ? `  ${option.result.etaMinutes} min` : '';
    console.log(`  ${bold(option.displayName.padEnd(18))}${price}${eta}`);
    if (top) console.log(`  ${dim(top.name)}`);
    console.log(`  ${cyan(option.deeplink)}`);
    console.log();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const agent = new Agent(config);

  console.log(bold('\nindia-ordering'), dim(`· ${config.llm.provider}/${config.llm.model}`));
  if (!config.worker) {
    console.log(dim('Tier 0 — deep-links only, no live prices. /help for commands.\n'));
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let history: Message[] = [];

  for (;;) {
    let input: string;
    try {
      input = (await rl.question(bold('> '))).trim();
    } catch {
      break; // stdin closed, e.g. piped input ran out
    }
    if (!input) continue;

    if (input === '/exit' || input === '/quit') break;

    if (input === '/help') {
      console.log(
        dim(
          [
            '  /addresses            list saved address labels',
            '  /setdefault <id>      choose the default label',
            '  /map <id> <provider>=<label>   map a label to a provider account',
            '  /usage                today\'s API usage against your limits',
            '  /reset                clear the conversation',
            '  /exit',
          ].join('\n'),
        ),
      );
      continue;
    }

    if (input === '/usage') {
      const usage = await agent.usage();
      const limits = limitsFromEnv();
      const tokens = usage.inputTokens + usage.outputTokens;
      console.log(
        dim(
          `  requests  ${usage.requests}/${limits.dailyRequests}\n` +
            `  tokens    ${tokens.toLocaleString()}/${limits.dailyTokens.toLocaleString()}\n` +
            '  resets at midnight UTC',
        ),
      );
      continue;
    }

    if (input === '/reset') {
      history = [];
      console.log(dim('  conversation cleared'));
      continue;
    }

    if (input === '/addresses') {
      for (const a of await agent.addresses.list()) {
        const mapped = Object.entries(a.providerLabels)
          .map(([p, l]) => `${p}="${l}"`)
          .join(' ');
        console.log(
          `  ${a.isDefault ? '*' : ' '} ${bold(a.id.padEnd(10))} ${a.displayName.padEnd(14)} ${dim(mapped)}`,
        );
      }
      continue;
    }

    if (input.startsWith('/setdefault ')) {
      const id = input.slice(12).trim();
      try {
        await agent.addresses.setDefault(id);
        console.log(dim(`  default is now ${id}`));
      } catch (error) {
        console.log(yellow(`  ${error instanceof Error ? error.message : 'failed'}`));
      }
      continue;
    }

    if (input.startsWith('/map ')) {
      const [, id, pair] = input.split(/\s+/);
      const [provider, ...rest] = (pair ?? '').split('=');
      const label = rest.join('=');
      if (!id || !provider || !label) {
        console.log(yellow('  usage: /map home zepto=Home'));
        continue;
      }
      const existing = (await agent.addresses.get(id)) ?? {
        id,
        displayName: id,
        isDefault: false,
        providerLabels: {},
      };
      existing.providerLabels = { ...existing.providerLabels, [provider]: label };
      await agent.addresses.upsert(existing);
      console.log(dim(`  ${id} → ${provider} = "${label}"`));
      continue;
    }

    try {
      process.stdout.write(dim('  thinking…\r'));
      const result = await agent.turn(input, history);
      history = result.history;
      process.stdout.write('             \r');
      console.log(`\n${result.reply}`);
      renderOptions(result.options);
    } catch (error) {
      console.log(yellow(`\n  ${error instanceof Error ? error.message : 'request failed'}\n`));
    }
  }

  rl.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
