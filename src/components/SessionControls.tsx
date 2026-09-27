import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { finishBrowserSignOut } from "@/lib/idle-session";

export function SessionControls({ sessionId }: { sessionId?: string | null }) {
  const [message, setMessage] = useState("");
  const logout = trpc.auth.logout.useMutation({
    onSuccess: (_, input) => {
      if (input?.scope === "others") setMessage("Other sessions have been signed out. This browser stays signed in.");
      else finishBrowserSignOut(sessionId);
    },
  });
  // Tokens are server-owned httpOnly cookies. Supabase supports revocation
  // scopes, but this client has no trustworthy device inventory to display.
  return <section aria-labelledby="session-controls" className="rounded-sm border p-6" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
    <h2 id="session-controls" className="font-serif text-xl">Security and sessions</h2>
    <p className="mt-2 font-sans text-sm">This browser is signed in. Device names and a list of active devices are not available.</p>
    <p className="mt-2 font-sans text-sm">After 60 minutes without activity in any Ansyra tab, this browser signs out. Other devices keep their own sessions.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {([
        ["local", "Sign out this device"], ["others", "Sign out other devices"], ["global", "Sign out everywhere"],
      ] as const).map(([scope, label]) => <button key={scope} disabled={logout.isPending} onClick={() => { setMessage(""); logout.mutate({ scope }); }} className="min-h-11 rounded-full border px-4 py-2 font-sans text-sm disabled:opacity-50" style={{ borderColor: "var(--fg-rule)" }}>{label}</button>)}
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {logout.isError && <p role="alert" className="mt-3 text-sm">Sign-out could not be completed. Please try again.</p>}
  </section>;
}
