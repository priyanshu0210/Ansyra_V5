# Deployment test pack — steps 4–6

Use only these fictional inputs. These tests change your hosted test workspace and consume real Gemini quota. Do one analysis at a time. Record pass/fail, time, account and any error text; do not include passwords or keys.

## Before you start

Use a **member** account for deal/document/AI work. Admin and main-admin accounts are deliberately restricted to administration. Give the member Deal Pipeline, Documents / Document Intelligence, and the AI features you want to test. Keep invitation email unchecked while email is deferred. Use an account you control.

Company membership must match by organization ID, not merely similar typed company names. Company admins without an organization cannot manage members. Check the permissions change first: company A admin sees only A users, company B admin sees only B users, and the main admin sees both. Company admins cannot create other companies/admins or review global access requests. Test roles in separate browser profiles to avoid session confusion.

## 4. Create, edit and persist a deal

1. Open Deal Pipeline → Create New Deal.
2. Enter:

| Field | Value |
|---|---|
| Deal name | Deployment Test — Project Maple |
| Target company | MapleWorks Software Ltd (Fictional) |
| Currency | $ |
| Amount | 24,000,000 (use the field's accepted numeric format) |
| Industry | Technology, or the closest software category offered |
| Initial stage | Sourcing (the create form's default) |

3. Click Create Deal once. Expect one card, no duplicates, and the correct name, company and value.
4. Reload the page. Expect the same card and values.
5. Edit its name to `Deployment Test — Project Maple Revised` and value to $25,000,000. Save and reload. Both changes should persist.
6. Restore the name to `Deployment Test — Project Maple` and value to $24,000,000 so they match the document.
7. Move the card from Sourcing to Evaluation using the available stage control. Reload. It should remain in Evaluation.
8. Search for `Maple`. The card should appear. Search for `ZZZ-NO-MATCH-0916`. Expect an empty result, not an error. Clear search and test the industry filter.
9. Open its dossier. Confirm the title/company/value match. Copy the dossier URL for later refresh testing.
10. With a second member in the same company, confirm the company-shared deal is visible. A member from a different company must not see it, including through the copied URL.

Pass: create/edit/stage/search/refresh all work, and the other company cannot read the deal. Record the deal ID or URL.

## 5. Upload, retrieve and delete a document

1. Download/open the accompanying `project-maple-brief.txt`; do not change its contents.
2. Open the Maple dossier → Data Room. Upload that TXT file once.
3. Expect one document row showing its filename, TXT type and nonzero size. Wait for upload completion.
4. Reload the dossier. The document should still be listed.
5. Click Download. Open the downloaded file and verify the final marker `MAPLE-FICTIONAL-2026-0916` and the FY2025 revenue of 12.5.
6. Keep the original uploaded document for step 6.
7. For deletion, make a local copy named `maple-delete-test.txt`, upload it separately, delete only that copy, confirm, and reload. The copy should be gone; the original should remain.
8. Optional validation: try a tiny `.csv` or `.exe` test file. Expect a clear unsupported-file refusal. Do not use a real executable or sensitive document.

Pass: uploaded bytes survive refresh/download, deletion removes only the selected copy, and invalid formats are refused.

## 6. Run real AI on the test document

Use the original document's **Analyze** menu. Run the following in order, waiting for each to finish. Wording varies; compare facts, not exact sentences. An error or missing result is a failed test, not a reason to click repeatedly.

### A. Summary

Choose **Summary**. Expect MapleWorks, the 100% share acquisition, enterprise value 24.0, FY2025 revenue 12.5 and EBITDA 2.0. Forecasts must be distinguished from actuals. It must not claim to have audited accounts or externally verified this fictional company.

Refresh after completion. Expect the saved result to remain without needing to rerun it.

### B. Red flags

Choose **Red flags**. Look for several material issues grounded in the document:

- 28% customer concentration; major contract expires March 2027 with no signed renewal.
- Contradiction between the contract expiry and the claim that major customers are secured through 2028.
- Unsupported 0.4 EBITDA add-back and unaudited financials.
- Pipeline assumption of 60% wins versus historical 32%.
- Outstanding change-of-control consent.
- Founder succession/key-engineer retention gaps.
- Unresolved security issue and absent disaster-recovery evidence.

Fail factual reliability if it invents signed approvals, audited statements, or a completed renewal. Missing some issues is a quality finding to record, separate from whether the request technically succeeded.

### C. Key terms

Choose **Key terms**. Expect 100% shares, 24.0 enterprise value, cash-free/debt-free basis, working-capital adjustment, proposed 45-day exclusivity, proposed 10% escrow for 18 months, and planned closing 15 December 2026. Terms must be labeled proposed, not executed.

### D. DD checklist

Choose **DD checklist**. Expect actionable requests for audited financials/QoE, renewal evidence, add-back invoices, supplier consent, security remediation, recovery testing, retention and succession plans. It should not assert these materials already exist.

### E. Optional deal copilot arithmetic check

If the copilot accepts deal/document context, paste this:

> Using the uploaded fictional Project Maple brief, calculate FY2025 EBITDA margin, FY2024-to-FY2025 revenue growth, EV/FY2025 EBITDA, implied equity value, and annual year-two EBITDA synergies. Show each formula. Treat management's EBITDA add-back as unverified. If you cannot access the document, say so rather than guessing.

Expected benchmark:

| Metric | Expected calculation |
|---|---|
| FY2025 EBITDA margin | 2.0 / 12.5 = 16% |
| Revenue growth | (12.5 - 10.0) / 10.0 = 25% |
| EV / EBITDA | 24.0 / 2.0 = 12.0x |
| Equity value before other adjustments | 24.0 - 4.5 + 1.2 = 20.7 |
| Recurring EBITDA synergies | 0.6 + 0.3 + (1.5 × 40%) = 1.5 |
| One-time integration cost | 0.8 separately; not recurring synergy |

If the tool lacks uploaded-document context, paste the brief alongside the question and record that limitation. This is fictional arithmetic validation, not investment advice.

### F. Optional public research check

Do not ask the research tool to find MapleWorks: it is fictional. Ask for current public information on a real industry, for example:

> Find three recent primary sources on enterprise workflow software adoption. Give title, publisher, date and URL, explain relevance to a hypothetical acquisition, and distinguish sourced facts from inference. Do not claim these sources describe fictional MapleWorks.

Open each citation. Verify that it exists and supports the associated statement. Search-backed output should be labeled real public research, not fictional company evidence.

## Finish

Check the saved analyses after another reload. Log out and revisit the dossier URL; it must require authentication. Test the banner with the sidebar expanded/collapsed and at phone width: all copy and the privacy link should wrap visibly with no clipping. Keep the original deal until results have been reviewed; delete only your disposable test records afterwards.

Email delivery and scheduled reminders are still separate pending checks.
