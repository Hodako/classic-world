import { useQuery, keepPreviousData, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";
import { readQueryCache, writeQueryCache } from "@/lib/query-cache";

/**
 * useQuery wrapper that hydrates from localStorage and persists on success.
 * Improves perceived load speed on repeat visits.
 */
export function useCachedQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">,
) {
  const cached = readQueryCache<T>(queryKey as readonly unknown[]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const data = await queryFn();
        // Accounting data integrity safeguard:
        // Never overwrite a valid cached list with an empty array if the device is offline
        if (
          typeof window !== "undefined" &&
          !navigator.onLine &&
          Array.isArray(data) &&
          data.length === 0
        ) {
          const cachedData = readQueryCache<T>(queryKey as readonly unknown[]);
          if (Array.isArray(cachedData) && cachedData.length > 0) {
            console.warn("Device is offline, preserving existing non-empty cache for:", queryKey);
            return cachedData;
          }
        }
        writeQueryCache(queryKey as readonly unknown[], data);
        return data;
      } catch (err) {
        const cachedData = readQueryCache<T>(queryKey as readonly unknown[]);
        if (cachedData !== undefined) {
          console.warn("Network query failed, using offline cache fallback:", queryKey, err);
          return cachedData;
        }
        throw err;
      }
    },
    initialData: cached,
    initialDataUpdatedAt: cached ? Date.now() - 1000 : undefined,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 15000, // 15-second heartbeat for real-time syncing without overwhelming network
    refetchIntervalInBackground: false,
    ...options,
  });
}
