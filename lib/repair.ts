// ================================================================
// REPAIR ENGINE — Surgical per-layer repair (not brute retry)
// ================================================================

import {
  DBSchemaSchema, APISchemaSchema, UISchemaSchema, AuthSchemaSchema,
  type DBSchema, type APISchema, type UISchema, type AuthSchema,
  type ValidationIssue,
} from "@/types";
import { llm, FAST_OPTIONS } from "@/lib/llm-client";

async function repairLayer<T>(
  layer: "db" | "api" | "ui" | "auth",
  currentSchema: T,
  issues: ValidationIssue[],
  context: Record<string, unknown>
): Promise<T> {
  const layerIssues = issues.filter(i => i.layer === layer || i.layer === "cross");
  if (layerIssues.length === 0) return currentSchema;

  const schemaValidators = { db: DBSchemaSchema, api: APISchemaSchema, ui: UISchemaSchema, auth: AuthSchemaSchema };
  const issuesSummary = layerIssues
    .map(i => `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}${i.fix_suggestion ? ` → FIX: ${i.fix_suggestion}` : ""}`)
    .join("\n");

  try {
    const response = await llm.chat.completions.create({
      ...FAST_OPTIONS,
      messages: [
        {
          role: "system",
          content: `You are the REPAIR ENGINE of an AI app compiler.
Fix ONLY the listed issues in the ${layer.toUpperCase()} schema. Do not change anything else.
Return the complete corrected schema. Output ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Current ${layer.toUpperCase()} schema:\n${JSON.stringify(currentSchema, null, 2)}\n\nContext:\n${JSON.stringify(context)}\n\nIssues to fix:\n${issuesSummary}`,
        },
      ],
      max_tokens: 4000,
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    const result = (schemaValidators[layer] as typeof DBSchemaSchema).safeParse(parsed);
    if (result.success) return result.data as T;
  } catch { /* repair failed — return original */ }

  return currentSchema;
}

export async function refineSchemas(
  db: DBSchema, api: APISchema, ui: UISchema, auth: AuthSchema,
  issues: ValidationIssue[],
  context: Record<string, unknown>
): Promise<{ db: DBSchema; api: APISchema; ui: UISchema; auth: AuthSchema; retries: number; repairApplied: boolean }> {
  const errors = issues.filter(i => i.severity === "error");
  if (errors.length === 0) return { db, api, ui, auth, retries: 0, repairApplied: false };

  const affectedLayers = new Set(errors.map(i => i.layer).filter(l => l !== "cross")) as Set<"db" | "api" | "ui" | "auth">;
  const crossIssues = errors.filter(i => i.layer === "cross");
  for (const issue of crossIssues) {
    if (issue.code.startsWith("DB_")) affectedLayers.add("db");
    if (issue.code.startsWith("API_")) affectedLayers.add("api");
    if (issue.code.startsWith("UI_")) affectedLayers.add("ui");
    if (issue.code.startsWith("ROLE_")) affectedLayers.add("auth");
  }

  let repairedDB = db, repairedAPI = api, repairedUI = ui, repairedAuth = auth;
  const ctx = { db: db.tables.map(t => t.name), api: api.endpoints.map(e => `${e.method} ${e.path}`), ...context };

  await Promise.all(Array.from(affectedLayers).map(async layer => {
    switch (layer) {
      case "db":   repairedDB   = await repairLayer("db",   db,   errors, ctx); break;
      case "api":  repairedAPI  = await repairLayer("api",  api,  errors, ctx); break;
      case "ui":   repairedUI   = await repairLayer("ui",   ui,   errors, ctx); break;
      case "auth": repairedAuth = await repairLayer("auth", auth, errors, ctx); break;
    }
  }));

  return { db: repairedDB, api: repairedAPI, ui: repairedUI, auth: repairedAuth, retries: affectedLayers.size, repairApplied: affectedLayers.size > 0 };
}
