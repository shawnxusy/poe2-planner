// Single-line structured logger for ingest steps. Aim is grep-friendly output.
const start = Date.now();

function ms() {
  return ((Date.now() - start) / 1000).toFixed(1) + "s";
}

export function info(msg: string, fields?: Record<string, unknown>) {
  if (fields) {
    console.log(`[${ms()}] ${msg}`, fields);
  } else {
    console.log(`[${ms()}] ${msg}`);
  }
}

export function warn(msg: string, fields?: Record<string, unknown>) {
  if (fields) {
    console.warn(`[${ms()}] WARN: ${msg}`, fields);
  } else {
    console.warn(`[${ms()}] WARN: ${msg}`);
  }
}

export function error(msg: string, err: unknown) {
  console.error(`[${ms()}] ERROR: ${msg}`, err instanceof Error ? err.stack : err);
}
