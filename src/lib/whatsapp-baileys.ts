import path from "path";
import fs from "fs";
import os from "os";
import QRCode from "qrcode";
import { getDb } from "@/lib/db";

// Global in-memory storage for active Baileys socket sessions
interface SessionData {
  sock: any;
  status: "disconnected" | "connecting" | "qr_ready" | "connected";
  qrCodeDataUrl: string | null;
  qrRaw: string | null;
  phone: string | null;
  name: string | null;
  jid: string | null;
  lastUpdated: number;
}

const g = global as unknown as {
  __whatsappSessions?: Map<string, SessionData>;
};

if (!g.__whatsappSessions) {
  g.__whatsappSessions = new Map<string, SessionData>();
}

const sessions = g.__whatsappSessions;

/**
 * Determine a guaranteed writable directory for Baileys session storage.
 * In serverless environments (e.g. Vercel, AWS Lambda where process.cwd() is read-only /var/task),
 * this falls back to os.tmpdir() (/tmp).
 */
function getBaseSessionDir(): string {
  // First try os.tmpdir() to guarantee writability across all environments
  const tmpBase = path.join(os.tmpdir(), "hakimqzz_whatsapp_sessions");
  try {
    if (!fs.existsSync(tmpBase)) {
      fs.mkdirSync(tmpBase, { recursive: true });
    }
    return tmpBase;
  } catch (tmpErr) {
    console.warn("[WhatsApp] Failed to create in tmpdir, trying local:", tmpErr);
  }

  // Fallback to local cwd
  const localBase = path.join(process.cwd(), ".whatsapp_sessions");
  try {
    if (!fs.existsSync(localBase)) {
      fs.mkdirSync(localBase, { recursive: true });
    }
    return localBase;
  } catch (localErr) {
    console.error("[WhatsApp] Failed to create local session directory:", localErr);
    return tmpBase;
  }
}

/**
 * Ensure business session directory exists and restore credentials from MongoDB if available
 */
async function ensureSessionDir(businessId: string): Promise<string> {
  const baseDir = getBaseSessionDir();
  const dir = path.join(baseDir, businessId);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    // If still fails, fallback to direct /tmp
    const directTmp = path.join(os.tmpdir(), `wa_${businessId}`);
    if (!fs.existsSync(directTmp)) {
      fs.mkdirSync(directTmp, { recursive: true });
    }
    return directTmp;
  }

  // Check if creds exist locally. If not, try restoring from MongoDB
  const credsPath = path.join(dir, "creds.json");
  if (!fs.existsSync(credsPath)) {
    try {
      const db = await getDb();
      const savedSession = await db.collection("whatsapp_sessions").findOne({ business_id: businessId });
      if (savedSession && savedSession.files) {
        for (const [filename, content] of Object.entries(savedSession.files)) {
          if (typeof content === "string") {
            fs.writeFileSync(path.join(dir, filename), content, "utf-8");
          }
        }
        console.log(`[WhatsApp] Restored session files for ${businessId} from database.`);
      }
    } catch (dbErr) {
      console.warn("[WhatsApp] Could not restore session from database:", dbErr);
    }
  }

  return dir;
}

/**
 * Backup session files to MongoDB for multi-instance persistence
 */
