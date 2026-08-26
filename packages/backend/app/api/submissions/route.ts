import { NextRequest, NextResponse } from "next/server";
import {
  createSubmission,
  listSubmissions,
  type SubmissionStatus,
} from "@repo/shared";
import { requireAdmin } from "@/lib/adminAuth";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Public: submit an API for review. Anyone can call this, so it's rate-limited
// and validated the same way as every other addApi() caller.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`submit:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 },
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Honeypot: a real form leaves this hidden field empty. Bots that
  // autofill every field trip it,  pretend to succeed so they don't adapt.
  if (typeof payload?.website === "string" && payload.website.trim() !== "") {
    return NextResponse.json({ ok: true, id: "ok" }, { status: 201 });
  }

  const result = await createSubmission(payload, payload?.email);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}

// Admin: list submissions by status (defaults to pending).
export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const status = (new URL(req.url).searchParams.get("status") ??
    "pending") as SubmissionStatus;
  if (!["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json(
      { error: "invalid status filter" },
      { status: 400 },
    );
  }

  const submissions = await listSubmissions(status);
  return NextResponse.json({ submissions });
}
