import { Link } from "react-router";
import { trpc } from "@/providers/trpc";

export function PortfolioNotice() {
  const deployment = trpc.deployment.useQuery(undefined, { staleTime: 60_000 });
  if (!deployment.data?.portfolioDemo) return null;
  return (
    <aside className="min-w-0 shrink-0 break-words border-b px-4 py-3 text-left font-sans text-sm leading-relaxed sm:text-center" style={{ background: "var(--fg-surface)", color: "var(--fg)", borderColor: "var(--fg-rule)" }}>
      <strong>Personal portfolio project.</strong> Use fictional deal data and sample documents only. AI requests send relevant inputs to the configured provider.
      {" "}<Link to="/legal/privacy" className="underline">Account data and privacy</Link>
    </aside>
  );
}
