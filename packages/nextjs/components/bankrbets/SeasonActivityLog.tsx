"use client";

import { useAccount } from "wagmi";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { useSeasonPoints } from "~~/hooks/bankrbets/useSeasonPoints";
import { shortenAddress } from "~~/lib/addressDisplay";
import type { BetActivityRow, BetActivityStatus } from "~~/utils/bankrbets/seasonPoints";

const fmtUSD = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtPoints = (n: number) => n.toLocaleString();

const STATUS_LABEL: Record<BetActivityStatus, string> = {
  settled: "Settled",
  refunded: "Refunded",
  cancelled: "Cancelled",
  pending: "Pending",
};

const STATUS_TONE: Record<BetActivityStatus, string> = {
  settled: "bg-pg-mint/10 text-pg-mint border-pg-mint/25",
  refunded: "bg-pg-violet/10 text-pg-violet border-pg-violet/25",
  cancelled: "bg-pg-pink/10 text-pg-pink border-pg-pink/25",
  pending: "bg-pg-amber/10 text-[#9a7200] border-pg-amber/25",
};

function noteForRow(row: BetActivityRow): string | null {
  if (row.unlocksFirstBet) return "First-bet bonus unlocked!";
  if (!row.eligible) return row.exclusionReason;
  if (row.cappedAmountUSD > 0) {
    return `$${fmtUSD(row.cappedAmountUSD)} above daily cap`;
  }
  return null;
}

function tokenLabel(token: string, tokenSymbolMap?: Map<string, string>) {
  return tokenSymbolMap?.get(token.toLowerCase()) ?? shortenAddress(token);
}

export function SeasonActivityLog({ tokenSymbolMap }: { tokenSymbolMap?: Map<string, string> }) {
  const { address, isConnected } = useAccount();
  const { data, isLoading, error } = useSeasonPoints(isConnected ? address : undefined);

  if (!isConnected) return null;

  const activity = data?.activity ?? [];
  // Most recent first
  const sorted = [...activity].sort((a, b) => b.placedAt - a.placedAt);

  return (
    <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b-2 border-pg-border">
        <div className="flex items-center gap-2">
          <ClipboardDocumentListIcon className="h-4 w-4 text-pg-violet" />
          <h2
            className="text-sm font-extrabold text-base-content uppercase tracking-wide mb-0"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Points activity
          </h2>
        </div>
        {!isLoading && !error && sorted.length > 0 ? (
          <span className="text-[10px] font-bold text-pg-muted">
            {sorted.length} bet{sorted.length === 1 ? "" : "s"} this season
          </span>
        ) : null}
      </div>

      {isLoading && !data ? (
        <div className="px-5 py-8 text-center text-xs text-pg-muted">Loading activity…</div>
      ) : error ? (
        <div className="px-5 py-6 text-xs text-pg-pink">
          Couldn&apos;t load activity: {error instanceof Error ? error.message : "unknown error"}
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            No Season 1 activity yet
          </p>
          <p className="mt-1 text-xs text-pg-muted">Place a settled bet to start earning points.</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet — table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-base-200/40">
                <tr
                  className="text-[10px] uppercase tracking-wider text-pg-muted font-bold text-left"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  <th className="px-4 py-2 font-bold">Market</th>
                  <th className="px-4 py-2 font-bold">Epoch</th>
                  <th className="px-4 py-2 font-bold">Side</th>
                  <th className="px-4 py-2 font-bold">Amount</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold text-right">Points</th>
                  <th className="px-4 py-2 font-bold">Note</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => {
                  const note = noteForRow(row);
                  return (
                    <tr
                      key={`${row.roundId}:${row.placedAt}`}
                      className="border-t border-pg-border/40 hover:bg-pg-cream/40"
                    >
                      <td className="px-4 py-2.5 font-bold text-base-content">
                        {tokenLabel(row.token, tokenSymbolMap)}
                      </td>
                      <td className="px-4 py-2.5 text-pg-muted">{row.epoch}</td>
                      <td className="px-4 py-2.5 text-pg-muted">{row.position === 0 ? "Up" : "Down"}</td>
                      <td className="px-4 py-2.5 font-bold text-base-content">${fmtUSD(row.amountUSD)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[row.roundStatus]}`}
                        >
                          {STATUS_LABEL[row.roundStatus]}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-bold ${row.pointsEarned > 0 ? "text-pg-violet" : "text-pg-muted"}`}
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {row.pointsEarned > 0 ? `+${fmtPoints(row.pointsEarned)}` : "0"}
                      </td>
                      <td className="px-4 py-2.5 text-pg-muted">{note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards */}
          <div className="sm:hidden divide-y-2 divide-pg-border/40">
            {sorted.map(row => {
              const note = noteForRow(row);
              return (
                <div key={`m:${row.roundId}:${row.placedAt}`} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-base-content">
                      {tokenLabel(row.token, tokenSymbolMap)}{" "}
                      <span className="text-[10px] text-pg-muted font-medium">
                        · ep {row.epoch} · {row.position === 0 ? "Up" : "Down"}
                      </span>
                    </span>
                    <span
                      className={`text-sm font-extrabold ${row.pointsEarned > 0 ? "text-pg-violet" : "text-pg-muted"}`}
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {row.pointsEarned > 0 ? `+${fmtPoints(row.pointsEarned)}` : "0"} pts
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-pg-muted">${fmtUSD(row.amountUSD)}</span>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[row.roundStatus]}`}
                    >
                      {STATUS_LABEL[row.roundStatus]}
                    </span>
                  </div>
                  {note ? <p className="text-[11px] text-pg-muted leading-snug">{note}</p> : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
