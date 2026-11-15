import { describe, expect, it } from "vitest";
import { buildSignInMessage } from "@/lib/session";

describe("sign-in message", () => {
  const challenge = {
    domain: "www.otherworldprojex.xyz",
    uri: "https://www.otherworldprojex.xyz",
    wallet: "Gj1irVNxLM4gidXvGL7jDJu9c17QaBa2FxK4GKkBUDUE",
    nonce: "3yZe7dQy4FfS2M1nXc9WqA",
    issuedAt: "2026-11-15T12:00:00.000Z",
  };
  const message = buildSignInMessage(challenge);
  const lines = message.split("\n");

  it("opens with the Sign-In With Solana header naming this site", () => {
    // Wallets match this exact shape to recognise a sign-in request and to
    // compare the domain with the page that is asking.
    expect(lines[0]).toBe("www.otherworldprojex.xyz wants you to sign in with your Solana account:");
    expect(lines[1]).toBe(challenge.wallet);
    expect(lines[2]).toBe("");
  });

  it("carries a one-line statement, then the fields in the order the format fixes", () => {
    expect(lines[3]).toMatch(/does not authorize any transaction/);
    expect(lines[4]).toBe("");
    expect(lines.slice(5)).toEqual([
      "URI: https://www.otherworldprojex.xyz",
      "Version: 1",
      "Chain ID: mainnet",
      "Nonce: 3yZe7dQy4FfS2M1nXc9WqA",
      "Issued At: 2026-11-15T12:00:00.000Z",
    ]);
  });

  it("is a different message on a different site", () => {
    const elsewhere = buildSignInMessage({ ...challenge, domain: "evil.example", uri: "https://evil.example" });
    expect(elsewhere).not.toBe(message);
  });
});
