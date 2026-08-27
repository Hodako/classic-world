/**
 * WhatsApp Share and Customer Communication Utilities (Classic World)
 */

export interface InvoiceShareData {
  invoiceNo: string;
  customerName?: string;
  customerPhone?: string;
  shopName?: string;
  shopPhone?: string;
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  discount?: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod?: string;
  date?: string;
}

export function generateWhatsAppInvoiceText(data: InvoiceShareData, lang: "bn" | "en" = "bn"): string {
  const shop = data.shopName || "Classic World";
  const date = data.date || new Date().toLocaleDateString("en-GB");
  const phone = data.shopPhone ? `\n📞 হেল্পলাইন: ${data.shopPhone}` : "";

  if (lang === "bn") {
    let itemsText = "";
    data.items.forEach((it, idx) => {
      itemsText += `\n${idx + 1}. ${it.name} (x${it.qty}) — ৳${(it.price * it.qty).toLocaleString()}`;
    });

    return `🧾 *${shop} — ক্যাশ মেমো / ইনভয়েস*
━━━━━━━━━━━━━━━━━━━
👤 ক্রেতার নাম: ${data.customerName || "সম্মানিত ক্রেতা"}
📑 ইনভয়েস নং: #${data.invoiceNo}
📅 তারিখ: ${date}

*ক্রয়কৃত পণ্যসমূহ:*${itemsText}
━━━━━━━━━━━━━━━━━━━
💵 সর্বমোট: ৳${data.total.toLocaleString()}
✅ পরিশোধিত: ৳${data.paidAmount.toLocaleString()}
${data.dueAmount > 0 ? `⚠️ অবশিষ্ট বাকী: ৳${data.dueAmount.toLocaleString()}\n` : ""}${data.paymentMethod ? `💳 পেমেন্ট মাধ্যম: ${data.paymentMethod.toUpperCase()}\n` : ""}
ধন্যবাদ! আমাদের সাথেই থাকুন।${phone}`;
  }

  // English formatting
  let itemsText = "";
  data.items.forEach((it, idx) => {
    itemsText += `\n${idx + 1}. ${it.name} (x${it.qty}) - ৳${(it.price * it.qty).toLocaleString()}`;
  });

  return `🧾 *${shop} — Digital Invoice*
━━━━━━━━━━━━━━━━━━━
👤 Customer: ${data.customerName || "Valued Customer"}
📑 Invoice #: #${data.invoiceNo}
📅 Date: ${date}

*Purchased Items:*${itemsText}
━━━━━━━━━━━━━━━━━━━
💵 Total Amount: ৳${data.total.toLocaleString()}
✅ Paid Amount: ৳${data.paidAmount.toLocaleString()}
${data.dueAmount > 0 ? `⚠️ Remaining Due: ৳${data.dueAmount.toLocaleString()}\n` : ""}${data.paymentMethod ? `💳 Payment Method: ${data.paymentMethod.toUpperCase()}\n` : ""}
Thank you for shopping with us!${phone}`;
}

export function getWhatsAppInvoiceUrl(data: InvoiceShareData, lang: "bn" | "en" = "bn"): string {
  const text = generateWhatsAppInvoiceText(data, lang);
  let cleanPhone = (data.customerPhone || "").replace(/[^0-9]/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "88" + cleanPhone;
  } else if (cleanPhone && !cleanPhone.startsWith("88") && cleanPhone.length === 10) {
    cleanPhone = "880" + cleanPhone;
  }

  const phoneParam = cleanPhone ? `phone=${cleanPhone}&` : "";
  return `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(text)}`;
}

export interface DueReminderData {
  customerName: string;
  customerPhone?: string;
  shopName?: string;
  shopPhone?: string;
  dueAmount: number;
  lastPurchaseDate?: string;
}

export function generateWhatsAppDueReminderText(data: DueReminderData, lang: "bn" | "en" = "bn"): string {
  const shop = data.shopName || "Classic World";
  const phone = data.shopPhone ? `\n📞 যোগাযোগ: ${data.shopPhone}` : "";

  if (lang === "bn") {
    return `আসসালামু আলাইকুম, সম্মানিত *${data.customerName}*।
${shop}-এ আপনার পূর্বের কেনাকাটার মোট বাকী রয়েছে *৳${data.dueAmount.toLocaleString()}*।

বকেয়া পরিশোধের জন্য অনুরোধ জানানো হচ্ছে।${phone}
ধন্যবাদ!`;
  }

  return `Dear *${data.customerName}*,
This is a gentle reminder regarding your outstanding due balance of *৳${data.dueAmount.toLocaleString()}* at ${shop}.

Kindly settle the due amount at your earliest convenience.${phone}
Thank you!`;
}

export function getWhatsAppDueReminderUrl(data: DueReminderData, lang: "bn" | "en" = "bn"): string {
  const text = generateWhatsAppDueReminderText(data, lang);
  let cleanPhone = (data.customerPhone || "").replace(/[^0-9]/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "88" + cleanPhone;
  } else if (cleanPhone && !cleanPhone.startsWith("88") && cleanPhone.length === 10) {
    cleanPhone = "880" + cleanPhone;
  }

  const phoneParam = cleanPhone ? `phone=${cleanPhone}&` : "";
  return `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(text)}`;
}
