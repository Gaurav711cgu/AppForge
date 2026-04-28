// ================================================================
// STAGE 2: SYSTEM DESIGN LAYER (AST Construction)
// ================================================================

import { ArchitectureSchema, type Architecture, type Intent, type StageResult } from "@/types";
import { llm, BASE_OPTIONS } from "@/lib/llm-client";

const SYSTEM_PROMPT = `You are the SYSTEM DESIGN stage of an AI application compiler.

Input: A structured intent specification
Output: A complete application architecture definition

Rules:
- Every entity from core_entities MUST become a data_model
- Every role from intent.roles MUST appear in user_flows
- Business rules must be concrete and enforceable
- Include soft-deletes (deleted_at) on all major entities
- Always include: id (uuid), created_at, updated_at on every model
- Relations must be bidirectional

Output ONLY valid JSON matching this schema:
{
  data_models: Array<{
    name: string,
    fields: Array<{
      name: string,
      type: "string"|"number"|"boolean"|"date"|"email"|"url"|"uuid"|"json"|"enum",
      required: boolean,
      unique?: boolean,
      enum_values?: string[],
      default?: unknown,
      reference?: string
    }>,
    relations: Array<{
      type: "one_to_one"|"one_to_many"|"many_to_many",
      with: string,
      foreign_key?: string
    }>,
    indexes?: string[]
  }>,
  user_flows: Array<{
    name: string,
    actor: string,
    steps: string[],
    outcome: string
  }>,
  auth_strategy: {
    type: "jwt"|"session"|"oauth"|"api_key",
    providers: Array<"email"|"google"|"github"|"phone">,
    mfa: boolean,
    session_duration: string
  },
  business_rules: Array<{
    name: string,
    condition: string,
    action: string,
    enforced_at: "ui"|"api"|"db"|"all"
  }>
}`;

export async function generateArchitecture(
  intent: Intent,
  repairFeedback?: string,
  previousAttempt?: Partial<Architecture>
): Promise<StageResult<Architecture>> {
  const start = Date.now();
  let retries = 0;
  let repairApplied = false;

  const buildMessages = (feedback?: string) => {
    const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Design the architecture for:\n\n${JSON.stringify(intent, null, 2)}` },
    ];
    if (feedback && previousAttempt) {
      msgs.push({ role: "assistant", content: JSON.stringify(previousAttempt) });
      msgs.push({ role: "user", content: `Fix these issues:\n${feedback}\nReturn complete corrected JSON.` });
      repairApplied = true;
    }
    return msgs;
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await llm.chat.completions.create({
        ...BASE_OPTIONS,
        messages: buildMessages(repairFeedback),
        max_tokens: 3500,
      });

      const raw = response.choices[0].message.content ?? "{}";
      const parsed = JSON.parse(raw);
      const result = ArchitectureSchema.safeParse(parsed);

      if (result.success) {
        const modelNames = result.data.data_models.map(m => m.name.toLowerCase());
        const missingEntities = intent.core_entities.filter(
          e => !modelNames.includes(e.name.toLowerCase())
        );
        if (missingEntities.length > 0) {
          repairFeedback = `Missing data models for: ${missingEntities.map(e => e.name).join(", ")}. Every core entity MUST have a data model.`;
          repairApplied = true;
          retries++;
          continue;
        }
        return {
          stage: "system_design",
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
          stage: "system_design",
          success: false,
          error: err instanceof Error ? err.message : "Architecture generation failed",
          tokens_used: 0,
          latency_ms: Date.now() - start,
          retries,
          repair_applied: repairApplied,
        };
      }
    }
  }

  return {
    stage: "system_design",
    success: false,
    error: "Could not generate valid architecture after 3 attempts",
    tokens_used: 0,
    latency_ms: Date.now() - start,
    retries,
    repair_applied: repairApplied,
  };
}
