// ================================================================
// STAGE 1: INTENT EXTRACTION (Lexer + Parser)
// ================================================================

import { IntentSchema, type Intent, type StageResult } from "@/types";
import { llm, BASE_OPTIONS } from "@/lib/llm-client";

const SYSTEM_PROMPT = `You are the INTENT EXTRACTION stage of an AI application compiler.

Your role: Parse a user's natural language description of an app into a precise, structured intermediate representation.

Rules:
1. NEVER generate UI, API, or DB schemas here — that is a later stage
2. Extract ONLY what is explicitly stated or strongly implied
3. For vague inputs: list them in clarifications_needed AND make reasonable assumptions
4. For conflicting requirements: flag them in clarifications_needed
5. Set confidence = 0.0 to 1.0 based on how complete the spec is
6. Identify ALL user roles — even implicit ones (e.g. "users" implies an authenticated user role)
7. List every page/screen implied by the features

Output ONLY valid JSON matching the exact schema. No markdown, no explanation.

Schema:
{
  app_name: string,
  app_type: "crm"|"ecommerce"|"saas"|"dashboard"|"marketplace"|"social"|"productivity"|"education"|"healthcare"|"custom",
  description: string,
  core_entities: Array<{ name: string, description: string, attributes: string[] }>,
  features: Array<{ name: string, description: string, priority: "must"|"should"|"could" }>,
  roles: Array<{ name: string, description: string, permissions: string[] }>,
  pages: string[],
  integrations: string[],
  assumptions: string[],
  clarifications_needed: string[],
  confidence: number
}`;

export async function extractIntent(
  userPrompt: string,
  previousAttempt?: Partial<Intent>,
  repairFeedback?: string
): Promise<StageResult<Intent>> {
  const start = Date.now();
  let retries = 0;
  let repairApplied = false;

  const buildMessages = (feedback?: string) => {
    const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Parse this application description:\n\n"${userPrompt}"` },
    ];
    if (feedback && previousAttempt) {
      msgs.push({ role: "assistant", content: JSON.stringify(previousAttempt) });
      msgs.push({ role: "user", content: `Fix these issues:\n${feedback}\n\nReturn complete corrected JSON.` });
      repairApplied = true;
    }
    return msgs;
  };

  while (retries < 3) {
    try {
      const response = await llm.chat.completions.create({
        ...BASE_OPTIONS,
        messages: buildMessages(repairFeedback),
        max_tokens: 2000,
      });

      const raw = response.choices[0].message.content ?? "{}";
      const parsed = JSON.parse(raw);
      const result = IntentSchema.safeParse(parsed);

      if (result.success) {
        return {
          stage: "intent_extraction",
          success: true,
          data: result.data,
          tokens_used: response.usage?.total_tokens ?? 0,
          latency_ms: Date.now() - start,
          retries,
          repair_applied: repairApplied,
        };
      }

      repairFeedback = result.error.issues.map(i => `• ${i.path.join(".")}: ${i.message}`).join("\n");
      repairApplied = true;
      retries++;
    } catch (err) {
      retries++;
      if (retries >= 3) {
        return {
          stage: "intent_extraction",
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
          tokens_used: 0,
          latency_ms: Date.now() - start,
          retries,
          repair_applied: repairApplied,
        };
      }
    }
  }

  return {
    stage: "intent_extraction",
    success: false,
    error: "Max retries exceeded.",
    tokens_used: 0,
    latency_ms: Date.now() - start,
    retries,
    repair_applied: repairApplied,
  };
}
