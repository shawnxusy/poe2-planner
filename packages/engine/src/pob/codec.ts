import { deflateRawSync, inflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

// PoB-PoE2 share codes are: URL-safe Base64 → raw zlib deflate → UTF-8 XML.
// The transform is identical to PoE1's PoB. Per PoB-PoE2 ImportTab.lua:
//   common.base64.encode(Deflate(SaveDB("code"))):gsub("+","-"):gsub("/","_")

export function decodePobCode(code: string): string {
  // Trim whitespace and strip newlines that often sneak in when codes are
  // copy-pasted from forums or pobb.in.
  const cleaned = code.replace(/\s+/g, "");
  // Reverse the URL-safe Base64 substitutions.
  const standard = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const compressed = Buffer.from(standard, "base64");
  if (compressed.length === 0) {
    throw new Error("decodePobCode: empty payload after base64 decode");
  }
  const xml = inflateRawSync(compressed);
  return xml.toString("utf-8");
}

export function encodePobCode(xml: string): string {
  const compressed = deflateRawSync(Buffer.from(xml, "utf-8"));
  const b64 = compressed.toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}
