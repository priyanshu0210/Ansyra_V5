import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@db": path.resolve(templateRoot, "db"),
      db: path.resolve(templateRoot, "db"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
      "@fixtures": path.resolve(templateRoot, "tests/fixtures"),
    },
  },
  test: {
    // Node stays the DEFAULT. Every existing test is a pure contract unit or a
    // source-level wiring guard and none of them wants a DOM — paying jsdom's
    // startup on all 45 files to serve a handful would be a tax on the suite
    // that runs on every commit.
    //
    // A component test opts in per file with the docblock:
    //     // @vitest-environment jsdom
    // which is why `.test.tsx` is added to the globs rather than a second
    // project: the split is one line at the top of the files that need it.
    environment: "node",
    include: [
      "api/**/*.test.ts",
      "api/**/*.spec.ts",
      "contracts/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      // The design-token resolver behind scripts/contrast.mjs. It replaced a
      // hand-copied token table, so it is now the single point where the gate
      // can be wrong about what the product ships — which makes it the last
      // thing that should be untested.
      "scripts/**/*.test.mjs",
      // Fixture-driven contract goldens. Pure: the Thornevale fixture imports
      // no database and no I/O, so these run in CI with no secrets exactly like
      // everything else here.
      "tests/unit/**/*.test.ts",
    ],
  },
});
