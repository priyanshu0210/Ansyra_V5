import { FEATURE_GUIDES } from "@/lib/feature-guides";
import { Info } from "lucide-react";
import type { DashTabId } from "./dashboard-tabs";

const guides: Record<DashTabId | "dossier" | "profile" | "help" | "updates" | "report", { stage: string; description: string }> = {
  home: { stage: "Across the deal lifecycle", description: "Get an overview of your deals, recent work, and items that need attention. Open a deal or choose a tool to continue your work." },
  pipeline: { stage: "Sourcing through integration", description: "Add acquisition opportunities and track each deal as it moves through review, approval, closing, and integration. Open a deal to see its evidence, decisions, and next steps." },
  targets: { stage: "Sourcing and initial screening", description: "Build a shortlist of companies you might acquire. Save targets yourself or use AI Discovery to find candidates by industry, location, and company size. Check the sources before relying on a suggested company or figure." },
  genome: { stage: "Evaluation and learning from past deals", description: "Find deals in your portfolio and revisit what your team recorded. Search supported deal details, assumptions, and saved financial figures, then open the deal dossier for the full record and source documents." },
  assumptions: { stage: "Evaluation and due diligence", description: "Write down what needs to be true for a deal to work, such as expected growth or cost savings. Test the reasoning, record supporting evidence, and revisit assumptions when new information arrives." },
  cultural: { stage: "Early evaluation through integration planning", description: "Explore how the two companies may differ in leadership, ways of working, and people practices. Use the review to prepare questions and plan further research; it does not replace conversations with employees and leaders." },
  regulatory: { stage: "Screening, due diligence, and pre-close review", description: "Enter the companies, industry, and locations to identify regulatory questions and missing evidence. Use the output to prepare a review with legal and regulatory specialists before committing to the deal." },
  synergy: { stage: "Integration planning and post-close tracking", description: "Record the savings or extra revenue expected from combining the companies. Compare planned amounts with actual results, investigate gaps, and keep corrective actions with the plan." },
  analytics: { stage: "Across the deal lifecycle", description: "Review the size, progress, and mix of your deal pipeline. Use the charts and summaries to see where work is concentrated and prepare discussions about portfolio performance." },
  comps: { stage: "Evaluation and valuation", description: "Compare recorded deal values and valuation multiples. Filter to relevant transactions, including closed deals, to put a proposed price in context. A comparable deal is a reference point, not a final valuation." },
  activity: { stage: "Across the deal lifecycle", description: "See recent recorded actions across your deals. Use the history to catch up on changes and find the work you need to review." },
  admin: { stage: "Workspace setup and ongoing administration", description: "Create accounts, assign roles, and manage access to features. Review permissions when team responsibilities change so people can work with the tools appropriate to their role." },
  "access-requests": { stage: "Workspace onboarding", description: "Review requests from people who want access to Ansyra. Check who is asking and approve or decline the request according to your team's access policy." },
  bugs: { stage: "Support throughout the deal lifecycle", description: "Review reported product issues, understand their impact, and update their status as they are investigated and resolved." },
  "admin-activity": { stage: "Ongoing workspace administration", description: "Review recorded administrative changes, such as account and access updates. Use this history to understand what changed and support follow-up checks." },
  dossier: { stage: "Evaluation through closing and integration", description: "This is the working record for one deal. Review the decision case, financial assumptions, deadlines, diligence tasks, analyses, documents, and activity. Keep evidence and decisions here so your team can understand why the deal moves forward." },
  profile: { stage: "Workspace setup and ongoing use", description: "Keep your personal details and account settings up to date, and change your password when needed. These settings support your work at every deal stage." },
  help: { stage: "Across the deal lifecycle", description: "Find answers about using Ansyra and shortcuts for common tasks. Use this page when you need help understanding where to work or how a feature behaves." },
  updates: { stage: "Across the deal lifecycle", description: "See what has changed in Ansyra. Review product updates to understand new capabilities and changes to the tools your team uses." },
  report: { stage: "Support throughout the deal lifecycle", description: "Tell the team when something does not work as expected. Describe what you were doing, what happened, and what you expected so the issue can be reproduced." },
};

export function PageHelp({ page }: { page: keyof typeof guides }) {
  const guide = guides[page];
  const feature = page in FEATURE_GUIDES ? FEATURE_GUIDES[page as keyof typeof FEATURE_GUIDES] : null;
  return (
    <div className="mt-3 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
      <p>M&amp;A stage: {guide.stage}</p>
      <details className="mt-2 max-w-3xl">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ color: "var(--sev-grounded-text)" }}>
          <Info size={16} aria-hidden="true" /> About this page
        </summary>
        <p className="mt-1 leading-relaxed">{guide.description}</p>
        {feature && <div className="mt-3 space-y-2 leading-relaxed"><p><strong>What you provide:</strong> {feature.input}</p><p><strong>What you receive:</strong> {feature.output}</p><p><strong>How AI helps:</strong> {feature.ai}</p><p><strong>What to check:</strong> {feature.limit}</p></div>}
      </details>
    </div>
  );
}
