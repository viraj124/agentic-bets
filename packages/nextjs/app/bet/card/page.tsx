import { BetCardView } from "./BetCardView";
import type { Metadata } from "next";

/**
 * Shareable bet card page — OG meta tags for Twitter/Farcaster unfurling,
 * plus an animated card view before redirecting to the market.
 */

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const token = params.token || "TOKEN";
  const side = (params.side || "UP").toUpperCase();
  const amount = params.amount || "0";
  const outcome = params.outcome || "pending";
  const payout = params.payout || "";
  const img = params.img || "";
  const marketToken = params.marketToken || "";

  const isWon = outcome === "won" || outcome === "claimed";
  const isLost = outcome === "lost";

  let title: string;
  if (isWon && payout) {
    title = `Won $${payout} USDC betting ${side} on $${token}!`;
  } else if (isLost) {
    title = `Bet $${amount} USDC ${side} on $${token}`;
  } else {
    title = `Betting $${amount} USDC ${side} on $${token}`;
  }

  const description = isWon
    ? `Just won ${payout ? `$${payout}` : ""} on AgenticBets — predict token prices on Base.`
    : `${side} bet on $${token} on AgenticBets — predict token prices in 5-minute rounds on Base.`;

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

  const ogParams = new URLSearchParams();
  ogParams.set("token", token);
  ogParams.set("side", side);
  ogParams.set("amount", amount);
  ogParams.set("outcome", outcome);
  if (payout) ogParams.set("payout", payout);
  if (img) ogParams.set("img", img);
  if (marketToken) ogParams.set("marketToken", marketToken);

  const ogImageUrl = `${baseUrl}/api/og/bet-card?${ogParams.toString()}`;

  return {
    title: `${title} | AgenticBets`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      siteName: "AgenticBets",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function BetCardPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <BetCardView
      token={params.token || "TOKEN"}
      side={(params.side || "UP").toUpperCase() as "UP" | "DOWN"}
      amount={params.amount || "0"}
      outcome={(params.outcome as "won" | "lost" | "pending" | "claimed") || "pending"}
      payout={params.payout}
      img={params.img}
      marketToken={params.marketToken}
    />
  );
}
