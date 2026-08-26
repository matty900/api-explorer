import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@repo/shared";

//top 15 by frequency, for the extension's category-pill filter.
// complete dropdown (e.g. the submit form) so contributors pick an existing

export async function GET(req: NextRequest) {
  const all = new URL(req.url).searchParams.get("all") === "true";

  try {
    const groups = await prisma.api.groupBy({
      by: ["category"],
      _count: { category: true },
      orderBy: all ? { category: "asc" } : { _count: { category: "desc" } },
      ...(all ? {} : { take: 15 }),
    });

    const categories = groups.map((g: { category: string }) => g.category);
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
