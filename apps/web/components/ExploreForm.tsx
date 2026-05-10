"use client";

import { useRef, useState } from "react";

type StreamState = "idle" | "streaming" | "done" | "error";

interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  iterations: number;
  estimated_cost_usd: number;
}

// Simple line-by-line markdown renderer for the agent's structured output.
// Handles: ## h2, ### h3, **bold**, - list items, blank-line paragraphs.
function renderLine(line: string, idx: number): React.ReactNode {
  if (line.startsWith("## ")) {
    const text = line.slice(3);
    return (
      <h2
        key={idx}
        className="mt-8 first:mt-0 font-display text-xl leading-snug text-gold-400"
      >
        {inlineMarkdown(text)}
      </h2>
    );
  }
  if (line.startsWith("### ")) {
    const text = line.slice(4);
    return (
      <h3
        key={idx}
        className="mt-6 text-[11px] uppercase tracking-[0.2em] text-ink-500"
      >
        {text}
      </h3>
    );
  }
  if (line.startsWith("- ") || line.startsWith("* ")) {
    const text = line.slice(2);
    // Split "Label — explanation" so the dash-part is dimmed
    const dashIdx = text.indexOf(" — ");
    return (
      <li key={idx} className="ml-4 list-none text-sm leading-relaxed">
        <span className="mr-1 text-gold-600">–</span>
        {dashIdx !== -1 ? (
          <>
            <span className="text-ink-100">{inlineMarkdown(text.slice(0, dashIdx))}</span>
            <span className="text-ink-500">{" — " + text.slice(dashIdx + 3)}</span>
          </>
        ) : (
          <span className="text-ink-100">{inlineMarkdown(text)}</span>
        )}
      </li>
    );
  }
  if (line.trim() === "") {
    return <div key={idx} className="h-2" />;
  }
  return (
    <p key={idx} className="text-sm leading-relaxed text-ink-300">
      {inlineMarkdown(line)}
    </p>
  );
}

function inlineMarkdown(text: string): React.ReactNode {
  // Handle **bold** spans
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ink-100">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function UsageFooter({ usage }: { usage: UsageSummary }) {
  const fmt = (n: number) => n.toLocaleString();
  const cost = usage.estimated_cost_usd;
  const costStr = cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-700/40 px-5 py-3 text-[10px] text-ink-600">
      <span>
        <span className="text-ink-400">{costStr}</span> est. cost
      </span>
      <span>
        <span className="text-ink-400">{fmt(usage.input_tokens)}</span> in
        {" / "}
        <span className="text-ink-400">{fmt(usage.output_tokens)}</span> out tokens
      </span>
      <span>
        <span className="text-ink-400">{usage.tool_calls}</span> tool calls
        {" · "}
        <span className="text-ink-400">{usage.iterations}</span> iterations
      </span>
    </div>
  );
}

function BuildConceptCard({ text, state, usage }: { text: string; state: StreamState; usage: UsageSummary | null }) {
  const lines = text.split("\n");

  return (
    <div className="mt-8 rounded-xl border border-ink-700 bg-ink-900/70 shadow-card">
      <div className="flex items-center justify-between border-b border-ink-700/60 px-4 py-3">
        <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
          Build Concept
        </span>
        <span className="flex items-center gap-2 text-[10px] text-ink-500">
          {state === "streaming" && (
            <>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold-500" />
              Thinking…
            </>
          )}
          {state === "done" && (
            <span className="text-gold-500/60">Complete</span>
          )}
          {state === "error" && (
            <span className="text-ember-500">Error</span>
          )}
        </span>
      </div>
      <div className="space-y-1 px-5 py-5">
        {lines.map((line, i) => renderLine(line, i))}
        {state === "streaming" && (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-gold-500/60 align-middle" />
        )}
      </div>
      {usage && <UsageFooter usage={usage} />}
    </div>
  );
}

export function ExploreForm() {
  const [seed, setSeed] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<StreamState>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    abortRef.current?.abort();
    setSeed("");
    setText("");
    setState("idle");
    setErrMsg(null);
    setUsage(null);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = seed.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText("");
    setErrMsg(null);
    setState("streaming");

    try {
      const res = await fetch("/api/builds/explore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed: trimmed }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const msg = JSON.parse(payload) as {
              type: string;
              text?: string;
              message?: string;
              input_tokens?: number;
              output_tokens?: number;
              tool_calls?: number;
              iterations?: number;
              estimated_cost_usd?: number;
            };
            if (msg.type === "text" && msg.text) {
              setText((prev) => prev + msg.text);
            } else if (msg.type === "usage") {
              setUsage({
                input_tokens: msg.input_tokens ?? 0,
                output_tokens: msg.output_tokens ?? 0,
                tool_calls: msg.tool_calls ?? 0,
                iterations: msg.iterations ?? 0,
                estimated_cost_usd: msg.estimated_cost_usd ?? 0,
              });
            } else if (msg.type === "done") {
              setState("done");
            } else if (msg.type === "error") {
              setErrMsg(msg.message ?? "Unknown error from agent.");
              setState("error");
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }

      // If stream ended without explicit done event
      setState((s) => (s === "streaming" ? "done" : s));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrMsg(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  const busy = state === "streaming";

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <label
          htmlFor="explore-seed"
          className="block text-[11px] uppercase tracking-[0.18em] text-ink-500"
        >
          Describe an archetype or mechanic
        </label>
        <div
          className={`relative rounded-xl border bg-ink-900/70 shadow-card transition ${
            busy
              ? "border-gold-500/40"
              : "border-ink-700 focus-within:border-gold-500/50 focus-within:shadow-glow"
          }`}
        >
          <input
            id="explore-seed"
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            disabled={busy}
            placeholder="e.g. Voltaxic Rift chaos shock, plant minion Invoker, bleed warrior"
            className="w-full rounded-xl bg-transparent px-4 py-3.5 text-sm text-ink-100 placeholder:text-ink-600 outline-none disabled:opacity-60"
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {(text || errMsg || state !== "idle") && (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-transparent px-3 py-1.5 text-xs text-ink-500 hover:border-ink-700 hover:text-ink-100"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !seed.trim()}
            className="rounded-md border border-gold-500/50 bg-gradient-to-b from-gold-500/15 to-gold-600/10 px-4 py-1.5 text-xs font-medium text-gold-400 transition hover:from-gold-500/25 hover:to-gold-600/20 disabled:opacity-50"
          >
            {busy ? "Thinking…" : "Explore build"}
          </button>
        </div>
      </form>

      {errMsg && state !== "error" && null}
      {errMsg && state === "error" && (
        <div
          role="alert"
          className="rounded-md border border-ember-600/50 bg-ember-600/10 px-3 py-2 text-sm text-ember-500"
        >
          {errMsg}
        </div>
      )}

      {(text || state === "streaming") && (
        <BuildConceptCard text={text} state={state} usage={usage} />
      )}
    </div>
  );
}
