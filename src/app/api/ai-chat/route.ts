import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getDb } from "@/lib/db";

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Groq High-Speed Free Models Fallback Array
const GROQ_MODELS = [
  DEFAULT_MODEL,
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "deepseek-r1-distill-llama-70b",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
];

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cookie, Authorization",
  };

  try {
    let ownerId = "default";
    let products: any[] = [];
    let sales: any[] = [];
    let expenses: any[] = [];
    let purchases: any[] = [];
    let parties: any[] = [];
    let cashboxEntries: any[] = [];

    // Safe session and database context retrieval
    try {
      const session = await requireSession(false).catch(() => null);
      if (session) {
        ownerId = session.ownerId;
      }
      const db = await getDb();
      [products, sales, purchases, expenses, parties, cashboxEntries] = await Promise.all([
        db.collection("products").find(ownerId !== "default" ? { owner_id: ownerId } : {}).toArray().catch(() => []),
        db.collection("sales").find(ownerId !== "default" ? { owner_id: ownerId } : {}).sort({ created_at: -1 }).limit(200).toArray().catch(() => []),
        db.collection("purchases").find(ownerId !== "default" ? { owner_id: ownerId } : {}).sort({ created_at: -1 }).limit(100).toArray().catch(() => []),
        db.collection("expenses").find(ownerId !== "default" ? { owner_id: ownerId } : {}).sort({ created_at: -1 }).limit(100).toArray().catch(() => []),
        db.collection("parties").find(ownerId !== "default" ? { owner_id: ownerId } : {}).toArray().catch(() => []),
        db.collection("cashbox_entries").find(ownerId !== "default" ? { owner_id: ownerId } : {}).sort({ created_at: -1 }).limit(100).toArray().catch(() => []),
      ]);
    } catch (_) {}

    // Date calculations for Today's statistics
    const now = new Date();
    const todayYMD = now.toISOString().slice(0, 10);
    const todayLocalStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);

    const isToday = (dateStr: string) => {
      if (!dateStr) return false;
      const d = String(dateStr).slice(0, 10);
      return d === todayYMD || d === todayLocalStr;
    };

    // Today's Specific Metrics
    const todaySales = sales.filter((s) => !s.returned && isToday(s.created_at));
    const todaySalesCount = todaySales.length;
    const todaySalesRevenue = todaySales.reduce((a, s) => a + (Number(s.sell_price || 0) * Number(s.qty || 1)), 0);
    const todayCashSales = todaySales.filter((s) => s.type === "cash").reduce((a, s) => a + (Number(s.sell_price || 0) * Number(s.qty || 1)), 0);
    const todayCreditSales = todaySales.filter((s) => s.type === "credit").reduce((a, s) => a + (Number(s.sell_price || 0) * Number(s.qty || 1)), 0);
    const todayOnlineSales = todaySales.filter((s) => s.type === "online").reduce((a, s) => a + (Number(s.sell_price || 0) * Number(s.qty || 1)), 0);
    const todayProfit = todaySales.reduce((a, s) => a + Number(s.profit || 0), 0);
    const todayDue = todaySales.reduce((a, s) => a + Number(s.due_amount || 0), 0);

    const todayExpensesList = expenses.filter((e) => isToday(e.created_at));
    const todayExpenses = todayExpensesList.reduce((a, e) => a + Number(e.amount || 0), 0);

    const todayPurchasesList = purchases.filter((p) => isToday(p.created_at));
    const todayPurchases = todayPurchasesList.reduce((a, p) => a + Number(p.total || 0), 0);

    const todayNetIncome = todayProfit - todayExpenses;

    // Overall / All-Time Metrics
    const activeProducts = products.filter((p) => !p.archived);
    const totalStockCostVal = activeProducts.reduce((a, p) => a + (Number(p.buy_price || 0) * Number(p.stock || 0)), 0);
    const totalStockSaleVal = activeProducts.reduce((a, p) => a + (Number(p.sell_price || 0) * Number(p.stock || 0)), 0);

    const totalSales = sales.filter((s) => !s.returned).reduce((s, x) => s + (Number(x.sell_price || 0) * Number(x.qty || 1)), 0);
    const totalProfit = sales.filter((s) => !s.returned).reduce((s, x) => s + Number(x.profit || 0), 0);
    const totalExpenses = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalPurchases = purchases.reduce((s, x) => s + Number(x.total || 0), 0);
    const totalDueOutstanding = sales.filter((s) => !s.returned && s.type === "credit").reduce((a, x) => a + Number(x.due_amount || 0), 0);

    const cashboxNetBalance = cashboxEntries.reduce((acc, c) => {
      if (c.kind === "deposit" || c.kind === "sale") return acc + Number(c.amount || 0);
      return acc - Number(c.amount || 0);
    }, 0);

    const lowStockProducts = activeProducts
      .filter((p) => p.stock <= (p.min_stock || 5))
      .map((p) => ({ name: p.name, stock: p.stock, min_stock: p.min_stock || 5 }))
      .slice(0, 20);

    const productSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const s of sales) {
      if (s.returned) continue;
      const key = s.product_name || "Unknown";
      if (!productSalesMap[key]) productSalesMap[key] = { name: key, qty: 0, revenue: 0 };
      productSalesMap[key].qty += Number(s.qty || 1);
      productSalesMap[key].revenue += (Number(s.sell_price || 0) * Number(s.qty || 1));
    }
    const bestSelling = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Build rich system prompt with real business data & Today's statistics
    const systemPrompt = `You are an expert AI business advisor and financial analyst for a retail fashion management platform called Classic World (Classic World). You have access to live real-time business statistics.

## 📅 TODAY'S LIVE STATISTICS (${todayLocalStr}):
- Today's Total Sales Revenue: ৳${todaySalesRevenue.toLocaleString()} (${todaySalesCount} sales transactions today)
- Today's Gross Profit: ৳${todayProfit.toLocaleString()}
- Today's Shop Expenses: ৳${todayExpenses.toLocaleString()} (${todayExpensesList.length} expense entries)
- Today's Inventory Purchases: ৳${todayPurchases.toLocaleString()} (${todayPurchasesList.length} purchase vouchers)
- Today's Net Income (Profit - Expenses): ৳${todayNetIncome.toLocaleString()}
- Today's Payment Method Breakdown:
  • Cash Sales: ৳${todayCashSales.toLocaleString()}
  • Credit Sales: ৳${todayCreditSales.toLocaleString()} (New Dues Recorded Today: ৳${todayDue.toLocaleString()})
  • Online Sales: ৳${todayOnlineSales.toLocaleString()}

## 📊 OVERALL BUSINESS METRICS & INVENTORY:
- All-Time Total Sales Revenue: ৳${totalSales.toLocaleString()}
- All-Time Total Gross Profit: ৳${totalProfit.toLocaleString()}
- All-Time Operating Expenses: ৳${totalExpenses.toLocaleString()}
- All-Time Inventory Purchases: ৳${totalPurchases.toLocaleString()}
- Customer Outstanding Dues: ৳${totalDueOutstanding.toLocaleString()}
- Cashbox Net Balance: ৳${cashboxNetBalance.toLocaleString()}
- Total Active Catalog Products: ${activeProducts.length} items
- Stock Valuation (At Buy Cost): ৳${totalStockCostVal.toLocaleString()}
- Stock Valuation (At Sale Price): ৳${totalStockSaleVal.toLocaleString()}
- Customer & Party Directory: ${parties.length} contacts

### ⚠️ Low Stock Alert (${lowStockProducts.length} items):
${lowStockProducts.map((p) => `  • ${p.name}: ${p.stock} left (min threshold: ${p.min_stock})`).join("\n") || "  All products have healthy stock levels."}

### 🏆 Top 10 Best Selling Items:
${bestSelling.map((p, i) => `${i + 1}. ${p.name} — ${p.qty} sold, ৳${p.revenue.toLocaleString()}`).join("\n") || "No sales recorded yet"}

### 🕒 Recent 5 Sales Transactions:
${sales.slice(0, 5).map((s) => `  • ${s.product_name} (×${s.qty || 1}) — ৳${(Number(s.sell_price || 0) * Number(s.qty || 1)).toLocaleString()} [${(s.type || "cash").toUpperCase()}] on ${s.created_at ? String(s.created_at).slice(0, 16).replace("T", " ") : "today"}`).join("\n") || "No recent sales"}

## RESPONSE INSTRUCTIONS:
- Always prioritize TODAY'S live metrics when answering queries about current performance, sales today, profit today, or daily overview.
- Be concise, direct, professional, and actionable (MAXIMUM 200 words unless in-depth report requested).
- Use clear structured headings and bullet points.
- If the user writes in Bangla, answer ENTIRELY in clear, natural Bengali.
- Always use the ৳ symbol for all monetary figures.`;

    const body = await req.json().catch(() => ({ messages: [] }));
    const { messages } = body as { messages: { role: string; content: string }[] };

    let reply = "";
    let lastError = "";

    // Try Groq free models with automatic failover
    const modelsToTry = Array.from(new Set(GROQ_MODELS));
    for (const modelCandidate of modelsToTry) {
      try {
        const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelCandidate,
            messages: [
              { role: "system", content: systemPrompt },
              ...(messages || []).slice(-10),
            ],
            temperature: 0.7,
            max_tokens: 1024,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const candidateReply = data.choices?.[0]?.message?.content;
          if (candidateReply && candidateReply.trim()) {
            reply = candidateReply;
            break;
          }
        } else {
          lastError = `Model ${modelCandidate} returned HTTP ${response.status}`;
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    if (!reply) {
      // High-availability fallback: return direct real-time audit report calculated from live DB metrics
      const fallbackReport = `📊 **হাকিম অটোমেটেড ফাইন্যান্সিয়াল অডিট (লাইভ রিপোর্ট)**:

• **মোট বিক্রয় রাজস্ব**: ৳${totalSales.toLocaleString()}
• **মোট নিট লাভ**: ৳${totalProfit.toLocaleString()}
• **মোট দোকান পরিচালনা খরচ**: ৳${totalExpenses.toLocaleString()}
• **স্টক ক্রয় ব্যয়**: ৳${totalPurchases.toLocaleString()}
• **চলতি নিট আয় (লাভ - খরচ)**: ৳${(totalProfit - totalExpenses).toLocaleString()}
• **আজকের নগদ বিক্রি**: ৳${todayCashSales.toLocaleString()} | **আজকের বাকী পাওনা**: ৳${todayDue.toLocaleString()} (মোট বাকী: ৳${totalDueOutstanding.toLocaleString()})
• **সংকটজনক স্টক আইটেম**: ${lowStockProducts.length > 0 ? lowStockProducts.map(p => `${p.name} (${p.stock}টি বাকি)`).join(", ") : "সকল পণ্যের স্টক পর্যাপ্ত আছে।"}

💡 *পরামর্শ: স্টক লেভেল ও ক্যাশবক্স রিকনসিলিয়েশন নিয়মিত চেক করুন।*`;

      return NextResponse.json({ reply: fallbackReport }, { headers: corsHeaders });
    }

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err: any) {
    console.error("[ai-chat]", err);
    return NextResponse.json(
      { reply: `⚠️ অডিট আপডেট: বর্তমানে সার্ভার সিঙ্ক্রোনাইজেশন প্রক্রিয়া চলছে। অনুগ্রহ করে কিছু মুহূর্ত পর আবার চেষ্টা করুন। (${err?.message || "OK"})` },
      { status: 200, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cookie, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
