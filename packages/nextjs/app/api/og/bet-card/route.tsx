import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { AgenticBetsLogo } from "~~/components/assets/AgenticBetsLogo";

export const runtime = "edge";

async function resolveTokenImage(origin: string, tokenSymbol?: string, marketToken?: string, fallbackImg?: string) {
  const explicitTokenImg = fallbackImg && fallbackImg !== "undefined" && fallbackImg !== "null" ? fallbackImg : "";
  if (explicitTokenImg) return explicitTokenImg;

  const normalizedTokenSymbol = tokenSymbol?.trim().replace(/^\$/, "").toUpperCase() || "";
  if (!marketToken && !normalizedTokenSymbol) return "";

  if (marketToken) {
    try {
      const url = new URL("/api/pool-data", origin);
      url.searchParams.set("token", marketToken.toLowerCase());
      const res = await fetch(url.toString(), { next: { revalidate: 120 } });
      if (!res.ok) return "";
      const json = await res.json();
      const poolImage = typeof json?.imageUrl === "string" ? json.imageUrl : "";
      if (poolImage) return poolImage;
    } catch {
      // fall through to token list fallback
    }
  }

  try {
    const url = new URL("/api/bankr-tokens", origin);
    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) return "";
    const json = await res.json();
    const match = Array.isArray(json?.tokens)
      ? json.tokens.find((t: any) => {
          const addressMatches =
            !!marketToken && typeof t?.address === "string" && t.address.toLowerCase() === marketToken.toLowerCase();
          const symbolMatches =
            typeof t?.symbol === "string" && t.symbol.trim().replace(/^\$/, "").toUpperCase() === normalizedTokenSymbol;
          return addressMatches || symbolMatches;
        })
      : null;
    return typeof match?.imgUrl === "string" ? match.imgUrl : "";
  } catch {
    return "";
  }
}

