import { trpc } from "@/providers/trpc";
// One-line AI disclaimer (Phase 12.7) — rendered once under the results area
// of every AI feature. Wording per product-domain trust rules.
export function AiDisclaimer() {
  const usage = trpc.ai.usageStatus.useQuery(undefined, { refetchInterval: 60_000 });
  return (
    <p
      data-testid="ai-disclaimer"
      className="mt-6 font-sans text-[length:var(--step-xs)] leading-relaxed"
      style={{ color: "var(--fg-2)" }}
    >
      {usage.data?.model === "mock" && <span className="mb-2 block">Sample AI output · development fixtures, not live analysis or a reviewed acquisition case.</span>}
      {usage.data && usage.data.model !== "mock" && <span className="mb-2 block">Live AI · {usage.data.model}. Your app allowance: {usage.data.personal.remaining}/{usage.data.personal.limit} requests left{usage.data.personal.resetsAt ? `; renews ${new Date(usage.data.personal.resetsAt).toLocaleString()}` : " in a 24-hour window"}. {(usage.data.personal.nearLimit || usage.data.shared.nearLimit) && "Live-AI capacity is running low. "}These app limits are separate from the provider’s quota.</span>}
      AI outputs are analytical estimates, not investment or legal advice. Verify
      independently before acting. See our{" "}
      <a href="/legal/terms" className="underline underline-offset-2">Terms</a>.
    </p>
  );
}
