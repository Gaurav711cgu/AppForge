// ================================================================
// STAGE 3: SCHEMA GENERATION (parallel DB+API+Auth, then UI)
// ================================================================

import {
  DBSchemaSchema, APISchemaSchema, UISchemaSchema, AuthSchemaSchema,
  type DBSchema, type APISchema, type UISchema, type AuthSchema,
  type Intent, type Architecture, type StageResult
} from "@/types";
import { llm, BASE_OPTIONS, JSON_REMINDER, LLM_PROVIDER } from "@/lib/llm-client";

async function callLLM(systemPrompt: string, userContent: string, maxTokens = 3000): Promise<string> {
  const res = await llm.chat.completions.create({
    ...BASE_OPTIONS,
    messages: [
      { role: "system", content: systemPrompt + JSON_REMINDER },
      { role: "user", content: userContent },
    ],
    max_tokens: maxTokens,
  });
  const raw = res.choices[0].message.content ?? "{}";
  return raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
}

// ── DB SCHEMA ────────────────────────────────────────────────────
async function generateDBSchema(arch: Architecture, repairFeedback?: string): Promise<StageResult<DBSchema>> {
  const start = Date.now();
  let retries = 0;
  let lastError = "DB schema failed";

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
      const raw = await callLLM(systemPrompt, content, 1800);
      const parsed = JSON.parse(raw);
      const result = DBSchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "DB schema failed";
      retries++;
    }
  }
  return { stage: "schema_generation", success: false, error: lastError, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── API SCHEMA ───────────────────────────────────────────────────
async function generateAPISchema(intent: Intent, arch: Architecture, repairFeedback?: string): Promise<StageResult<APISchema>> {
  const start = Date.now();
  let retries = 0;
  let lastError = "API schema failed";

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
      const raw = await callLLM(systemPrompt, content, 2200);
      const parsed = JSON.parse(raw);
      const result = APISchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "API schema failed";
      retries++;
    }
  }
  return { stage: "schema_generation", success: false, error: lastError, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── AUTH SCHEMA ──────────────────────────────────────────────────
async function generateAuthSchema(intent: Intent, arch: Architecture, repairFeedback?: string): Promise<StageResult<AuthSchema>> {
  const start = Date.now();
  let retries = 0;
  let lastError = "Auth schema failed";

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
      const raw = await callLLM(systemPrompt, content, 1200);
      const parsed = JSON.parse(raw);
      const result = AuthSchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Auth schema failed";
      retries++;
    }
  }
  return { stage: "schema_generation", success: false, error: lastError, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

// ── UI SCHEMA ────────────────────────────────────────────────────
async function generateUISchema(intent: Intent, arch: Architecture, api: APISchema, repairFeedback?: string): Promise<StageResult<UISchema>> {
  const start = Date.now();
  let retries = 0;
  let lastError = "UI schema failed";
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
      const raw = await callLLM(systemPrompt, content, 2200);
      const parsed = JSON.parse(raw);
      const result = UISchemaSchema.safeParse(parsed);
      if (result.success) {
        return { stage: "schema_generation", success: true, data: result.data, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: !!repairFeedback };
      }
      repairFeedback = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      retries++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "UI schema failed";
      retries++;
    }
  }
  return { stage: "schema_generation", success: false, error: lastError, tokens_used: 0, latency_ms: Date.now() - start, retries, repair_applied: false };
}

