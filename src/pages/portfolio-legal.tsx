import { LegalSection, LegalShell, OperatorContact, OPERATOR_NAME } from "./legal-shell";

export function PortfolioPrivacy() {
  return (
    <LegalShell title="Portfolio privacy notice" updated="September 2026" portfolio>
      <LegalSection heading="1. This demonstration">
        Ansyra is {OPERATOR_NAME}&apos;s personal portfolio project. Its deal examples are intended
        to be fictional. You can explore the application's uploads, editing and AI workflows using
        made-up information and sample documents. Do not submit confidential or client information.
      </LegalSection>
      <LegalSection heading="2. Information you provide">
        Fictional deal examples do not mean that no personal information is processed. If you
        request access, we store the name, email address, organization details and reason you
        provide. We also store the deal information, documents, analyses and other content you
        submit or generate. Accounts have sign-in records, access permissions and security logs.
        Please limit access requests to what is needed to arrange a demonstration.
      </LegalSection>
      <LegalSection heading="3. Services and AI">
        Supabase provides database, authentication and sample-file storage. The web host serves the
        application and may keep request and security logs. Authentication email is delivered by
        the configured mail provider. When you request AI analysis, relevant deal inputs and
        extracted document text are sent to the configured AI provider. Source-backed research
        may also use the provider's web-search service. Provider processing, logging and retention
        depend on the service and account terms; fictional inputs are not a promise of zero retention.
        Saved and newly generated analyses are not professional advice.
      </LegalSection>
      <LegalSection heading="4. Cookies and browser storage">
        Authentication uses a secure session cookie. The application also stores interface
        preferences in your browser. These support sign-in and your chosen interface settings.
      </LegalSection>
      <LegalSection heading="5. Access, deletion and retention">
        Account information is used to provide and secure demonstration access. You can export
        account data and request deletion from Profile → Data &amp; privacy, or contact the operator.
        Account removal may retain attribution on historical records; security logs and backup
        copies may remain until their retention periods expire. This prototype is not an archive
        and availability or continued storage is not guaranteed.
      </LegalSection>
      <LegalSection heading="6. Contact">
        For access, correction, deletion or privacy questions, contact {OPERATOR_NAME} at{" "}
        <OperatorContact />.
      </LegalSection>
    </LegalShell>
  );
}

export function PortfolioTerms() {
  return (
    <LegalShell title="Portfolio demonstration terms" updated="September 2026" portfolio>
      <LegalSection heading="1. Purpose">
        Ansyra is a free personal portfolio demonstration by {OPERATOR_NAME}. It demonstrates
        software workflows using fictional deal content, editable examples and AI analyses. It is not offered as
        a commercial transaction service. Access to the workspace is provisioned by the operator.
      </LegalSection>
      <LegalSection heading="2. Sample content only">
        Use the provided examples or your own made-up deal data and sample documents. Do not submit
        real transaction documents, confidential information or client material, including in an
        access request. Do not share credentials or bypass access controls.
      </LegalSection>
      <LegalSection heading="3. Illustrative results">
        The sample figures, analyses and decisions illustrate the application. They are not
        investment, legal, tax or accounting advice, and should not be used for actual transactions.
        AI tools make requests to the configured provider when available. Outputs can be incorrect
        or incomplete; provider quotas, rate limits and temporary failures can affect availability.
      </LegalSection>
      <LegalSection heading="4. Availability and your information">
        Features and sample content may change, and the demonstration may be withdrawn.
        Account information is handled as described in the portfolio privacy notice. You can
        stop using the demonstration and request account deletion. Nothing in these terms
        excludes rights or responsibilities that applicable law does not allow to be excluded.
      </LegalSection>
      <LegalSection heading="5. Contact">
        Questions about the demonstration: <OperatorContact />.
      </LegalSection>
    </LegalShell>
  );
}
