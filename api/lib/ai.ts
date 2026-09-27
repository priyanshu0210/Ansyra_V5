import { TRPCError } from "@trpc/server";
import { providerFailure, retryDelayMs } from "./ai-errors";
// ─────────────────────────────────────────────────────────────────────────────
// Ansyra — single-source AI abstraction layer
// ─────────────────────────────────────────────────────────────────────────────
// Every AI call in the app goes through callAI(). The provider is chosen by
// the AI_PROVIDER env var — nothing else in the codebase needs to change:
//
//   mock       – no key needed; realistic canned JSON for zero-cost development
//   gemini     – Google AI Studio free tier (OpenAI-compatible endpoint)
//   groq       – Groq free tier (Llama models, OpenAI-compatible)
//   openrouter – OpenRouter (free-tier models available, OpenAI-compatible)
//   anthropic  – Anthropic Messages API (Claude; paid)
//
// Mock output requires an explicit mock provider. A missing live key returns
// an availability error; it never silently substitutes fixture output.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { mockAIResponse } from "./ai-mock";
import { env } from "./env";

export type AIProvider =
  | "mock"
  | "gemini"
  | "groq"
  | "openrouter"
  | "anthropic";

interface ProviderConfig {
  baseUrl: string; // OpenAI-compatible /chat/completions base (unused for anthropic/mock)
  keyEnv: string;
  defaultModel: string;
  // Whether the provider can ground answers in live web search. Reserved for
  // future research features (deep target research, live regulatory signals);
  // see the `webSearch` option on callAI.
  supportsWebSearch: boolean;
}

const PROVIDERS: Record<Exclude<AIProvider, "mock">, ProviderConfig> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-3.8-flash",
    supportsWebSearch: true, // Google Search grounding — wired in a later phase
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
    supportsWebSearch: false,
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "deepseek/deepseek-chat-v3-0324:free",
    supportsWebSearch: false,
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    keyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-5",
    supportsWebSearch: true, // Anthropic web_search tool — wired in a later phase
  },
};

const requestedProvider = process.env.AI_PROVIDER || "mock";
const knownProviders = new Set<AIProvider>(["mock", ...Object.keys(PROVIDERS) as Exclude<AIProvider, "mock">[]]);
if (!knownProviders.has(requestedProvider as AIProvider) && env.isProduction) {
  throw new Error(`Unknown AI_PROVIDER: ${requestedProvider}`);
}
export const AI_PROVIDER = (knownProviders.has(requestedProvider as AIProvider) ? requestedProvider : "mock") as AIProvider;
export const AI_MODEL =
  process.env.AI_MODEL ||
  (AI_PROVIDER === "mock" ? "mock" : PROVIDERS[AI_PROVIDER].defaultModel);

if (env.isProduction && env.appMode === "production" && AI_PROVIDER === "mock") {
  throw new Error("AI_PROVIDER=mock is not permitted when APP_MODE=production.");
}

export interface CallAIOptions {
  system?: string;
  json?: boolean; // if true, request JSON-only output and parse before returning
  temperature?: number;
  maxTokens?: number;
  model?: string; // per-call override
  // Reserved: ask the provider to ground the answer in live web search.
  // Currently ignored (no provider wired); the option exists so research
  // features can be added without changing any call sites.
  webSearch?: boolean;
}

export interface CallAIResult<T = unknown> {
  text: string;
  data?: T; // populated when json:true and parse succeeds
  raw?: unknown;
}

/**
 * The one and only function that talks to an LLM. Everything else calls this.
 */
export async function callAI<T = unknown>(
  prompt: string,
  options: CallAIOptions = {},
): Promise<CallAIResult<T>> {
  const {
    system,
    json = false,
    temperature = 0.4,
    maxTokens = 2000,
    model,
  } = options;

  const provider = resolveProvider();

  if (provider === "mock") {
    const text = await mockAIResponse(prompt, system, json);
    const result: CallAIResult<T> = { text, raw: { provider: "mock" } };
    if (json && text) result.data = safeParseJson<T>(text);
    return result;
  }

  const cfg = PROVIDERS[provider];
  const apiKey = process.env[cfg.keyEnv]!;
  const useModel = model || AI_MODEL;

  const text =
    provider === "anthropic"
      ? await callAnthropic(cfg, apiKey, useModel, prompt, {
          system,
          json,
          temperature,
          maxTokens,
        })
      : await callOpenAICompatible(cfg, apiKey, useModel, prompt, {
          system,
          json,
          temperature,
          maxTokens,
        });

  const result: CallAIResult<T> = { text, raw: { provider, model: useModel } };
  if (json && text) {
    result.data = safeParseJson<T>(text);
  }
  return result;
}

