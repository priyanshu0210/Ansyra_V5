import { toast } from "sonner";

// D5. Write feedback, said the same way everywhere.
//
// There are 51 mutations across the instrument panels and every one of them
// used to succeed in silence. Wiring them individually invites two failures:
// fifty-one slightly different phrasings of the same event, and the temptation
// to write "Saved!" fifty-one times because naming the thing is more effort.
//
// THE COPY RULE, from the craft floor: a confirmation names WHAT happened, and
// a failure names the problem AND the recovery. "Success" tells the reader
// nothing they did not already know from pressing the button; "Error" tells
// them nothing they can act on.
//
// So the subject is always passed in, and the verb is chosen from a small set
// that matches what the server actually did. `withToast` merges into an
// existing `useMutation` config rather than replacing it, because most of these
// already have an `onSuccess` doing cache invalidation that must keep running.

// tRPC/react-query hand their handlers THREE arguments, and some call sites
// here use the third: `deals.update` does an optimistic update and rolls back
// from the context object in `onError(err, vars, ctx)`. An earlier version of
// this typed them as one-argument functions and silently dropped the rollback,
// which is a data bug wearing a type error's clothes. Everything is forwarded.
// The parameters are typed HERE because wrapping a mutation config removes
// tRPC's contextual typing from the call site: `onError: (e) => ...` inside a
// wrapper has no idea what `e` is, and an earlier version that used rest
// parameters widened every handler argument to `unknown` across twelve files.
// Declaring the positions gives the call sites their types back.
// `any` in the positions, deliberately, and it is the narrowest thing that
// works. tRPC's option type is generic over the procedure's input and output,
// and its handler parameters are CONTRAVARIANT: anything more specific than
// `any` here — `unknown`, `never`, a structural stand-in — makes the returned
// object unassignable to `UseTRPCMutationOptions` for every procedure with a
// different shape, which is all of them. Tried in that order; each failed on a
// different one of the sixteen call sites.
//
// The trade is contained: the `any` lives in this adapter, the call sites keep
// their own inference because they still write their handlers as literals, and
// the wrapper only ever forwards arguments it does not inspect.
/* eslint-disable @typescript-eslint/no-explicit-any */
type MutErr = { message?: string };
type Handlers = {
  onSuccess?: (data: any, vars: any, ctx: any) => unknown;
  onError?: (err: any, vars: any, ctx: any) => unknown;
  onMutate?: (vars: any) => unknown;
  onSettled?: (data: any, err: any, vars: any, ctx: any) => unknown;
};
type AnyArgs = readonly unknown[];

/**
 * Wraps a mutation's handlers with a confirmation and a failure message.
 *
 * ```ts
 * trpc.milestones.create.useMutation(
 *   withToast(
 *     { done: "Milestone added", failed: "Could not add that milestone" },
 *     { onSuccess: () => utils.milestones.list.invalidate() },
 *   ),
 * )
 * ```
 */
export function withToast(
  copy: {
    /** Names what happened. "Milestone added", not "Success". */
    done: string;
    /** Optional detail: the specific thing, or what changes next. */
    detail?: string | ((...args: AnyArgs) => string | undefined);
    /** Names the problem. "Could not add that milestone", not "Error". */
    failed: string;
    /** Overrides the default recovery line. */
    recovery?: string;
    /** Suppress the success toast — for writes that are already visible. */
    silentOnSuccess?: boolean;
    /**
     * Suppress the failure toast — for call sites that ALREADY render the
     * error inline.
     *
     * Several panels keep a persistent banner fed from their own `onError`
     * (AdminPanel's `actionError`, AccessRequests' `onError` prop, the modals'
     * local `error`). Wrapping those in a toast as well makes one rejection
     * report itself twice, in two places, with the same server message. The
     * inline banner is the better of the two there — it sits with the control
     * that failed and it persists — so the toast is the one that gives way.
     */
    silentOnError?: boolean;
  },
  handlers: Handlers = {},
): Handlers {
  return {
    // Everything the caller already had is preserved — `onMutate`, `onSettled`,
    // `retry`, optimistic-update config — and only the two handlers are wrapped.
    ...handlers,
    onSuccess: ((...args: AnyArgs) => {
      (handlers.onSuccess as ((...a: AnyArgs) => unknown) | undefined)?.(...args);
      if (copy.silentOnSuccess) return;
      const detail = typeof copy.detail === "function" ? copy.detail(...args) : copy.detail;
      toast.success(copy.done, detail ? { description: detail } : undefined);
    }) as Handlers["onSuccess"],
    onError: ((...args: AnyArgs) => {
      (handlers.onError as ((...a: AnyArgs) => unknown) | undefined)?.(...args);
      if (copy.silentOnError) return;
      const err = args[0] as MutErr | undefined;
      toast.error(copy.failed, {
        // The server's own message where there is one — it is more specific
        // than anything written here, and the gates in particular return a
        // sentence the reader needs verbatim.
        description:
          err?.message ||
          copy.recovery ||
          "Try again. If it keeps failing, reload the page.",
      });
    }) as Handlers["onError"],
  };
}

/**
 * For writes with no mutation object to wrap — an imperative failure.
 *
 * There was a `done` counterpart here and nothing ever called it: every success
 * path goes through `withToast`'s `done` copy, which is the point of the
 * wrapper. Only the failure case genuinely needs to be fired by hand, and only
 * from one place — DealPipeline's optimistic stage move, which cannot use
 * `withToast` without losing the type of its rollback context.
 */
export const notify = {
  failed: (what: string, detail?: string) =>
    toast.error(what, {
      description: detail || "Try again. If it keeps failing, reload the page.",
    }),
};
