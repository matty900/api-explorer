import { NextRequest, NextResponse } from "next/server";
import { approveSubmission } from "@repo/shared";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const result = await approveSubmission(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.errors.join("; ") }, { status: 400 });
  }

  return NextResponse.json({ ok: true, apiId: result.apiId });
}
