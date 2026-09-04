export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Gemini 3 encrypted reasoning state; must be resent verbatim or the call is rejected. */
  thoughtSignature?: string;
}

export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface LlmReply {
  content: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  complete(messages: Message[], tools: ToolSchema[]): Promise<LlmReply>;
}

export interface LlmOptions {
  provider: 'gemini' | 'openai' | 'groq';
  apiKey: string;
  model: string;
  maxOutputTokens: number;
}

/** Gemini, OpenAI and Groq differ only in wire format — swap with one env var. */
export function createLlm(options: LlmOptions): LlmClient {
  return options.provider === 'gemini' ? new GeminiClient(options) : new OpenAiCompatClient(options);
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

/** Free tiers return 429 and 503 routinely, so a transient failure must not surface. */
async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    lastStatus = res.status;
    if (!RETRY_STATUSES.has(res.status)) {
      throw new Error(`${label} ${res.status}: ${await res.text()}`);
    }
    if (attempt === MAX_ATTEMPTS - 1) {
      throw new Error(
        res.status === 429
          ? `${label} rate limit hit. Wait a minute and try again.`
          : `${label} is busy right now (${res.status}). Try again in a moment.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000 + Math.random() * 500));
  }
  throw new Error(`${label} failed after ${MAX_ATTEMPTS} attempts (${lastStatus})`);
}

class GeminiClient implements LlmClient {
  constructor(private options: LlmOptions) {}

  async complete(messages: Message[], tools: ToolSchema[]): Promise<LlmReply> {
    const system = messages.find((m) => m.role === 'system');
    const body: Record<string, unknown> = {
      contents: messages.filter((m) => m.role !== 'system').map(toGeminiContent),
      generationConfig: { maxOutputTokens: this.options.maxOutputTokens },
      ...(system && system.role === 'system'
        ? { systemInstruction: { parts: [{ text: system.content }] } }
        : {}),
      ...(tools.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              },
            ],
          }
        : {}),
    };

    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.options.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify(body),
      },
      'Gemini',
    );

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];

    return {
      content: parts
        .map((p) => p.text)
        .filter(Boolean)
        .join(''),
      toolCalls: parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: `${p.functionCall!.name}-${i}`,
          name: p.functionCall!.name,
          arguments: p.functionCall!.args ?? {},
          thoughtSignature: p.thoughtSignature,
        })),
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

class OpenAiCompatClient implements LlmClient {
  private baseUrl: string;

  constructor(private options: LlmOptions) {
    this.baseUrl =
      options.provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.openai.com/v1';
  }

  async complete(messages: Message[], tools: ToolSchema[]): Promise<LlmReply> {
    const res = await fetchWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: messages.map(toOpenAiMessage),
          max_completion_tokens: this.options.maxOutputTokens,
          ...(tools.length
            ? { tools: tools.map((t) => ({ type: 'function', function: t })) }
            : {}),
        }),
      },
      this.options.provider,
    );

    const json = (await res.json()) as OpenAiResponse;
    const message = json.choices?.[0]?.message;

    return {
      content: message?.content ?? '',
      toolCalls: (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeParse(call.function.arguments),
      })),
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}

function toGeminiContent(message: Message): unknown {
  if (message.role === 'tool') {
    return {
      role: 'user',
      parts: [
        { functionResponse: { name: message.name, response: { result: message.content } } },
      ],
    };
  }
  if (message.role === 'assistant') {
    const parts: unknown[] = [];
    if (message.content) parts.push({ text: message.content });
    for (const call of message.toolCalls ?? []) {
      parts.push({
        functionCall: { name: call.name, args: call.arguments },
        ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
      });
    }
    return { role: 'model', parts: parts.length ? parts : [{ text: '' }] };
  }
  return { role: 'user', parts: [{ text: message.content }] };
}

function toOpenAiMessage(message: Message): unknown {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content || null,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.arguments) },
            })),
          }
        : {}),
    };
  }
  return { role: message.role, content: message.content };
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        thoughtSignature?: string;
        functionCall?: { name: string; args?: Record<string, unknown> };
      }[];
    };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface OpenAiResponse {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