function toSnake(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function toKebab(name: string) {
  return toSnake(name).replace(/_/g, "-");
}

function tableName(name: string) {
  const snake = toSnake(name);
  return snake === "user" ? "users" : snake;
}

function title(name: string) {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function sqlType(type: string) {
  if (type === "number") return "INTEGER";
  if (type === "boolean") return "BOOLEAN";
  if (type === "date") return "TIMESTAMPTZ";
  if (type === "uuid") return "UUID";
  if (type === "json") return "JSONB";
  return "TEXT";
}

function fallbackDB(arch: Architecture): DBSchema {
  const tables = arch.data_models.map(model => {
    const dbTableName = tableName(model.name);
    const columns: DBSchema["tables"][number]["columns"] = [
      { name: "id", sql_type: "UUID", nullable: false, primary_key: true },
      ...model.fields.filter(field => !["id", "created_at", "updated_at", "deleted_at"].includes(toSnake(field.name))).map(field => ({
        name: toSnake(field.name),
        sql_type: sqlType(field.type),
        nullable: field.reference ? true : !field.required,
        unique: field.unique,
        references: field.reference ? { table: tableName(field.reference), column: "id" } : undefined,
      })),
      { name: "created_at", sql_type: "TIMESTAMPTZ", nullable: false, default: "NOW()" },
      { name: "updated_at", sql_type: "TIMESTAMPTZ", nullable: false, default: "NOW()" },
      { name: "deleted_at", sql_type: "TIMESTAMPTZ", nullable: true },
    ];
    return { name: dbTableName, columns, indexes: [{ name: `idx_${dbTableName}_deleted_at`, columns: ["deleted_at"], unique: false }] };
  });

  const migration_sql = tables.map(table => {
    const cols = table.columns.map(column => {
      const parts = [`${column.name} ${column.sql_type}`];
      if (column.primary_key) parts.push("PRIMARY KEY");
      if (!column.nullable) parts.push("NOT NULL");
      if (column.unique) parts.push("UNIQUE");
      if (column.default) parts.push(`DEFAULT ${column.default}`);
      if (column.references) parts.push(`REFERENCES ${column.references.table}(${column.references.column})`);
      return `  ${parts.join(" ")}`;
    }).join(",\n");
    return `CREATE TABLE ${table.name} (\n${cols}\n);`;
  }).join("\n\n");

  return { tables, migration_sql };
}

function fallbackAPI(intent: Intent, arch: Architecture): APISchema {
  const roles = intent.roles.map(role => role.name);
  const endpoints = arch.data_models.flatMap(model => {
    const resource = toKebab(model.name);
    const request_body = Object.fromEntries(model.fields.filter(field => !["id", "created_at", "updated_at", "deleted_at"].includes(toSnake(field.name))).map(field => [toSnake(field.name), {
      type: field.type,
      required: field.required,
      description: `${title(field.name)} value`,
    }]));
    return [
      { method: "GET" as const, path: `/${resource}`, description: `List ${title(model.name)}`, auth_required: true, roles, query_params: [{ name: "page", type: "number", required: false, description: "Page number" }, { name: "limit", type: "number", required: false, description: "Page size" }] },
      { method: "POST" as const, path: `/${resource}`, description: `Create ${title(model.name)}`, auth_required: true, roles, request_body },
      { method: "GET" as const, path: `/${resource}/{id}`, description: `Get ${title(model.name)}`, auth_required: true, roles },
      { method: "PATCH" as const, path: `/${resource}/{id}`, description: `Update ${title(model.name)}`, auth_required: true, roles, request_body },
      { method: "DELETE" as const, path: `/${resource}/{id}`, description: `Delete ${title(model.name)}`, auth_required: true, roles },
    ];
  });

  return {
    base_path: "/api",
    endpoints,
    error_codes: { "400": "Bad request", "401": "Authentication required", "403": "Insufficient permissions", "404": "Resource not found", "422": "Validation failed", "429": "Rate limit exceeded", "500": "Internal server error" },
  };
}

function fallbackAuth(intent: Intent, arch: Architecture): AuthSchema {
  const resources = arch.data_models.map(model => toSnake(model.name));
  return {
    strategy: arch.auth_strategy.type,
    roles: intent.roles.map(role => ({
      name: role.name,
      permissions: resources.map(resource => ({
        resource,
        actions: role.name.toLowerCase().includes("admin") ? ["create", "read", "update", "delete", "export", "admin"] : ["create", "read", "update"],
      })),
    })),
    policies: arch.business_rules.map(rule => ({
      name: rule.name,
      description: rule.action,
      rule: `${rule.condition}: ${rule.action}`,
      enforced_at: rule.enforced_at === "db" ? ["db_row"] : rule.enforced_at === "ui" ? ["route"] : ["api"],
    })),
    token_config: { access_token_ttl: "15m", refresh_token_ttl: "7d", algorithm: "HS256" },
  };
}

function fallbackUI(intent: Intent, arch: Architecture, api: APISchema): UISchema {
  const roles = intent.roles.map(role => role.name);
  const modelPages = arch.data_models.slice(0, 6).map(model => {
    const resource = toKebab(model.name);
    return {
      id: `${resource}-page`,
      name: title(model.name),
      path: `/${resource}`,
      auth_required: true,
      roles,
      layout: "full" as const,
      components: [
        { id: `${resource}-table`, type: "DataTable" as const, title: `${title(model.name)} List`, data_source: `/${resource}`, actions: [{ label: "Create", type: "modal" as const, target: `/${resource}`, roles }, { label: "Export", type: "export" as const, roles }] },
        { id: `${resource}-form`, type: "Form" as const, title: `Create ${title(model.name)}`, data_source: `/${resource}`, fields: model.fields.slice(0, 8).map(field => ({ name: toSnake(field.name), type: field.type === "email" ? "email" as const : field.type === "number" ? "number" as const : field.type === "boolean" ? "boolean" as const : field.type === "date" ? "date" as const : "text" as const, label: title(field.name), required: field.required })), actions: [{ label: "Save", type: "submit" as const, target: `/${resource}`, roles }] },
      ],
    };
  });

  return {
    theme: { primary_color: "#6366f1", style: "dashboard", font: "Inter" },
    layout: "sidebar",
    pages: [{ id: "dashboard", name: "Dashboard", path: "/dashboard", auth_required: true, roles, layout: "full", components: [{ id: "overview", type: "StatCard", title: `${intent.app_name} Overview`, data_source: api.endpoints[0]?.path ?? "/" }, { id: "activity", type: "Chart", title: "Activity", data_source: api.endpoints[0]?.path ?? "/" }] }, ...modelPages],
    navigation: { items: [{ label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard", roles }, ...modelPages.map(page => ({ label: page.name, path: page.path, icon: "Table", roles }))] },
  };
}

// ── ORCHESTRATE ALL ──────────────────────────────────────────────
export async function generateSchemas(intent: Intent, arch: Architecture) {
  if (LLM_PROVIDER === "groq") {
    const db = fallbackDB(arch);
    const api = fallbackAPI(intent, arch);
    const auth = fallbackAuth(intent, arch);
    const ui = fallbackUI(intent, arch, api);

    return {
      db: { stage: "schema_generation" as const, success: true, data: db, tokens_used: 0, latency_ms: 0, retries: 0, repair_applied: true },
      api: { stage: "schema_generation" as const, success: true, data: api, tokens_used: 0, latency_ms: 0, retries: 0, repair_applied: true },
      ui: { stage: "schema_generation" as const, success: true, data: ui, tokens_used: 0, latency_ms: 0, retries: 0, repair_applied: true },
      auth: { stage: "schema_generation" as const, success: true, data: auth, tokens_used: 0, latency_ms: 0, retries: 0, repair_applied: true },
    };
  }

  const [db, api, auth] = await Promise.all([
    generateDBSchema(arch),
    generateAPISchema(intent, arch),
    generateAuthSchema(intent, arch),
  ]);

  const ui = api.success && api.data
    ? await generateUISchema(intent, arch, api.data)
    : { stage: "schema_generation" as const, success: false, error: "API failed so UI skipped", tokens_used: 0, latency_ms: 0, retries: 0, repair_applied: false };

  const finalDb = db.success && db.data
    ? db
    : { ...db, success: true, data: fallbackDB(arch), repair_applied: true, error: `${db.error}; deterministic fallback applied` };
  const finalApi = api.success && api.data
    ? api
    : { ...api, success: true, data: fallbackAPI(intent, arch), repair_applied: true, error: `${api.error}; deterministic fallback applied` };
  const finalAuth = auth.success && auth.data
    ? auth
    : { ...auth, success: true, data: fallbackAuth(intent, arch), repair_applied: true, error: `${auth.error}; deterministic fallback applied` };
  const finalUi = ui.success && ui.data
    ? ui
    : { ...ui, success: true, data: fallbackUI(intent, arch, finalApi.data!), repair_applied: true, error: `${ui.error}; deterministic fallback applied` };

  return { db: finalDb, api: finalApi, ui: finalUi, auth: finalAuth };
}
