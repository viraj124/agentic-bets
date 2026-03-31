import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Cron job to keep the bankr-tokens cache warm.
 * Runs every 4 minutes so users always get fully-enriched data
 * (with real volume from DexScreener/GeckoTerminal) instead of
 * bootstrap data with $0 volumes.
 */
export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Hit the bankr-tokens endpoint with refresh=1 to trigger a full rebuild
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/bankr-tokens?refresh=1`, {
    signal: AbortSignal.timeout(55_000),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json({
    ok: res.ok,
    count: data.count ?? 0,
    updatedAt: data.updatedAt ?? null,
  });
}
