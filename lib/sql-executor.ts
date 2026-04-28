// ================================================================
// SQL EXECUTION VALIDATOR
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

// ── Pre-process SQL ────────────
function adaptSQLToSQLite(sql: string): string {
  return sql
    .replace(/\bUUID\b/gi, "TEXT")
    .replace(/\bTIMESTAMPTZ\b/gi, "TEXT")
    .replace(/gen_random_uuid\(\)/gi, "lower(hex(randomblob(16)))")
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    .replace(/\bSERIAL\b/gi, "INTEGER")
    .replace(/\bBIGSERIAL\b/gi, "INTEGER")
    .replace(/\bVARCHAR\s*\(\d+\)/gi, "TEXT")
    .replace(/\bBOOLEAN\b/gi, "INTEGER")
    .replace(/\bJSONB?\b/gi, "TEXT")
    .replace(/CREATE TYPE[^;]+;/gi, "")
    .replace(/CREATE TABLE IF NOT EXISTS/gi, "CREATE TABLE")
    .replace(/\bpublic\./gi, "");
}

// ── Extract enums ────
function extractEnumTables(sql: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();

  // ✅ UPDATED
  const enumMatches = Array.from(
    sql.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM\s*\(([^)]+)\)/gi)
  );

  for (const match of enumMatches) {
    const name = match[1].toLowerCase();

    // ✅ UPDATED
    const values = match[2]
      .split(",")
      .map((v: string) => v.trim().replace(/'/g, ""));

    enums.set(name, values);
  }

  return enums;
}

// ── Split SQL ────
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 5 && !s.startsWith("--"));
}

// ── Extract tables ────
function extractTableNames(sql: string): string[] {
  // ✅ UPDATED
  const matches = Array.from(
    sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+["']?(\w+)["']?/gi)
  );

  return matches.map(m => m[1]);
}

// ── Test INSERT ────
function buildTestInsert(schema: DBSchema): { sql: string; table: string } | null {
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

// ── MAIN EXECUTOR ────
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
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");

    const adaptedSQL = adaptSQLToSQLite(schema.migration_sql);
    const statements = splitStatements(adaptedSQL);
    const expectedTables = extractTableNames(adaptedSQL);

    for (const stmt of statements) {
      if (!stmt || stmt.length < 5) continue;

      try {
        db.exec(stmt + ";");

        const tableMatch = stmt.match(/CREATE TABLE\s+["']?(\w+)["']?/i);
        if (tableMatch) {
          result.tables_created.push(tableMatch[1]);
        }
      } catch (err) {
        const tableMatch = stmt.match(/CREATE TABLE\s+["']?(\w+)["']?/i);
        const tableName = tableMatch?.[1] ?? "unknown";
        const errMsg = err instanceof Error ? err.message : String(err);

        const nonFatal = ["already exists", "no such module", "unknown function"];

        if (!nonFatal.some(nf => errMsg.toLowerCase().includes(nf))) {
          result.tables_failed.push({ table: tableName, error: errMsg });
          result.errors.push(`${tableName}: ${errMsg}`);
        }
      }
    }

    const actualTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    result.tables_created = actualTables.map(t => t.name);

    for (const { name } of actualTables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
        result.row_count_checks.push({ table: name, count: row.c });
      } catch {}
    }

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
      result.insert_test_passed = true;
    }

    const coverage = result.tables_created.length / Math.max(expectedTables.length, 1);

    result.success =
      coverage >= 0.5 &&
      result.tables_failed.filter(f => !f.error.includes("exists")).length === 0;

  } catch (err) {
    result.errors.push(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    result.success = false;
  } finally {
    db?.close();
    result.execution_time_ms = Date.now() - start;
  }

  return result;
}

// ── TS VALIDATION ────
export function validateTypeScriptOutput(generatedTypes: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // ✅ UPDATED
  const interfaces = Array.from(
    generatedTypes.matchAll(/interface\s+(\w+)\s*\{([^}]*)\}/g)
  );

  for (const [, name, body] of interfaces) {
    if (body.trim().length === 0) {
      issues.push(`Interface ${name} is empty`);
    }
  }

  const names = interfaces.map(([, name]) => name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);

  for (const d of dupes) {
    issues.push(`Duplicate interface: ${d}`);
  }

  const invalidPatterns = [/: undefined;/, /: unknown\[\]\[\];/, /: never;/];

  for (const pat of invalidPatterns) {
    if (pat.test(generatedTypes)) {
      issues.push(`Suspicious type pattern found: ${pat}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
