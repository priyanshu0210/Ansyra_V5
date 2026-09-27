import { env } from "./env";

// Optional server-side error reporting (Phase 13.4). Completely inert unless
// SENTRY_DSN is set — no import cost, no network calls, no behavior change.
// @sentry/node is kept OUT of the esbuild bundle (--external in the build
// script) and resolved from node_modules at runtime, which the Docker image
// ships anyway; bundling it trips over its OpenTelemetry dynamic requires.

let capture: ((err: unknown) => void) | null = null;
let flush: ((timeout: number) => Promise<boolean>) | null = null;

export async function initServerSentry(): Promise<void> {
  if (!env.sentryDsn) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.isProduction ? "production" : "development",
      // Render exposes the deployed commit; harmless undefined elsewhere.
      release: process.env.RENDER_GIT_COMMIT || process.env.APP_RELEASE || undefined,
      // Errors only — tracing would burn through the free tier for nothing.
      tracesSampleRate: 0,
    });
    capture = (err) => Sentry.captureException(err);
    flush = (timeout) => Sentry.flush(timeout);
    console.log("[sentry] server error reporting enabled");
  } catch (err) {
    // A monitoring failure must never take the app down with it.
    console.error("[sentry] init failed — continuing without error reporting", err);
  }
}

export function captureServerException(err: unknown): void {
  capture?.(err);
}

export async function flushServerSentry(timeoutMs = 2_000): Promise<void> {
  await flush?.(timeoutMs).catch(() => false);
}
