import { describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "./telegram";

// All data here is synthetic. The bot token sits in the request URL, so every failure must be reduced to a short code.

const SECRET = "123456:SYNTHETIC-bot-token";
const message = { token: SECRET, chatId: "-1001", text: "Treść wiadomości" };

function reply(status: number, body = "{}") {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status })));
}

describe("sendTelegramMessage", () => {
  it("posts one sendMessage call with the chat id and the text", async () => {
    const fake = reply(200);

    expect(await sendTelegramMessage({ fetch: fake }, message)).toEqual({ ok: true });

    expect(fake).toHaveBeenCalledTimes(1);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${SECRET}/sendMessage`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ chat_id: "-1001", text: "Treść wiadomości" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([400, 401, 429, 500])("reduces a %i answer to its status code", async (status) => {
    const result = await sendTelegramMessage({ fetch: reply(status, `{"description":"${SECRET}"}`) }, message);

    expect(result).toEqual({ ok: false, code: String(status) });
  });

  it.each(["TimeoutError", "AbortError"])("reports %s as a timeout", async (name) => {
    const fake = vi.fn<typeof fetch>(() => Promise.reject(new DOMException(`aborted ${SECRET}`, name)));

    expect(await sendTelegramMessage({ fetch: fake }, message)).toEqual({ ok: false, code: "timeout" });
  });

  it("reports any other failure as network, without the error's own text", async () => {
    const fake = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError(`fetch failed: https://api.telegram.org/bot${SECRET}/sendMessage`)),
    );

    const result = await sendTelegramMessage({ fetch: fake }, message);

    expect(result).toEqual({ ok: false, code: "network" });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("gives up after its own timeout when the server never answers", async () => {
    const hang = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        }),
    );

    expect(await sendTelegramMessage({ fetch: hang, timeoutMs: 20 }, message)).toEqual({ ok: false, code: "timeout" });
  });
});
