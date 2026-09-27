import { LegalShell, LegalSection, CounselMark, OPERATOR_NAME, OperatorContact } from "./legal-shell";
import { trpc } from "@/providers/trpc";
import { PortfolioPrivacy } from "./portfolio-legal";

export default function LegalPrivacy() {
  const deployment = trpc.deployment.useQuery(undefined, { staleTime: 60_000 });
  if (deployment.isPending) return <p role="status">Loading privacy notice…</p>;
  if (deployment.isError) return <p role="alert">The deployment settings could not be verified. Please reload to view the privacy notice.</p>;
  if (deployment.data.portfolioDemo) return <PortfolioPrivacy />;
  return (
    <LegalShell title="Privacy Policy" updated="August 2026">
      <LegalSection heading="1. What we collect">
        To request access we ask for your name, email address, and a short reason. If an account is
        created we hold that, plus any optional profile fields you choose to fill in, and the content
        you enter or upload — deals, targets, assumptions, analyses, documents, and bug reports. We
        ask for nothing else, and we do not buy or scrape personal data about you.
      </LegalSection>

      <LegalSection heading="2. Who controls it">
        The data controller is {OPERATOR_NAME}, acting as an individual rather than as a registered
        company. Infrastructure providers (Supabase for database, authentication, and file storage,
        and the configured AI model provider) act as processors under their respective
        data-processing agreements.{" "}
        <CounselMark>confirm Supabase DPA signed; list AI provider DPA</CounselMark>
      </LegalSection>

      <LegalSection heading="3. How we use it">
        Only to operate the service: authenticating you, storing and displaying your deal data,
        running the AI analyses you request (your data is sent to the configured AI model provider
        solely to produce your requested output), notifying administrators of requests you submit,
        and keeping the service secure. We do not sell personal data or use it for advertising.
      </LegalSection>

      <LegalSection heading="4. Cookies">
        Ansyra sets exactly one cookie: an httpOnly authentication session cookie. There are no
        analytics, advertising, or tracking cookies. If that ever changes, this policy and an
        in-product notice will say so first.
      </LegalSection>

      <LegalSection heading="5. Your rights (GDPR / India DPDP Act 2023)">
        You may access and export everything the service holds about you (Profile → Data &amp;
        privacy → Download my data) and request account deletion in the same place — deletion
        requests are fulfilled by an administrator. Depending on your jurisdiction you may also have
        rights to correction, restriction, and objection; exercise them via{" "}
        <OperatorContact />.
        Where consent is the legal basis under the DPDP Act, you may withdraw it by requesting
        deletion.
      </LegalSection>

      <LegalSection heading="6. Retention & security">
        Data is retained while your account is active and deleted on fulfilment of a deletion
        request. Because Ansyra is a prototype, it may also be withdrawn at any time, at which point
        all stored content is deleted. Access is role-restricted; documents live in private storage
        reachable only through short-lived signed links issued after an access check. Please do not
        store anything here that you could not afford to lose or would not want disclosed.
      </LegalSection>

      <LegalSection heading="7. Contact">
        Privacy questions and data-rights requests:{" "}
        <OperatorContact />.{" "}
        <CounselMark>postal address if required by jurisdiction</CounselMark>
      </LegalSection>
    </LegalShell>
  );
}
