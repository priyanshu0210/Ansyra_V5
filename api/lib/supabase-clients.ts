// ─────────────────────────────────────────────────────────────────────────────
// The two Supabase clients the server uses, built in exactly one place.
//
//   anonClient()  — for calls that only need the public key: password sign-in,
//                   token verification, refresh, OTP verification, reset email.
//   adminClient() — for auth.admin.* and Storage signing, which genuinely need
//                   the service-role key. Never hold one of these longer than
//                   the call that needs it.
//
// Both wrap fetch with EXTERNAL_REQUEST_TIMEOUT_MS. supabase-js has no timeout
// of its own, and authenticateRequest awaits GoTrue on every request — a hung
// Auth endpoint must not stall the whole API until the platform proxy gives up.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

function timedFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(env.externalRequestTimeoutMs);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...(init ?? {}), signal });
}

const options = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: timedFetch },
};

export function anonClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, options);
}

export function adminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, options);
}
