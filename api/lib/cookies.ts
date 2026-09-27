import type { CookieOptions } from "hono/utils/cookie";
import { env } from "./env";

// ─────────────────────────────────────────────────────────────────────────────
// SESSION COOKIE FLAGS, DECIDED BY THE SCHEME — NOT BY GUESSING AT THE HOST.
//
// This used to ask "does the Host look like localhost?" and set
// `Secure` + `SameSite=None` whenever the answer was no:
//
//     host.startsWith("localhost:") || host.startsWith("127.0.0.1:")
//
// which silently broke sign-in on three ordinary dev origins, because a
// `Secure` cookie is DISCARDED by the browser over plain http. The request
// itself succeeded — 200, correct password, session minted — and the cookie was
// then dropped on the floor. The reader landed on /dashboard, `auth.me` 401'd,
// and they were bounced back to the login form. Indistinguishable, from the
// outside, from getting your own password wrong.
//
// Measured against the running server, same credentials, only the Host varying:
//
//     localhost:3200      → HttpOnly; SameSite=Lax                  ✓ stored
//     127.0.0.1:3200      → HttpOnly; SameSite=Lax                  ✓ stored
//     [::1]:3200          → HttpOnly; Secure; SameSite=None         ✗ DROPPED
//     192.168.1.20:3200   → HttpOnly; Secure; SameSite=None         ✗ DROPPED
//
// The IPv6 case is the one that bites, and it is not exotic: the dev server is
// deliberately bound to `::` so Safari can reach it (see vite.config.ts), macOS
// resolves `localhost` to `::1` ahead of `127.0.0.1`, and anyone who opens
// `http://[::1]:3000` — or reaches the machine over the LAN to test on a phone —
// gets a login that accepts the password and refuses to stay signed in.
//
// The hostname was never the right question. `Secure` is only ever wrong when
// the connection is not secure, so THAT is what is checked. It fixes every host
// above at once, and it keeps working for the ones a host-list would have to
// keep chasing: container hostnames, *.local, ngrok tunnels, LAN IPs, IPv6.
//
// `SameSite` follows, because it has no choice: browsers reject `SameSite=None`
// unless `Secure` is also set, so the two move together or the cookie is
// refused for a second reason.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the ORIGINAL client request arrived over HTTPS.
 *
 * In production Ansyra sits behind a TLS-terminating proxy (Render/Docker), so
 * the socket into Node is plain http and only the forwarded headers carry the
 * truth. Locally there is no proxy and no header, and the answer is http.
 */
export function isSecureRequest(headers: Headers): boolean {
  // `x-forwarded-proto` may be a list ("https,http") when more than one proxy
  // is in front; the CLIENT-facing hop is the first entry.
  const forwardedProto = headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0]!.trim().toLowerCase() === "https";

  // RFC 7239's standard form, which some proxies send instead:
  //   Forwarded: for=1.2.3.4;proto=https
  const forwarded = headers.get("forwarded");
  if (forwarded) {
    const proto = /proto=("?)([A-Za-z]+)\1/i.exec(forwarded)?.[2];
    if (proto) return proto.toLowerCase() === "https";
  }

  // No proxy in front. `origin` is sent on the POST that logs in, and it
  // carries the scheme the browser actually used — which is the same thing the
  // browser will apply the `Secure` rule against.
  const origin = headers.get("origin");
  if (origin) return origin.startsWith("https://");

  // Last resort for requests with neither (curl, same-origin GETs in some
  // engines): the referer, then default to NOT secure. Defaulting to insecure
  // is the safe direction here — an omitted `Secure` on an https origin still
  // yields a working session, while a spurious `Secure` on http destroys it.
  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).protocol === "https:";
    } catch {
      /* malformed referer: fall through */
    }
  }
  return false;
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  // Production cookie security comes from trusted configuration, never a
  // client-supplied proxy/origin header that could downgrade an HTTPS cookie.
  const secure = env.isProduction ? new URL(env.siteUrl).protocol === "https:" : isSecureRequest(headers);

  return {
    httpOnly: true,
    path: "/",
    // Same-site deployment is the production default. Cross-site cookies are
    // enabled only for an explicitly configured embedded preview.
    sameSite: secure && env.allowCrossSiteEmbedding ? "None" : "Lax",
    secure,
  };
}
