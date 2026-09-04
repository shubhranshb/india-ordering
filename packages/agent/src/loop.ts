import {
  AddressBook,
  BudgetExceededError,
  BudgetGuard,
  checkModelIsFree,
  createStore,
  limitsFromEnv,
  safeError,
  WorkerClient,
  type Config,
} from '@io/core';
import { createProviders } from '@io/providers';
import { createLlm, type LlmClient, type Message } from './llm.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { runTool, TOOL_SCHEMAS, type OrderOption, type ToolContext } from './tools.js';

const MAX_TOOL_ROUNDS = 6;
/** Each turn re-sends the history, so trimming it directly caps input tokens. */
const MAX_HISTORY_MESSAGES = 12;

export interface DailyUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TurnResult {
  reply: string;
  options: OrderOption[];
  history: Message[];
  usage?: DailyUsage;
}

export class Agent {
  private llm: LlmClient;
  private ctx: ToolContext;
  private budget: BudgetGuard;

  constructor(config: Config) {
    const store = createStore(config.redis, config.keyPrefix);
    const limits = limitsFromEnv();

    const warning = checkModelIsFree(config.llm.provider, config.llm.model);
    if (warning) console.warn(`⚠️  ${warning}`);

    this.budget = new BudgetGuard(store, limits);
    this.llm = createLlm({ ...config.llm, maxOutputTokens: limits.maxOutputTokens });
    this.ctx = {
      providers: createProviders(new WorkerClient(config.worker)),
      addresses: new AddressBook(store),
      store,
    };
  }

  async turn(userMessage: string, history: Message[] = [], extraSystem = ''): Promise<TurnResult> {
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT + extraSystem },
      ...history.slice(-MAX_HISTORY_MESSAGES),
      { role: 'user', content: userMessage },
    ];
    const options: OrderOption[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        await this.budget.check();
      } catch (error) {
        if (error instanceof BudgetExceededError) {
          return { reply: `🛑 ${error.message}`, options, history: messages.slice(1) };
        }
        throw error;
      }

      const reply = await this.llm.complete(messages, TOOL_SCHEMAS);
      await this.budget.record(reply.usage);

      messages.push({
        role: 'assistant',
        content: reply.content,
        toolCalls: reply.toolCalls,
      });

      if (reply.toolCalls.length === 0) {
        return {
          reply: reply.content,
          options,
          history: messages.slice(1),
          usage: await this.budget.usage(),
        };
      }

      for (const call of reply.toolCalls) {
        let content: string;
        try {
          content = await runTool(call.name, call.arguments, this.ctx, options);
        } catch (error) {
          safeError(`tool ${call.name} failed`, error);
          content = `Error: ${error instanceof Error ? error.message : 'tool failed'}`;
        }
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content });
      }
    }

    return {
      reply: 'I could not finish that — try narrowing the request to one or two items.',
      options,
      history: messages.slice(1),
    };
  }

  async usage(): Promise<DailyUsage> {
    return this.budget.usage();
  }

  get addresses(): AddressBook {
    return this.ctx.addresses;
  }
}
