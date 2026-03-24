# Bankr Bets

Permissionless binary prediction markets for [Bankr](https://bankr.fun) ecosystem tokens on Base.

Bet **UP** or **DOWN** on token prices in 4-minute rounds. Winners split the pool. No keeper needed for pricing — prices are read directly on-chain from Uniswap V4.

## How It Works

1. **Pick a token** — Browse Bankr ecosystem tokens with active Uniswap V4 pools
2. **Bet UP or DOWN** — Predict price direction within a 4-minute betting window using USDC
3. **Anyone settles** — Lock and close rounds on-chain to earn a 0.1% settler reward
4. **Collect winnings** — Winners split the losers' pool. Market creators earn 0.5% forever

### Round Lifecycle

```
Betting Open (4 min) → Bets Locked → Round Settled → Payouts
```

- Prices are read on-chain from Uniswap V4 `PoolManager.getSlot0()` — no off-chain oracle needed
- Settlement is permissionless: any wallet can call `lockRound` / `closeRound`
- If the price doesn't change, the round is tied and all bets are refunded

### Fee Structure

| Fee | Recipient | Description |
|-----|-----------|-------------|
| 1.5% | Treasury | Protocol fee |
| 0.5% | Market Creator | Perpetual royalty for creating the market |
| 0.1% | Settler | Reward for calling lock/close on-chain |

## Architecture

```
bankr-bets/
├── packages/
│   ├── foundry/          # Smart contracts (Solidity, Forge)
│   │   ├── contracts/
│   │   │   ├── BankrBetsPrediction.sol   # Core prediction market logic
│   │   │   └── BankrBetsOracle.sol       # Market registry + V4 price oracle
│   │   ├── script/       # Deployment scripts (Base mainnet)
│   │   └── test/         # Fork tests against Base
│   │
│   ├── nextjs/           # Frontend (Next.js, Wagmi, Viem, Tailwind)
│   │   ├── app/          # App Router pages
│   │   ├── components/   # UI components (BetPanel, RoundHistory, etc.)
│   │   └── hooks/        # Custom hooks for contract interaction
│   │
│   ├── keeper/           # Automated settlement bot (TypeScript, Viem)
│   │   └── src/          # Polling loop, tx submission, health server
│   │
│   └── ponder/           # Event indexer (Ponder v0.9)
│       ├── ponder.config.ts
│       └── src/          # Schema + API for user stats, bets, rounds
```

### Smart Contracts

**BankrBetsPrediction** — Core prediction market. Users call `betBull` / `betBear` with USDC. Anyone can `lockRound` (snapshot lock price) and `closeRound` (snapshot close price, distribute rewards). Uses SafeERC20, ReentrancyGuard, and the CEI pattern.

**BankrBetsOracle** — Permissionless market registry. Anyone can register a token market if it has a Uniswap V4 pool. Supports Clanker V4 hooks, Bankr launcher hooks, and vanilla V4 pools. Reads prices directly from `PoolManager.getSlot0()`.

### Deployed Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| BankrBetsPrediction | `0x8e9eBff2D977C69501a66961c919Cb7AA44494ce` |
| USDC (bet token) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Uniswap V4 PoolManager | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) >= v20
- [Yarn](https://yarnpkg.com/)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Install

```bash
git clone https://github.com/viraj124/bankr-bets.git
cd bankr-bets
yarn install
```

### Local Development

```bash
# Start the frontend
yarn start

# Run contract tests (requires BASE_RPC_URL for fork tests)
BASE_RPC_URL=<your-base-rpc> yarn foundry:test
```

### Deploy Contracts

```bash
# Deploy to Base mainnet
yarn deploy --network base
```

### Run the Keeper

```bash
# Set env vars (PRIVATE_KEY, RPC_URL, etc.)
cp packages/keeper/.env.example packages/keeper/.env

# Start the settlement bot
yarn keeper:start
```

### Deploy Frontend

```bash
yarn vercel:yolo --prod
```

## Tech Stack

- **Smart Contracts**: Solidity, Foundry, OpenZeppelin
- **Frontend**: Next.js (App Router), Wagmi, Viem, RainbowKit, Tailwind CSS
- **Keeper**: TypeScript, Viem
- **Indexer**: Ponder v0.9
- **Chain**: Base (Coinbase L2)
- **Price Oracle**: Uniswap V4 on-chain reads
- **Bet Token**: USDC (6 decimals)

## Inspiration

This project draws inspiration from on-chain prediction market protocols:

- [PancakeSwap Prediction](https://github.com/pancakeswap/pancake-smart-contracts) — Binary prediction on BNB/CAKE prices using Chainlink oracles
- [Polymarket](https://github.com/polymarket) — CLOB-based prediction markets on Polygon
- [CryptoPredict](https://github.com/CoderEren/CryptoPredict) — Decentralized prediction market for Bitcoin price movements

Key differences in Bankr Bets:
- **No off-chain oracle** — prices read directly from Uniswap V4 pools on-chain
- **Permissionless markets** — anyone can create a market for any token with a V4 pool
- **Permissionless settlement** — anyone can settle rounds and earn rewards
- **Creator royalties** — market creators earn 0.5% of every round's pool forever

## Author

**Viraz Malhotra** — [@Viraz04](https://twitter.com/Viraz04)

Built for the [Bankr](https://bankr.fun) ecosystem.

## License

MIT
