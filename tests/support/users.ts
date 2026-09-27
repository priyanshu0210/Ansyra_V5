// The four seeded accounts, by role, so tests read as intent rather than as
// email addresses. Resolved by EMAIL rather than by the fixture's uuid: the
// email is what a person types at the login screen and what survives an auth
// schema being rebuilt.
import { USER_ADMIN, USER_ASSOCIATE, USER_PARTNER, USER_RIVAL } from "@fixtures/thornevale/ids";

/** Full grants, owns the corpus. */
export const PARTNER = USER_PARTNER.email;
/** Same org, deliberately WITHOUT `documents` or `economics`. */
export const ASSOCIATE = USER_ASSOCIATE.email;
/** Different organisation, full grants — the isolation control. */
export const RIVAL = USER_RIVAL.email;
/** Admin kind, full grants, blocked from every product feature by design. */
export const ADMIN = USER_ADMIN.email;
