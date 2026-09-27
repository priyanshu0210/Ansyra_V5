import { PageHelp } from "@/components/dashboard/PageHelp";
import { Link, useNavigate } from "react-router";

const PORTFOLIO_FAQ = [
  { q: "Is Ansyra a personal project?", a: "Yes. Ansyra is a personal portfolio project demonstrating deal workflows. It is not a commercial transaction service. Use fictional deal information and sample documents only; do not upload confidential, client or real transaction material." },
  { q: "Do uploads, editing and AI actually work?", a: "Yes. The portfolio keeps the application's upload, editing and AI workflows, subject to your account permissions. AI tools make real calls to the configured provider when available; relevant inputs and extracted document text are sent to that provider. Quotas and temporary provider failures can affect availability." },
  { q: "Does fictional deal data mean no personal information is collected?", a: "No. Account and access-request information, submitted content and security logs may still be processed. The privacy policy explains this. AI-generated results are illustrative and are not professional advice." },
  { q: "How can I try the portfolio?", a: "Request access from the home page. The operator reviews requests and provisions workspace access. Existing users can sign in with their own account." },
];

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Esc", label: "Close any open menu or dialog" },
  { keys: "Enter", label: "Submit the focused form" },
];

const HELP: { q: string; a: string }[] = [
  { q: "How do I get access to a feature?", a: "Ask your administrator to enable it — feature access is granted per member." },
  { q: "I can't see the product tabs.", a: "Admin accounts don't use product features. Use your member account for deal work." },
  { q: "How do I report a problem?", a: "Open the user menu (top-right or bottom-left) and choose Report a Bug — you can attach screenshots." },
  { q: "How do I change my password?", a: "Profile Settings → Change password. Other sessions expire within the hour." },
  { q: "Can I export my data?", a: "Yes — Profile Settings → Data & privacy → Download my data." },
];

export default function Help({ publicPage = false }: { publicPage?: boolean }) {
  const navigate = useNavigate();
  return (
    <div data-surface="page" className="ansyra-page-ground min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Support</p>
            <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>{publicPage ? "Frequently asked questions" : "Help & Shortcuts"}</h1>
            <PageHelp page="help" />
          </div>
          <button onClick={() => navigate(publicPage ? "/" : "/dashboard")} className="shrink-0 rounded-full border px-4 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>{publicPage ? "← Home" : "← Dashboard"}</button>
        </div>

        {!publicPage && <div className="rounded-sm border p-6" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}>
          <p className="mb-4 ansyra-label" style={{ color: "var(--fg-2)" }}>Keyboard shortcuts</p>
          <div className="space-y-2">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center gap-3">
                <kbd className="rounded-sm border px-2 py-0.5 font-mono text-[length:var(--step-xs)]" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}>{s.keys}</kbd>
                <span className="font-sans text-[14px]" style={{ color: "var(--fg-2)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>}

        <div className="rounded-sm border p-6" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}>
          <p className="mb-4 ansyra-label" style={{ color: "var(--fg-2)" }}>Common questions</p>
          <div className="space-y-4">
            {(publicPage ? PORTFOLIO_FAQ : [...PORTFOLIO_FAQ, ...HELP]).map((h) => (
              <div key={h.q}>
                <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>{h.q}</p>
                <p className="mt-1 font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{h.a}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Read the <Link to="/legal/privacy" className="underline">privacy policy</Link> and <Link to="/legal/terms" className="underline">terms of use</Link> for data handling and demonstration conditions.</p>
      </div>
    </div>
  );
}
