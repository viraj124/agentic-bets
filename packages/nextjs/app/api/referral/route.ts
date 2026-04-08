import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getEnrichedBetsCached } from "~~/utils/bankrbets/server/derivedStats";
import { getReferralsByReferrer, registerReferral } from "~~/utils/bankrbets/server/referralStore";

/**
 * POST /api/referral — register a referral (called once per referred user on wallet connect)
 * Body: { referee: "0x…", referrer: "0x…" }
 */
export async function POST(req: NextRequest) {
  let body: { referee?: string; referrer?: string };

  try {
    body = (await req.json()) as { referee?: string; referrer?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { referee, referrer } = body;

  if (!referee || !referrer || !isAddress(referee) || !isAddress(referrer)) {
    return NextResponse.json({ error: "Invalid addresses" }, { status: 400 });
  }

  try {
    const result = await registerReferral(referee, referrer);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to register referral", error);
    return NextResponse.json({ error: "Referral store unavailable" }, { status: 503 });
  }
}

/**
 * GET /api/referral?referrer=0x… — get referral stats for a referrer
 * Returns: referral count, list of referees, referred volume, estimated reward
 */
export async function GET(req: NextRequest) {
  const referrer = req.nextUrl.searchParams.get("referrer");

  if (!referrer || !isAddress(referrer)) {
    return NextResponse.json({ error: "Invalid referrer address" }, { status: 400 });
  }

  let referrals;
  try {
    referrals = await getReferralsByReferrer(referrer);
  } catch (error) {
    console.error("Failed to fetch referral stats", error);
    return NextResponse.json({ error: "Referral store unavailable" }, { status: 503 });
  }

  const refereeAddresses = new Set(referrals.map(r => r.referee));

  let totalReferredVolume = 0;
  let totalReferredBets = 0;

  if (refereeAddresses.size > 0) {
    try {
      const enrichedBets = await getEnrichedBetsCached();
      for (const bet of enrichedBets) {
        if (refereeAddresses.has(bet.user)) {
          totalReferredVolume += bet.amount;
          totalReferredBets += 1;
        }
      }
    } catch {
      // If enriched data is unavailable, return zero volume
    }
  }

  return NextResponse.json(
    {
      referrer: referrer.toLowerCase(),
      referralCount: referrals.length,
      referees: referrals.map(r => ({ address: r.referee, createdAt: r.createdAt })),
      totalReferredVolume,
      totalReferredBets,
      estimatedReward: totalReferredVolume * 0.005, // 0.5% of referred volume
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
