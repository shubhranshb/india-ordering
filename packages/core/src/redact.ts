const SENSITIVE_KEYS =
  /^(cookies?|storagestate|origins|localstorage|token|authorization|apikey|api_key|phone|mobile|address|line1|line2|value)$/i;

const PHONE = /(?<![\d+])(?:\+?91[-\s]?)?[6-9]\d{9}(?![\d])/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

/**
 * Sessions carry auth cookies for accounts with saved payment methods, so
 * nothing from them may reach a log line.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (typeof value === 'string') {
    return value.replace(PHONE, '[phone]').replace(LONG_TOKEN, '[redacted]');
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        SENSITIVE_KEYS.test(k) ? [k, '[redacted]'] : [k, redact(v, depth + 1)],
      ),
    );
  }
  return value;
}

export function safeLog(message: string, context?: unknown): void {
  if (context === undefined) console.log(message);
  else console.log(message, JSON.stringify(redact(context)));
}

export function safeError(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(message, redact(detail));
}