/**
 * Throws unless live AI may run here: provider known, key present, and — in
 * production — the data-processing acknowledgement set. Exported so a route
 * can check BEFORE doing expensive work (a 20 MB download) that resolveProvider
 * would otherwise refuse afterwards.
 */
export function assertLiveAiPermitted(): void {
  resolveProvider();
}

function resolveProvider(): AIProvider {
  if (AI_PROVIDER === "mock") return "mock";
  const cfg = PROVIDERS[AI_PROVIDER];
  if (!cfg) {
    if (env.isProduction) throw new Error(`Unknown AI_PROVIDER: ${AI_PROVIDER}`);
    console.warn(`[ai] Unknown AI_PROVIDER "${AI_PROVIDER}" — using mock.`);
    return "mock";
  }
  if (!process.env[cfg.keyEnv]) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Live AI is not configured. Please contact the workspace administrator; existing records remain available." });
  }
  // Every live call carries deal, assumption or document text to the provider.
  // In production that needs the operator's explicit confirmation of the
  // provider's data-processing terms, in every APP_MODE — demo mode relaxes
  // operational requirements, not this one. Mock output is unaffected.
  if (env.isProduction && !env.aiDataProcessingApproved) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Live AI sends deal and document text to the configured provider. The workspace administrator must confirm the provider's data-processing terms (AI_DATA_PROCESSING_APPROVED=true) before live analysis can run. Existing records remain available.",
    });
  }
  return AI_PROVIDER;
}

// ── OpenAI-compatible providers (gemini / groq / openrouter) ────────────────
async function callOpenAICompatible(
  cfg: ProviderConfig,
  apiKey: string,
  model: string,
  prompt: string,
  opts: { system?: string; json: boolean; temperature: number; maxTokens: number },
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.json) {
    body.response_format = { type: "json_object" };
  }
  // Gemini 2.5 models "think" by default, and thinking tokens count against
  // max_tokens on the OpenAI-compat endpoint — which truncates JSON output.
  // Keep structured calls bounded: 2.5 uses no thinking; 3.8 uses low thinking.
  if (cfg.baseUrl.includes("generativelanguage.googleapis.com")) {
    body.reasoning_effort = model.startsWith("gemini-2.5-flash") ? "none" : "low";
    if (!model.startsWith("gemini-2.5-flash")) body.max_tokens = opts.maxTokens + 2048;
  }

  const res = await fetchWithRetry(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const raw = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return raw.choices?.[0]?.message?.content ?? "";
}

// ── Anthropic Messages API ───────────────────────────────────────────────────
async function callAnthropic(
  cfg: ProviderConfig,
  apiKey: string,
  model: string,
  prompt: string,
  opts: { system?: string; json: boolean; temperature: number; maxTokens: number },
): Promise<string> {
  // Anthropic has no response_format — strict-JSON instructions live in the
  // system prompts already, and safeParseJson strips any stray fencing.
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: [{ role: "user", content: prompt }],
  };
  if (opts.system) body.system = opts.system;

  const res = await fetchWithRetry(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const raw = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return (
    raw.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? ""
  );
}

// ── Web-grounded research path (Phase 9) ────────────────────────────────────
// Sibling to callAI for calls that must be grounded in live web search.
// Gemini grounding is only available on the NATIVE :generateContent endpoint
// with tools:[{google_search:{}}] — NOT on the OpenAI-compat path callAI uses.
// Grounding cannot be combined with JSON response mode, so strict-JSON output
// is enforced by the prompt and recovered by safeParseJson.
//   mock                → canned candidates (ai-mock detects the system prompt)
//   gemini              → native grounded call + groundingMetadata sources
//   any other provider  → ungrounded callAI fallback (logged; sources: [])

