import type { BetEventInput, RoundSettlement, RoundStatus } from "../seasonPoints";
import "server-only";

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

type BetEventRow = {
  id: string;
  roundId: string;
  user: string;
  token: string;
  epoch: string;
  position: number;
  amount: string;
  placedAt: string;
  contractAddress?: string;
  contractVersion?: "v1" | "v2";
};

type RoundSettlementRow = {
  id: string;
  status: RoundStatus;
  settledAt?: string;
  contractAddress?: string;
  contractVersion?: "v1" | "v2";
};

type BetEventsResponse = {
  betEvents: {
    items: BetEventRow[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type RoundSettlementsResponse = {
  roundSettlements: { items: RoundSettlementRow[] };
};

async function ponderQuery<T>(query: string): Promise<T> {
  const res = await fetch(`${PONDER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`ponder ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message || "ponder query failed");
  return json.data as T;
}

function rowToBetEventInput(row: BetEventRow): BetEventInput {
  return {
    user: row.user.toLowerCase(),
    roundId: row.roundId,
    contractAddress: row.contractAddress?.toLowerCase(),
    contractVersion: row.contractVersion,
    token: row.token.toLowerCase(),
    epoch: Number(BigInt(row.epoch)),
    amount: BigInt(row.amount),
    placedAt: Number(BigInt(row.placedAt)),
    position: row.position === 1 ? 1 : 0,
  };
}

async function paginateBetEvents(whereClause: string): Promise<BetEventInput[]> {
  const out: BetEventInput[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const afterClause: string = cursor ? `, after: ${JSON.stringify(cursor)}` : "";
    const whereSegment = whereClause.trim().length > 0 ? `where: { ${whereClause} },` : "";
    const query = `{
      betEvents(
        ${whereSegment}
        orderBy: "placedAt",
        orderDirection: "asc",
        limit: ${PAGE_SIZE}${afterClause}
      ) {
        items { id roundId user token epoch position amount placedAt contractAddress contractVersion }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await ponderQuery<BetEventsResponse>(query);
    for (const row of data.betEvents.items) out.push(rowToBetEventInput(row));
    if (!data.betEvents.pageInfo.hasNextPage || !data.betEvents.pageInfo.endCursor) break;
    cursor = data.betEvents.pageInfo.endCursor;
  }

  return out;
}

export async function fetchBetEventsForUser(user: string, startUnix?: number): Promise<BetEventInput[]> {
  const userLower = user.toLowerCase();
  const placedAtFilter = startUnix !== undefined ? `, placedAt_gte: "${startUnix}"` : "";
  return paginateBetEvents(`user: "${userLower}"${placedAtFilter}`);
}

export async function fetchAllBetEvents(
  startUnix: number,
  { unbounded = false }: { unbounded?: boolean } = {},
): Promise<BetEventInput[]> {
  if (unbounded) return paginateBetEvents("");
  return paginateBetEvents(`placedAt_gte: "${startUnix}"`);
}

export async function fetchRoundSettlements(roundIds: string[]): Promise<Map<string, RoundSettlement>> {
  const map = new Map<string, RoundSettlement>();
  if (!roundIds.length) return map;

  const chunked: string[][] = [];
  for (let i = 0; i < roundIds.length; i += 100) chunked.push(roundIds.slice(i, i + 100));

  for (const chunk of chunked) {
    const idsLiteral = chunk.map(id => JSON.stringify(id)).join(",");
    const query = `{
      roundSettlements(where: { id_in: [${idsLiteral}] }, limit: ${chunk.length}) {
        items { id status settledAt contractAddress contractVersion }
      }
    }`;
    const data = await ponderQuery<RoundSettlementsResponse>(query);
    for (const row of data.roundSettlements.items) {
      map.set(row.id, {
        status: row.status,
        settledAt: row.settledAt ? Number(BigInt(row.settledAt)) : 0,
      });
    }
  }

  return map;
}

// Back-compat alias for older callers that only need the status map.
export async function fetchRoundStatuses(roundIds: string[]): Promise<Map<string, RoundStatus>> {
  const settlements = await fetchRoundSettlements(roundIds);
  const out = new Map<string, RoundStatus>();
  settlements.forEach((s, id) => out.set(id, s.status));
  return out;
}
