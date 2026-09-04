export interface Config {
  keyPrefix: string;
  llm: {
    provider: 'gemini' | 'openai' | 'groq';
    apiKey: string;
    model: string;
  };
  telegram: {
    botToken: string;
    webhookSecret: string;
    ownerId: number;
  };
  redis: { url: string; token: string } | null;
  worker: { url: string; token: string } | null;
  sessionEncryptionKey: string | null;
  cronSecret: string;
  dryRun: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const DEFAULT_MODELS = {
  gemini: 'gemini-3.6-flash',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
} as const;

export function loadConfig(): Config {
  const provider = (process.env.LLM_PROVIDER ?? 'gemini') as Config['llm']['provider'];
  if (!(provider in DEFAULT_MODELS)) {
    throw new Error(`LLM_PROVIDER must be one of gemini, openai, groq (got "${provider}")`);
  }
  const apiKeyVar = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY' }[
    provider
  ];

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const workerUrl = process.env.WORKER_URL;
  const workerToken = process.env.WORKER_TOKEN;

  return {
    keyPrefix: process.env.KEY_PREFIX ?? 'default',
    llm: {
      provider,
      apiKey: required(apiKeyVar),
      model: process.env.LLM_MODEL ?? DEFAULT_MODELS[provider],
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
      ownerId: Number(process.env.TELEGRAM_OWNER_ID ?? 0),
    },
    redis: redisUrl && redisToken ? { url: redisUrl, token: redisToken } : null,
    worker: workerUrl && workerToken ? { url: workerUrl, token: workerToken } : null,
    sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY ?? null,
    cronSecret: process.env.CRON_SECRET ?? '',
    dryRun: process.env.DRY_RUN === 'true',
  };
}
