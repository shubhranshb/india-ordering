import type { Store } from './store.js';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface BudgetLimits {
  dailyRequests: number;
  dailyTokens: number;
  maxOutputTokens: number;
  /** Free tiers are rate-limited per minute; staying under avoids 429s. */
  requestsPerMinute: number;
}

export const DEFAULT_LIMITS: BudgetLimits = {
  dailyRequests: 200,
  dailyTokens: 500_000,
  maxOutputTokens: 800,
  requestsPerMinute: 10,
};

/**
 * Models known to have a free tier. Calling anything else risks a bill, so the
 * guard refuses rather than trusting a typo in LLM_MODEL.
 */
export const FREE_TIER_MODELS: Record<string, RegExp> = {
  // flash and flash-lite have a free tier at every version; pro does not
  gemini: /^gemini-\d+(\.\d+)?-flash(-lite|-8b)?(-\d{3})?$/,
  groq: /^(llama|gemma|mixtral|qwen|deepseek)/i,
  openai: /$^/, // OpenAI has no free tier — always flagged
};

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    readonly kind: 'daily-requests' | 'daily-tokens' | 'rate-limit',
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

interface DailyUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class BudgetGuard {
  constructor(
    private store: Store,
    private limits: BudgetLimits = DEFAULT_LIMITS,
  ) {}

  get maxOutputTokens(): number {
    return this.limits.maxOutputTokens;
  }

  async usage(): Promise<DailyUsage> {
    return (
      (await this.store.get<DailyUsage>(`usage:${today()}`)) ?? {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
      }
    );
  }

  /** Throws before any paid call is made. Fails closed. */
  async check(): Promise<void> {
    const usage = await this.usage();

    if (usage.requests >= this.limits.dailyRequests) {
      throw new BudgetExceededError(
        `Daily request limit reached (${this.limits.dailyRequests}). Resets at midnight UTC.`,
        'daily-requests',
      );
    }

    const totalTokens = usage.inputTokens + usage.outputTokens;
    if (totalTokens >= this.limits.dailyTokens) {
      throw new BudgetExceededError(
        `Daily token limit reached (${this.limits.dailyTokens.toLocaleString()}). Resets at midnight UTC.`,
        'daily-tokens',
      );
    }

    const minute = Math.floor(Date.now() / 60_000);
    const key = `rate:${minute}`;
    const thisMinute = (await this.store.get<number>(key)) ?? 0;
    if (thisMinute >= this.limits.requestsPerMinute) {
      throw new BudgetExceededError(
        `Slow down — ${this.limits.requestsPerMinute} requests per minute is the cap.`,
        'rate-limit',
      );
    }
    await this.store.set(key, thisMinute + 1, 120);
  }

  async record(usage: TokenUsage): Promise<void> {
    const current = await this.usage();
    await this.store.set(
      `usage:${today()}`,
      {
        requests: current.requests + 1,
        inputTokens: current.inputTokens + usage.inputTokens,
        outputTokens: current.outputTokens + usage.outputTokens,
      },
      60 * 60 * 48,
    );
  }
}

/** Returns a warning when the configured model has no free tier. */
export function checkModelIsFree(provider: string, model: string): string | null {
  const pattern = FREE_TIER_MODELS[provider];
  if (!pattern) return null;
  if (pattern.test(model)) return null;
  return `Model "${model}" is not on the known free tier for ${provider} — this may cost money.`;
}

export function limitsFromEnv(): BudgetLimits {
  const num = (name: string, fallback: number): number => {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    dailyRequests: num('DAILY_REQUEST_LIMIT', DEFAULT_LIMITS.dailyRequests),
    dailyTokens: num('DAILY_TOKEN_LIMIT', DEFAULT_LIMITS.dailyTokens),
    maxOutputTokens: num('MAX_OUTPUT_TOKENS', DEFAULT_LIMITS.maxOutputTokens),
    requestsPerMinute: num('REQUESTS_PER_MINUTE', DEFAULT_LIMITS.requestsPerMinute),
  };
}
