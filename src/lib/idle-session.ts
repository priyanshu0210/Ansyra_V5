export const IDLE_MS = 60 * 60_000;
export const WARNING_MS = 55 * 60_000;
const events = ["pointermove", "pointerdown", "keydown", "touchstart", "click", "ansyra-navigation"] as const;
export const activityKey = (sessionId: string) => `ansyra:activity:${sessionId}`;

/** One controller per browser tab. Absolute timestamps survive sleep/refresh;
 * storage events synchronize tabs sharing the same httpOnly browser session.
 * Storage can be blocked by browser privacy settings; the in-memory fallback
 * still expires this tab, but cannot promise persistence in that case. */
export function monitorIdleSession(sessionId: string, onWarning: (warning: boolean) => void, onExpire: () => void) {
  const key = activityKey(sessionId);
  let last = Date.now();
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  function read() {
    try {
      const raw = localStorage.getItem(key);
      const value = raw === null ? NaN : Number(raw);
      if (Number.isFinite(value) && value > 0 && value <= Date.now()) last = value;
    } catch { /* Browser storage unavailable: retain this tab's timestamp. */ }
    return last;
  }
  function write() {
    last = Date.now();
    try { localStorage.setItem(key, String(last)); } catch { /* See fallback above. */ }
  }
  function check() {
    clearTimeout(timer);
    if (expired) return;
    const age = Date.now() - read();
    if (age >= IDLE_MS) { expired = true; onExpire(); return; }
    onWarning(age >= WARNING_MS);
    timer = setTimeout(check, Math.max(1, (age >= WARNING_MS ? IDLE_MS : WARNING_MS) - age));
  }
  function activity() {
    // Returning after the deadline cannot revive an expired session.
    check();
    if (expired) return;
    write();
    check();
  }
  function storage(e: StorageEvent) { if (e.key === key) check(); }
  function visibility() { if (!document.hidden) check(); }
  read();
  // Only an unseen session is initialized; mounting is not user activity.
  try { if (localStorage.getItem(key) === null) write(); } catch { /* In-memory fallback. */ }
  check();
  for (const event of events) window.addEventListener(event, activity, { passive: true });
  window.addEventListener("storage", storage);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    clearTimeout(timer);
    for (const event of events) window.removeEventListener(event, activity);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function finishBrowserSignOut(sessionId?: string | null) {
  notifyBrowserSignOut(sessionId);
  // Full navigation clears in-memory draft stores as well as query caches.
  window.location.replace("/login");
}

export function notifyBrowserSignOut(sessionId?: string | null) {
  if (sessionId) {
    try { localStorage.setItem(`ansyra:signout:${sessionId}`, String(Date.now())); } catch { /* Other tabs also revalidate at the API. */ }
  }
}
