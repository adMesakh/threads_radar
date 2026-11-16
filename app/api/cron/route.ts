import { NextRequest, NextResponse } from "next/server";
import { runFetch } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Cron otomatis mengirim header "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runFetch("cron");
  return NextResponse.json(summary);
}
