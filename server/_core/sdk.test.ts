import { describe, expect, it } from "vitest";
import { sdk } from "./sdk";

describe("sdk session verification", () => {
  it("accepts sessions when appId is empty in local env", async () => {
    const token = await sdk.createSessionToken("dev-admin", {
      name: "Dev Admin",
      expiresInMs: 60_000,
    });

    const session = await sdk.verifySession(token);

    expect(session).not.toBeNull();
    expect(session?.openId).toBe("dev-admin");
    expect(session?.name).toBe("Dev Admin");
  });
});
