import OpenAI from "openai";

const PROVIDER = process.env.LLM_PROVIDER ?? "grok";

const PROVIDERS = {
  grok: {
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY!,
    model: "grok-3",
    model_fast: "grok-3",
    supports_json_mode: false, // Grok does NOT support response_format
  },
  openai: {
    baseURL: undefined,
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o",
    model_fast: "gpt-4o-mini",
    supports_json_mode: true,
  },
} as const;

const cfg = PROVIDERS[PROVIDER as keyof typeof PROVIDERS] ?? PROVIDERS.grok;

export const llm = new OpenAI({
  apiKey: cfg.apiKey,
  baseURL: cfg.baseURL,
});

export const LLM_MODEL = cfg.model;
export const LLM_MODEL_FAST = cfg.model_fast;
export const LLM_PROVIDER = PROVIDER;
export const SUPPORTS_JSON_MODE = cfg.supports_json_mode;

// For Grok: no response_format, enforce JSON via prompt instead
export const BASE_OPTIONS = {
  model: LLM_MODEL,
  temperature: 0,
  ...(SUPPORTS_JSON_MODE ? { response_format: { type: "json_object" as const } } : {}),
} as const;

export const FAST_OPTIONS = {
  ...BASE_OPTIONS,
  model: LLM_MODEL_FAST,
} as const;

// Append this to every system prompt when not using json_object mode
export const JSON_REMINDER = SUPPORTS_JSON_MODE
  ? ""
  : "\n\nCRITICAL: Your response must be ONLY valid JSON. No markdown, no backticks, no explanation. Start your response with { and end with }.";
