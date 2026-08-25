import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requestStore } from "@/lib/request-store";
import * as actions from "@/lib/rpc-actions";
import * as adminActions from "@/lib/rpc-admin-actions";

// Merge user actions and admin actions
const allActions: Record<string, Function> = {
  ...actions,
  ...adminActions,
};

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
    },
  });
}

// Main RPC handler
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  try {
    let bodyText = "";
    try {
      bodyText = await req.text();
    } catch (e) {}
    if (!bodyText || !bodyText.trim()) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }
    const { actionName, args, token, activeProfile } = JSON.parse(bodyText);

    return await requestStore.run({ token, activeProfile }, async () => {
      if (token) {
        const cookieStore = await cookies();
        cookieStore.set("token", token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
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
