import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  app.use("*", serveStatic({
    root: "./dist/public",
    precompressed: true,
    onFound(filePath, c) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        c.header("Cache-Control", "public, max-age=0, must-revalidate");
      }
    },
  }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    c.header("Cache-Control", "public, max-age=0, must-revalidate");
    return c.html(content);
  });
}
