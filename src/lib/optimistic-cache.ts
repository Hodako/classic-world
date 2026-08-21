import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { writeQueryCache } from "@/lib/query-cache";

/** Update React Query cache and persist to localStorage immediately. */
export function setCachedData<T>(
  qc: QueryClient,
  queryKey: QueryKey,
  updater: T | ((prev: T | undefined) => T | undefined),
) {
  qc.setQueryData<T>(queryKey, updater);
  const next = qc.getQueryData<T>(queryKey);
  if (next !== undefined) {
    writeQueryCache(queryKey as readonly unknown[], next);
  }
}

/** Invalidate and actively refetch queries (ensures UI updates after mutations). */
export async function refreshQueries(qc: QueryClient, ...keys: QueryKey[]) {
  await Promise.all(
    keys.map(key =>
      qc.invalidateQueries({ queryKey: key }).then(() =>
        qc.refetchQueries({ queryKey: key, type: "active" }),
      ),
    ),
  );
}
