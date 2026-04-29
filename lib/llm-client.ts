import OpenAI from "openai";

const PROVIDER = process.env.LLM_PROVIDER ?? "groq";

const PROVIDERS = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-20b",
    model_fast: "openai/gpt-oss-20b",
    supports_json_mode: true,
    envVar: "GROQ_API_KEY",
  },
  grok: {
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY,
    model: "grok-3",
    model_fast: "grok-3",
    supports_json_mode: false,
    envVar: "XAI_API_KEY",
  },
  openai: {
    baseURL: undefined,
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o",
    model_fast: "gpt-4o-mini",
    supports_json_mode: true,
    envVar: "OPENAI_API_KEY",
  },
} as const;

const cfg = PROVIDERS[PROVIDER as keyof typeof PROVIDERS];
const providerConfigError = !cfg
  ? new Error(`Unsupported LLM_PROVIDER "${PROVIDER}". Use one of: groq, grok, openai.`)
  : null;
const missingApiKeyError = cfg && !cfg.apiKey
  ? new Error(`Missing API key: set ${cfg.envVar} in your environment variables`)
  : null;
const llmConfigError = providerConfigError ?? missingApiKeyError;

export function assertLLMConfigured() {
  if (llmConfigError) throw llmConfigError;
}

export const llm = llmConfigError
  ? new Proxy({} as OpenAI, {
      get() {
        throw llmConfigError;
      },
    })
  : new OpenAI({
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
