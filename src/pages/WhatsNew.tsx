import { PageHelp } from "@/components/dashboard/PageHelp";
import { useNavigate } from "react-router";
// Vite raw import — the changelog is authored in docs/CHANGELOG.md.
import changelog from "../../docs/CHANGELOG.md?raw";

// Minimal markdown rendering: headings (#, ##) and bullet lists. Enough for a
// changelog; avoids pulling in a markdown dependency.
//
// SOURCE LINES ARE NOT OUTPUT LINES. `docs/CHANGELOG.md` is hard-wrapped at
// ~76 columns like every other prose file in the repo, and this used to map one
// source line to one element — so a three-line bullet rendered as one list item
// followed by two loose paragraphs, losing the bullet, the indent and the
// sentence. Every multi-line entry in the file was affected, which is most of
// them.
//
// Unwrapping first is the fix, and it belongs here rather than in the markdown:
// authoring the changelog as very long single lines to satisfy a renderer would
// put the workaround in the file humans edit. A block ends at a blank line, a
// heading, or the next bullet — which is exactly markdown's own rule.
function unwrap(md: string) {
  const blocks: string[] = [];
  for (const line of md.split("\n")) {
    const starts = line.startsWith("- ") || line.startsWith("#") || line.trim() === "";
    if (starts || blocks.length === 0) blocks.push(line);
    // A continuation joins the block above it with a space, never a newline.
    else blocks[blocks.length - 1] += ` ${line.trim()}`;
  }
  return blocks;
}

function render(md: string) {
  return unwrap(md).map((line, i) => {
    if (line.startsWith("## ")) return <h2 key={i} className="mt-6 font-serif text-xl" style={{ color: "var(--fg)" }}>{line.slice(3)}</h2>;
    if (line.startsWith("# ")) return null; // page already has a title
    if (line.startsWith("- ")) return <li key={i} className="ml-5 list-disc font-sans text-[14px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{line.slice(2)}</li>;
    if (line.trim() === "") return null;
    return <p key={i} className="font-sans text-[14px]" style={{ color: "var(--fg-2)" }}>{line}</p>;
  });
}

export default function WhatsNew() {
  const navigate = useNavigate();
  return (
    <div data-surface="page" className="ansyra-page-ground min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Product</p>
            <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>What&apos;s New</h1>
            <PageHelp page="updates" />
          </div>
          <button onClick={() => navigate("/dashboard")} className="rounded-full border px-4 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>← Dashboard</button>
        </div>
        <div className="rounded-sm border p-6 space-y-1" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }} data-testid="whats-new">
          {render(changelog)}
        </div>
      </div>
    </div>
  );
}