/**
 * Generates a compact shareable bet card image for social media previews.
 *
 * Query params:
 *  - token:     Token symbol (e.g. "DEGEN")
 *  - side:      "UP" or "DOWN"
 *  - amount:    Bet amount in USDC (e.g. "50.00")
 *  - outcome:   "won" | "lost" | "pending" | "claimed"
 *  - payout:    Payout amount if won/claimed (e.g. "95.00")
 *  - price:     Token price when bet was placed (e.g. "$0.0₄231")
 *  - img:       Token image URL (optional)
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const token = params.get("token") || "TOKEN";
  const side = (params.get("side") || "UP").toUpperCase();
  const amount = params.get("amount") || "0";
  const outcome = params.get("outcome") || "pending";
  const payout = params.get("payout") || "";
  const img = params.get("img") || "";
  const marketToken = params.get("marketToken") || "";
  const resolvedTokenImg = await resolveTokenImage(req.nextUrl.origin, token, marketToken, img);

  const isUp = side === "UP";
  const isWon = outcome === "won" || outcome === "claimed";
  const isLost = outcome === "lost";

  // Theme colors
  const mint = "#34D399";
  const pink = "#F472B6";
  const slate = "#0F172A";
  const darkBg = "#111827";
  const cardBg = "#1A1F2E";
  const cardBorder = "#2A3040";
  const mutedText = "#94A3B8";

  const sideColor = isUp ? mint : pink;
  const outcomeColor = isWon ? mint : isLost ? pink : "#FBBF24";
  const outcomeLabel = isWon ? (outcome === "claimed" ? "CLAIMED" : "WON") : isLost ? "LOST" : "PENDING";

  // Profit for wins
  const profit = isWon && payout && amount ? (parseFloat(payout) - parseFloat(amount)).toFixed(2) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200",
          height: "630",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: darkBg,
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background pattern — subtle grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage: `radial-gradient(circle at 1px 1px, ${cardBorder} 1px, transparent 0)`,
            backgroundSize: "40px 40px",
            opacity: 0.4,
          }}
        />

        {/* Ambient glow behind card */}
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${sideColor}18 0%, transparent 70%)`,
            display: "flex",
          }}
        />

        {/* ═══ Main Card ═══ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "680px",
            backgroundColor: cardBg,
            borderRadius: "32px",
            border: `2px solid ${cardBorder}`,
            boxShadow: `0 0 60px ${sideColor}10`,
            overflow: "hidden",
          }}
        >
          {/* ─── Card header: branding + outcome ─── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "24px 32px",
              borderBottom: `1px solid ${cardBorder}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <AgenticBetsLogo style={{ width: "100%", height: "100%" }} />
              </div>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#E2E8F0",
                  letterSpacing: "-0.3px",
                }}
              >
                AgenticBets
              </span>
            </div>

            {/* Outcome pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: `${outcomeColor}18`,
                border: `1.5px solid ${outcomeColor}60`,
                borderRadius: "20px",
                padding: "6px 16px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: outcomeColor,
                  display: "flex",
                }}
              />
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 800,
                  color: outcomeColor,
                  letterSpacing: "1.5px",
                }}
              >
                {outcomeLabel}
              </span>
            </div>
          </div>

          {/* ─── Card body: token + bet info ─── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "28px 32px 24px",
              gap: "24px",
            }}
          >
            {/* Token row: logo + name + direction */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {/* Token logo */}
                {resolvedTokenImg ? (
                  <img
                    src={resolvedTokenImg}
                    alt={token}
                    width={56}
                    height={56}
                    style={{
                      borderRadius: "16px",
                      border: `2px solid ${cardBorder}`,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "16px",
                      backgroundColor: `${sideColor}15`,
                      border: `2px solid ${cardBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                      fontWeight: 800,
                      color: sideColor,
                    }}
                  >
                    {token.charAt(0)}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: "32px",
                      fontWeight: 800,
                      color: "#F1F5F9",
                      letterSpacing: "-0.5px",
                      lineHeight: 1.1,
                    }}
                  >
                    ${token}
                  </span>
                </div>
              </div>

              {/* Direction badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: `${sideColor}15`,
                  border: `2px solid ${sideColor}50`,
                  borderRadius: "16px",
                  padding: "10px 20px",
                }}
              >
                <span style={{ fontSize: "24px" }}>{isUp ? "▲" : "▼"}</span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: sideColor,
                  }}
                >
                  {side}
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "flex",
                gap: "16px",
              }}
            >
              {/* Wager */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  backgroundColor: `${slate}80`,
                  borderRadius: "16px",
                  padding: "16px 20px",
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: mutedText,
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                    marginBottom: "4px",
                  }}
                >
                  Wager
                </span>
                <span
                  style={{
                    fontSize: "28px",
                    fontWeight: 800,
                    color: "#F1F5F9",
                    letterSpacing: "-0.5px",
                  }}
                >
                  ${amount}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: mutedText,
                  }}
                >
                  USDC
                </span>
              </div>

              {/* Payout / Result */}
              {isWon && payout ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    backgroundColor: `${mint}10`,
                    borderRadius: "16px",
                    padding: "16px 20px",
                    border: `1px solid ${mint}30`,
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: mint,
                      textTransform: "uppercase",
                      letterSpacing: "1.5px",
                      marginBottom: "4px",
                    }}
                  >
                    Payout
                  </span>
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: 800,
                      color: mint,
                      letterSpacing: "-0.5px",
                    }}
                  >
                    ${payout}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: `${mint}cc`,
                    }}
                  >
                    {profit && parseFloat(profit) > 0 ? `+$${profit} profit` : "USDC"}
                  </span>
                </div>
              ) : isLost ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    backgroundColor: `${pink}10`,
                    borderRadius: "16px",
                    padding: "16px 20px",
                    border: `1px solid ${pink}30`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: 800,
                      color: pink,
                    }}
                  >
                    -${amount}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: `${pink}cc`,
                    }}
                  >
                    USDC
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    backgroundColor: `${slate}80`,
                    borderRadius: "16px",
                    padding: "16px 20px",
                    border: `1px solid ${cardBorder}`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#FBBF24",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Awaiting result...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
