import { describe, expect, it, vi } from "vitest";
import { withClient } from "./load-with-client";

describe("withClient", () => {
  it("returns the fallback without loading when there is no client", async () => {
    const load = vi.fn(() => Promise.resolve("loaded"));

    await expect(withClient(() => null, load, "empty")).resolves.toBe("empty");
    expect(load).not.toHaveBeenCalled();
  });

  it("returns what the loader returns, given the client", async () => {
    const client = { id: "client" };
    const load = vi.fn((c: typeof client) => Promise.resolve(`loaded by ${c.id}`));

    await expect(withClient(() => client, load, "empty")).resolves.toBe("loaded by client");
    expect(load).toHaveBeenCalledExactlyOnceWith(client);
  });

  it("lets a loader error through", async () => {
    await expect(
      withClient(
        () => ({}),
        () => Promise.reject(new Error("boom")),
        "empty",
      ),
    ).rejects.toThrow("boom");
  });

  it("keeps a falsy but real result instead of the fallback", async () => {
    await expect(
      withClient(
        () => ({}),
        () => Promise.resolve(0),
        5,
      ),
    ).resolves.toBe(0);
  });
});
