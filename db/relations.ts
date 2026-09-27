import { relations } from "drizzle-orm";
import { deals, targets, users } from "./schema";

// FIX: was "import {} from './schema'" — an empty no-op import that did nothing.
// These relation definitions are needed for Drizzle's db.query.* relational API.

export const usersRelations = relations(users, ({ many }) => ({
  deals: many(deals),
  targets: many(targets),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  creator: one(users, {
    fields: [deals.createdBy],
    references: [users.id],
  }),
}));

export const targetsRelations = relations(targets, ({ one }) => ({
  creator: one(users, {
    fields: [targets.createdBy],
    references: [users.id],
  }),
}));
