import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lightweight health probe for Azure App Service. Does not touch the database
// so it stays fast and does not fail the app during transient DB issues.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
