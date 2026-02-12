import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export type ResolvedIdentity = {
  address: string;
  ensName?: string | null;
  ensAvatar?: string | null;
  baseName?: string | null;
  baseAvatar?: string | null;
  weiName?: string | null;
};

export function useResolvedAddresses(addresses: string[] | undefined) {
  const normalized = useMemo(() => {
    if (!addresses || addresses.length === 0) return [];
    const set = new Set(addresses.map(a => a.toLowerCase()));
    return Array.from(set);
  }, [addresses]);

  const query = useQuery({
    queryKey: ["resolve-addresses", normalized.join(",")],
    queryFn: async () => {
      const res = await fetch("/api/resolve-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: normalized }),
      });
      if (!res.ok) return [] as ResolvedIdentity[];
      const json = (await res.json()) as { data?: ResolvedIdentity[] };
      return json.data || [];
    },
    enabled: normalized.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 2 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  const map = useMemo(() => {
    const entries = (query.data || []).map(item => [item.address.toLowerCase(), item] as const);
    return new Map(entries);
  }, [query.data]);

  return { data: map, isLoading: query.isLoading };
}
