import { authRouter } from "./auth-router";
import { adminRouter } from "./admin-router";
import { dealsRouter } from "./deals-router";
import { decisionsRouter } from "./decisions-router";
import { economicsRouter } from "./economics-router";
import { milestonesRouter } from "./milestones-router";
import { compsRouter } from "./comps-router";
import { ddRouter } from "./dd-router";
import { commentsRouter } from "./comments-router";
import { recommendationsRouter } from "./recommendations-router";
import { patternsRouter } from "./patterns-router";
import { scenariosRouter } from "./scenarios-router";
import { assumptionsRouter } from "./assumptions-router";
import { targetsRouter } from "./targets-router";
import { aiRouter } from "./ai-router";
import { activityRouter } from "./activity-router";
import { accessRouter } from "./access-router";
import { bugsRouter } from "./bugs-router";
import { documentsRouter } from "./documents-router";
import { createRouter, publicQuery } from "./middleware";
import { env } from "./lib/env";

// Removed deliberately, not forgotten: the anonymous `chat` router (canned
// text presented as AI, two DB writes per unauthenticated call), the
// `screening` router (eight invented companies returned as results) and the
// read-only `leads` router had no caller anywhere in the client. The `leads`
// and `chat_messages` tables stay — the copilot still persists to
// chat_messages, and dropping a table is a separate, destructive decision.
export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  deployment: publicQuery.query(() => ({ portfolioDemo: env.portfolioDemo })),
  auth: authRouter,
  admin: adminRouter,
  deals: dealsRouter,
  decisions: decisionsRouter,
  economics: economicsRouter,
  milestones: milestonesRouter,
  comps: compsRouter,
  dd: ddRouter,
  comments: commentsRouter,
  recommendations: recommendationsRouter,
  patterns: patternsRouter,
  scenarios: scenariosRouter,
  assumptionLedger: assumptionsRouter,
  targets: targetsRouter,
  ai: aiRouter,
  activity: activityRouter,
  access: accessRouter,
  bugs: bugsRouter,
  documents: documentsRouter,
});

export type AppRouter = typeof appRouter;
