/**
 * MiMSMS Bulk SMS API (v2) Client
 * Official Spec: https://api.mimsms.com/api
 */

export interface MiMSMSCredentials {
  apiKey: string;
  userName: string;
  senderName: string;
}

export interface SendSingleSmsParams extends MiMSMSCredentials {
  mobileNumber: string;
  message: string;
  transactionType?: "T" | "P"; // "T" for Transactional, "P" for Promotional
  campaignName?: string;
}

export interface SendBroadcastSmsParams extends MiMSMSCredentials {
  numbers: string[];
  message: string;
  transactionType?: "T" | "P";
  campaignId?: string;
}

export interface DynamicSmsItem {
  mobileNumber: string;
  message: string;
}

export interface SendDynamicSmsParams extends MiMSMSCredentials {
  smsData: DynamicSmsItem[];
  transactionType?: "T" | "P";
}

export interface MiMSMSResponse {
  statusCode: string;
  status: "Success" | "Failed" | "Scheduled" | string;
  trxnId?: string;
  trackingId?: string;
  balance?: string;
  deliveryStatus?: string;
  smsCount?: number;
  recipientCount?: number;
  responseResult?: string;
  error_Data?: Array<{
    res_Code?: string;
    error?: string;
    failedNumbers?: string;
    errorParm?: string;
  }>;
}

const BASE_URL = "https://api.mimsms.com/api";

/**
 * Standardize Bangladeshi mobile numbers into 8801XXXXXXXXX format
 */
