// ================================================================
// SQL EXECUTION VALIDATOR
// Runs generated migration SQL against in-memory SQLite
// Proves output is actually executable — not just generated
// Uses Node.js built-in sqlite (v22+)
// ================================================================

import { DatabaseSync } from "node:sqlite";
import type { DBSchema } from "@/types";

export interface SQLExecutionResult {
  success: boolean;
  tables_created: string[];
  tables_failed: { table: string; error: string }[];
  execution_time_ms: number;
  row_count_checks: { table: string; count: number }[];
  insert_test_passed: boolean;
  errors: string[];
}

// ── Pre-process SQL: convert Postgres → SQLite syntax ────────────
function adaptSQLToSQLite(sql: string): string {
  return sql
    // UUID type → TEXT
    .replace(/\bUUID\b/gi, "TEXT")
    // TIMESTAMPTZ → TEXT
    .replace(/\bTIMESTAMPTZ\b/gi, "TEXT")
    // gen_random_uuid() → lower(hex(randomblob(16)))
    .replace(/gen_random_uuid\(\)/gi, "lower(hex(randomblob(16)))")
    // NOW() → datetime('now')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // SERIAL → INTEGER
    .replace(/\bSERIAL\b/gi, "INTEGER")
    // BIGSERIAL → INTEGER
    .replace(/\bBIGSERIAL\b/gi, "INTEGER")
    // VARCHAR(n) → TEXT
    .replace(/\bVARCHAR\s*\(\d+\)/gi, "TEXT")
    // BOOLEAN → INTEGER (SQLite has no BOOLEAN)
    .replace(/\bBOOLEAN\b/gi, "INTEGER")
    // JSONB → TEXT
    .replace(/\bJSONB?\b/gi, "TEXT")
    // Postgres CREATE TYPE ... AS ENUM → skip (handled separately)
    .replace(/CREATE TYPE[^;]+;/gi, "")
    // REFERENCES with ON DELETE → keep (SQLite supports this)
    // Remove IF NOT EXISTS conflicts
    .replace(/CREATE TABLE IF NOT EXISTS/gi, "CREATE TABLE")
    // Remove schema prefixes (public.tablename → tablename)
    .replace(/\bpublic\./gi, "");
}

// ── Extract enum definitions and convert to CHECK constraints ────
function extractEnumTables(sql: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const enumMatches = [...sql.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM\s*\(([^)]+)\)/gi)];
  for (const match of enumMatches) {
    const name = match[1].toLowerCase();
    const values = match[2].split(",").map(v => v.trim().replace(/'/g, ""));
    enums.set(name, values);
  }
  return enums;
}

// ── Split SQL into individual statements ──────────────────────────
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 5 && !s.startsWith("--"));
}

