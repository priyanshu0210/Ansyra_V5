import { LegalShell, LegalSection, CounselMark, OPERATOR_NAME, OperatorContact } from "./legal-shell";
import { trpc } from "@/providers/trpc";
import { PortfolioTerms } from "./portfolio-legal";

export default function LegalTerms() {
  const deployment = trpc.deployment.useQuery(undefined, { staleTime: 60_000 });
  if (deployment.isPending) return <p role="status">Loading demonstration terms…</p>;
  if (deployment.isError) return <p role="alert">The deployment settings could not be verified. Please reload to view the terms.</p>;
  if (deployment.data.portfolioDemo) return <PortfolioTerms />;
  return (
    <LegalShell title="Terms of Use" updated="August 2026">
      <LegalSection heading="1. The service">
        Ansyra is a prototype web application for M&amp;A deal intelligence, operated as a personal
        portfolio project by {OPERATOR_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) as an individual
        rather than through a registered company. It is not sold and no fee is charged. Access is
        provisioned manually; there is no public sign-up. By using Ansyra you agree to these terms.
      </LegalSection>

      <LegalSection heading="2. Acceptable use">
        You agree not to: share your credentials; probe, disable, or circumvent security or access
        controls; use the service to violate law or third-party rights; upload content you have no
        right to process; or use the service to build a competing product. We may suspend accounts
        that put the service or other customers at risk.
      </LegalSection>

      <LegalSection heading="3. Your data stays yours">
        You retain all ownership of the deal data, documents, and other content you enter or upload.
        We process it only to operate the service for you, and we claim no license beyond what is
        technically required to do so. On termination you may export your data (Profile → Data &amp;
        privacy) and request deletion.
      </LegalSection>

      <LegalSection heading="4. AI output disclaimer">
        Ansyra's AI features (including assumption stress-tests, compatibility scores, regulatory
        analyses, target discovery, and document analyses) produce <strong>analytical estimates,
        not investment, legal, tax, or accounting advice</strong>. Outputs may be incomplete or
        incorrect and may include estimated figures. You are solely responsible for verifying any
        output before relying on it, and for all decisions made using the service.
      </LegalSection>

      <LegalSection heading="5. Limitation of liability">
        To the maximum extent permitted by law, the service is provided &ldquo;as is&rdquo; and
        &ldquo;as available&rdquo;, with no warranty of any kind. Because Ansyra is provided free of
        charge as a prototype, no fee has been paid against which liability could be measured. We are
        not liable for indirect, incidental, or consequential damages, including lost profits or lost
        deals. Nothing here limits liability that cannot be limited by law.{" "}
        <CounselMark>jurisdiction-specific carve-outs</CounselMark>
      </LegalSection>

      <LegalSection heading="6. Changes and termination">
        We may update these terms; material changes will be notified in-product. Continued use after
        a change takes effect constitutes acceptance. As a prototype, Ansyra may be changed,
        suspended, or withdrawn at any time, and accounts and stored content may be deleted without
        notice. You may stop using it at any time and request deletion of your data.
      </LegalSection>

      <LegalSection heading="7. Governing law & contact">
        These terms are governed by the laws of <CounselMark>governing jurisdiction</CounselMark>.
        Questions: <OperatorContact />.
      </LegalSection>
    </LegalShell>
  );
}
