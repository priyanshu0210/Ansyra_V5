// The multi-tenancy read rule, in one place.
//
// "A row is yours if you created it, or if it belongs to your organization."
// That sentence was implemented independently in ai-router (`scoped`),
// deals-router (`scopeFilter`), and inline at ai-router's genome corpus query.
// Three copies of an access rule is three chances for one to drift, and the
// assumption gate found exactly that: the server enforced the gate over an
// UNSCOPED read while the client's warning banner was computed from a scoped
// one, so the two could disagree about whether a deal was blocked.
//
// Callers still add their own row filter (usually a dealId); this only supplies
// the ownership half.
import { eq, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/** Any table carrying the standard ownership pair. */
export interface OwnedTable {
  createdBy: PgColumn;
  organizationId: PgColumn;
}

/**
 * Ownership predicate for `userId` within `orgId`.
 *
 * With no organization the user sees only their own rows — deliberately NOT
 * `organizationId IS NULL`, which would pool every org-less user's data into
 * one shared bucket.
 */
export function ownerScope(table: OwnedTable, userId: string, orgId: string | null): SQL {
  if (orgId) {
    return or(eq(table.createdBy, userId), eq(table.organizationId, orgId))!;
  }
  return eq(table.createdBy, userId);
}
