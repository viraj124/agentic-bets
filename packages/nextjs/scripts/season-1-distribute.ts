/**
 * Season 1 $AGBETS distribution generator (manual / Disperse-friendly).
 *
 * Reads a Season 1 snapshot ({ manifest, summary, activity, exclusions, merkleDraft })
 * produced by GET /api/season-1/export?type=all, fetches the treasury balance on Base,
 * computes a linear pro-rata distribution of POOL_BPS basis points of that balance,
 * drops wallets below MIN_DUST_HUMAN, and writes:
 *   - season-1-distribution.csv  (address,amount in human units — Disperse paste-ready)
 *   - season-1-distribution.json (full audit log with wei + pct + ranks)
 *
 * Usage:
 *   npx tsx scripts/season-1-distribute.ts [path/to/season-1-snapshot.json]
 *
 * Env overrides:
 *   POOL_BPS     basis points of treasury to distribute. default 5000 (= 50%)
 *   MIN_DUST     minimum AGBETS payout, in whole tokens. default 1
 *   AGBETS_RPC   custom RPC URL. default https://mainnet.base.org
 */
import { promises as fs } from "fs";
import path from "path";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { base } from "viem/chains";

const AGBETS = "0x37d183FCf1DA460a64D21E754b3E6144C4e11BA3" as const;
const TREASURY = "0x2876540f274b39786d1ff034dbed8dc41fea5024" as const;

const POOL_BPS = BigInt(process.env.POOL_BPS ?? 5_000);
const MIN_DUST_HUMAN = BigInt(process.env.MIN_DUST ?? 1);
const RPC_URL = process.env.AGBETS_RPC ?? "https://mainnet.base.org";

const snapshotPath = path.resolve(process.argv[2] ?? "season-1-snapshot.json");

type SummaryRow = {
  wallet: string;
  totalPointsE6: string;
  rank: number | null;
  excluded: boolean;
};

type Snapshot = {
  manifest: { seasonId: number; generatedAt: string; gitCommit: string | null };
  summary: SummaryRow[];
};

async function main() {
  const raw = await fs.readFile(snapshotPath, "utf8");
  const snap = JSON.parse(raw) as Snapshot;

  const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

  const [balance, decimalsRaw] = await Promise.all([
    client.readContract({ address: AGBETS, abi: erc20Abi, functionName: "balanceOf", args: [TREASURY] }),
    client.readContract({ address: AGBETS, abi: erc20Abi, functionName: "decimals" }),
  ]);
  const decimals = Number(decimalsRaw);
  const decimalsBig = 10n ** BigInt(decimals);

  const pool = (balance * POOL_BPS) / 10_000n;
  const minDustWei = MIN_DUST_HUMAN * decimalsBig;

  const eligible = snap.summary
    .filter(r => !r.excluded && BigInt(r.totalPointsE6) > 0n)
    .map(r => ({ wallet: r.wallet.toLowerCase(), points: BigInt(r.totalPointsE6), rank: r.rank }));

  const totalPoints = eligible.reduce((a, r) => a + r.points, 0n);
  if (totalPoints === 0n) throw new Error("snapshot has zero eligible points — nothing to distribute");

  const enriched = eligible.map(r => {
    const amount = (r.points * pool) / totalPoints;
    const sharePct = Number((r.points * 1_000_000n) / totalPoints) / 10_000;
    return { ...r, amount, sharePct };
  });

  const distributedRows = enriched
    .filter(r => r.amount >= minDustWei)
    .sort((a, b) => (b.amount === a.amount ? a.wallet.localeCompare(b.wallet) : b.amount > a.amount ? 1 : -1));
  const droppedRows = enriched.filter(r => r.amount < minDustWei);

  const distributedWei = distributedRows.reduce((a, r) => a + r.amount, 0n);
  const unallocatedWei = pool - distributedWei;

  const csv = ["address,amount"]
    .concat(distributedRows.map(r => `${r.wallet},${formatUnits(r.amount, decimals)}`))
    .join("\n");

  const audit = {
    seasonId: snap.manifest.seasonId,
    snapshotGeneratedAt: snap.manifest.generatedAt,
    snapshotGitCommit: snap.manifest.gitCommit,
    distributionGeneratedAt: new Date().toISOString(),
    token: { address: AGBETS.toLowerCase(), decimals, symbol: "AGBETS" },
    treasury: TREASURY.toLowerCase(),
    chainId: 8453,
    policy: {
      curve: "linear-prorata",
      poolBps: Number(POOL_BPS),
      minDustHuman: Number(MIN_DUST_HUMAN),
    },
    balances: {
      treasuryWei: balance.toString(),
      treasuryHuman: formatUnits(balance, decimals),
      poolWei: pool.toString(),
      poolHuman: formatUnits(pool, decimals),
    },
    totals: {
      totalPointsE6: totalPoints.toString(),
      walletsEligible: eligible.length,
      walletsDistributed: distributedRows.length,
      walletsDroppedDust: droppedRows.length,
      distributedWei: distributedWei.toString(),
      distributedHuman: formatUnits(distributedWei, decimals),
      unallocatedWei: unallocatedWei.toString(),
      unallocatedHuman: formatUnits(unallocatedWei, decimals),
    },
    rows: distributedRows.map(r => ({
      wallet: r.wallet,
      rank: r.rank,
      pointsE6: r.points.toString(),
      sharePct: r.sharePct,
      amountWei: r.amount.toString(),
      amountHuman: formatUnits(r.amount, decimals),
    })),
    dropped: droppedRows.map(r => ({
      wallet: r.wallet,
      rank: r.rank,
      pointsE6: r.points.toString(),
      sharePct: r.sharePct,
      amountWei: r.amount.toString(),
      amountHuman: formatUnits(r.amount, decimals),
    })),
  };

  await fs.writeFile(path.resolve("season-1-distribution.csv"), csv);
  await fs.writeFile(path.resolve("season-1-distribution.json"), JSON.stringify(audit, null, 2));

  console.log("");
  console.log(`Snapshot:               ${snapshotPath}`);
  console.log(`Treasury balance:       ${formatUnits(balance, decimals)} AGBETS`);
  console.log(`Pool (${Number(POOL_BPS) / 100}%):           ${formatUnits(pool, decimals)} AGBETS`);
  console.log(`Eligible wallets:       ${eligible.length}`);
  console.log(`Distributed:            ${distributedRows.length}`);
  console.log(`Dropped (< ${MIN_DUST_HUMAN} AGBETS): ${droppedRows.length}`);
  console.log(`Total distributed:      ${formatUnits(distributedWei, decimals)} AGBETS`);
  console.log(`Unallocated dust:       ${formatUnits(unallocatedWei, decimals)} AGBETS`);
  console.log("");
  console.log("Top 10:");
  distributedRows.slice(0, 10).forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2, " ")}. ${r.wallet}  ${formatUnits(r.amount, decimals).padStart(14, " ")} AGBETS  (${r.sharePct.toFixed(4)}%)`,
    );
  });
  console.log("");
  console.log(`Wrote: season-1-distribution.csv`);
  console.log(`Wrote: season-1-distribution.json`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
