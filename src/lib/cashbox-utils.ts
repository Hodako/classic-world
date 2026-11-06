import type { CashboxEntry } from "@/lib/queries";

export type CashboxKind = CashboxEntry["kind"];

/** Signed amount for balance: inflows positive, outflows negative. Safe against NaN/null/string/negative values. */
export function cashboxDelta(kind: string | null | undefined, amount: number | string | null | undefined): number {
  const n = Math.abs(parseFloat(String(amount ?? 0)) || 0);
  const k = String(kind || "").toLowerCase().trim();
  const isPositive = k === "deposit" || k === "sale" || k === "cash_in" || k === "in" || k === "add";
  return isPositive ? n : -n;
}

/** Sum all cashbox entries into current balance. Uses rounded arithmetic to avoid JS float errors. */
export function cashboxBalance(entries: { kind?: any; amount: number | string | null | undefined }[]): number {
  if (!Array.isArray(entries)) return 0;
  const raw = entries.reduce((sum, e) => sum + cashboxDelta(e?.kind, e?.amount), 0);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

/** Human label key suffix for a cashbox entry kind. */
export function cashboxKindLabel(kind: string | null | undefined): "deposit" | "withdraw" | "sale" | "expense" {
  const k = String(kind || "").toLowerCase().trim();
  if (k === "sale") return "sale";
  if (k === "expense") return "expense";
  if (k === "deposit" || k === "cash_in" || k === "add" || k === "in") return "deposit";
  return "withdraw";
}
