import { beforeAll, describe, expect, it } from "vitest";
import { loadLiveState } from "@/lib/services/live-state";
import { baseBody } from "./support/bodies";
import { nextCapturedAt } from "./support/keys";
import { push } from "./support/push";
import { ownerClient, requireStack } from "./support/stack";

describe("seed: a pushed state is the newest live state", () => {
  let owner: Awaited<ReturnType<typeof ownerClient>>;

  beforeAll(async () => {
    requireStack();
    owner = await ownerClient();
  });

  it("stores the push and shows it as the live state to an owner", async () => {
    const capturedAt = nextCapturedAt();

    const result = await push(baseBody(capturedAt, { pv_w: 3137 }));
    expect(result).toEqual({ status: 201, body: { status: "created" } });

    const live = await loadLiveState(owner);
    expect(live).not.toBeNull();
    expect(Date.parse(live?.captured_at ?? "")).toBe(capturedAt.getTime());
    expect(live?.state).toMatchObject({ pv_w: 3137 });
  });
});
