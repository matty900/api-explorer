import { NextResponse } from "next/server";
import { prisma } from "@repo/shared";

export async function GET() {
  try {
    const groups = await prisma.api.groupBy({
      by: ["category"],
      _count: { category: true },
      orderBy: { _count: { category: "desc" } },
      take: 15,
    });

    const categories = groups.map((g) => g.category);
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
