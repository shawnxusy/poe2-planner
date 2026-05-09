import { deflateRawSync, inflateRawSync, inflateSync } from "node:zlib";
import { Buffer } from "node:buffer";

// PoB-PoE2 share codes are: URL-safe Base64 → zlib deflate → UTF-8 XML.
// PoB's `Deflate()` Lua wrapper uses zlib format (RFC 1950, with 2-byte
// header + 4-byte Adler32 trailer) — real codes start with bytes 0x78 0xDA.
//
// Real-world codes copied through Slack / Discord / chat clients sometimes
// arrive with the trailing Adler32 corrupted (utf-8 normalization or
// trailing-whitespace stripping touches the last few base64 chars). The
// deflate body itself is normally intact, so we fall back to raw-inflate
// the body (skip header + trailer) when the strict zlib check fails. PoB
// desktop is similarly tolerant.

export function decodePobCode(code: string): string {
  // Strip everything that isn't valid in URL-safe base64. Real codes copy-
  // pasted from forums or chat clients sometimes pick up zero-width spaces,
  // box-drawing chars from "view truncated…" UI, or unicode dashes that
  // look like "-" but are actually em-dashes. Keep only [A-Za-z0-9-_=].
  const cleaned = code.replace(/[^A-Za-z0-9\-_=]/g, "");
  const standard = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const compressed = Buffer.from(standard, "base64");
  if (compressed.length < 6) {
    throw new Error("decodePobCode: payload too short to be a PoB code");
  }
  try {
    return inflateSync(compressed).toString("utf-8");
  } catch (err) {
    // Fall through to raw-inflate the body. If THIS fails the data really
    // is corrupted beyond recovery and we surface the original error.
    try {
      const body = compressed.subarray(2, compressed.length - 4);
      return inflateRawSync(body).toString("utf-8");
    } catch {
      throw err;
    }
  }
}

export function encodePobCode(xml: string): string {
  // We always emit a proper zlib-wrapped stream (header + body + Adler32)
  // so the output round-trips through any standard zlib decoder.
  const buf = Buffer.from(xml, "utf-8");
  const body = deflateRawSync(buf);

  // Build zlib header: CMF=0x78 (deflate, 32K window) + FLG with check.
  // Default level produces 0x9C; we use 0xDA to match PoB's high-compression.
  const header = Buffer.from([0x78, 0xda]);
  const adler = adler32(buf);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(adler, 0);
  const out = Buffer.concat([header, body, trailer]);

  return out.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function adler32(buf: Buffer): number {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]!) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}
