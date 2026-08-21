import * as jose from "jose";
import { getDb } from "@/lib/db";

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const pkcs8Key = privateKey.replace(/\\n/g, "\n");
  const alg = "RS256";

  const jwt = await new jose.SignJWT({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg })
    .sign(await jose.importPKCS8(pkcs8Key, alg));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets Auth failed: ${errText}`);
  }

  const tokenData = await res.json();
  return tokenData.access_token as string;
}

export async function appendRowToGoogleSheet(
  ownerId: string,
  tabName: string,
  headers: string[],
  row: any[],
) {
  try {
    const db = await getDb();
    const biz = await db.collection("businesses").findOne({ owner_id: ownerId });
    if (!biz) return;

    const spreadsheetId = biz.google_sheets_spreadsheet_id as string | undefined;
    const credsStr = biz.google_sheets_credentials_json as string | undefined;

    if (!spreadsheetId || !credsStr) return;

    let creds: { client_email?: string; private_key?: string };
    try {
      creds = JSON.parse(credsStr.trim());
    } catch {
      console.error("Failed to parse Google Sheets Credentials JSON");
      return;
    }

    const clientEmail = creds.client_email;
    const privateKey = creds.private_key;

    if (!clientEmail || !privateKey) return;

    const token = await getAccessToken(clientEmail, privateKey);

    // Google values.append endpoint
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${tabName}'!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    // Sheets append endpoint will automatically write the values
    const appendRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [row],
      }),
    });

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      console.error(`Failed to append row to sheet ${tabName}: ${errText}`);
      
      // If the sheet tab does not exist, the API will fail. We can attempt to create headers first by doing a value write to range A1
      if (errText.includes("Unable to parse range")) {
        // Try creating the tab with headers first by calling batchUpdate with addSheet
        const createTabUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
        await fetch(createTabUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabName,
                  },
                },
              },
            ],
          }),
        });
        
        // Write headers to Row 1
        const writeHeadersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${tabName}'!A1:1?valueInputOption=USER_ENTERED`;
        await fetch(writeHeadersUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [headers],
          }),
        });

        // Try appending row again
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [row],
          }),
        });
      }
    }
  } catch (err) {
    console.error("Google Sheet Append Error:", err);
  }
}

/** Bulk export all existing data to Google Sheet tabs. */
export async function bulkExportToGoogleSheets(ownerId: string) {
  const db = await getDb();
  const biz = await db.collection("businesses").findOne({ owner_id: ownerId });
  if (!biz) throw new Error("Business not found");

  const spreadsheetId = biz.google_sheets_spreadsheet_id as string | undefined;
  const credsStr = biz.google_sheets_credentials_json as string | undefined;

  if (!spreadsheetId || !credsStr) {
    throw new Error("Google Sheets Spreadsheet ID or Service Account Credentials JSON are missing.");
  }

  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(credsStr.trim());
  } catch {
    throw new Error("Invalid Credentials JSON format.");
  }

  const clientEmail = creds.client_email;
  const privateKey = creds.private_key;

  if (!clientEmail || !privateKey) {
    throw new Error("Credentials JSON is missing client_email or private_key.");
  }

  const token = await getAccessToken(clientEmail, privateKey);

  // Queries
  const products = await db.collection("products").find({ owner_id: ownerId }).toArray();
  const sales = await db.collection("sales").find({ owner_id: ownerId }).toArray();
  const expenses = await db.collection("expenses").find({ owner_id: ownerId }).toArray();
  const cashbox = await db.collection("cashbox_entries").find({ owner_id: ownerId }).toArray();
  const purchases = await db.collection("purchases").find({ owner_id: ownerId }).toArray();

  const dataSets = [
    {
      tab: "Products",
      headers: ["ID", "Name", "Buy Price", "Sell Price", "Stock", "Min Stock", "Category", "Created At"],
      rows: products.map(p => [p._id, p.name, p.buy_price, p.sell_price, p.stock, p.min_stock ?? 5, p.category || "", p.created_at]),
    },
    {
      tab: "Sales",
      headers: ["ID", "Product Name", "Qty", "Buy Price", "Sell Price", "Profit", "Type", "Party ID", "Paid Amount", "Due Amount", "Created At"],
      rows: sales.map(s => [s._id, s.product_name, s.qty, s.buy_price, s.sell_price, s.profit, s.type, s.party_id || "", s.paid_amount, s.due_amount, s.created_at]),
    },
    {
      tab: "Expenses",
      headers: ["ID", "Title", "Amount", "Note", "Created At"],
      rows: expenses.map(e => [e._id, e.title, e.amount, e.note || "", e.created_at]),
    },
    {
      tab: "Cashbox",
      headers: ["ID", "Kind", "Amount", "Note", "Ref ID", "Created At"],
      rows: cashbox.map(c => [c._id, c.kind, c.amount, c.note || "", c.ref_id || "", c.created_at]),
    },
    {
      tab: "Purchases",
      headers: ["ID", "Product Name", "Qty", "Unit Cost", "Total", "Note", "Created At"],
      rows: purchases.map(p => [p._id, p.product_name, p.qty, p.unit_cost, p.total, p.note || "", p.created_at]),
    },
  ];

  for (const ds of dataSets) {
    // 1. Create tab if it doesn't exist
    try {
      const createTabUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      await fetch(createTabUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: ds.tab,
                },
              },
            },
          ],
        }),
      });
    } catch {
      // Tab likely already exists - ignore
    }

    // 2. Clear existing sheet values
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${ds.tab}'!A:Z:clear`;
    await fetch(clearUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // 3. Write headers and rows
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${ds.tab}'!A1?valueInputOption=USER_ENTERED`;
    const values = [ds.headers, ...ds.rows];
    await fetch(writeUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values,
      }),
    });
  }
}