export interface ResearchSource {
  title: string;
  url: string;
}

export interface CallAIResearchResult<T = unknown> {
  text: string;
  data?: T;
  sources: ResearchSource[]; // grounding citations (empty when ungrounded/mock)
  raw?: unknown;
}

export async function callAIResearch<T = unknown>(
  prompt: string,
  options: CallAIOptions = {},
): Promise<CallAIResearchResult<T>> {
  const { system, json = true, temperature = 0.4, maxTokens = 8000, model } = options;
  const provider = resolveProvider();

  if (provider === "mock") {
    const text = await mockAIResponse(prompt, system, json);
    const result: CallAIResearchResult<T> = { text, sources: [], raw: { provider: "mock" } };
    if (json && text) result.data = safeParseJson<T>(text);
    return result;
  }

  if (provider !== "gemini") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Live source-backed research is not configured for this provider. Existing research remains available; no unsourced replacement was generated." });
  }

  const cfg = PROVIDERS.gemini;
  const apiKey = process.env[cfg.keyEnv]!;
  const useModel = model || process.env.AI_RESEARCH_MODEL || "gemini-2.5-flash";

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      // Gemini 2.5 thinking tokens count against maxOutputTokens. Unbounded,
      // a grounded research task thinks for 8k+ tokens and truncates the JSON
      // (finishReason MAX_TOKENS, verified). A small budget is enough to plan
      // searches while leaving most of the budget for the actual output.
      thinkingConfig: useModel.startsWith("gemini-2.5") ? { thinkingBudget: 2048 } : { thinkingLevel: "low" },
    },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    },
  );

  const raw = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };

  const candidate = raw.candidates?.[0];
  // Exclude `thought` parts — they're the model's reasoning, not the answer,
  // and would corrupt JSON parsing if concatenated in.
  const text =
    candidate?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("") ?? "";
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri;
    if (url && !seen.has(url)) {
      seen.add(url);
      sources.push({ title: chunk.web?.title || url, url });
    }
  }

  const result: CallAIResearchResult<T> = {
    text,
    sources,
    raw: { provider: "gemini", model: useModel, grounded: true },
  };
  if (json && text) result.data = safeParseJson<T>(text);
  return result;
}

// ── Retry on rate limits (free tiers throttle) ──────────────────────────────
//
// Two bounds beyond the attempt count:
//   - a WALL-CLOCK budget for the whole call (one timeout plus a margin), so a
//     request never outlives the platform's proxy timeout while it retries;
//   - NO retry after our own timeout fired. The provider may well have finished
//     that request and billed it; sending it again is a duplicate charge, and a
//     provider that took 45 s once will not answer faster on the second try.
const TIMEOUT_MESSAGE = "AI analysis could not finish. Your input has not been replaced. Please try again shortly.";
const RETRY_MARGIN_MS = 15_000;

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
  budgetMs = env.externalRequestTimeoutMs + RETRY_MARGIN_MS,
): Promise<Response> {
  const deadline = Date.now() + budgetMs;
  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      const timeout = AbortSignal.timeout(env.externalRequestTimeoutMs);
      res = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      const backoff = 500 * (i + 1);
      if (!timedOut && i + 1 < attempts && Date.now() + backoff < deadline) {
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new TRPCError({ code: "TIMEOUT", message: TIMEOUT_MESSAGE });
    }
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    const failure = providerFailure(res.status, body);
    if (!failure.retryable || i + 1 >= attempts) {
      console.warn("[ai-availability]", JSON.stringify({ status: res.status, kind: failure.kind }));
      throw new TRPCError({ code: failure.code, message: failure.message });
    }
    const delay = retryDelayMs(res.headers.get("retry-after"), i);
    // Do not retry before the provider's stated time, past the call's budget,
    // or hold an HTTP request indefinitely.
    if (delay > 10000 || Date.now() + delay > deadline) throw new TRPCError({ code: failure.code, message: failure.message });
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AI analysis is temporarily unavailable. Please try again later." });
}

// ── JSON parsing that survives occasional markdown fencing ──────────────────
// Exported for unit tests only — production callers go through callAI.
export function safeParseJson<T>(text: string): T | undefined {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to locate the first {...} block
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
