// ================================================================
// APPFORGE — MASTER TYPE CONTRACT
// Every layer of the pipeline is typed here.
// This is the "grammar" of our compiler.
// ================================================================

import { z } from "zod";

// ────────────────────────────────────────────────────────────────
// STAGE 1: INTENT (Lexer output)
// ────────────────────────────────────────────────────────────────

export const IntentSchema = z.object({
  app_name: z.string().describe("Short name for the application"),
  app_type: z.enum([
    "crm", "ecommerce", "saas", "dashboard", "marketplace",
    "social", "productivity", "education", "healthcare", "custom"
  ]),
  description: z.string().describe("One sentence describing the app"),
  core_entities: z.array(z.object({
    name: z.string(),
    description: z.string(),
    attributes: z.array(z.string()),
  })).min(1).max(10),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    priority: z.enum(["must", "should", "could"]),
  })).min(1).max(20),
  roles: z.array(z.object({
    name: z.string(),
    description: z.string(),
    permissions: z.array(z.string()),
  })).min(1).max(6),
  pages: z.array(z.string()).min(1).max(15),
  integrations: z.array(z.string()),
  assumptions: z.array(z.string()).describe("Reasonable assumptions made for vague inputs"),
  clarifications_needed: z.array(z.string()).describe("Things too ambiguous to assume"),
  confidence: z.number().min(0).max(1).describe("How confident in the parsing (0-1)"),
});
export type Intent = z.infer<typeof IntentSchema>;

// ────────────────────────────────────────────────────────────────
// STAGE 2: APP ARCHITECTURE (AST)
// ────────────────────────────────────────────────────────────────

export const ArchitectureSchema = z.object({
  data_models: z.array(z.object({
    name: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.enum(["string", "number", "boolean", "date", "email", "url", "uuid", "json", "enum"]),
      required: z.boolean(),
      unique: z.boolean().optional(),
      enum_values: z.array(z.string()).optional(),
      default: z.unknown().optional(),
      reference: z.string().optional().describe("Foreign key to another model"),
    })),
    relations: z.array(z.object({
      type: z.enum(["one_to_one", "one_to_many", "many_to_many"]),
      with: z.string(),
      foreign_key: z.string().optional(),
    })),
    indexes: z.array(z.string()).optional(),
  })).min(1),
  user_flows: z.array(z.object({
    name: z.string(),
    actor: z.string(),
    steps: z.array(z.string()),
    outcome: z.string(),
  })),
  auth_strategy: z.object({
    type: z.enum(["jwt", "session", "oauth", "api_key"]),
    providers: z.array(z.enum(["email", "google", "github", "phone"])),
    mfa: z.boolean(),
    session_duration: z.string(),
  }),
  business_rules: z.array(z.object({
    name: z.string(),
    condition: z.string(),
    action: z.string(),
    enforced_at: z.enum(["ui", "api", "db", "all"]),
  })),
});
export type Architecture = z.infer<typeof ArchitectureSchema>;

// ────────────────────────────────────────────────────────────────
// STAGE 3: SCHEMAS (Code Gen output)
// ────────────────────────────────────────────────────────────────

// DB Schema
export const DBSchemaSchema = z.object({
  tables: z.array(z.object({
    name: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      sql_type: z.string(),
      nullable: z.boolean(),
      primary_key: z.boolean().optional(),
      unique: z.boolean().optional(),
      default: z.string().optional(),
      references: z.object({ table: z.string(), column: z.string() }).optional(),
    })),
    indexes: z.array(z.object({
      name: z.string(),
      columns: z.array(z.string()),
      unique: z.boolean(),
    })).optional(),
  })),
  migration_sql: z.string().describe("Complete CREATE TABLE SQL statements"),
});
export type DBSchema = z.infer<typeof DBSchemaSchema>;

// API Schema
export const APISchemaSchema = z.object({
  base_path: z.string(),
  endpoints: z.array(z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string(),
    description: z.string(),
    auth_required: z.boolean(),
    roles: z.array(z.string()),
    request_body: z.record(z.object({
      type: z.string(),
      required: z.boolean(),
      description: z.string().optional(),
    })).optional(),
    response_schema: z.record(z.unknown()).optional(),
    query_params: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string(),
    })).optional(),
    rate_limit: z.object({ requests: z.number(), window: z.string() }).optional(),
  })).min(1),
  error_codes: z.record(z.string()),
});
export type APISchema = z.infer<typeof APISchemaSchema>;