async function backupSessionToDb(businessId: string, sessionDir: string) {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const fileNames = fs.readdirSync(sessionDir);
    const files: Record<string, string> = {};

    for (const file of fileNames) {
      const filePath = path.join(sessionDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size < 500000) {
        files[file] = fs.readFileSync(filePath, "utf-8");
      }
    }

    if (Object.keys(files).length > 0) {
      const db = await getDb();
      await db.collection("whatsapp_sessions").updateOne(
        { business_id: businessId },
        {
          $set: {
            business_id: businessId,
            files,
            updated_at: new Date(),
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn("[WhatsApp] Failed to backup session files to database:", err);
  }
}

/**
 * Format any raw phone number into a valid WhatsApp JID
 */
export function formatToWhatsAppJid(rawPhone: string): string {
  let cleaned = rawPhone.replace(/\D/g, "");
  if (!cleaned) return "";

  // If local Bangladesh format (017...), prefix with 88
  if (cleaned.startsWith("01") && cleaned.length === 11) {
    cleaned = "88" + cleaned;
  } else if (cleaned.startsWith("8801") && cleaned.length === 13) {
    // already good
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Get current WhatsApp status for a business
 */
export async function getWhatsAppStatus(businessId: string) {
  const session = sessions.get(businessId);
  if (!session) {
    const baseDir = getBaseSessionDir();
    const sessionDir = path.join(baseDir, businessId);
    const credsPath = path.join(sessionDir, "creds.json");

    // Check disk or MongoDB
    let hasSavedCreds = fs.existsSync(credsPath);
    if (!hasSavedCreds) {
      try {
        const db = await getDb();
        const saved = await db.collection("whatsapp_sessions").findOne({ business_id: businessId });
        if (saved?.files?.["creds.json"]) {
          hasSavedCreds = true;
        }
      } catch (_) {}
    }

    if (hasSavedCreds) {
      startWhatsAppSession(businessId).catch(() => {});
      return {
        status: "connecting",
        qrCodeDataUrl: null,
        phone: null,
        name: null,
        jid: null,
      };
    }

    return {
      status: "disconnected",
      qrCodeDataUrl: null,
      phone: null,
      name: null,
      jid: null,
    };
  }

  return {
    status: session.status,
    qrCodeDataUrl: session.qrCodeDataUrl,
    phone: session.phone,
    name: session.name,
    jid: session.jid,
  };
}

/**
 * Start or resume WhatsApp Baileys session
 */
export async function startWhatsAppSession(businessId: string) {
  const existing = sessions.get(businessId);
  if (existing && (existing.status === "connected" || existing.status === "connecting")) {
    return {
      status: existing.status,
      qrCodeDataUrl: existing.qrCodeDataUrl,
      phone: existing.phone,
      name: existing.name,
    };
  }

  const sessionDir = await ensureSessionDir(businessId);

  // Dynamic import Baileys and Pino for Next.js ESM compatibility
  const baileys = await import("@whiskeysockets/baileys");
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
  const pino = (await import("pino")).default;

  const logger = pino({ level: "silent" });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] as any }));

  const sessionData: SessionData = {
    sock: null,
    status: "connecting",
    qrCodeDataUrl: null,
    qrRaw: null,
    phone: null,
    name: null,
    jid: null,
    lastUpdated: Date.now(),
  };

  sessions.set(businessId, sessionData);

  try {
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ["HakimQzz POS", "Chrome", "120.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    sessionData.sock = sock;

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      backupSessionToDb(businessId, sessionDir).catch(() => {});
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sessionData.status = "qr_ready";
        sessionData.qrRaw = qr;
        try {
          sessionData.qrCodeDataUrl = await QRCode.toDataURL(qr, {
            width: 280,
            margin: 2,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });
        } catch (e) {
          console.error("Failed to generate QR code data URL:", e);
        }
        sessionData.lastUpdated = Date.now();
      }

      if (connection === "connecting") {
        sessionData.status = "connecting";
        sessionData.lastUpdated = Date.now();
      }

      if (connection === "open") {
        sessionData.status = "connected";
        sessionData.qrCodeDataUrl = null;
        sessionData.qrRaw = null;

        const userJid = sock.user?.id || "";
        const cleanPhone = userJid.split(":")[0] || userJid.split("@")[0];
        sessionData.jid = userJid;
        sessionData.phone = cleanPhone;
        sessionData.name = sock.user?.name || "WhatsApp Business";
        sessionData.lastUpdated = Date.now();

        console.log(`[WhatsApp] Business ${businessId} connected as ${cleanPhone}`);
        backupSessionToDb(businessId, sessionDir).catch(() => {});
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Business ${businessId} connection closed (code ${statusCode}). Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          sessionData.status = "connecting";
          setTimeout(() => {
            startWhatsAppSession(businessId).catch(() => {});
          }, 3000);
        } else {
          sessionData.status = "disconnected";
          sessionData.sock = null;
          sessionData.qrCodeDataUrl = null;
          sessionData.phone = null;
          // Clear credentials
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            const db = await getDb();
            await db.collection("whatsapp_sessions").deleteOne({ business_id: businessId });
          } catch (_) {}
        }
        sessionData.lastUpdated = Date.now();
      }
    });

    return {
      status: sessionData.status,
      qrCodeDataUrl: sessionData.qrCodeDataUrl,
      phone: sessionData.phone,
      name: sessionData.name,
    };
  } catch (err: any) {
    sessionData.status = "disconnected";
    console.error(`[WhatsApp] Error starting session for ${businessId}:`, err);
    throw err;
  }
}

