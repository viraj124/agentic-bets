#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchMarkets, formatMarketSummary } from "./markets.js";
import {
  checkClaimable,
  claimWinnings,
  getUsdcBalance,
  getWalletAddress,
  placeBet,
} from "./wallet.js";

const API_URL =
  process.env.BANKR_API_URL || "https://agenticbets.dev/api/bankr/markets";

const server = new McpServer({
  name: "agenticbets",
  version: "0.1.0",
});

// ── Read-only tools ──────────────────────────────────────────────

server.tool(
  "list_markets",
  "List all prediction markets on AgenticBets with their current status, pool size, odds, and time to lock",
  {
    status: z
      .enum(["all", "open", "locked", "settled"])
      .optional()
      .describe("Filter by market status (default: all)"),
  },
  async ({ status }) => {
    const markets = await fetchMarkets(API_URL);
    const filtered =
      !status || status === "all"
        ? markets
        : markets.filter(m => m.status === status);

    if (filtered.length === 0) {
      return { content: [{ type: "text", text: "No markets found matching the filter." }] };
    }

    const summary = filtered.map(formatMarketSummary).join("\n\n---\n\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${filtered.length} market(s):\n\n${summary}`,
        },
      ],
    };
  },
);

server.tool(
  "get_market",
  "Get detailed info for a specific prediction market by token symbol or address",
  {
    query: z
      .string()
      .describe("Token symbol (e.g. AGBETS) or token contract address"),
  },
  async ({ query }) => {
    const markets = await fetchMarkets(API_URL);
    const q = query.toLowerCase();
    const market = markets.find(
      m => m.symbol.toLowerCase() === q || m.token.toLowerCase() === q,
    );

    if (!market) {
      return {
        content: [
          { type: "text", text: `No market found for "${query}". Use list_markets to see available markets.` },
        ],
      };
    }

    return { content: [{ type: "text", text: formatMarketSummary(market) }] };
  },
);

server.tool(
  "get_odds",
  "Get the current bull/bear odds and pool size for a market",
  {
    query: z
      .string()
      .describe("Token symbol (e.g. AGBETS) or token contract address"),
  },
  async ({ query }) => {
    const markets = await fetchMarkets(API_URL);
    const q = query.toLowerCase();
    const market = markets.find(
      m => m.symbol.toLowerCase() === q || m.token.toLowerCase() === q,
    );

    if (!market) {
      return {
        content: [{ type: "text", text: `No market found for "${query}".` }],
      };
    }

    const bull = Math.round(market.bullPct);
    const bear = 100 - bull;
    const timeLeft =
      market.secondsToLock !== null && market.secondsToLock > 0
        ? `${market.secondsToLock}s until lock`
        : market.status;

    return {
      content: [
        {
          type: "text",
          text: [
            `$${market.symbol} — Epoch ${market.epoch}`,
            `UP: ${bull}% | DOWN: ${bear}%`,
            `Pool: $${market.poolUsdc.toFixed(2)} USDC`,
            `Status: ${timeLeft}`,
          ].join("\n"),
        },
      ],
    };
  },
);

// ── Wallet tools ─────────────────────────────────────────────────

server.tool(
  "get_wallet",
  "Get the agent wallet address and USDC balance on Base",
  {},
  async () => {
    try {
      const [address, balance] = await Promise.all([
        getWalletAddress(),
        getUsdcBalance(),
      ]);
      return {
        content: [
          {
            type: "text",
            text: `Agent wallet: ${address}\nUSDC balance: $${balance}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Wallet not configured. Set CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET env vars. Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "place_bet",
  "Place a prediction bet on AgenticBets. Requires USDC in the agent wallet. Automatically handles USDC approval.",
  {
    token: z
      .string()
      .describe("Token symbol (e.g. AGBETS) or token contract address"),
    amount: z
      .string()
      .describe("Bet amount in USDC (e.g. '5' for $5)"),
    direction: z
      .enum(["up", "down"])
      .describe("Bet direction: 'up' (bull/price goes up) or 'down' (bear/price goes down)"),
  },
  async ({ token, amount, direction }) => {
    // Resolve symbol to address
    const markets = await fetchMarkets(API_URL);
    const q = token.toLowerCase();
    const market = markets.find(
      m => m.symbol.toLowerCase() === q || m.token.toLowerCase() === q,
    );

    if (!market) {
      return {
        content: [{ type: "text", text: `No market found for "${token}".` }],
      };
    }

    // The prediction contract auto-starts a fresh round when the previous one
    // is settled or when no round exists yet. Only a currently locked round
    // should be blocked at the MCP layer.
    if (market.status === "locked") {
      return {
        content: [
          {
            type: "text",
            text: `Market $${market.symbol} is currently locked. Wait for settlement, then the next bet can start a fresh round.`,
          },
        ],
      };
    }

    try {
      const txHash = await placeBet(market.token, amount, direction);
      const startedFreshRound = market.status !== "open";
      return {
        content: [
          {
            type: "text",
            text: [
              `Bet placed on $${market.symbol}!`,
              ...(startedFreshRound ? ["A fresh round was auto-started for this market."] : []),
              `Direction: ${direction.toUpperCase()}`,
              `Amount: $${amount} USDC`,
              ...(!startedFreshRound ? [`Epoch: ${market.epoch}`] : []),
              `Tx: https://basescan.org/tx/${txHash}`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Bet failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "claim_winnings",
  "Claim winnings from settled prediction rounds",
  {
    token: z
      .string()
      .describe("Token symbol (e.g. AGBETS) or token contract address"),
    epochs: z
      .array(z.number())
      .describe("Array of epoch numbers to claim (e.g. [1, 2, 3])"),
  },
  async ({ token, epochs }) => {
    const markets = await fetchMarkets(API_URL);
    const q = token.toLowerCase();
    const market = markets.find(
      m => m.symbol.toLowerCase() === q || m.token.toLowerCase() === q,
    );

    if (!market) {
      return {
        content: [{ type: "text", text: `No market found for "${token}".` }],
      };
    }

    try {
      const txHash = await claimWinnings(market.token, epochs);
      return {
        content: [
          {
            type: "text",
            text: [
              `Claimed winnings for $${market.symbol}!`,
              `Epochs: ${epochs.join(", ")}`,
              `Tx: https://basescan.org/tx/${txHash}`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Claim failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "check_claimable",
  "Check if the agent wallet has claimable winnings for a specific round",
  {
    token: z
      .string()
      .describe("Token symbol (e.g. AGBETS) or token contract address"),
    epoch: z.number().describe("Epoch number to check"),
  },
  async ({ token, epoch }) => {
    const markets = await fetchMarkets(API_URL);
    const q = token.toLowerCase();
    const market = markets.find(
      m => m.symbol.toLowerCase() === q || m.token.toLowerCase() === q,
    );

    if (!market) {
      return {
        content: [{ type: "text", text: `No market found for "${token}".` }],
      };
    }

    try {
      const canClaim = await checkClaimable(market.token, epoch);
      return {
        content: [
          {
            type: "text",
            text: canClaim
              ? `Yes — epoch ${epoch} on $${market.symbol} is claimable. Use claim_winnings to collect.`
              : `No — epoch ${epoch} on $${market.symbol} is not claimable (either not settled, lost, or already claimed).`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

// ── Start server ─────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
