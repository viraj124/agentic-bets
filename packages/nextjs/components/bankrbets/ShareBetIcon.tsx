"use client";

import type { BetCardParams } from "./ShareButton";

interface ShareBetIconProps {
  token: string;
  side: "UP" | "DOWN";
  amount: string;
  outcome: BetCardParams["outcome"];
  payout?: string;
  img?: string;
  marketToken?: string;
}

function buildShareUrl(params: ShareBetIconProps): string {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const query = new URLSearchParams();
  query.set("token", params.token);
  query.set("side", params.side);
  query.set("amount", params.amount);
  query.set("outcome", params.outcome);
  if (params.payout) query.set("payout", params.payout);
  if (params.img) query.set("img", params.img);
  if (params.marketToken) query.set("marketToken", params.marketToken);
  return `${base}/bet/card?${query.toString()}`;
}

function buildMessage(params: ShareBetIconProps): string {
  const isWon = params.outcome === "won" || params.outcome === "claimed";
  if (isWon && params.payout) {
    return `I just won $${params.payout} USDC betting ${params.side} on $${params.token} on AgenticBets!`;
  }
  if (isWon) {
    return `I just won my ${params.side} bet on $${params.token} on AgenticBets!`;
  }
  return `I bet $${params.amount} ${params.side} on $${params.token} on AgenticBets!`;
}

export function ShareBetIcon(props: ShareBetIconProps) {
  const cardUrl = buildShareUrl(props);
  const message = buildMessage(props);
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${message}\n\n${cardUrl}`)}`;

  return (
    <a
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="Share on X"
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-pg-violet/10 hover:bg-pg-violet/20 text-pg-violet/60 hover:text-pg-violet transition-colors shrink-0"
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  );
}
