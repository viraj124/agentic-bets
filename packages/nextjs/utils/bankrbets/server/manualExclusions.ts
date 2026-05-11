import type { ExclusionCode, WalletExclusionEntry } from "../seasonPoints";
import { promises as fs } from "fs";
import path from "path";
import "server-only";

type RawExclusionRow = {
  wallet: string;
  excluded?: boolean;
  flagged?: boolean; // soft flag — review status only, points not zeroed
  reason: ExclusionCode;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

const DATA_PATH = path.join(process.cwd(), "data", "season-1-exclusions.json");

export type ManualExclusionPayload = {
  excluded: Map<string, WalletExclusionEntry>;
  flagged: Set<string>;
};

let cache: { payload: ManualExclusionPayload; loadedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

async function readRows(): Promise<RawExclusionRow[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RawExclusionRow => r && typeof r === "object" && typeof r.wallet === "string" && isAddress(r.wallet),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function loadManualExclusions(): Promise<ManualExclusionPayload> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.payload;

  const rows = await readRows();
  const excluded = new Map<string, WalletExclusionEntry>();
  const flagged = new Set<string>();

  for (const row of rows) {
    const wallet = row.wallet.toLowerCase();
    if (row.excluded) {
      excluded.set(wallet, {
        reason: row.reason,
        notes: row.notes,
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt,
      });
    } else if (row.flagged) {
      flagged.add(wallet);
    }
  }

  const payload: ManualExclusionPayload = { excluded, flagged };
  cache = { payload, loadedAt: Date.now() };
  return payload;
}
