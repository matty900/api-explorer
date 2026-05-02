import { NextRequest, NextResponse } from "next/server";

const BLOCKED = [
  /^https?:\/\/localhost/,
  /^https?:\/\/127\./,
  /^https?:\/\/0\.0\.0\.0/,
  /^https?:\/\/10\./,
  /^https?:\/\/192\.168\./,
];

export async function POST(req: NextRequest) {
  const { method, url, headers, body } = await req.json();

  if (BLOCKED.some((p) => p.test(url))) {
    return NextResponse.json(
      { error: "Internal network requests are not allowed" },
      { status: 403 },
    );
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const start = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : undefined,
    });

    const responseBody = await response.text();
    const durationMs = Date.now() - start;

    return NextResponse.json(
      {
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
        durationMs,
      },
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        statusText: "Network Error",
        body: `Could not reach ${url}`,
        durationMs: Date.now() - start,
      },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
