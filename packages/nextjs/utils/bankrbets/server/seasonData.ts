import type { BetEventInput, RoundStatus } from "../seasonPoints";
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
};

type RoundSettlementRow = {
  id: string;
  status: RoundStatus;
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
    const query = `{
      betEvents(
        where: { ${whereClause} },
        orderBy: "placedAt",
        orderDirection: "asc",
        limit: ${PAGE_SIZE}${afterClause}
      ) {
        items { id roundId user token epoch position amount placedAt }
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

export async function fetchAllBetEvents(startUnix: number): Promise<BetEventInput[]> {
  return paginateBetEvents(`placedAt_gte: "${startUnix}"`);
}

export async function fetchRoundStatuses(roundIds: string[]): Promise<Map<string, RoundStatus>> {
  const map = new Map<string, RoundStatus>();
  if (!roundIds.length) return map;

  // Ponder GraphQL supports id_in for batch fetch
  const chunked: string[][] = [];
  for (let i = 0; i < roundIds.length; i += 100) chunked.push(roundIds.slice(i, i + 100));

  for (const chunk of chunked) {
    const idsLiteral = chunk.map(id => JSON.stringify(id)).join(",");
    const query = `{
      roundSettlements(where: { id_in: [${idsLiteral}] }, limit: ${chunk.length}) {
        items { id status }
      }
    }`;
    const data = await ponderQuery<RoundSettlementsResponse>(query);
    for (const row of data.roundSettlements.items) {
      map.set(row.id, row.status);
    }
  }

  return map;
}
