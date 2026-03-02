import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

export const maxDuration = 15;

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";

export async function GET(req: NextRequest) {
  const userAddress = req.nextUrl.searchParams.get("address");
  if (!userAddress || !isAddress(userAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const id = userAddress.toLowerCase();

  try {
    const res = await fetch(`${PONDER_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ userStats(id: "${id}") { id totalBets totalWagered totalWon wins } }`,
      }),
    });

    if (!res.ok) return NextResponse.json({ stats: null });

    const json = await res.json();
    const row = json.data?.userStats as {
      id: string;
      totalBets: number;
      totalWagered: string;
      totalWon: string;
      wins: number;
    } | null;

    if (!row) return NextResponse.json({ stats: null });

    const wagered = Number(BigInt(row.totalWagered)) / 1e6;
    const won = Number(BigInt(row.totalWon)) / 1e6;

    return NextResponse.json(
      {
        stats: {
          address: row.id,
          totalBets: row.totalBets,
          totalWagered: wagered,
          totalWon: won,
          netPnL: won - wagered,
          wins: row.wins,
          winRate: row.totalBets > 0 ? (row.wins / row.totalBets) * 100 : 0,
        },
      },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json({ stats: null });
  }
}
