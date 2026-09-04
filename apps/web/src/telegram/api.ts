const API = 'https://api.telegram.org/bot';

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

async function call(token: string, method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API}${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Telegram ${method} failed: ${res.status}`);
  return res.json();
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  buttons: InlineButton[][] = [],
): Promise<number> {
  const res = (await call(token, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  })) as { result?: { message_id: number } };
  return res.result?.message_id ?? 0;
}

export async function editMessage(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  buttons: InlineButton[][] = [],
): Promise<void> {
  await call(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

/** Must be called within 15s of a tap or the button spinner hangs. */
export async function answerCallback(
  token: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await call(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
  };
}
