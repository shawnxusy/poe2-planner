// Catch-all BFF proxy: browser hits /api/* on this Next.js app, we
// forward it server-side to the api service over Railway's private
// network. Removes CORS, lets us keep the api private, and gives us a
// stable single origin for the UI.
//
//   API_INTERNAL_URL  Where to forward to. Defaults to localhost:3001
//                     for local dev. In Railway production, set to
//                     http://api.railway.internal:3001 (or wire it as a
//                     reference variable: ${{api.RAILWAY_PRIVATE_DOMAIN}}).
//
// Anything under /api/* on this app is proxied verbatim — method,
// query string, body, response status. Hop-by-hop headers stripped.

import type { NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Headers that don't make sense to forward as-is — either rewritten by
// fetch() or hop-by-hop per RFC 7230.
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "transfer-encoding",
  "upgrade",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "keep-alive",
  "content-encoding", // upstream may gzip; let Next handle re-encoding
  "content-length", // recomputed when we re-stream
]);

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target = `${API_BASE}/api/${path.join("/")}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  // Only forward a body for methods that carry one. ArrayBuffer keeps
  // it binary-safe (JSON, multipart, etc.).
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
    init.duplex = "half"; // Node's fetch requires this when body is set
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return Response.json(
      {
        error: "upstream api unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      respHeaders.set(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
