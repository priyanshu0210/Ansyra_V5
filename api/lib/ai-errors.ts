import { TRPCError } from "@trpc/server";

/**
 * The model answered, but not in the shape asked for.
 *
 * A BAD_GATEWAY with a fixed message — never the model's text. The old
 * `new Error("… " + text.slice(0, 200))` became an INTERNAL_SERVER_ERROR that
 * errorFormatter forwarded to error monitoring with 200 characters of whatever
 * the model was reasoning over, which is deal and document content.
 */
export function malformedAiOutput(message = "The AI response could not be read. Nothing was saved; please try again.") {
  return new TRPCError({ code: "BAD_GATEWAY", message });
}

export function providerFailure(status: number, body: string) {
  if (status === 429) {
    const daily = /per.?day|per.?month|daily|monthly|per_day|per_month/i.test(body);
    return { code: "TOO_MANY_REQUESTS" as const, kind: daily ? "quota" : "busy", retryable: !daily,
      message: daily ? "The shared AI allowance is exhausted. Live analysis is unavailable until the provider resets it. Existing records remain available." : "AI analysis is busy or its shared capacity has been reached. Please try again shortly; existing records remain available." };
  }
  return { code: "SERVICE_UNAVAILABLE" as const, kind: status >= 500 ? "unavailable" : "configuration", retryable: status >= 500,
    message: status >= 500 ? "The AI service is temporarily unavailable. Please try again shortly." : "The configured AI service could not complete this request. Please contact the workspace administrator; your existing records remain available." };
}
export function retryDelayMs(value: string | null, attempt: number, now = Date.now()) {
  if (value !== null && value.trim()) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return 1500 * (attempt + 1);
}
