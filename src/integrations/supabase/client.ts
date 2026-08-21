// Supabase removed — using MongoDB + JWT auth instead.
// This stub prevents import errors from any lingering references.
export const supabase = new Proxy({} as any, {
  get: () => {
    throw new Error("Supabase has been removed. Use the /api/* endpoints instead.");
  },
});