export function sanitizeBdPhoneNumber(phone: string): string | null {
  if (!phone) return null;
  // Remove all whitespace, hyphens, plus signs, brackets
  const cleaned = phone.replace(/[\s\-\+\(\)]/g, "");

  // Match 8801XXXXXXXXX (13 digits starting with 8801)
  if (/^8801[3-9]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  // Match 01XXXXXXXXX (11 digits starting with 01) -> convert to 8801XXXXXXXXX
  if (/^01[3-9]\d{8}$/.test(cleaned)) {
    return `88${cleaned}`;
  }
  // Match 1XXXXXXXXX (10 digits) -> convert to 8801XXXXXXXXX
  if (/^1[3-9]\d{8}$/.test(cleaned)) {
    return `880${cleaned}`;
  }

  return null;
}

/**
 * Calculate character count and SMS parts (GSM 7-bit vs Unicode/Bengali)
 */
export function calculateSmsParts(message: string): {
  chars: number;
  parts: number;
  isUnicode: boolean;
  maxPerPart: number;
} {
  const chars = message ? message.length : 0;
  // Check if string contains non-GSM 7-bit characters (e.g. Bengali, emojis, accents)
  const isUnicode = /[^\x20-\x7E\r\n\t]/.test(message);

  if (chars === 0) {
    return { chars: 0, parts: 0, isUnicode, maxPerPart: isUnicode ? 70 : 160 };
  }

  if (isUnicode) {
    // Unicode (Bengali / UTF-16)
    if (chars <= 70) {
      return { chars, parts: 1, isUnicode, maxPerPart: 70 };
    }
    const parts = Math.ceil(chars / 67);
    return { chars, parts, isUnicode, maxPerPart: 67 };
  } else {
    // GSM 7-bit standard
    if (chars <= 160) {
      return { chars, parts: 1, isUnicode, maxPerPart: 160 };
    }
    const parts = Math.ceil(chars / 153);
    return { chars, parts, isUnicode, maxPerPart: 153 };
  }
}

/**
 * Send Single SMS via POST /V2/SMS
 */
export async function sendSingleSms(params: SendSingleSmsParams): Promise<MiMSMSResponse> {
  const { apiKey, userName, senderName, mobileNumber, message, transactionType = "T", campaignName } = params;

  if (!apiKey || !userName || !senderName) {
    throw new Error("Missing MiMSMS credentials (apiKey, userName, senderName are required)");
  }

  const sanitizedNumber = sanitizeBdPhoneNumber(mobileNumber);
  if (!sanitizedNumber) {
    throw new Error(`Invalid Bangladeshi mobile number: ${mobileNumber}`);
  }

  const payload: Record<string, any> = {
    apiKey,
    userName,
    senderName,
    transactionType,
    mobileNumber: sanitizedNumber,
    message,
  };

  if (campaignName) {
    payload.campaignName = campaignName;
  }

  const res = await fetch(`${BASE_URL}/V2/SMS`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data: MiMSMSResponse = await res.json().catch(() => ({
    statusCode: String(res.status),
    status: "Failed",
    responseResult: `HTTP ${res.status}: ${res.statusText}`,
  }));

  return data;
}

/**
 * Send Broadcast SMS via POST /V2/OneToMany (up to 1,000 per request)
 */
export async function sendBroadcastSms(params: SendBroadcastSmsParams): Promise<MiMSMSResponse[]> {
  const { apiKey, userName, senderName, message, numbers, transactionType = "P", campaignId } = params;

  if (!apiKey || !userName || !senderName) {
    throw new Error("Missing MiMSMS credentials (apiKey, userName, senderName are required)");
  }

  // Sanitize and filter out invalid/duplicate numbers
  const validNumbers = Array.from(
    new Set(
      numbers
        .map((num) => sanitizeBdPhoneNumber(num))
        .filter((num): num is string => Boolean(num))
    )
  );

  if (validNumbers.length === 0) {
    throw new Error("No valid mobile numbers provided for SMS broadcast");
  }

  // If only 1 number and transactional, use single SMS endpoint
  if (validNumbers.length === 1 && transactionType === "T") {
    const singleRes = await sendSingleSms({
      apiKey,
      userName,
      senderName,
      mobileNumber: validNumbers[0],
      message,
      transactionType: "T",
      campaignName: campaignId,
    });
    return [singleRes];
  }

  // Split into chunks of 1,000 recipients
  const CHUNK_SIZE = 1000;
  const results: MiMSMSResponse[] = [];

  for (let i = 0; i < validNumbers.length; i += CHUNK_SIZE) {
    const chunk = validNumbers.slice(i, i + CHUNK_SIZE);
    const smsData = chunk.map((mobileNumber) => ({ mobileNumber }));

    const payload: Record<string, any> = {
      apiKey,
      userName,
      senderName,
      transactionType,
      message,
      smsData,
    };

    if (campaignId) {
      payload.campaignId = campaignId;
    }

    const res = await fetch(`${BASE_URL}/V2/OneToMany`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: MiMSMSResponse = await res.json().catch(() => ({
      statusCode: String(res.status),
      status: "Failed",
      responseResult: `HTTP ${res.status}: ${res.statusText}`,
    }));

    results.push(data);
  }

  return results;
}

/**
 * Send Dynamic (Personalized) SMS via POST /V2/DSMS
 */
export async function sendDynamicSms(params: SendDynamicSmsParams): Promise<MiMSMSResponse[]> {
  const { apiKey, userName, senderName, smsData, transactionType = "T" } = params;

  if (!apiKey || !userName || !senderName) {
    throw new Error("Missing MiMSMS credentials (apiKey, userName, senderName are required)");
  }

  // Sanitize all items
  const validData = smsData
    .map((item) => ({
      mobileNumber: sanitizeBdPhoneNumber(item.mobileNumber),
      message: item.message,
    }))
    .filter((item): item is { mobileNumber: string; message: string } => Boolean(item.mobileNumber && item.message));

  if (validData.length === 0) {
    throw new Error("No valid mobile numbers and messages for dynamic SMS");
  }

  const CHUNK_SIZE = 500;
  const results: MiMSMSResponse[] = [];

  for (let i = 0; i < validData.length; i += CHUNK_SIZE) {
    const chunk = validData.slice(i, i + CHUNK_SIZE);
    const payload = {
      apiKey,
      userName,
      senderName,
      transactionType,
      smsData: chunk,
    };

    const res = await fetch(`${BASE_URL}/V2/DSMS`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: MiMSMSResponse = await res.json().catch(() => ({
      statusCode: String(res.status),
      status: "Failed",
      responseResult: `HTTP ${res.status}: ${res.statusText}`,
    }));

    results.push(data);
  }

  return results;
}

/**
 * Check remaining balance via GET /V2/BalanceCheck
 */
export async function checkSmsBalance(credentials: { apiKey: string; userName: string }): Promise<MiMSMSResponse> {
  const { apiKey, userName } = credentials;

  if (!apiKey || !userName) {
    throw new Error("API Key and Username are required to check balance");
  }

  const url = `${BASE_URL}/V2/BalanceCheck?apiKey=${encodeURIComponent(apiKey)}&userName=${encodeURIComponent(userName)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data: MiMSMSResponse = await res.json().catch(() => ({
    statusCode: String(res.status),
    status: "Failed",
    responseResult: `HTTP ${res.status}: ${res.statusText}`,
  }));

  return data;
}

/**
 * Delivery Report Lookup via POST /V2/DlrApi
 */
export async function lookupDlrStatus(params: {
  apiKey: string;
  userName: string;
  trackingId: string;
}): Promise<MiMSMSResponse> {
  const { apiKey, userName, trackingId } = params;

  if (!apiKey || !userName || !trackingId) {
    throw new Error("apiKey, userName, and trackingId are required to check delivery status");
  }

  const res = await fetch(`${BASE_URL}/V2/DlrApi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, userName, trackingId }),
  });

  const data: MiMSMSResponse = await res.json().catch(() => ({
    statusCode: String(res.status),
    status: "Failed",
    responseResult: `HTTP ${res.status}: ${res.statusText}`,
  }));

  return data;
}
