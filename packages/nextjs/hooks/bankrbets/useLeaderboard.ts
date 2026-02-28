import { useEffect, useState } from "react";

export interface LeaderboardEntry {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

type UseLeaderboardOptions = {
  address?: string;
  watch?: boolean;
};

export function useLeaderboard({ watch = false }: UseLeaderboardOptions = {}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/leaderboard");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setLeaderboard(Array.isArray(json.leaderboard) ? json.leaderboard : []);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (watch) {
      interval = setInterval(load, 2 * 60_000); // re-fetch every 2 min when watching
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [watch]);

  return { leaderboard, isLoading };
}
