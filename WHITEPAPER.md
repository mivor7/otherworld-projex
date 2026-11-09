# Other World Projex — whitepaper

An open bounty arcade on Solana. People buy and sell **$OWP**. Players win or lose it on the games. The team does not try to control that market.

This paper describes the app as it runs at [otherworldprojex.xyz](https://www.otherworldprojex.xyz/whitepaper). It is not an offer of securities and it promises no return. The same text is the page at `/whitepaper`.

The source is public: [github.com/mivor7/otherworld-projex](https://github.com/mivor7/otherworld-projex), published by [mivor7](https://github.com/mivor7).

## The market

The team does not trade the house wallet to push the $OWP price up or down. Holders buy and sell on the open market, and that market sets the price. A win or a loss on a game is the player's.

The house wallet holds deposits so the app can pay withdrawals and prizes. Those payments return a player's own balance. They are not orders placed to move the chart, and the wallet is not a trading book.

On Frog Flip and Pond Dice the only cut is a **4% house edge**. It is applied to the payout multiplier, never to the roll. A winning flip pays 1.92× the wager (2 × 0.96). Dice pays (100 ÷ target) × 0.96. By default, half of that edge fills the bounty pot and is paid back to eligible players. The live rate is on `/treasury`.

Blackjack uses its published rules — a natural pays 3:2, the dealer stands on every 17 — and does not add the 4% on top. Hopper, Frogris, and Worm Frog are free. They take no wager.

## $OWP

$OWP is the balance of the house. There is no second chip. Deposit it, play, bid, hunt bounties, and withdraw the same token.

The published mint is `GE8JGUE6ssrnFh4FSv9iwniYCwucB15PupT97uVRpump`. The app reads that account on Solana. Until the account exists, deposits, website buys, and automatic payouts stay closed. The site does not invent a price.

Decimals default to 6 and are read from the mint when it exists. The token program, classic SPL or Token-2022, is read from the mint account owner. It is not hardcoded.

$OWP is a memecoin. It is not a registered security. Nothing here is investment advice, a yield, a buyback, or a promise that the price rises.

## One wallet

One wallet is the admin, the treasury, and the payout signer. The private key is not on the website. A worker elsewhere pays the queue. The public address is shown on `/treasury`.

Deposited $OWP sits in that wallet until it is withdrawn or paid out as a prize. An Anchor program in `program/` can custody SOL, with a multisig admin and a daily cap. It does not hold $OWP, and it has not been audited. $OWP payouts are signed by the house wallet.

## Deposit and withdraw

A deposit is a transfer of $OWP to the house wallet. The server checks the transaction on Solana, then credits the in-app balance. Tables play in whole tokens from that balance.

A withdrawal queues a payment of the available balance back to the same wallet. The payout worker sends it.

## Buying

The website can sell $OWP from the house at the live pump.fun spot. The visitor pays SOL from their own wallet. The house sends $OWP to that same wallet. The buy does not credit the in-app balance, and the team does not pick a private price.

While the coin is on the bonding curve, the payout is one integer division in the house's favor: lamports paid, times the curve's virtual token reserve, divided by its virtual SOL reserve. After the curve migrates, the price is the PumpSwap price. If there is no price, the buy is refused. A buy is 0.01 to 50 SOL. If the house cannot cover the send, the buy is refused.

Selling $OWP is something the holder does on the open market. The site does not run a sell book, and it does not buy the chart up.

## Games

Every round is provably fair. The server publishes the SHA-256 hash of a seed before play. The outcome is HMAC-SHA256 of that seed over the player's client seed and a nonce. When the player rotates the seed, the old seed is revealed and past rounds can be recomputed at `/fairness`. Blackjack's whole deck is derived the same way before the first card.

Frog Flip is a coin. Pond Dice is roll-under. Blackjack is the table above. Hopper, Frogris, and Worm Frog are the free arcade. Prize boards rank wallets that have deposited enough $OWP. The current minimums are shown on the games and the leaderboard.

## Auctions and bounties

The auction house takes bids in $OWP from the in-app balance. A bid is escrowed. An outbid is refunded. A bid in the last two minutes extends the close by two minutes. Community listings go through review.

Bounties pay a fixed $OWP prize. One bounty is open per game. Table pots fill from the bounty's share of the house edge — half of the 4%, by default, which is 0.02 $OWP added to the pot per 1 $OWP wagered. When the pot reaches the prize, every eligible winner is paid pro-rata, then the next round opens. Free arcade bounties pay on a weekly clock. The house can declare a seed as a head start. That seed is its own money, not a trade.

## The waitlist

The airdrop waitlist records wallets that hold $OWP on-chain. Joining does not lock or transfer those tokens. Once the list reaches its goal, the app treats the airdrop as guaranteed. The amount is not set in this paper and is not set on the waitlist page. There is no vesting schedule in the app.

## What this is not

There is no staking pool. There is no liquidity pool run by the house. The team does not market-make. The source is public so those claims can be checked.

Games are entertainment. The edge is real, the outcome is chance, and you can lose the $OWP you wager. Do not spend more than you can afford to lose. Real-money play may be restricted where you live. You are responsible for your own compliance.
