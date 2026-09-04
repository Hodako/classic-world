import type { CashboxEntry } from "@/lib/queries";

export type CashboxKind = CashboxEntry["kind"];

/** Signed amount for balance: inflows positive, outflows negative. Safe against NaN/null/string/negative values. */
export function cashboxDelta(kind: CashboxKind, amount: number | string | null | undefined): number {
  const n = Math.abs(parseFloat(String(amount ?? 0)) || 0);
  return kind === "deposit" || kind === "sale" ? n : -n;
}

/** Sum all cashbox entries into current balance. Uses rounded arithmetic to avoid JS float errors. */
export function cashboxBalance(entries: Pick<CashboxEntry, "kind" | "amount">[]): number {
  const raw = entries.reduce((sum, e) => sum + cashboxDelta(e.kind, e.amount), 0);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

/** Human label key suffix for a cashbox entry kind. */
export function cashboxKindLabel(kind: CashboxKind): "deposit" | "withdraw" | "sale" | "expense" {
  if (kind === "sale") return "sale";
  if (kind === "expense") return "expense";
  return kind === "deposit" ? "deposit" : "withdraw";
}
