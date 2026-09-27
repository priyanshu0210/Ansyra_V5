import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Logo } from "@/components/ansyra/Logo";

// Shared parchment shell for the public legal pages (Phase 12.7). Public —
// reachable without a session from the landing page, login, and user menu.

// A placeholder awaiting legal review, marked so it cannot be mistaken for
// finished copy. It renders ELEVEN times across the two public legal pages.
//
// It used to paint a hardcoded cream (`#F3E2C0`) with the label in
// `--sev-watch`, which was wrong twice over: the pair measures **1.64:1** —
// unreadable at any size, let alone the 12px it is set at — and the cream is
// theme-blind, so on the dark ground it was a bright chip stapled into a
// paragraph. Same light-only assumption as the severity tokens and the button
// labels.
//
// Now it uses the tint-over-surface idiom the callouts already use, with the
// `-text` cut for the label: readable in both themes, and it reads as an
// annotation on the page rather than a sticker over it.
/**
 * Who operates this deployment.
 *
 * A data controller does not have to be a company — a natural person can be one,
 * and naming a real individual is both truthful and sufficient. Inventing a
 * legal entity to fill a blank would be worse than leaving the blank: it is a
 * false statement about who is accountable for someone else's data.
 *
 * Defined once here because the Terms and the Privacy Policy must never
 * disagree about it.
 */
export const OPERATOR_NAME = "Priyanshu Singh";
const OPERATOR_EMAIL = import.meta.env.VITE_PUBLIC_CONTACT_EMAIL?.trim();

/** Public contact is deployment configuration, not a committed personal address. */
export function OperatorContact() {
  return OPERATOR_EMAIL
    ? <a className="underline" href={`mailto:${OPERATOR_EMAIL}`}>{OPERATOR_EMAIL}</a>
    : <span>your workspace administrator (use Profile for account-data requests)</span>;
}

/**
 * The prototype notice.
 *
 * This app invites people to upload diligence documents, which in this domain
 * means real confidential deal material. The single most effective privacy
 * control available here is not a policy clause — it is telling people plainly,
 * before they upload anything, that this is a demonstration and they should not.
 */
export function PrototypeNotice({ portfolio = false }: { portfolio?: boolean }) {
  return (
    <div
      className="rounded-sm border p-4"
      style={{
        borderColor: "var(--sev-watch-text)",
        background: "color-mix(in srgb, var(--sev-watch) 8%, transparent)",
      }}
    >
      <p className="ansyra-label" style={{ color: "var(--sev-watch-text)" }}>
        Prototype — not a commercial service
      </p>
      <p className="mt-2 font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg)" }}>
        {portfolio ? <>Ansyra is {OPERATOR_NAME}&apos;s personal portfolio demonstration. Deal examples
        are illustrative. Uploads, editing and AI tools are available for fictional data only.
        AI requests send relevant inputs to the configured provider. Account and access-request
        information is still processed. Do not submit confidential or real transaction information.</> : <>Ansyra is a portfolio demonstration operated by an individual, {OPERATOR_NAME}. It is not a
        registered company, it is not sold, and no fee is charged.{" "}
        <strong>Do not upload confidential, client, or real transaction documents.</strong> A
        fictional sample company is provided so every feature can be explored without real data.
        Accounts and all stored content may be deleted without notice.</>}
      </p>
    </div>
  );
}

export function CounselMark({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-sm px-1 font-mono text-[length:var(--step-xs)]"
      style={{
        // 8%, NOT 12%, AND MIXED WITH `transparent`.
        //
        // The wash measured 4.45:1 against its own label on the dark theme —
        // under AA, on a public page, across eleven marks. `--sev-watch` is a
        // bright amber, so washing it over the dark card LIGHTENS the
        // background out from under `--sev-watch-text`, which is also light.
        // The tint was working against its own legibility, and the more of it
        // there was the worse it got. Measured across the range on the real
        // card colour:
        //
        //     wash    0%     6%     8%    10%    12%
        //     dark   5.33   4.88   4.74   4.59   4.45   ← AA is 4.50
        //     light  5.51   5.30   5.23   5.16   5.10
        //
        // Light passes everywhere; only dark was failing. 8% clears both with
        // margin rather than sitting on the threshold, and still reads as a
        // tinted placeholder rather than a plain box.
        //
        // `transparent` rather than `var(--fg-surface)`: the mix renders
        // IDENTICALLY today, because the legal prose does sit on a
        // `--fg-surface` card — but naming a surface states a fact about the
        // ground instead of asking for one, and this component cannot see where
        // it is used. A translucent wash composites over whatever is actually
        // behind it and cannot go stale when a ground changes. Which is not
        // hypothetical: the page ground under this card moved to `--rail` in
        // the same pass that found this.
        //
        // NOTE — this is text, not a severity mark. `scripts/contrast.mjs`
        // gates the `-text` cuts at AA_LARGE (3:1) as graphics under WCAG
        // 1.4.11, which is right for a coloured bar and wrong for the smallest
        // words on the page. There is an AA row for this one now.
        background: "color-mix(in srgb, var(--sev-watch) 8%, transparent)",
        color: "var(--sev-watch-text)",
        border: "1px dashed color-mix(in srgb, var(--sev-watch) 55%, transparent)",
      }}
    >
      [REVIEW BY COUNSEL: {children}]
    </span>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-xl" style={{ color: "var(--fg)" }}>{heading}</h2>
      <p className="mt-2 font-sans text-[14px] leading-relaxed" style={{ color: "var(--fg-2)" }}>
        {children}
      </p>
    </section>
  );
}

export function LegalShell({ title, updated, children, portfolio = false }: { title: string; updated: string; children: ReactNode; portfolio?: boolean }) {
  const { pathname } = useLocation();
  const onTerms = pathname.includes("terms");
  return (
    <div className="ansyra-page-ground min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5" style={{ color: "var(--fg)" }}>
            <Logo size={30} />
            <span className="font-serif text-xl tracking-wide">Ansyra</span>
          </Link>
          <Link
            to={onTerms ? "/legal/privacy" : "/legal/terms"}
            className="rounded-full border px-4 py-2 font-sans text-[13px]"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}
          >
            {onTerms ? "Privacy Policy →" : "Terms of Use →"}
          </Link>
        </div>

        <div>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Legal · Last updated {updated}
          </p>
          <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>{title}</h1>
        </div>

        <PrototypeNotice portfolio={portfolio} />

        <div className="space-y-6 rounded-sm border p-6 sm:p-8" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}>
          {children}
        </div>

        <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
          Operated by {OPERATOR_NAME} (<OperatorContact />). {!portfolio && <>Dashed markers show the points that still
          require legal counsel before Ansyra could operate as a commercial service; they are left
          visible rather than filled in with a guess.</>}
        </p>
      </div>
    </div>
  );
}
