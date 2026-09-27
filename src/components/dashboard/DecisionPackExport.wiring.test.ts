import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions, the posture of DecisionCard.wiring.test.ts: vitest runs
// environment "node" with no jsdom, so what is pinned here is the wiring — that
// the pack is an export rather than a panel, that the print scope actually
// exists in CSS, and that it cannot silently break the ordinary dossier export.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const pack = strip(read("DecisionPackExport.tsx"));
const dealDetail = strip(readFileSync(join(__dirname, "../../pages/DealDetail.tsx"), "utf8"));
const css = readFileSync(join(__dirname, "../../index.css"), "utf8");
const contract = strip(readFileSync(join(__dirname, "../../../contracts/decision-pack.ts"), "utf8"));

describe("it is an export, not a fifth panel", () => {
  it("shows one button on screen and hides the pack itself", () => {
    // Every input already renders elsewhere on the dossier; a visible panel
    // would be the collision 15.12 §16d exists to avoid.
    expect(pack).toMatch(/className="decision-pack print-only"/);
    expect(pack).toMatch(/data-testid="export-decision-pack"/);
  });

  it("reuses the shipped print path rather than adding a PDF library", () => {
    expect(pack).toMatch(/window\.print\(\)/);
    for (const lib of ["jspdf", "html2canvas", "pdfmake", "puppeteer"]) {
      expect(pack.toLowerCase(), `must not pull in ${lib}`).not.toContain(lib);
    }
  });

  it("scopes the print by a body class, and cleans it up", () => {
    // Left behind, it would silently narrow the NEXT ordinary Export PDF.
    expect(pack).toMatch(/classList\.add\("printing-pack"\)/);
    expect(pack).toMatch(/classList\.remove\("printing-pack"\)/);
  });
});

describe("the print scope exists in CSS and is bounded", () => {
  it("defines the printing-pack rules inside @media print", () => {
    const at = css.indexOf("@media print");
    const block = css.slice(at, css.indexOf("\n}", css.indexOf(".decision-pack", at)) + 2);
    expect(at).toBeGreaterThan(-1);
    expect(block).toMatch(/body\.printing-pack/);
    expect(block).toMatch(/\.decision-pack \{ display: block/);
  });

  it("never hides anything unless the body class is present", () => {
    // Otherwise the ordinary dossier export loses its content.
    // Comments stripped first: the explanatory block above the rules mentions
    // `printing-pack` and is not a selector. Without this the test failed on
    // its own documentation.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = bare.split("\n").filter((l) => l.includes("printing-pack"));
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r, `unscoped print rule: ${r.trim()}`).toMatch(/body\.printing-pack/);
    }
  });

  it("leaves the pack hidden on screen", () => {
    // .print-only is display:none outside @media print — the pack relies on it.
    expect(css).toMatch(/\.print-only \{ display: none; \}/);
  });
});

describe("it borrows every judgement rather than restating one", () => {
  it("renders the gate's own sentence", () => {
    expect(pack).toMatch(/pack\.readinessMessage/);
    // And does not invent a second wording of the same rule.
    expect(pack).not.toMatch(/cannot move into|requires at least one accepted/);
  });

  it("assembles in contracts, not in the component", () => {
    expect(pack).toMatch(/buildDecisionPack\(/);
    expect(pack).not.toMatch(/blocksAdvancement|unansweredCounterarguments|isLiveRecommendation/);
  });

  it("the contract reuses the shipped predicates", () => {
    for (const p of ["gateState", "isLiveRecommendation", "unansweredCounterarguments", "blocksAdvancement"]) {
      expect(contract, `${p} must be imported, not restated`).toMatch(new RegExp(`\\b${p}\\b`));
    }
    expect(contract).not.toMatch(/RED_FLAG_OPTIMISM\s*=/);
  });

  it("stays pure — no clock read beyond the injected one", () => {
    expect(contract).not.toMatch(/Date\.now\(/);
  });
});

describe("grants and mounting", () => {
  it("guards the two optional ledgers behind their own grants", () => {
    expect(pack).toMatch(/enabled: requested && canSeeAssumptions/);
    expect(pack).toMatch(/enabled: requested && canSeeScenarios/);
  });

  it("mounts inside the recommendations gate", () => {
    // A decision pack with no recorded conclusions in it is not a pack.
    expect(dealDetail).toMatch(/hasFeature\(user, "recommendations"\) && \(\s*<DecisionPackExport/);
  });

  it("keeps the dossier export connected to deferred print preparation", () => {
    expect(dealDetail).toMatch(/data-testid="export-pdf"/);
    expect(dealDetail).toMatch(/onClick=\{printing.prepare\}/);
  });
});
