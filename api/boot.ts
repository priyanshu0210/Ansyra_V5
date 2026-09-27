import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { registerExportRoutes } from "./export-routes";
import { env } from "./lib/env";
import { initServerSentry, captureServerException, flushServerSentry } from "./lib/sentry";
import { inlineScriptHashes } from "./lib/csp";
import { closeDb, getDb } from "./queries/connection";
import { assertDeploymentReady } from "./lib/deployment-check";

await initServerSentry();

// A single unhandled rejection / uncaught exception must NOT take down the whole
// server. In dev the API runs inside the Vite process (@hono/vite-dev-server),
// so an uncaught error there kills Vite — which is why the dashboard (many
// concurrent DB queries) could "stop the server". The usual trigger is an async
// I/O error with no local catch (e.g. an idle Postgres connection the Supabase
// pooler dropped). Log it and keep serving instead of exiting.
async function handleFatal(reason: unknown, label: string) {
  const rendered = reason instanceof Error ? reason.stack : reason;
  console.error(`[${label}]`, rendered);
  captureServerException(reason);
  if (!env.isProduction) return;
  await flushServerSentry();
  await closeDb().catch(() => undefined);
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  void handleFatal(reason, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  void handleFatal(err, "uncaughtException");
});

// Keep a WebSocket fallback for supported Node runtimes/build variants where
// the global implementation is unavailable. Supabase constructs its Realtime
// client eagerly even though this server does not subscribe to Realtime.
if (typeof globalThis.WebSocket === "undefined") {
  const wsMod = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = wsMod.WebSocket;
}

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(
  secureHeaders({
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
    // Vite's dev server serves the HTML/JS itself (only /api/* is routed
    // through this Hono app in dev — see vite.config.ts), so a strict CSP
    // here can't break HMR; keep it prod-only anyway per the plan in case
    // that ever changes.
    strictTransportSecurity: env.isProduction ? "max-age=31536000; includeSubDomains" : false,
    contentSecurityPolicy: env.isProduction
      ? {
          defaultSrc: ["'self'"],
          baseUri: ["'none'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          // The inline pre-paint boot script in index.html, by hash. Without
          // it `script-src 'self'` blocks the one script that must run before
          // the first frame — see api/lib/csp.ts.
          scriptSrc: ["'self'", ...inlineScriptHashes()],
          connectSrc: [
            "'self'",
            "https://*.supabase.co",
            "https://*.ingest.sentry.io",
            "https://*.ingest.us.sentry.io",
          ],
        }
      : undefined,
  }),
);
app.use(bodyLimit({ maxSize: 2 * 1024 * 1024 }));

// Liveness and readiness are exempt from the canonical-host redirect below:
// the container HEALTHCHECK calls 127.0.0.1 and the platform's checker may use
// its own default hostname.
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", async (c) => {
  try {
    await getDb().execute(sql`select 1`);
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});

// Every mutation requires `Origin === SITE_URL` (api/lib/request-security.ts),
// so a user who opens the platform's default hostname could browse but never
// sign in. Send them to the canonical origin instead. GET/HEAD redirect; other
// methods are refused with 421 rather than silently served on the wrong host.
//
// Only PUBLIC hostnames are redirected. A proxy that rewrites Host to an
// internal service name, an IP literal or localhost would otherwise turn this
// into a redirect loop; those requests are served as-is. The bearer-secret cron
// path is exempt too — it is authenticated by the secret, not by origin, and a
// scheduler pointed at the platform's default hostname must still work.
function isPublicHostname(host: string): boolean {
  const name = host.replace(/:\d+$/, "");
  if (!name || name === "localhost" || name.startsWith("[")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return false;
  return name.includes(".");
}

if (env.isProduction && env.siteUrl && env.canonicalHostRedirect) {
  const canonical = new URL(env.siteUrl);
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/internal/")) return next();
    const forwardedHost = env.trustProxyHeaders ? c.req.header("x-forwarded-host") : undefined;
    const host = (forwardedHost?.split(",")[0] ?? c.req.header("host") ?? "").trim().toLowerCase();
    if (!isPublicHostname(host) || host === canonical.host.toLowerCase()) return next();
    if (c.req.method === "GET" || c.req.method === "HEAD") {
      const url = new URL(c.req.url);
      return c.redirect(`${canonical.origin}${url.pathname}${url.search}`, 301);
    }
    return c.json({ error: `Use ${canonical.origin}.` }, 421);
  });
}

app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

function secretMatches(header: string | undefined): boolean {
  if (!env.cronSecret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(env.cronSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Called by Supabase Cron, Railway Cron, or another external scheduler. It is
// intentionally not an in-process interval so scale-to-zero and replicas do
// not lose or duplicate scheduling responsibility.
app.post("/internal/cron/deadlines", async (c) => {
  if (!secretMatches(c.req.header("authorization"))) return c.json({ error: "Unauthorized" }, 401);
  const { checkDeadlines } = await import("./lib/deadline-check");
  const { sweepOrphanedDocuments } = await import("./lib/storage-sweep");
  const result = await checkDeadlines();
  await getDb().execute(sql`delete from public.rate_limits where reset_at < now() - interval '1 day'`);
  await getDb().execute(sql`
    delete from public.chat_messages
    where "userId" is null and "createdAt" < now() - interval '7 days'
  `);
  // Storage objects whose documents row is gone (deal deleted, confirm never
  // called, removal failed). A rotating window with a 45 s budget, so the
  // whole request stays inside the scheduler's timeout; never touches anything
  // under an hour old so an in-flight upload is not swept before its confirm.
  const storage = await sweepOrphanedDocuments({ budgetMs: 45_000 }).catch((err: unknown) => {
    console.warn("[cron] orphan sweep failed:", err instanceof Error ? err.message : err);
    return { folders: 0, scanned: 0, removed: 0, partial: true, failed: true };
  });
  return c.json({ ...result, storage });
});

// Non-tRPC file downloads (CSV export) — mounted before the tRPC handler and the
// catch-all so the specific GET route wins. Auth/scoping handled inside.
registerExportRoutes(app);

app.use("/api/trpc/*", async (c) => {
  // The socket peer address, for rate limiting when proxy headers are not
  // trusted. Absent under the Vite dev-server adapter, which has no bindings.
  const remoteAddress = c.env?.incoming?.socket?.remoteAddress ?? undefined;
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: (opts) => createContext(opts, remoteAddress),
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  await assertDeploymentReady();
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received; draining requests`);
    const forced = setTimeout(() => process.exit(1), 10_000);
    forced.unref();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb().catch((error) => console.error("[shutdown] database close failed", error));
    await flushServerSentry();
    clearTimeout(forced);
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
