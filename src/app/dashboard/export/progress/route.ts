import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, NotFoundError } from "@/lib/rbac";
import { progressReportService } from "@/lib/services/progressReport";

export const dynamic = "force-dynamic";

/**
 * GET /dashboard/export/progress[?exercise=<id>]
 * A read-only PDF of recorded progression and PRs, for the athlete to send to a
 * coach. The dashboard middleware requires sign-in; the service re-checks it.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("exercise");
  try {
    const { bytes, filename } = await progressReportService.pdf({ exerciseId: id && /^[\w-]{1,64}$/.test(id) ? id : undefined });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    if (e instanceof AuthenticationError) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });
    if (e instanceof AuthorizationError) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: "No data to export yet." }, { status: 404 });
    return NextResponse.json({ error: "The export could not be created." }, { status: 500 });
  }
}
