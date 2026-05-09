"use client";

import { useState, useTransition } from "react";
import type { ApiError, ImportPobResponse } from "../lib/types";
import { StatsCard } from "./StatsCard";

// Same-origin: hits /api/builds/import-pob on this Next.js app, which
// proxies it to the api service over the private network (see
// app/api/[...path]/route.ts).
export function ImportForm() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ImportPobResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim()) {
      setErr("Paste a Path of Building share code first.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/builds/import-pob`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
        });
        const body = (await res.json()) as ImportPobResponse | ApiError;
        if (!res.ok || "error" in body) {
          const e = body as ApiError;
          setErr(e.detail ? `${e.error} — ${e.detail}` : e.error);
          setResult(null);
          return;
        }
        setResult(body as ImportPobResponse);
      } catch (e) {
        setErr(
          e instanceof Error
            ? `Network error: ${e.message}`
            : "Network error contacting the API.",
        );
        setResult(null);
      }
    });
  }

  function reset() {
    setCode("");
    setResult(null);
    setErr(null);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-3">
        <label
          htmlFor="pob-code"
          className="block text-[11px] uppercase tracking-[0.18em] text-ink-500"
        >
          Path of Building share code
        </label>
        <div
          className={`relative rounded-xl border bg-ink-900/70 shadow-card transition ${
            isPending
              ? "border-gold-500/40 glow-pulse"
              : "border-ink-700 focus-within:border-gold-500/50 focus-within:shadow-glow"
          }`}
        >
          <textarea
            id="pob-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={isPending}
            placeholder="eyJ2ZXJzaW9uIjoxLCJjb2RlIjoiZUp4VFVK..."
            rows={6}
            className="w-full resize-y rounded-xl bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-ink-100 placeholder:text-ink-600 outline-none disabled:opacity-60"
            spellCheck={false}
          />
          <div className="flex items-center justify-between border-t border-ink-700/60 px-3 py-2 text-xs text-ink-500">
            <span>
              {code.length > 0
                ? `${code.length.toLocaleString()} chars`
                : "Paste from PoB → Build menu → Share → Generate code"}
            </span>
            <div className="flex items-center gap-2">
              {(code || result || err) && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={isPending}
                  className="rounded-md border border-transparent px-2.5 py-1 text-ink-500 hover:border-ink-700 hover:text-ink-100 disabled:opacity-40"
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={isPending}
                className="group relative rounded-md border border-gold-500/50 bg-gradient-to-b from-gold-500/15 to-gold-600/10 px-4 py-1.5 font-medium text-gold-400 transition hover:from-gold-500/25 hover:to-gold-600/20 hover:text-gold-400 disabled:opacity-50"
              >
                {isPending ? "Inspecting…" : "Inspect build"}
              </button>
            </div>
          </div>
        </div>
        {err && (
          <div
            role="alert"
            className="rounded-md border border-ember-600/50 bg-ember-600/10 px-3 py-2 text-sm text-ember-500"
          >
            {err}
          </div>
        )}
      </form>

      {result && (
        <StatsCard
          header={result.header}
          stats={result.stats}
          passiveCount={result.build.passives.length}
          itemCount={result.build.items.length}
          skillCount={result.build.skills.length}
        />
      )}
    </div>
  );
}
