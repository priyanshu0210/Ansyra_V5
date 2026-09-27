import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { hasFeature } from "@/lib/rbac";
import type { AuthUser } from "@/hooks/useAuth";
import { DEAL_STAGES, stageOrdinal, type DealStage } from "@contracts/stages";
import { gateState } from "@contracts/recommendation-gate";
import { blockingAssumptions } from "@contracts/assumption-gate";
import { Card } from "./parchment/Card";
import { Figure } from "./parchment/Figure";
import { Skeleton, LoadingAnnounce } from "./parchment/Skeleton";

// D4. Where this deal stands, and what is holding it.
//
// WHAT THIS REPLACES: a four-cell grid of Stage / Industry / Value / Status.
// Every one of those is a property of the deal, and none of them answers the
// question somebody opens a deal page to ask — *can this move, and if not, why
// not?* That answer existed, but only inside the Recommendations panel, three
// screens down, and only for one of the two gates that can actually stop it.
//
// So the band keeps the four facts and adds the thing they were missing: the
// gate, both halves of it, at the top.
//
// BOTH GATES, IN THE SERVER'S OWN ORDER. `decisions.record` checks assumptions
// first and recommendations second, and reports whichever it hits. This reads
// the same two contracts (`blockingAssumptions`, `gateState`) in the same order,
// so the header cannot promise an advance the server will refuse — or warn about
// one it would have allowed.
//
// IT STATES THE VERDICT AND NAMES THE BLOCKER. IT DOES NOT RESTATE THE RULE.
//
// The first version of this paraphrased the recommendation gate ("Diligence
// needs an accepted, unexpired recommendation recorded at evaluation") — which
// is a SECOND wording of a sentence the Recommendations panel already renders
// from `gateStateHeadline`, deliberately, because that one is character-for-
// character what `decisions.record` returns when the move is refused. Two
// wordings of one rule is not duplication, it is divergence: change
// `recommendationGateReason` and this copy silently goes stale.
//
// So the rule is stated ONCE, in the panel that fixes it. Up here the reader
// gets the verdict, which gate owns it, and a way to get to that panel.
//
// THE RESOLVE IS THE ONE AUTHORED MOMENT IN THE DASHBOARD.
//
// DESIGN.md bans set pieces on Operate surfaces and it is right to: someone is
// using this at 11pm in week three of diligence. But a gate clearing is not
// decoration — it is the single most consequential state change in the product,
// the thing the entire landing page argues for, and the moment the deal becomes
// movable. It gets ONE transition, on colour and opacity, over --t-shift. It
// does not loop, it does not pulse, and nothing else on this surface is allowed
// to do anything like it.

type GateRead =
  | { kind: "loading" }
  /**
   * The gate could not be READ — a query failed, or the stage is not one this
   * lifecycle knows. Distinct from `ungated`, and the distinction is the whole
   * point: "nothing is blocking this" and "we could not find out" are opposite
   * claims, and defaulting the second to the first is how a gate panel tells
   * someone a locked deal is clear.
   */
  | { kind: "unknown"; note: string }
  | { kind: "ungated"; note: string }
  | { kind: "clear"; note: string }
  /** `where` names the panel that carries the full rule and the remedy. */
  | { kind: "locked"; note: string; where: string };

