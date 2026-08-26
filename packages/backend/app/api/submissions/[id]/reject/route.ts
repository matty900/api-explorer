import { NextRequest, NextResponse } from "next/server";
import { rejectSubmission } from "@repo/shared";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  let reviewNote: string | undefined;
  try {
    const body = await req.json();
    reviewNote = typeof body?.reviewNote === "string" ? body.reviewNote : undefined;
  } catch {
    // no body provided — reject without a note
  }

  const result = await rejectSubmission(id, reviewNote);
  if (!result.ok) {
    return NextResponse.json({ error: result.errors.join("; ") }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
