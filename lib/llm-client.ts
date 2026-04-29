import OpenAI from "openai";

const PROVIDER = process.env.LLM_PROVIDER ?? "grok";

const PROVIDERS = {
  grok: {
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY,
    model: "grok-3",
    model_fast: "grok-3",
    supports_json_mode: false,
  },
  openai: {
    baseURL: undefined,
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o",
    model_fast: "gpt-4o-mini",
    supports_json_mode: true,
  },
} as const;

const cfg = PROVIDERS[PROVIDER as keyof typeof PROVIDERS] ?? PROVIDERS.grok;

// Bug fix: validate API key at startup so failures show a clear error
// instead of a cryptic auth exception that gets misclassified as "vague_input"
if (!cfg.apiKey) {
  const envVar = PROVIDER === "openai" ? "OPENAI_API_KEY" : "XAI_API_KEY";
  throw new Error(
    `Missing API key: ${envVar} is not set. ` +
    `Copy .env.example to .env.local and add your ${envVar}.`
  );
}

export const llm = new OpenAI({
  apiKey: cfg.apiKey,
  baseURL: cfg.baseURL,
});

export const LLM_MODEL = cfg.model;
export const LLM_MODEL_FAST = cfg.model_fast;
export const LLM_PROVIDER = PROVIDER;
export const SUPPORTS_JSON_MODE = cfg.supports_json_mode;

export const BASE_OPTIONS = {
  model: LLM_MODEL,
  temperature: 0,
  ...(SUPPORTS_JSON_MODE ? { response_format: { type: "json_object" as const } } : {}),
} as const;

export const FAST_OPTIONS = {
  ...BASE_OPTIONS,
  model: LLM_MODEL_FAST,
} as const;

export const JSON_REMINDER = SUPPORTS_JSON_MODE
  ? ""
  : "\n\nCRITICAL: Your response must be ONLY valid JSON. No markdown, no backticks, no explanation. Start your response with { and end with }.";
