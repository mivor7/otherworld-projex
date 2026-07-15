import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OwpTreasury } from "../target/types/owp_treasury";
import { LAMPORTS_PER_SOL, PublicKey, Keypair } from "@solana/web3.js";
import { assert } from "chai";

describe("owp-treasury", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.owpTreasury as Program<OwpTreasury>;
  const admin = provider.wallet;

  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );

  const CAP = 2 * LAMPORTS_PER_SOL;

  it("initializes with a daily cap", async () => {
    await program.methods
      .initialize(new anchor.BN(CAP))
      .accounts({ admin: admin.publicKey })
      .rpc();
    const state = await program.account.treasury.fetch(treasury);
    assert.ok(state.admin.equals(admin.publicKey));
    assert.equal(state.dailyCapLamports.toNumber(), CAP);
  });

  it("accepts deposits from anyone", async () => {
    const stranger = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      stranger.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .deposit(new anchor.BN(3 * LAMPORTS_PER_SOL))
      .accounts({ payer: stranger.publicKey })
      .signers([stranger])
      .rpc();

    const balance = await provider.connection.getBalance(vault);
    assert.isAtLeast(balance, 3 * LAMPORTS_PER_SOL);
  });

  it("pays out with admin signature", async () => {
    const recipient = Keypair.generate().publicKey;
    await program.methods
      .payout(new anchor.BN(LAMPORTS_PER_SOL))
      .accounts({ recipient, admin: admin.publicKey })
      .rpc();
    const balance = await provider.connection.getBalance(recipient);
    assert.equal(balance, LAMPORTS_PER_SOL);
  });

  it("enforces the daily cap", async () => {
    const recipient = Keypair.generate().publicKey;
    try {
      // 1 SOL already spent this "day"; another 1.5 breaches the 2 SOL cap.
      await program.methods
        .payout(new anchor.BN(1.5 * LAMPORTS_PER_SOL))
        .accounts({ recipient, admin: admin.publicKey })
        .rpc();
      assert.fail("payout above the daily cap should have failed");
    } catch (e) {
      assert.include(String(e), "DailyCapExceeded");
    }
  });

  it("rejects payouts from non-admin", async () => {
    const mallory = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      mallory.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    try {
      await program.methods
        .payout(new anchor.BN(1000))
        .accounts({ recipient: mallory.publicKey, admin: mallory.publicKey })
        .signers([mallory])
        .rpc();
      assert.fail("non-admin payout should have failed");
    } catch (e) {
      assert.include(String(e), "has_one");
    }
  });
});
