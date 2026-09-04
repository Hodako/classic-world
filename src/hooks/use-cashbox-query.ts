import { useQuery } from "@tanstack/react-query";
import { getCashbox } from "@/lib/queries";
import type { CashboxEntry } from "@/lib/queries";

export function useCashboxQuery() {
  return useQuery<CashboxEntry[]>({
    queryKey: ["cashbox"],
    queryFn: getCashbox,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 3000, // Poll every 3 seconds for real-time database sync
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });
}
