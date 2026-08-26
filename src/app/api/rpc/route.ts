import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requestStore } from "@/lib/request-store";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import * as actions from "@/lib/rpc-actions";
import * as adminActions from "@/lib/rpc-admin-actions";

// Merge user actions and admin actions
const allActions: Record<string, Function> = {
  ...actions,
  ...adminActions,
};

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB payload limit

// CORS preflight handler
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, Cookie, Authorization, Accept, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Main RPC handler
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  const ip = getClientIp(req);

  // Anti-DDoS Rate Limiting Guard
  const rateCheck = checkRateLimit(ip, { limit: 250, windowMs: 60 * 1000 });
  if (!rateCheck.success) {
    return new NextResponse(
      JSON.stringify({ error: rateCheck.blocked ? "IP temporarily blocked due to excessive requests" : "Too Many Requests" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Retry-After": String(rateCheck.resetInSeconds),
        },
      }
    );
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new NextResponse(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
      });
    }

    let bodyText = "";
    try {
      bodyText = await req.text();
    } catch (e) {}
    if (!bodyText || !bodyText.trim()) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }
    const { actionName, args, token, activeProfile } = JSON.parse(bodyText);

    const authHeader = req.headers.get("authorization");
    let effectiveToken = token;
    if (!effectiveToken && authHeader && authHeader.startsWith("Bearer ")) {
      effectiveToken = authHeader.substring(7);
    }
    if (!effectiveToken) {
      try {
        const cookieStore = await cookies();
        effectiveToken = cookieStore.get("token")?.value;
      } catch (_) {}
    }

    return await requestStore.run({ token: effectiveToken, activeProfile }, async () => {
      if (effectiveToken) {
        try {
          const cookieStore = await cookies();
          cookieStore.set("token", effectiveToken, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
        } catch (_) {}
      }
      if (activeProfile) {
        const cookieStore = await cookies();
        cookieStore.set("active_profile", activeProfile, { maxAge: 365 * 24 * 60 * 60, path: "/" });
      }

      const action = allActions[actionName];
      if (!action || typeof action !== "function") {
        return new NextResponse(`Action ${actionName} not found`, {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
          },
        });
      }

      const result = await action(args);

      return NextResponse.json(result, {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    });
  } catch (error: any) {
    const status = error?.statusCode || (
      error?.message === "Invalid email or password" || error?.message?.includes("Unauthorized") ? 401 :
      error?.message?.includes("not found") || error?.message?.includes("required") || error?.message?.includes("balance") ? 400 : 500
    );

    if (status >= 500) {
      console.error(`RPC API error during POST:`, error);
    } else {
      console.warn(`RPC API client error [${status}]: ${error?.message || "Bad Request"}`);
    }

    return new NextResponse(error?.message || "Internal Server Error", {
      status,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }
}