// UI Schema
export const UISchemaSchema = z.object({
  theme: z.object({
    primary_color: z.string(),
    style: z.enum(["minimal", "corporate", "playful", "dashboard", "landing"]),
    font: z.string(),
  }),
  layout: z.enum(["sidebar", "topnav", "centered", "split"]),
  pages: z.array(z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    auth_required: z.boolean(),
    roles: z.array(z.string()),
    layout: z.enum(["full", "centered", "split"]),
    components: z.array(z.object({
      id: z.string(),
      type: z.enum([
        "DataTable", "Form", "Chart", "StatCard", "List",
        "Modal", "Tabs", "SearchBar", "Filter", "Hero",
        "CardGrid", "Timeline", "Map", "FileUpload", "RichText"
      ]),
      title: z.string().optional(),
      data_source: z.string().optional().describe("API endpoint or model name"),
      fields: z.array(z.object({
        name: z.string(),
        type: z.enum(["text", "email", "number", "select", "date", "boolean", "file", "textarea", "password"]),
        label: z.string(),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
        validation: z.string().optional(),
      })).optional(),
      actions: z.array(z.object({
        label: z.string(),
        type: z.enum(["submit", "navigate", "delete", "export", "modal"]),
        target: z.string().optional(),
        roles: z.array(z.string()),
      })).optional(),
      config: z.record(z.unknown()).optional(),
    })),
  })).min(1),
  navigation: z.object({
    items: z.array(z.object({
      label: z.string(),
      path: z.string(),
      icon: z.string().optional(),
      roles: z.array(z.string()),
    })),
  }),
});
export type UISchema = z.infer<typeof UISchemaSchema>;

// Auth Schema
export const AuthSchemaSchema = z.object({
  strategy: z.string(),
  roles: z.array(z.object({
    name: z.string(),
    inherits: z.string().optional(),
    permissions: z.array(z.object({
      resource: z.string(),
      actions: z.array(z.enum(["create", "read", "update", "delete", "export", "admin"])),
      conditions: z.string().optional().describe("e.g. 'own records only'"),
    })),
  })),
  policies: z.array(z.object({
    name: z.string(),
    description: z.string(),
    rule: z.string().describe("Human-readable policy rule"),
    enforced_at: z.array(z.enum(["route", "api", "db_row"])),
  })),
  token_config: z.object({
    access_token_ttl: z.string(),
    refresh_token_ttl: z.string(),
    algorithm: z.string(),
  }),
});
export type AuthSchema = z.infer<typeof AuthSchemaSchema>;

// ────────────────────────────────────────────────────────────────
// STAGE 4: FULL APP CONFIG (Final compiled output)
// ────────────────────────────────────────────────────────────────

export const AppConfigSchema = z.object({
  meta: z.object({
    id: z.string().uuid(),
    version: z.string(),
    generated_at: z.string(),
    pipeline_version: z.literal("1.0"),
  }),
  intent: IntentSchema,
  architecture: ArchitectureSchema,
  db: DBSchemaSchema,
  api: APISchemaSchema,
  ui: UISchemaSchema,
  auth: AuthSchemaSchema,
  consistency_report: z.object({
    issues_found: z.number(),
    issues_resolved: z.number(),
    warnings: z.array(z.string()),
    cross_layer_checks: z.array(z.object({
      check: z.string(),
      passed: z.boolean(),
      detail: z.string().optional(),
    })),
  }),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

// ────────────────────────────────────────────────────────────────
// PIPELINE EXECUTION TYPES
// ────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "intent_extraction"
  | "system_design"
  | "schema_generation"
  | "refinement"
  | "validation"
  | "repair";

export interface StageResult<T> {
  stage: PipelineStage;
  success: boolean;
  data?: T;
  error?: string;
  tokens_used: number;
  latency_ms: number;
  retries: number;
  repair_applied: boolean;
}

export interface PipelineResult {
  run_id: string;
  success: boolean;
  stages: StageResult<unknown>[];
  final_config?: AppConfig;
  total_tokens: number;
  total_latency_ms: number;
  total_retries: number;
  failure_type?: "vague_input" | "conflicting_requirements" | "schema_violation" | "repair_failed" | "api_error";
  assumptions_made: string[];
  clarifications_needed: string[];
}

// ────────────────────────────────────────────────────────────────
// VALIDATION TYPES
// ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  layer: "db" | "api" | "ui" | "auth" | "cross";
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  fix_suggestion?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  cross_layer_checks: { check: string; passed: boolean; detail?: string }[];
}

// ────────────────────────────────────────────────────────────────
// EVALUATION TYPES
// ────────────────────────────────────────────────────────────────

export interface EvalCase {
  id: string;
  category: "real_product" | "edge_vague" | "edge_conflicting" | "edge_incomplete";
  prompt: string;
  expected_entities?: string[];
  expected_pages?: string[];
  should_ask_clarification?: boolean;
}

export interface EvalResult {
  case_id: string;
  success: boolean;
  retries: number;
  latency_ms: number;
  tokens_used: number;
  failure_type?: string;
  schema_valid: boolean;
  cross_layer_consistent: boolean;
  assumptions_count: number;
  clarifications_count: number;
  repair_applied: boolean;
}

export interface EvalReport {
  total_cases: number;
  success_rate: number;
  avg_latency_ms: number;
  avg_tokens: number;
  avg_retries: number;
  repair_success_rate: number;
  failure_breakdown: Record<string, number>;
  results: EvalResult[];
}