/**
 * Disconnect and unlink WhatsApp session
 */
export async function disconnectWhatsAppSession(businessId: string) {
  const session = sessions.get(businessId);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch (_) {}
    try {
      session.sock.end(undefined);
    } catch (_) {}
  }

  sessions.delete(businessId);

  const baseDir = getBaseSessionDir();
  const sessionDir = path.join(baseDir, businessId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    const db = await getDb();
    await db.collection("whatsapp_sessions").deleteOne({ business_id: businessId });
  } catch (_) {}

  return { success: true };
}

/**
 * Send a single WhatsApp text message
 */
export async function sendWhatsAppMessage(
  businessId: string,
  toPhone: string,
  messageText: string,
  options?: { recipientName?: string; userId?: string }
): Promise<{ isSuccess: boolean; messageId?: string; error?: string }> {
  const session = sessions.get(businessId);

  if (!session || session.status !== "connected" || !session.sock) {
    return {
      isSuccess: false,
      error: "WhatsApp is not connected. Please scan the QR code in the WhatsApp tab.",
    };
  }

  const jid = formatToWhatsAppJid(toPhone);
  if (!jid) {
    return {
      isSuccess: false,
      error: `Invalid phone number: ${toPhone}`,
    };
  }

  try {
    // Send WhatsApp text message via Baileys socket
    const sentMsg = await session.sock.sendMessage(jid, {
      text: messageText,
    });

    const msgId = sentMsg?.key?.id || `wa_${Date.now()}`;

    // Log to DB
    try {
      const db = await getDb();
      await db.collection("sms_logs").insertOne({
        business_id: businessId,
        user_id: options?.userId || businessId,
        recipient: toPhone,
        recipient_name: options?.recipientName || "WhatsApp Contact",
        message: messageText,
        channel: "whatsapp",
        gateway: "WhatsApp Web",
        message_id: msgId,
        status: "Delivered",
        is_success: true,
        sms_count: 1,
        created_at: new Date(),
      });
    } catch (dbErr) {
      console.warn("Failed to write WhatsApp log to database:", dbErr);
    }

    return {
      isSuccess: true,
      messageId: msgId,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error(`[WhatsApp] Failed to send to ${toPhone}:`, errMsg);

    try {
      const db = await getDb();
      await db.collection("sms_logs").insertOne({
        business_id: businessId,
        user_id: options?.userId || businessId,
        recipient: toPhone,
        recipient_name: options?.recipientName || "WhatsApp Contact",
        message: messageText,
        channel: "whatsapp",
        gateway: "WhatsApp Web",
        status: "Failed",
        is_success: false,
        error_message: errMsg,
        sms_count: 1,
        created_at: new Date(),
      });
    } catch (_) {}

    return {
      isSuccess: false,
      error: errMsg,
    };
  }
}

/**
 * Send bulk WhatsApp messages / campaign
 */
export async function sendWhatsAppCampaign(
  businessId: string,
  recipients: Array<{ phone: string; name?: string }>,
  messageTemplate: string,
  userId?: string
) {
  const session = sessions.get(businessId);
  if (!session || session.status !== "connected" || !session.sock) {
    throw new Error("WhatsApp is not connected. Please scan the QR code to link your device.");
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const item of recipients) {
    if (!item.phone) continue;

    // Personalize message
    let personalized = messageTemplate
      .replace(/{name}|{customer_name}/gi, item.name || "Customer")
      .replace(/{phone}/gi, item.phone);

    const result = await sendWhatsAppMessage(businessId, item.phone, personalized, {
      recipientName: item.name,
      userId,
    });

    if (result.isSuccess) {
      successCount++;
    } else {
      failCount++;
      if (result.error && !errors.includes(result.error)) {
        errors.push(`${item.phone}: ${result.error}`);
      }
    }

    // Safety pause of 400ms between WhatsApp messages to avoid rate limits
    await new Promise((r) => setTimeout(r, 400));
  }

  return {
    total: recipients.length,
    successCount,
    failCount,
    errors: errors.slice(0, 5),
  };
}