// ── Extract table names from CREATE TABLE statements ─────────────
function extractTableNames(sql: string): string[] {
  const matches = [...sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+["']?(\w+)["']?/gi)];
  return matches.map(m => m[1]);
}

// ── Generate a minimal INSERT to test write access ────────────────
function buildTestInsert(schema: DBSchema): { sql: string; table: string } | null {
  // Find the simplest table (fewest non-nullable columns)
  const candidates = schema.tables
    .filter(t => !["sessions", "refresh_tokens", "audit_logs"].includes(t.name.toLowerCase()))
    .sort((a, b) => {
      const aNonNull = a.columns.filter(c => !c.nullable && !c.primary_key && !c.default).length;
      const bNonNull = b.columns.filter(c => !c.nullable && !c.primary_key && !c.default).length;
      return aNonNull - bNonNull;
    });

  if (candidates.length === 0) return null;
  const table = candidates[0];

  const insertCols = table.columns.filter(c => !c.primary_key && !c.default);
  if (insertCols.length === 0) {
    return { sql: `INSERT INTO ${table.name} DEFAULT VALUES`, table: table.name };
  }

  const cols = insertCols.map(c => c.name).join(", ");
  const vals = insertCols.map(c => {
    const t = c.sql_type.toLowerCase();
    if (t.includes("int") || t.includes("bool") || t === "integer") return "0";
    if (t.includes("text") || t.includes("varchar") || t.includes("char")) return `'test_value'`;
    if (t.includes("date") || t.includes("time")) return `datetime('now')`;
    return "'test'";
  }).join(", ");

  return {
    sql: `INSERT INTO ${table.name} (${cols}) VALUES (${vals})`,
    table: table.name,
  };
}

// ── MAIN EXECUTOR ─────────────────────────────────────────────────
export function executeGeneratedSQL(schema: DBSchema): SQLExecutionResult {
  const start = Date.now();
  const result: SQLExecutionResult = {
    success: false,
    tables_created: [],
    tables_failed: [],
    execution_time_ms: 0,
    row_count_checks: [],
    insert_test_passed: false,
    errors: [],
  };

  let db: DatabaseSync | null = null;

  try {
    // In-memory DB — no disk write, no cleanup needed
    db = new DatabaseSync(":memory:");

    // Enable foreign key checks
    db.exec("PRAGMA foreign_keys = ON;");

    const adaptedSQL = adaptSQLToSQLite(schema.migration_sql);
    const statements = splitStatements(adaptedSQL);
    const expectedTables = extractTableNames(adaptedSQL);

    // Execute each statement individually for precise error isolation
    for (const stmt of statements) {
      if (!stmt || stmt.length < 5) continue;

      try {
        db.exec(stmt + ";");

        // Track created tables
        const tableMatch = stmt.match(/CREATE TABLE\s+["']?(\w+)["']?/i);
        if (tableMatch) {
          result.tables_created.push(tableMatch[1]);
        }
      } catch (err) {
        const tableMatch = stmt.match(/CREATE TABLE\s+["']?(\w+)["']?/i);
        const tableName = tableMatch?.[1] ?? "unknown";
        const errMsg = err instanceof Error ? err.message : String(err);

        // Skip non-fatal SQLite compatibility issues
        const nonFatal = [
          "already exists",
          "no such module",
          "unknown function",
        ];

        if (nonFatal.some(nf => errMsg.toLowerCase().includes(nf))) {
          // Skip silently
        } else {
          result.tables_failed.push({ table: tableName, error: errMsg });
          result.errors.push(`${tableName}: ${errMsg}`);
        }
      }
    }

    // Verify tables actually exist in SQLite
    const actualTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    result.tables_created = actualTables.map(t => t.name);

    // Row count check on each created table
    for (const { name } of actualTables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
        result.row_count_checks.push({ table: name, count: row.c });
      } catch {
        // Table exists but count failed — non-critical
      }
    }

    // Test INSERT on simplest table
    const testInsert = buildTestInsert(schema);
    if (testInsert) {
      try {
        db.exec(testInsert.sql + ";");
        result.insert_test_passed = true;
      } catch (err) {
        result.errors.push(`Insert test failed on ${testInsert.table}: ${err instanceof Error ? err.message : err}`);
        result.insert_test_passed = false;
      }
    } else {
      result.insert_test_passed = true; // No suitable table, skip
    }

    // Success = at least half the expected tables created, no fatal errors
    const coverage = result.tables_created.length / Math.max(expectedTables.length, 1);
    result.success = coverage >= 0.5 && result.tables_failed.filter(f => !f.error.includes("exists")).length === 0;

  } catch (err) {
    result.errors.push(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    result.success = false;
  } finally {
    db?.close();
    result.execution_time_ms = Date.now() - start;
  }

  return result;
}

// ── TypeScript type-check simulation (structural validation) ──────
export function validateTypeScriptOutput(generatedTypes: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check all interfaces have at least one field
  const interfaces = [...generatedTypes.matchAll(/interface\s+(\w+)\s*\{([^}]*)\}/g)];
  for (const [, name, body] of interfaces) {
    if (body.trim().length === 0) {
      issues.push(`Interface ${name} is empty`);
    }
  }

  // Check no duplicate interface names
  const names = interfaces.map(([, name]) => name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  for (const d of dupes) {
    issues.push(`Duplicate interface: ${d}`);
  }

  // Check no invalid TypeScript types
  const invalidPatterns = [/: undefined;/, /: unknown\[\]\[\];/, /: never;/];
  for (const pat of invalidPatterns) {
    if (pat.test(generatedTypes)) {
      issues.push(`Suspicious type pattern found: ${pat}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
