// ================================================================
// LLM CLIENT — Single source of truth for provider config
// Grok (xAI) is OpenAI-compatible — same SDK, different base URL
// To switch providers: change BASE_URL + MODEL only
// ================================================================

import OpenAI from "openai";

// ── Provider config ───────────────────────────────────────────────
const PROVIDER = process.env.LLM_PROVIDER ?? "grok"; // "grok" | "openai"

const PROVIDERS = {
  grok: {
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY!,
    model: "grok-3",           // or "grok-2" for faster/cheaper
    model_fast: "grok-2",      // used for repair (lower stakes)
  },
  openai: {
    baseURL: undefined,        // default OpenAI endpoint
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o",
    model_fast: "gpt-4o-mini",
  },
} as const;

const cfg = PROVIDERS[PROVIDER as keyof typeof PROVIDERS] ?? PROVIDERS.grok;

// ── Singleton client ──────────────────────────────────────────────
export const llm = new OpenAI({
  apiKey: cfg.apiKey,
  baseURL: cfg.baseURL,
});

export const LLM_MODEL = cfg.model;
export const LLM_MODEL_FAST = cfg.model_fast;
export const LLM_PROVIDER = PROVIDER;

// ── Standard call options (determinism) ──────────────────────────
export const BASE_OPTIONS = {
  model: LLM_MODEL,
  temperature: 0,
  seed: 42,
  response_format: { type: "json_object" as const },
} as const;

export const FAST_OPTIONS = {
  ...BASE_OPTIONS,
  model: LLM_MODEL_FAST,
} as const;
