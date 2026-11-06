export function fmtMoney(n: number | string | null | undefined): string {
  let val = n;
  if (typeof val === "string") {
    val = val.replace(/^[৳$Tk.\s]+/i, "").replace(/,/g, "").trim();
  }
  const num = typeof val === "string" ? Number(val) : (val ?? 0);
  if (!Number.isFinite(num)) return "৳0";
  return "৳" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtDate(d: string | Date | number | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function fmtDateTime(d: string | Date | number | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}