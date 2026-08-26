import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  const ip = getClientIp(req);

  const rateCheck = checkRateLimit(`upload_${ip}`, { limit: 40, windowMs: 60 * 1000 });
  if (!rateCheck.success) {
    return NextResponse.json({ error: "Upload rate limit exceeded. Please wait a moment." }, {
      status: 429,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Retry-After": String(rateCheck.resetInSeconds),
      },
    });
  }

  try {
    let session: any = null;
    try {
      session = await requireSession();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "IMGBB_API_KEY is not configured" }, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    const formData = await req.formData();
    const file = formData.get("image");
    if (!file) {
      return NextResponse.json({ error: "No image file provided" }, {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    const blob = file as Blob;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const imgbbForm = new FormData();
    imgbbForm.append("image", base64);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body: imgbbForm,
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Image upload failed" }, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    const json = await res.json();
    if (!json.success) {
      return NextResponse.json({ error: json.error?.message || "Upload failed" }, {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }

    const imageUrl = json.data?.url as string;
    const deleteUrl = json.data?.delete_url as string;

    // Store deletion URL in DB for automatic cleanup
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      await db.collection("uploaded_images").insertOne({
        _id: crypto.randomUUID() as any,
        owner_id: session?.ownerId || null,
        url: imageUrl,
        display_url: json.data?.display_url || imageUrl,
        delete_url: deleteUrl || null,
        created_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn("Could not save image delete_url:", dbErr);
    }

    return NextResponse.json({ url: imageUrl, delete_url: deleteUrl }, {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Something went wrong" }, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }
}

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
