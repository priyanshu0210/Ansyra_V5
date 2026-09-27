import { TRPCError } from "@trpc/server";

/** Browser writes must originate from this application, including login writes. */
export function assertMutationOrigin(req: Request, siteUrl: string, production: boolean) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cross-site requests are not allowed." });
  }
  if (!origin) {
    if (production) throw new TRPCError({ code: "FORBIDDEN", message: "A same-origin request is required." });
    return; // Local test callers do not use a browser.
  }
  const expected = new URL(siteUrl || req.url).origin;
  if (origin !== expected && (production || origin !== new URL(req.url).origin)) throw new TRPCError({ code: "FORBIDDEN", message: "Cross-site requests are not allowed." });
}

const PASSWORD_SETUP_ROUTES = new Set([
  "deployment",
  "auth.me", "auth.logout", "auth.changePassword", "auth.requestPasswordReset",
  "auth.confirmPasswordReset", "auth.confirmInvite", "auth.login",
]);
export function assertAccountReady(user: { mustChangePassword?: boolean } | undefined, path: string) {
  if (user?.mustChangePassword && !PASSWORD_SETUP_ROUTES.has(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Change your temporary password before using the workspace." });
  }
}
