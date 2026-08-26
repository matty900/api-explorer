import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Returns a NextResponse with 401 or 503 if the request is not authorized as an admin, or null if authorized.
export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Admin access is not configured on this server" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!provided || !safeEqual(provided, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
