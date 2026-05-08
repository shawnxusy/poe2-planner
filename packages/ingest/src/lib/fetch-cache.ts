import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { info } from "./log.js";

// Cache HTTP responses to disk so iterating during dev doesn't re-hit the
// upstream. Stale-while-revalidate-style: anything fresher than maxAgeMs is
// served from cache; anything older is re-fetched.
//
// Cache lives under packages/ingest/.cache/<key> at process cwd. The key is
// the URL path with safe chars only.

const CACHE_ROOT = resolve(process.cwd(), ".cache", "fetch");

function cachePathFor(url: string): string {
  const safe = url.replace(/[^a-zA-Z0-9_./-]/g, "_");
  return resolve(CACHE_ROOT, safe);
}

interface FetchOptions {
  // How fresh the cache hit must be to skip the network. Default: 6h.
  maxAgeMs?: number;
  // If true, force re-fetch and overwrite the cache.
  bypassCache?: boolean;
}

export async function fetchTextCached(
  url: string,
  opts: FetchOptions = {},
): Promise<string> {
  const maxAgeMs = opts.maxAgeMs ?? 6 * 60 * 60 * 1000;
  const path = cachePathFor(url);

  if (!opts.bypassCache) {
    try {
      const stats = await stat(path);
      const age = Date.now() - stats.mtimeMs;
      if (age <= maxAgeMs) {
        const buf = await readFile(path, "utf-8");
        info("cache hit", { url, ageS: Math.round(age / 1000) });
        return buf;
      }
    } catch {
      // miss
    }
  }

  info("fetching", { url });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf-8");
  return text;
}

export async function fetchJsonCached<T = unknown>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const text = await fetchTextCached(url, opts);
  return JSON.parse(text) as T;
}
