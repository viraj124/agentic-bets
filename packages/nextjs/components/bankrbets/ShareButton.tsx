"use client";

export interface BetCardParams {
  token: string;
  side: "UP" | "DOWN";
  amount: string;
  outcome: "won" | "lost" | "pending" | "claimed";
  payout?: string;
  price?: string;
  img?: string;
  marketToken?: string; // contract address for redirect
}

interface ShareButtonProps {
  message: string;
  /** When provided, attaches a shareable bet card link with OG image preview */
  betCard?: BetCardParams;
}

function buildBetCardUrl(params: BetCardParams): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000";

  const query = new URLSearchParams();
  query.set("token", params.token);
  query.set("side", params.side);
  query.set("amount", params.amount);
  query.set("outcome", params.outcome);
  if (params.payout) query.set("payout", params.payout);
  if (params.price) query.set("price", params.price);
  if (params.img) query.set("img", params.img);
  if (params.marketToken) query.set("marketToken", params.marketToken);

  return `${base}/bet/card?${query.toString()}`;
}

export function ShareButton({ message, betCard }: ShareButtonProps) {
  const shareText = betCard ? `${message}\n\n${buildBetCardUrl(betCard)}` : message;

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <a
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-sm font-bold text-white bg-pg-violet hover:bg-pg-violet/90 rounded-xl px-4 py-2 transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share Bet
    </a>
  );
}
