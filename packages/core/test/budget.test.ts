import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BudgetExceededError, BudgetGuard, checkModelIsFree, type BudgetLimits } from '../src/budget.js';
import { FileStore } from '../src/store.js';

function guard(limits: Partial<BudgetLimits> = {}) {
  const store = new FileStore(
    `budget-${Math.random()}`,
    join(tmpdir(), `io-budget-${Date.now()}-${Math.random()}.json`),
  );
  return new BudgetGuard(store, {
    dailyRequests: 3,
    dailyTokens: 1000,
    maxOutputTokens: 800,
    requestsPerMinute: 100,
    ...limits,
  });
}

describe('BudgetGuard', () => {
  it('allows calls under the limit', async () => {
    const budget = guard();
    await expect(budget.check()).resolves.toBeUndefined();
  });

  it('blocks once the daily request limit is hit', async () => {
    const budget = guard();
    for (let i = 0; i < 3; i++) await budget.record({ inputTokens: 1, outputTokens: 1 });
    await expect(budget.check()).rejects.toThrow(BudgetExceededError);
    await expect(budget.check()).rejects.toThrow(/Daily request limit/);
  });

  it('blocks once the daily token limit is hit', async () => {
    const budget = guard({ dailyRequests: 1000 });
    await budget.record({ inputTokens: 600, outputTokens: 500 });
    await expect(budget.check()).rejects.toThrow(/Daily token limit/);
  });

  it('blocks a burst that exceeds the per-minute cap', async () => {
    const budget = guard({ requestsPerMinute: 2 });
    await budget.check();
    await budget.check();
    await expect(budget.check()).rejects.toThrow(/per minute/);
  });

  it('accumulates usage across calls', async () => {
    const budget = guard();
    await budget.record({ inputTokens: 10, outputTokens: 5 });
    await budget.record({ inputTokens: 20, outputTokens: 5 });
    expect(await budget.usage()).toMatchObject({
      requests: 2,
      inputTokens: 30,
      outputTokens: 10,
    });
  });
});

describe('checkModelIsFree', () => {
  it('accepts Gemini flash models', () => {
    expect(checkModelIsFree('gemini', 'gemini-3.6-flash')).toBeNull();
    expect(checkModelIsFree('gemini', 'gemini-2.5-flash-lite')).toBeNull();
    expect(checkModelIsFree('gemini', 'gemini-1.5-flash-8b')).toBeNull();
  });

  it('warns about Gemini pro, which is not free', () => {
    expect(checkModelIsFree('gemini', 'gemini-2.5-pro')).toMatch(/may cost money/);
    expect(checkModelIsFree('gemini', 'gemini-3.6-pro')).toMatch(/may cost money/);
  });

  it('always warns for OpenAI, which has no free tier', () => {
    expect(checkModelIsFree('openai', 'gpt-4o-mini')).toMatch(/may cost money/);
  });
});
