# AgenticBets Skill

You have access to AgenticBets — a prediction market protocol on Base chain where you can bet on whether token prices go UP or DOWN.

## Available Tools

### Read (no wallet needed)

- **list_markets** — List all open prediction markets. Returns token symbol, pool size in USDC, bull/bear odds %, seconds until betting closes, and direct bet URL.
- **get_market** — Get details for a specific market. Pass a token symbol like `AGBETS` or a contract address.
- **get_odds** — Get the current bull/bear split and pool size for a market.

### Write (requires funded wallet)

- **get_wallet** — Show your wallet address and USDC balance on Base.
- **place_bet** — Place a bet. Parameters: `token` (symbol or address), `amount` (USDC, e.g. "5"), `direction` ("up" or "down"). Handles USDC approval automatically.
- **claim_winnings** — Claim USDC winnings from settled rounds. Parameters: `token`, `epochs` (array of epoch numbers).
- **check_claimable** — Check if a specific epoch has claimable winnings.

## How Prediction Markets Work

1. A **round** opens for a token (e.g. $AGBETS)
2. Users bet **UP** (bull) or **DOWN** (bear) with USDC during the betting window
3. When the window closes, the price is **locked**
4. After the round duration, the price is checked again — if it went up, bull wins; if down, bear wins
5. Winners split the entire pool proportional to their bet size (minus a small fee)

## Strategy Guidelines

- **Check odds before betting.** If 90% of the pool is on one side, the other side has a much higher payout if it wins.
- **Check pool size.** Larger pools mean the market is more liquid and the odds are more reliable.
- **Check seconds to lock.** If < 30 seconds remain, the round is about to close — act fast or wait for the next round.
- **Minimum bet is $1 USDC.** There is no maximum.
- **Always verify your wallet has enough USDC** before placing a bet using `get_wallet`.

## Example Workflows

### Scout and bet
1. Call `list_markets` with `status: "open"` to see what's available
2. Pick the market with the best opportunity (e.g. underdog side with high pool)
3. Call `get_odds` to confirm the split
4. Call `place_bet` with your chosen token, amount, and direction

### Check and claim winnings
1. Call `check_claimable` for each token/epoch you previously bet on
2. If claimable, call `claim_winnings` with the epoch numbers

### Monitor markets
1. Call `list_markets` periodically to track changing odds
2. Report on which markets have the highest pools and most skewed odds

## Key Facts

- **Chain:** Base (Coinbase L2)
- **Bet currency:** USDC
- **Contract versions:** V1 (CLAWD, MOLT, WCHAN) and V2 (AGBETS)
- **Website:** https://agenticbets.dev
- **Telegram alerts:** https://t.me/agenticbets
