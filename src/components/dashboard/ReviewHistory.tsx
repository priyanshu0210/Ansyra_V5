import { EvidenceReviewResult } from "./EvidenceReviewResult";
import { groupReviews, type Review } from "@/lib/review-history";

export function ReviewHistory<T extends Review>({ reviews, heading, onDelete }: {
  reviews: T[];
  heading: (review: T) => string;
  onDelete: (id: number) => void;
}) {
  const current = reviews.filter((review) => review.result.reviewKind === "questions");
  const legacy = reviews.filter((review) => review.result.reviewKind !== "questions");
  return <div className="space-y-4">
    <GroupedReviews reviews={current} heading={heading} onDelete={onDelete} />
    {legacy.length > 0 && <details className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
      <summary className="cursor-pointer py-3">Legacy saved analyses ({legacy.length})</summary>
      <p className="mb-4">Historical results may include mock outputs and are unverified. Prepare a new review from supplied evidence before relying on them.</p>
      <GroupedReviews reviews={legacy} heading={heading} onDelete={onDelete} />
    </details>}
  </div>;
}

function GroupedReviews<T extends Review>({ reviews, heading, onDelete }: {
  reviews: T[];
  heading: (review: T) => string;
  onDelete: (id: number) => void;
}) {
  return <div className="space-y-4">
    {groupReviews(reviews).map(([latest, ...copies]) => <section key={latest.id}>
      <p className="mb-2 font-sans text-xs" style={{ color: "var(--fg-2)" }}>{latest.dealId == null ? "Review not linked to a deal" : <a className="underline" href={`/dashboard/deals/${latest.dealId}`}>View linked deal #{latest.dealId}</a>}</p>
      <EvidenceReviewResult heading={heading(latest)} date={latest.createdAt} result={latest.result} onDelete={() => onDelete(latest.id)} />
      {copies.length > 0 && <details className="mt-2 px-5 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
        <summary className="cursor-pointer py-2">{copies.length} earlier identical {copies.length === 1 ? "analysis" : "analyses"}</summary>
        <p className="py-2">The latest result is shown above. Earlier saved copies are retained in the history.</p>
        <ul className="divide-y" style={{ borderColor: "var(--fg-rule)" }}>{copies.map((copy) => <li key={copy.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <span>{new Date(copy.createdAt).toLocaleString()}</span>
          <button type="button" className="min-h-11 underline" onClick={() => onDelete(copy.id)} aria-label={`Remove analysis from ${new Date(copy.createdAt).toLocaleString()}`}>Remove</button>
        </li>)}</ul>
      </details>}
    </section>)}
  </div>;
}
