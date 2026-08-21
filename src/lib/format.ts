export function fmtMoney(n: number | string | null | undefined): string {
  const num = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(num)) return "৳0";
  return "৳" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}