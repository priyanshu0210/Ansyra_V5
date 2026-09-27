const rawBase = process.env.SMOKE_BASE_URL;
if (!rawBase) throw new Error("Set SMOKE_BASE_URL to the deployed origin, for example https://ansyra.onrender.com");

const base = new URL(rawBase);
if (base.pathname !== "/" || base.search || base.hash) {
  throw new Error("SMOKE_BASE_URL must be an origin without a path, query, or hash.");
}

async function request(path: string, expectedStatus = 200): Promise<Response> {
  const response = await fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== expectedStatus) {
    const location = response.headers.get("location");
    if ([301, 302, 307, 308].includes(response.status) && location) {
      // The server redirects every non-canonical host to SITE_URL. That is
      // correct behaviour, but it means this script was pointed at the wrong
      // origin — say so instead of reporting a bare status mismatch.
      throw new Error(
        `${path} redirected to ${location}. SMOKE_BASE_URL must be the canonical SITE_URL origin (${new URL(location).origin}), not a platform default hostname.`,
      );
    }
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}.`);
  }
  return response;
}

const health = await request("/health");
const healthBody = await health.json() as { status?: string };
if (healthBody.status !== "ok") throw new Error("/health returned an unexpected body.");

const ready = await request("/ready");
const readyBody = await ready.json() as { status?: string };
if (readyBody.status !== "ready") throw new Error("/ready did not confirm database readiness.");

const home = await request("/");
const html = await home.text();
if (!html.includes("Ansyra")) throw new Error("The homepage HTML does not contain the Ansyra shell.");

const requiredHeaders = [
  "content-security-policy",
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
] as const;
for (const header of requiredHeaders) {
  if (!home.headers.get(header)) throw new Error(`Homepage is missing ${header}.`);
}

await request("/api/definitely-not-a-route", 404);
console.log(`Smoke test passed for ${base.origin}`);
