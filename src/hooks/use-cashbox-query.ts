import { useQuery } from "@tanstack/react-query";
import { getCashbox } from "@/lib/queries";
import type { CashboxEntry } from "@/lib/queries";

export function useCashboxQuery() {
  return useQuery<CashboxEntry[]>({
    queryKey: ["cashbox"],
    queryFn: getCashbox,
    staleTime: 5000,
    gcTime: 60 * 1000,
    refetchInterval: 10000, // Poll every 10 seconds for real-time database sync
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });
}
