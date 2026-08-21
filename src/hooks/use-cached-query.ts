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
    staleTime: 30 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    ...options,
  });
}
