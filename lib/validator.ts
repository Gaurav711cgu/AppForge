// ================================================================
// VALIDATOR — Cross-Layer Consistency Engine
// Checks that DB ↔ API ↔ UI ↔ Auth are all consistent
// This is the "linker" step of our compiler
// ================================================================

import type {
  DBSchema, APISchema, UISchema, AuthSchema, Architecture,
  ValidationReport, ValidationIssue
} from "@/types";

export function validateCrossLayer(
  db: DBSchema,
  api: APISchema,
  ui: UISchema,
  auth: AuthSchema,
  arch: Architecture
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const checks: ValidationReport["cross_layer_checks"] = [];

  // ── CHECK 1: Every DB table has at least one API endpoint ────────
  const dbTableNames = new Set(db.tables.map(t => t.name.toLowerCase()));
  const apiEndpointPaths = api.endpoints.map(e => e.path.toLowerCase());

  for (const table of db.tables) {
    const hasEndpoint = apiEndpointPaths.some(p => p.includes(table.name.toLowerCase().replace("_", "-")) || p.includes(table.name.toLowerCase()));
    checks.push({
      check: `DB table '${table.name}' has API coverage`,
      passed: hasEndpoint || ["users", "sessions", "refresh_tokens"].includes(table.name.toLowerCase()),
      detail: hasEndpoint ? undefined : `No API endpoint found for table '${table.name}'`,
    });
    if (!hasEndpoint && !["users", "sessions", "refresh_tokens"].includes(table.name.toLowerCase())) {
      issues.push({
        layer: "cross",
        severity: "warning",
        code: "DB_NO_API_COVERAGE",
        message: `DB table '${table.name}' has no corresponding API endpoint`,
        fix_suggestion: `Add GET /api/${table.name.toLowerCase().replace("_", "-")} and POST /api/${table.name.toLowerCase().replace("_", "-")}`,
      });
    }
  }

  // ── CHECK 2: API request bodies reference valid DB columns ───────
  for (const endpoint of api.endpoints) {
    if (!endpoint.request_body) continue;
    const resourceName = endpoint.path.split("/").filter(Boolean)[0]?.replace("-", "_");
    const table = db.tables.find(t => t.name.toLowerCase() === resourceName?.toLowerCase());

    if (table) {
      const tableColumns = new Set(table.columns.map(c => c.name.toLowerCase()));
      for (const [field] of Object.entries(endpoint.request_body)) {
        if (["password", "confirm_password", "token", "code"].includes(field)) continue;
        const fieldMatches = tableColumns.has(field.toLowerCase());
        if (!fieldMatches) {
          issues.push({
            layer: "cross",
            severity: "warning",
            code: "API_FIELD_NOT_IN_DB",
            message: `API endpoint '${endpoint.method} ${endpoint.path}' has field '${field}' not found in DB table '${table.name}'`,
            path: `api.endpoints[${endpoint.path}].request_body.${field}`,
            fix_suggestion: `Add column '${field}' to table '${table.name}' or remove field from API`,
          });
        }
      }
      checks.push({
        check: `API ${endpoint.method} ${endpoint.path} fields match DB schema`,
        passed: true,
      });
    }
  }

  // ── CHECK 3: UI data_sources reference real API endpoints ────────
  const apiPathSet = new Set(api.endpoints.map(e => e.path.toLowerCase()));

  for (const page of ui.pages) {
    for (const component of page.components) {
      if (component.data_source) {
        const source = component.data_source.toLowerCase().replace(/^\/api/, "");
        const hasMatch = apiPathSet.has(source) || apiPathSet.has(`/${source}`) ||
          [...apiPathSet].some(p => p.includes(source.split("/")[0]));

        checks.push({
          check: `UI component '${component.id}' on '${page.name}' data_source maps to API`,
          passed: hasMatch,
          detail: hasMatch ? undefined : `data_source '${component.data_source}' not found in API endpoints`,
        });

        if (!hasMatch) {
          issues.push({
            layer: "cross",
            severity: "warning",
            code: "UI_DATASOURCE_NOT_IN_API",
            message: `UI component data_source '${component.data_source}' doesn't match any API endpoint`,
            fix_suggestion: `Use one of: ${[...apiPathSet].slice(0, 3).join(", ")}`,
          });
        }
      }
    }
  }

  // ── CHECK 4: Auth roles are consistent across all layers ─────────
  const authRoleNames = new Set(auth.roles.map(r => r.name.toLowerCase()));
  const intentRoles = new Set(arch.user_flows.map(f => f.actor.toLowerCase()));

  for (const flow of arch.user_flows) {
    const hasAuthRole = authRoleNames.has(flow.actor.toLowerCase()) ||
      [...authRoleNames].some(r => flow.actor.toLowerCase().includes(r));
    checks.push({
      check: `User flow actor '${flow.actor}' has auth role`,
      passed: hasAuthRole,
    });
    if (!hasAuthRole) {
      issues.push({
        layer: "cross",
        severity: "error",
        code: "ROLE_MISSING_AUTH",
        message: `User flow actor '${flow.actor}' has no corresponding auth role`,
        fix_suggestion: `Add role '${flow.actor}' to auth schema`,
      });
    }
  }

  // ── CHECK 5: API auth-required endpoints have auth roles ─────────
  for (const endpoint of api.endpoints) {
    if (endpoint.auth_required && endpoint.roles.length === 0) {
      issues.push({
        layer: "api",
        severity: "error",
        code: "API_AUTH_REQUIRED_NO_ROLES",
        message: `Endpoint '${endpoint.method} ${endpoint.path}' requires auth but no roles defined`,
        fix_suggestion: "Add at least one role or set auth_required to false",
      });
    }
  }
  checks.push({
    check: "All auth-required endpoints have roles defined",
    passed: !issues.some(i => i.code === "API_AUTH_REQUIRED_NO_ROLES"),
  });

  // ── CHECK 6: DB FK references point to real tables ───────────────
  for (const table of db.tables) {
    for (const col of table.columns) {
      if (col.references) {
        const refExists = dbTableNames.has(col.references.table.toLowerCase());
        checks.push({
          check: `FK ${table.name}.${col.name} → ${col.references.table} exists`,
          passed: refExists,
        });
        if (!refExists) {
          issues.push({
            layer: "db",
            severity: "error",
            code: "DB_INVALID_FK",
            message: `Column '${table.name}.${col.name}' references non-existent table '${col.references.table}'`,
            fix_suggestion: `Create table '${col.references.table}' or fix the reference`,
          });
        }
      }
    }
  }

  // ── CHECK 7: UI forms have matching API POST/PUT endpoints ────────
  for (const page of ui.pages) {
    for (const component of page.components) {
      if (component.type === "Form" && component.actions) {
        const submitAction = component.actions.find(a => a.type === "submit");
        if (submitAction?.target) {
          const targetExists = [...apiPathSet].some(p => p.includes(submitAction.target!.toLowerCase().split("?")[0]));
          checks.push({
            check: `Form on '${page.name}' submit target '${submitAction.target}' exists in API`,
            passed: targetExists,
          });
        }
      }
    }
  }

  const errorCount = issues.filter(i => i.severity === "error").length;

  return {
    valid: errorCount === 0,
    issues,
    cross_layer_checks: checks,
  };
}

export function buildConsistencyReport(validation: ValidationReport) {
  return {
    issues_found: validation.issues.length,
    issues_resolved: 0,
    warnings: validation.issues
      .filter(i => i.severity === "warning")
      .map(i => i.message),
    cross_layer_checks: validation.cross_layer_checks,
  };
}
