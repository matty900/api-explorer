import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@repo/shared";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  try {
    const apis = await prisma.api.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
    });

    return NextResponse.json({ apis });
  } catch (error) {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
