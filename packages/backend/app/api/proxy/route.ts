// proxy endpoint that makes live HTTP requests to the actual third-party APIs
// inline request testing
// SSRF (Server-Side Request Forgery) protection layer.
import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b, c] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.slice("::ffff:".length);
    if (isIP(v4) === 4) return isBlockedIPv4(v4);
  }
  if (normalized.startsWith("fe80:")) return true; // link-local incl. metadata via fe80::
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local (ULA)
  if (normalized.startsWith("ff")) return true; // multicast
  return false;
}

function isBlockedIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true; // couldn't parse it — fail closed
}

async function validateTarget(
  targetUrl: URL,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
    return {
      ok: false,
      reason: `protocol ${targetUrl.protocol} is not allowed`,
    };
  }

  const hostname = stripBrackets(targetUrl.hostname);
  const literalVersion = isIP(hostname);

  let addresses: string[];
  if (literalVersion) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname, { all: true })).map((r) => r.address);
    } catch {
      return { ok: false, reason: "could not resolve host" };
    }
  }

  if (addresses.length === 0 || addresses.some(isBlockedIP)) {
    return {
      ok: false,
      reason: "target resolves to a blocked internal or reserved address",
    };
  }

  return { ok: true };
}

export async function POST(req: NextRequest) {
  const { method, url, headers, body } = await req.json();

  let currentUrl: URL;
  try {
    currentUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const start = Date.now();
  let currentMethod = method;
  let currentBody = method !== "GET" && method !== "HEAD" ? body : undefined;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const validation = await validateTarget(currentUrl);
    if (!validation.ok) {
      return NextResponse.json(
        { error: `Request blocked: ${validation.reason}` },
        { status: 403 },
      );
    }

    try {
      const response = await fetch(currentUrl, {
        method: currentMethod,
        headers,
        body:
          currentMethod !== "GET" && currentMethod !== "HEAD"
            ? currentBody
            : undefined,
        redirect: "manual",
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return NextResponse.json(
            { error: "Redirect response missing Location header" },
            { status: 502 },
          );
        }

        currentUrl = new URL(location, currentUrl);
        // 303 always downgrades to GET; 301/302 downgrade non-GET/HEAD bodies for
        // compatibility with the historical (incorrect but ubiquitous) browser behavior.
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) &&
            currentMethod !== "GET" &&
            currentMethod !== "HEAD")
        ) {
          currentMethod = "GET";
          currentBody = undefined;
        }
        continue;
      }

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
          body: `Could not reach ${currentUrl}`,
          durationMs: Date.now() - start,
        },
        { headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }
  }

  return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
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
