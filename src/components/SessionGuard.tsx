import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { finishBrowserSignOut, monitorIdleSession } from "@/lib/idle-session";

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const sessionId = user?.browserSessionId;
  const [warning, setWarning] = useState(false);
  const [expired, setExpired] = useState(false);
  const location = useLocation();
  const previousLocation = useRef(location.key);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => finishBrowserSignOut(sessionId),
    onError: (e) => {
      if (e.data?.code === "UNAUTHORIZED" || e.data?.code === "FORBIDDEN") finishBrowserSignOut(sessionId);
    },
  });
  const mutate = logout.mutate;
  useEffect(() => {
    if (!sessionId) return;
    return monitorIdleSession(sessionId, setWarning, () => { setExpired(true); mutate({ scope: "local" }); });
  }, [sessionId, mutate]);
  useEffect(() => {
    if (previousLocation.current !== location.key) window.dispatchEvent(new Event("ansyra-navigation"));
    previousLocation.current = location.key;
  }, [location.key]);
  useEffect(() => {
    if (!sessionId) return;
    const sync = (e: StorageEvent) => { if (e.key === `ansyra:signout:${sessionId}`) window.location.replace("/login"); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [sessionId]);
  if (expired) return <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--clear)", color: "var(--fg)" }}>
    <div role="alert"><h1 className="font-serif text-3xl">Your session was inactive for an hour.</h1>
      <p className="mt-3">{logout.isError ? "Sign-out could not reach the server. Retry to finish signing out." : "Signing out this browser…"}</p>
      {logout.isError && <button className="mt-4 underline" onClick={() => mutate({ scope: "local" })}>Retry sign-out</button>}
    </div>
  </div>;
  return <>{warning && <div role="status" className="fixed bottom-4 left-4 right-4 z-[200] mx-auto max-w-lg rounded-sm border p-4 font-sans text-sm" style={{ background: "var(--fg-surface)", color: "var(--fg)", borderColor: "var(--fg-rule)" }}>
    You’ve been inactive. You’ll be signed out within 5 minutes. <button className="underline">Stay signed in</button>
  </div>}{children}</>;
}
