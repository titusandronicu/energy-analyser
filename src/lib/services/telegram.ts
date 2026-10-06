// One Telegram Bot API `sendMessage` call. The bot token is part of the request URL, so nothing from the request or the
// response ever leaves this module: a failure is reduced to an HTTP status code, "timeout" or "network".

export const TELEGRAM_TIMEOUT_MS = 10_000;

export interface TelegramDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
}

export interface TelegramMessage {
  token: string;
  chatId: string;
  text: string;
}

export type TelegramResult = { ok: true } | { ok: false; code: string };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function sendTelegramMessage(deps: TelegramDeps, message: TelegramMessage): Promise<TelegramResult> {
  try {
    const response = await deps.fetch(`https://api.telegram.org/bot${message.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: message.chatId, text: message.text }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? TELEGRAM_TIMEOUT_MS),
    });
    // The answer is never read; closing it frees the connection.
    await response.body?.cancel();
    return response.ok ? { ok: true } : { ok: false, code: String(response.status) };
  } catch (error) {
    // The error's message can quote the URL, so only its kind is kept.
    return { ok: false, code: isTimeout(error) ? "timeout" : "network" };
  }
}
