/** Usable thermal head width is smaller than the physical roll. */
export function getPrintableWidthMm(widthMm: number): number {
  if (widthMm >= 148) return widthMm;
  if (widthMm >= 80) return Math.min(72, widthMm - 6);
  if (widthMm >= 70) return Math.min(63, widthMm - 6);
  if (widthMm >= 56) return Math.min(48, widthMm - 8);
  if (widthMm >= 48) return Math.min(42, widthMm - 6);
  return Math.max(1, widthMm - 4);
}
export function getPrintScale(value: number): number {
  return Math.max(20, Math.min(250, Number(value) || 100));
}

/** Rewrite earlier page rules to ensure continuous thermal roll paper */
export function setReceiptPageSize(doc: Document, widthMm: number, heightMm?: number): void {
  const size = heightMm && heightMm > 0 ? `${widthMm}mm ${heightMm}mm` : `${widthMm}mm auto`;
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule.type === 6) (rule as CSSPageRule).style.setProperty("size", size, "important");
      }
    } catch { /* External sheets may not permit CSSOM access. */ }
  }
  const style = doc.createElement("style");
  style.textContent = "@page { size: " + size + " !important; margin: 0 !important; }";
  doc.head.appendChild(style);
}
