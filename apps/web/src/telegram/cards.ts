import type { AddressLabel } from '@io/core';
import type { OrderOption } from '@io/agent';
import type { InlineButton } from './api.js';

/** callback_data is capped at 64 bytes, so it carries ids only — never payloads. */
export function encodeCallback(action: 'addr' | 'cancel', value: string): string {
  return `${action}:${value}`.slice(0, 64);
}

export function decodeCallback(data: string): { action: string; value: string } {
  const [action = '', ...rest] = data.split(':');
  return { action, value: rest.join(':') };
}

export function renderOrderCard(
  reply: string,
  options: OrderOption[],
  address: AddressLabel,
): { text: string; buttons: InlineButton[][] } {
  const lines = [`📍 ${address.displayName}`, '', reply];

  const priced = options.filter((o) => o.result?.items.length);
  if (priced.length) {
    lines.push('');
    for (const option of priced) {
      const top = option.result!.items[0]!;
      const price = top.price !== undefined ? `₹${top.price}` : '—';
      const eta = option.result?.etaMinutes ? ` · ${option.result.etaMinutes} min` : '';
      lines.push(`${option.displayName} — ${price}${eta}`);
    }
  } else if (options.length) {
    lines.push('', 'Live prices unavailable — tap a store to search there.');
  }

  const buttons: InlineButton[][] = [];
  for (let i = 0; i < options.length; i += 2) {
    buttons.push(
      options.slice(i, i + 2).map((option) => ({
        text: option.displayName,
        url: option.deeplink,
      })),
    );
  }
  if (options.length) {
    buttons.push([{ text: '📍 Change address', callback_data: encodeCallback('addr', 'list') }]);
  }

  return { text: lines.join('\n'), buttons };
}

export function renderAddressPicker(addresses: AddressLabel[]): {
  text: string;
  buttons: InlineButton[][];
} {
  return {
    text: 'Which address?',
    buttons: addresses.map((a) => [
      {
        text: `${a.isDefault ? '✓ ' : ''}${a.displayName}`,
        callback_data: encodeCallback('addr', a.id),
      },
    ]),
  };
}

export const HELP_TEXT = [
  'Just tell me what you need, e.g.',
  '  "2L amul milk and a dozen eggs to home"',
  '',
  '/addresses — saved address labels',
  '/providers — what each store can do',
  '/usage — API usage against your daily limits',
  '/help — this message',
  '',
  'I never pay for anything. I find the items and hand you a link — you make the final tap in the app.',
].join('\n');
