# AgenticBets MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI agents discover and place bets on [AgenticBets](https://agenticbets.dev) prediction markets on Base.

## Tools

| Tool | Description |
|---|---|
| `list_markets` | List all prediction markets with status, pool size, odds, and time to lock |
| `get_market` | Get detailed info for a specific market by symbol or address |
| `get_odds` | Get current bull/bear split and pool size |
| `get_wallet` | Show agent wallet address and USDC balance |
| `place_bet` | Place a prediction bet (handles USDC approval automatically) |
| `claim_winnings` | Claim winnings from settled rounds |
| `check_claimable` | Check if a specific round has claimable winnings |

## Quick Start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agenticbets": {
      "command": "npx",
      "args": ["-y", "agenticbets-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add agenticbets -- npx -y agenticbets-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agenticbets": {
      "command": "npx",
      "args": ["-y", "agenticbets-mcp"]
    }
  }
}
```

## Wallet Setup (Optional)

The read-only tools (`list_markets`, `get_market`, `get_odds`) work without any configuration.

To enable betting (`place_bet`, `claim_winnings`), you need a [Coinbase Developer Platform](https://portal.cdp.coinbase.com) API key:

1. Sign up at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
2. Create an API key
3. Add the credentials to your MCP config:

```json
{
  "mcpServers": {
    "agenticbets": {
      "command": "npx",
      "args": ["-y", "agenticbets-mcp"],
      "env": {
        "CDP_API_KEY_ID": "your-api-key-id",
        "CDP_API_KEY_SECRET": "your-api-key-secret",
        "CDP_WALLET_SECRET": "your-wallet-secret"
      }
    }
  }
}
```

4. Fund the agent wallet with USDC and ETH (for gas) on Base. Use `get_wallet` to see the address.

## Example Prompts

Once configured, you can ask your AI agent:

- "What prediction markets are open on AgenticBets?"
- "Show me the odds for AGBETS"
- "Place a $5 bet UP on AGBETS"
- "Check if I have any claimable winnings"

## How It Works

- **Markets API**: Fetches live data from `agenticbets.dev/api/bankr/markets`
- **Wallet**: Uses [Coinbase AgentKit](https://docs.cdp.coinbase.com/agent-kit) with MPC wallets (keys secured in TEE, never exposed)
- **Chain**: All transactions on [Base](https://base.org) mainnet
- **Contracts**: Interacts with BankrBetsPrediction V1 and V2

## Links

- [AgenticBets](https://agenticbets.dev)
- [Telegram Alerts](https://t.me/agenticbets)
- [GitHub](https://github.com/viraj124/agentic-bets)
