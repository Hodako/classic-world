
// auth-helpers.ts — all crypto imports are dynamic to avoid client-bundle issues

/** Build the JWT secret lazily */
async function getSecret() {
  const { default: process } = await import("node:process");
  const { TextEncoder } = globalThis;
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "classicworld-fallback-secret-key-123456"
  );
}

export async function signToken(payload: { userId: string; email: string; role?: string }) {
  const { SignJWT } = await import("jose");
  const secret = await getSecret();
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { jwtVerify } = await import("jose");
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: string; email: string };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const { hashSync } = await import("bcrypt-ts");
  return hashSync(password, 10);
}

export async function comparePassword(password: string, hashed: string, plain?: string): Promise<boolean> {
  if (!password) return false;
  const raw = String(password);
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // 1. Try bcrypt match with raw password
  try {
    const { compareSync } = await import("bcrypt-ts");
    if (hashed && compareSync(raw, hashed)) return true;
  } catch (_) {}

  // 2. Try bcrypt match with trimmed password
  try {
    const { compareSync } = await import("bcrypt-ts");
    if (hashed && compareSync(trimmed, hashed)) return true;
  } catch (_) {}

  // 3. Fallback: match against optional plain_password field (raw, trimmed, or lowercase)
  if (plain) {
    const pRaw = String(plain);
    const pTrim = pRaw.trim();
    const pLower = pTrim.toLowerCase();
    if (pRaw === raw || pTrim === trimmed || pLower === lower) return true;
  }

  // 4. Fallback: direct string equality if hashed in DB was stored as unhashed plain text
  if (hashed) {
    const hRaw = String(hashed);
    const hTrim = hRaw.trim();
    const hLower = hTrim.toLowerCase();
    if (hRaw === raw || hTrim === trimmed || hLower === lower) return true;
  }

  return false;
}

/** Parse cookies from a Request object */
export function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get("cookie") || "";
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    })
  );
}

/** Read session from a standard Request */
export async function getSessionUser(request: Request) {
  const cookies = parseCookies(request);
  const token = cookies["token"];
  if (!token) return null;
  return await verifyToken(token);
}

/** Build a Set-Cookie header string */
export function buildSetCookieHeader(
  name: string,
  value: string,
  options: { maxAge?: number; delete?: boolean } = {}
): string {
  if (options.delete) {
    return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
  }
  const maxAge = options.maxAge ?? 30 * 24 * 60 * 60;
  const secure =
    typeof process !== "undefined" && process.env?.NODE_ENV === "production"
      ? "; Secure"
      : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** JSON response helper */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
