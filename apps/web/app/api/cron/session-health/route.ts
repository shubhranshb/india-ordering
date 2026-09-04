import { NextResponse } from 'next/server';
import { loadConfig, safeEqual, safeError, WorkerClient } from '@io/core';
import { sendMessage } from '../../../../src/telegram/api.js';

/** Daily nudge when a provider login has expired — see vercel.json. */
export async function GET(request: Request): Promise<NextResponse> {
  const config = loadConfig();

  const auth = request.headers.get('authorization') ?? '';
  if (!config.cronSecret || !safeEqual(auth, `Bearer ${config.cronSecret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const worker = new WorkerClient(config.worker);
  if (!worker.available) return NextResponse.json({ ok: true, tier: 0 });

  try {
    const health = await worker.sessionHealth();
    const stale = Object.entries(health)
      .filter(([, state]) => !state.healthy)
      .map(([provider]) => provider);

    if (stale.length && config.telegram.botToken) {
      await sendMessage(
        config.telegram.botToken,
        config.telegram.ownerId,
        `⚠️ Login expired for: ${stale.join(', ')}\nRun on your laptop:\n${stale
          .map((p) => `pnpm auth ${p}`)
          .join('\n')}`,
      );
    }
    return NextResponse.json({ ok: true, stale });
  } catch (error) {
    safeError('session health check failed', error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
