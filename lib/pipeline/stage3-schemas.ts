// ================================================================
// STAGE 3: SCHEMA GENERATION (parallel DB+API+Auth, then UI)
// ================================================================

import {
  DBSchemaSchema, APISchemaSchema, UISchemaSchema, AuthSchemaSchema,
  type DBSchema, type APISchema, type UISchema, type AuthSchema,
  type Intent, type Architecture, type StageResult
} from "@/types";
import { llm, BASE_OPTIONS } from "@/lib/llm-client";

async function callLLM(systemPrompt: string, userContent: string, maxTokens = 3000): Promise<string> {
  const res = await llm.chat.completions.create({
    ...BASE_OPTIONS,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: maxTokens,
  });
  return res.choices[0].message.content ?? "{}";
}

// ── DB SCHEMA ────────────────────────────────────────────────────
async function generateDBSchema(arch: Architecture, repairFeedback?: string): Promise<StageResult<DBSchema>> {
  const start = Date.now();
  let retries = 0;

  const systemPrompt = `You are the DATABASE SCHEMA generator of an AI app compiler.
Convert data models into a complete PostgreSQL-ready schema.
Rules:
- Every data_model becomes a table
- All PKs: UUID DEFAULT gen_random_uuid()
- Include created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() and updated_at
- FK constraints must reference real tables
- migration_sql must be complete runnable SQL
- Define enum types before tables that use them

Output ONLY valid JSON:
{
  tables: Array<{
    name: string,
    columns: Array<{
      name: string, sql_type: string, nullable: boolean,
      primary_key?: boolean, unique?: boolean, default?: string,
      references?: { table: string, column: string }
    }>,
    indexes?: Array<{ name: string, columns: string[], unique: boolean }>
  }>,
  migration_sql: string
}`;

  for (let i = 0; i < 3; i++) {
    try {
      const content = `Generate DB schema from:\n${JSON.stringify(arch.data_models, null, 2)}${repairFeedback ? `\n\nFix: ${repairFeedback}` : ""}`;
      const raw = await callLLM(systemPrompt, content, 3000);
      const parsed = JSON.parse(raw);
      const result = DBSchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch { retries++; }
  }
  return { stage: "schema_generation", success: false, error: "DB schema failed", tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── API SCHEMA ───────────────────────────────────────────────────
async function generateAPISchema(intent: Intent, arch: Architecture, repairFeedback?: string): Promise<StageResult<APISchema>> {
  const start = Date.now();
  let retries = 0;

  const systemPrompt = `You are the API SCHEMA generator of an AI app compiler.
Generate a complete REST API specification.
Rules:
- CRUD endpoints for every data_model
- Auth endpoints: POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout
- Paths use kebab-case plural nouns
- Include pagination (page, limit) on all list endpoints
- Request body fields MUST match data model fields
- error_codes must cover: 401, 403, 404, 409, 422, 429, 500

Output ONLY valid JSON matching APISchema type.`;

  for (let i = 0; i < 3; i++) {
    try {
      const content = `Intent features: ${JSON.stringify(intent.features)}\nModels: ${JSON.stringify(arch.data_models)}\nRoles: ${JSON.stringify(arch.auth_strategy)}\nBusiness rules: ${JSON.stringify(arch.business_rules)}${repairFeedback ? `\nFix: ${repairFeedback}` : ""}`;
      const raw = await callLLM(systemPrompt, content, 4000);
      const parsed = JSON.parse(raw);
      const result = APISchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch { retries++; }
  }
  return { stage: "schema_generation", success: false, error: "API schema failed", tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── AUTH SCHEMA ──────────────────────────────────────────────────
async function generateAuthSchema(intent: Intent, arch: Architecture, repairFeedback?: string): Promise<StageResult<AuthSchema>> {
  const start = Date.now();
  let retries = 0;

  const systemPrompt = `You are the AUTH SCHEMA generator of an AI app compiler.
Generate a complete RBAC specification.
Rules:
- Every role from intent.roles MUST be defined
- Permissions must reference actual data models
- Specify WHERE each policy is enforced (route/api/db_row)
Output ONLY valid JSON matching AuthSchema type.`;

  for (let i = 0; i < 3; i++) {
    try {
      const content = `Roles: ${JSON.stringify(intent.roles)}\nAuth strategy: ${JSON.stringify(arch.auth_strategy)}\nBusiness rules: ${JSON.stringify(arch.business_rules)}${repairFeedback ? `\nFix: ${repairFeedback}` : ""}`;
      const raw = await callLLM(systemPrompt, content, 2500);
      const parsed = JSON.parse(raw);
      const result = AuthSchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch { retries++; }
  }
  return { stage: "schema_generation", success: false, error: "Auth schema failed", tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── UI SCHEMA ────────────────────────────────────────────────────
async function generateUISchema(intent: Intent, arch: Architecture, api: APISchema, repairFeedback?: string): Promise<StageResult<UISchema>> {
  const start = Date.now();
  let retries = 0;
  const apiPaths = api.endpoints.map(e => `${e.method} ${e.path}`).join(", ");

  const systemPrompt = `You are the UI SCHEMA generator of an AI app compiler.
Generate a complete page and component specification.
Rules:
- Every page from intent.pages MUST be defined
- Components must reference real API endpoints from: ${apiPaths}
- Forms must have fields matching the API request body
- DataTables must reference a GET list endpoint
- Always include: Login page, Dashboard page
Output ONLY valid JSON matching UISchema type.`;

  for (let i = 0; i < 3; i++) {
    try {
      const content = `Pages needed: ${JSON.stringify(intent.pages)}\nApp type: ${intent.app_type}\nRoles: ${JSON.stringify(intent.roles)}\nEntities: ${JSON.stringify(arch.data_models.map(m => m.name))}${repairFeedback ? `\nFix: ${repairFeedback}` : ""}`;
      const raw = await callLLM(systemPrompt, content, 4000);
      const parsed = JSON.parse(raw);
      const result = UISchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch { retries++; }
  }
  return { stage: "schema_generation", success: false, error: "UI schema failed", tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── ORCHESTRATE ALL ──────────────────────────────────────────────
export async function generateSchemas(intent: Intent, arch: Architecture) {
  const [db, api, auth] = await Promise.all([
    generateDBSchema(arch),
    generateAPISchema(intent, arch),
    generateAuthSchema(intent, arch),
  ]);

  const ui = api.success && api.data
    ? await generateUISchema(intent, arch, api.data)
    : { stage: "schema_generation" as const, success: false, error: "API failed so UI skipped", tokens_used: 0, latency_ms: 0, retries: 0, repair_applied: false };

  return { db, api, ui, auth };
}