export function DealStanding({
  user,
  dealId,
  stage,
  industry,
  value,
  status,
}: {
  user: AuthUser | null;
  dealId: number;
  stage: string;
  industry: string | null;
  value: string | null;
  status: string;
}) {
  const recsOn = hasFeature(user, "recommendations");
  const assumptionsOn = hasFeature(user, "assumptions");

  const recs = trpc.recommendations.list.useQuery({ dealId }, { enabled: recsOn });
  const assumptions = trpc.ai.listAssumptions.useQuery({ dealId }, { enabled: assumptionsOn });

  // `stageOrdinal` returns -1 for a stage this lifecycle does not know, and
  // -1 + 1 indexes the FIRST stage — so an unrecognised value would silently
  // offer to advance the deal to "sourcing". Resolve the ordinal first and
  // check it, rather than indexing off a value that may be a sentinel.
  const ordinal = stageOrdinal(stage);
  const knownStage = ordinal >= 0;
  const nextStage = knownStage
    ? (DEAL_STAGES[ordinal + 1] as DealStage | undefined)
    : undefined;

  const gate = useMemo<GateRead>(() => {
    if ((recsOn && recs.isLoading) || (assumptionsOn && assumptions.isLoading)) {
      return { kind: "loading" };
    }

    // A failed query means the gate is UNREAD, not clear. Both are checked
    // before anything below can conclude, because either one alone is enough to
    // lock the deal — reporting "nothing is holding this back" on the strength
    // of the half that happened to load would be the same lie in a narrower
    // window.
    if ((recsOn && recs.isError) || (assumptionsOn && assumptions.isError)) {
      return {
        kind: "unknown",
        note: "Could not check the advancement gate. Reload to try again — the server enforces it either way, so a move may still be refused.",
      };
    }
    if (!knownStage) {
      return {
        kind: "unknown",
        note: `"${stage}" is not a stage in this lifecycle, so there is no next stage to gate against.`,
      };
    }
    if (!nextStage) {
      return { kind: "ungated", note: "This deal is at the last stage. There is nowhere further to advance it." };
    }

    // 1. The assumption gate, first — same order as api/decisions-router.ts.
    if (assumptionsOn && assumptions.data) {
      const blocking = blockingAssumptions(assumptions.data);
      if (blocking.length > 0) {
        return {
          kind: "locked",
          note:
            blocking.length === 1
              ? "One red-flag assumption is unanswered."
              : `${blocking.length} red-flag assumptions are unanswered.`,
          where: "the Assumption Ledger",
        };
      }
    }

    // 2. Then the recommendation gate.
    if (recsOn && recs.data) {
      const g = gateState(recs.data, stage, nextStage);
      if (g.kind === "locked") {
        return {
          kind: "locked",
          note: `No accepted recommendation at ${stage}.`,
          where: "Recommendations",
        };
      }
      if (g.kind === "clear") {
        return {
          kind: "clear",
          note:
            g.expiringSoon && g.soonestExpiry
              ? `Clear to move into ${nextStage}. The recommendation behind it expires soon.`
              : `Clear to move into ${nextStage}.`,
        };
      }
    }

    return {
      kind: "ungated",
      note: `Nothing is holding this deal back from ${nextStage}.`,
    };
  }, [
    recsOn,
    assumptionsOn,
    recs.isLoading,
    recs.isError,
    recs.data,
    assumptions.isLoading,
    assumptions.isError,
    assumptions.data,
    stage,
    knownStage,
    nextStage,
  ]);

  // THE `-text` CUTS, NOT THE BASE SEVERITY TOKENS.
  //
  // `--sev-flag`, `--sev-watch` and `--sev-grounded` are all light-ground values
  // used unchanged in both themes; on the dark card they measure 1.4-2.0:1. The
  // mark is a graphic conveying state, so it owes 3:1 (WCAG 1.4.11) the same way
  // the rail marker does. The `-text` cuts are theme-varied and measured: 4.5:1
  // and 5.2:1 dark, 6.2:1 and 6.6:1 light.
  // `unknown` takes the watch cut rather than the neutral rule: it is not a
  // clear state and must not look like one.
  const tone =
    gate.kind === "locked"
      ? "var(--sev-flag-text)"
      : gate.kind === "clear"
        ? "var(--sev-grounded-text)"
        : gate.kind === "unknown"
          ? "var(--sev-watch-text)"
          : "var(--fg-rule)";

  return (
    <Card data-testid="deal-standing">
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {[
          ["Stage", stage],
          ["Industry", industry ?? "—"],
          ["Value", value ?? "—"],
          ["Status", status],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 [overflow-wrap:anywhere]">
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>{k}</p>
            {/* Value is the only one of the four that is a quantity, and the
                only one that changes. Through Figure so it stops reflowing. */}
            {k === "Value" ? (
              <Figure
                value={v}
                format="raw"
                className="mt-1 block font-serif text-lg"
                style={{ color: "var(--fg)" }}
              />
            ) : (
              <p className="mt-1 font-serif text-lg capitalize" style={{ color: "var(--fg)" }}>{v}</p>
            )}
          </div>
        ))}
      </div>

      {/* THE GATE. Separated by a rule rather than made a fifth cell: it is a
          verdict about the four facts above, not a fifth fact. */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
        {gate.kind === "loading" ? (
          <div className="flex items-center gap-3">
            <LoadingAnnounce what="the advancement gate" />
            <Skeleton w={3} h={30} style={{ borderRadius: 999 }} />
            <Skeleton w="46%" />
          </div>
        ) : (
          <div className="flex items-start gap-3" data-testid={`deal-gate-${gate.kind}`}>
            <span
              aria-hidden
              className="ansyra-gate-mark mt-0.5 block shrink-0"
              style={{ backgroundColor: tone }}
            />
            <div className="min-w-0">
              <p
                className="ansyra-gate-line font-sans font-medium"
                style={{
                  color: gate.kind === "locked" ? "var(--sev-flag-text)" : "var(--fg)",
                  fontSize: "var(--step-sm)",
                }}
              >
                {gate.kind === "locked"
                  ? "Advancement gate: locked"
                  : gate.kind === "clear"
                    ? "Advancement gate: clear"
                    : gate.kind === "unknown"
                      ? "Advancement gate: unknown"
                      : "Advancement gate: not applicable"}
              </p>
              <p
                className="mt-1 text-pretty font-sans"
                style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.5 }}
              >
                {gate.note}
                {gate.kind === "locked" ? (
                  <>
                    {" "}
                    The full rule and the fix are in{" "}
                    <span style={{ color: "var(--fg)" }}>{gate.where}</span>, below.
                  </>
                ) : null}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
