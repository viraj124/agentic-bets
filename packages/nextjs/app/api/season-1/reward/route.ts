import { NextResponse } from "next/server";
import { SEASON_REWARD_META, getSeasonReward } from "~~/utils/bankrbets/seasonReward";

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address")?.toLowerCase();

  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }

  const reward = getSeasonReward(address);

  return NextResponse.json(
    { reward, meta: SEASON_REWARD_META },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
  );
}
