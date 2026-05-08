import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@repo/shared";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";

  const categoryFilter =
    category && category !== "All" ? { category } : undefined;

  try {
    const apis = await prisma.api.findMany({
      where: {
        ...categoryFilter,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { tags: { has: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 50,
    });

    return NextResponse.json({ apis });
  } catch {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
