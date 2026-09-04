import { NextResponse } from 'next/server';
import { loadConfig, safeError } from '@io/core';
import { Agent, type Message } from '@io/agent';

export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { message, history } = (await request.json()) as {
      message: string;
      history?: Message[];
    };
    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const agent = new Agent(loadConfig());
    const result = await agent.turn(message, history ?? []);
    return NextResponse.json(result);
  } catch (error) {
    safeError('chat route failed', error);
    return NextResponse.json({ error: 'request failed' }, { status: 500 });
  }
}
