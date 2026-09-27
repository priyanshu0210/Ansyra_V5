import { expect, it, vi } from "vitest";

vi.mock("./lib/env", () => ({ env: { portfolioDemo: true, isProduction: false, siteUrl: "" } }));

it("portfolio disclosures do not intercept uploads, edits or AI mutations", async () => {
  const { createRouter, publicQuery, authedQuery } = await import("./middleware");
  const upload = vi.fn(() => "upload issued");
  const edit = vi.fn(() => "edit saved");
  const ai = vi.fn(() => "provider requested");
  const router = createRouter({
    documents: createRouter({ requestUpload: publicQuery.mutation(upload) }),
    deals: createRouter({ update: publicQuery.mutation(edit) }),
    ai: createRouter({ analyzeDocument: publicQuery.mutation(ai) }),
    auth: createRouter({ me: authedQuery.query(() => "private") }),
  });
  const caller = router.createCaller({ req: new Request("http://localhost/api"), resHeaders: new Headers() });
  await expect(caller.documents.requestUpload()).resolves.toBe("upload issued");
  await expect(caller.deals.update()).resolves.toBe("edit saved");
  await expect(caller.ai.analyzeDocument()).resolves.toBe("provider requested");
  expect(upload).toHaveBeenCalledOnce();
  expect(edit).toHaveBeenCalledOnce();
  expect(ai).toHaveBeenCalledOnce();
  // This tests the common procedure boundary, not an external provider call.
  // The original account/role checks remain in force on their respective tiers.
  await expect(caller.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
