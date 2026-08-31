/** Trigger a CSV file download in the browser. Supports (filename, headers, rows) or (filename, arrayOfObjects). */
export function downloadCsv(
  filename: string,
  headersOrObjects: string[] | Record<string, any>[],
  maybeRows?: (string | number)[][]
) {
  let headers: string[] = [];
  let rows: (string | number)[][] = [];

  if (Array.isArray(headersOrObjects) && headersOrObjects.length > 0 && typeof headersOrObjects[0] === "object" && !Array.isArray(headersOrObjects[0])) {
    // Array of objects format
    const objList = headersOrObjects as Record<string, any>[];
    headers = Object.keys(objList[0] || {});
    rows = objList.map(obj => headers.map(h => obj[h] ?? ""));
  } else if (Array.isArray(headersOrObjects) && maybeRows) {
    // Standard (headers, rows) format
    headers = headersOrObjects as string[];
    rows = maybeRows;
  } else if (Array.isArray(headersOrObjects) && headersOrObjects.length === 0) {
    headers = [];
    rows = [];
  }

  const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format ISO date for export filenames. */
export function exportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}
